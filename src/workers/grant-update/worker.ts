import { Worker, Job, RedisOptions, ClusterOptions, Queue } from 'bullmq';
import { IsGrantUpdateJobBody, StoryJobBody } from '../../types/job';
import { log } from '../../lib/helpers';
import { analyzeCast } from '../../lib/casts/analysis/analyze';
import { RedisClientType } from 'redis';
import { farcasterCasts } from '../../database/farcaster-schema';
import { farcasterDb } from '../../database/farcasterDb';
import { eq, sql } from 'drizzle-orm';
import { flowsDb } from '../../database/flowsDb';
import { derivedData } from '../../database/flows-schema';
import { getCastHash } from '../../lib/casts/utils';

export const isGrantUpdateWorker = async (
  queueName: string,
  connection: RedisOptions | ClusterOptions,
  redisClient: RedisClientType,
  storyAgentQueue: Queue<StoryJobBody[]>
) => {
  new Worker<IsGrantUpdateJobBody[]>(
    queueName,
    async (job: Job<IsGrantUpdateJobBody[]>) => {
      const casts = job.data;
      const storyJobs: StoryJobBody[] = [];

      if (!casts || !casts.length) {
        throw new Error('Cast data is required');
      }

      try {
        const results = [];
        for (let i = 0; i < casts.length; i++) {
          const jobData = casts[i];
          const result = await analyzeCast(redisClient, jobData, job);

          const grantId = result.grantId;

          if (result.isGrantUpdate && grantId) {
            // Convert the hexadecimal hash string to a Buffer
            const castHash = getCastHash(jobData.castHash);

            const updated = await farcasterDb
              .update(farcasterCasts)
              .set({
                computedTags: sql`array_append(array_remove(array_append(array_remove(computed_tags, ${grantId}), ${grantId}), 'nouns-flows'), 'nouns-flows')`,
              })
              .where(eq(farcasterCasts.hash, castHash))
              .returning();

            log(`Updated cast: ${updated[0].id}`, job);

            storyJobs.push({
              newCastId: updated[0].id,
              grantId,
            });

            // get timestamp of updated cast
            const timestamp = updated[0].timestamp;

            const currentLastBuilderUpdate = await flowsDb
              .select({ lastBuilderUpdate: derivedData.lastBuilderUpdate })
              .from(derivedData)
              .where(eq(derivedData.grantId, grantId));

            const lastBuilderUpdate =
              currentLastBuilderUpdate?.[0]?.lastBuilderUpdate || 0;

            if (updated && timestamp && timestamp > lastBuilderUpdate) {
              await flowsDb
                .insert(derivedData)
                .values({
                  grantId,
                  lastBuilderUpdate: timestamp,
                  id: grantId,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  minimumSalary: null,
                  template: null,
                })
                .onConflictDoUpdate({
                  target: derivedData.grantId,
                  set: {
                    lastBuilderUpdate: timestamp,
                  },
                });
            }
          }

          log(
            `Analysis complete for cast: ${
              result.isGrantUpdate ? 'Is update' : 'Not update'
            } (${result.reason})`,
            job
          );

          results.push(result);
        }

        const queueJobName = `story-agent-${Date.now()}`;

        let storyQueueJob;
        if (storyJobs.length > 0) {
          storyQueueJob = await storyAgentQueue.add(queueJobName, storyJobs);
        }

        log(`Added ${storyJobs.length} story jobs to queue`, job);

        return {
          jobId: job.id,
          results,
          // storyQueueJobId: storyQueueJob?.id || '',
        };
      } catch (error) {
        console.error('Error processing casts:', error);
        throw error;
      }
    },
    {
      connection,
      concurrency: 25, // Lower concurrency since this involves AI analysis
      lockDuration: 1200000, // 20 minutes
      lockRenewTime: 600000, // 10 minutes (half of lockDuration)
    }
  );
};
