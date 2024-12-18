import { Worker, Job, RedisOptions, ClusterOptions, Queue } from 'bullmq';
import { JobBody, StoryJobBody } from '../../types/job';
import { log } from '../../lib/helpers';
import { RedisClientType } from 'redis';
import { buildStories } from '../../lib/stories/build-story/build-story';
import { getGrantAndParentGrant } from '../../database/queries/grants/grant-and-parent';
import { eq } from 'drizzle-orm';
import { getAllCastsForStories } from '../../database/queries/casts/casts-for-story';
import { flowsDb } from '../../database/flowsDb';
import { stories } from '../../database/flows-schema';
import { sql } from 'drizzle-orm';
import { getGrantStories } from '../../database/queries/stories/get-grant-stories';
import { farcasterDb } from '../../database/farcasterDb';
import { farcasterCasts } from '../../database/farcaster-schema';
import { getCastHash } from '../../lib/casts/utils';
import {
  acquireLock,
  releaseLock,
  filterRelevantCasts,
  prepareStoryForInsertion,
  createEmbeddingJob,
} from './worker-helpers';

export const storyAgentWorker = async (
  queueName: string,
  connection: RedisOptions | ClusterOptions,
  redisClient: RedisClientType,
  bulkEmbeddingsQueue: Queue<JobBody[]>
) => {
  new Worker<StoryJobBody[]>(
    queueName,
    async (job: Job<StoryJobBody[]>) => {
      const storiesJobData = job.data;
      const embeddingJobs: JobBody[] = [];

      if (!storiesJobData || !storiesJobData.length) {
        throw new Error('Story data is required');
      }

      try {
        const results = [];
        for (const story of storiesJobData) {
          const lockAcquired = await acquireLock(redisClient, story.grantId);

          if (!lockAcquired) {
            log(
              `Story ${story.grantId} is already being processed or was recently processed, skipping`,
              job
            );
            continue;
          }

          try {
            log(`Processing story event: ${story.newCastId}`, job);
            const allStories = await getGrantStories(story.grantId);
            log(
              `Found ${allStories.length} existing stories for grant: ${story.grantId}`,
              job
            );

            // relevant stories are those that have < 5 castHashes attached
            // do this so stories don't get too big or long
            const relevantStories = allStories.filter(
              (story) => (story.castHashes?.length || 0) < 5
            );

            log(
              `Found ${relevantStories.length} relevant stories for grant: ${story.grantId}`,
              job
            );

            const rawCasts = await getAllCastsForStories(story.grantId);

            // make sure to filter on all stories, not just relevant ones
            const relevantCasts = filterRelevantCasts(rawCasts, allStories);

            if (!relevantCasts.length) {
              log(
                `No casts found for story event: ${story.newCastId}, skipping`,
                job
              );
              continue;
            }

            log(
              `Filtered out ${rawCasts.length - relevantCasts.length} casts for story event: ${story.newCastId}`,
              job
            );

            log(
              `Analyzing ${relevantCasts.length} casts for story event: ${story.newCastId}`,
              job
            );

            const { grant, parentGrant } = await getGrantAndParentGrant(
              story.grantId
            );

            if (!grant || !parentGrant) {
              throw new Error(
                `No ${!grant ? 'grant' : 'parent grant'} found for story event: ${story.newCastId}`
              );
            }

            const analysis = await buildStories(
              redisClient,
              relevantCasts,
              job,
              {
                description: grant.description,
              },
              {
                description: parentGrant.description,
              },
              relevantStories,
              [grant.recipient]
            );

            if (!analysis || !analysis.length) {
              log(
                `No stories found for story event: ${story.newCastId}, skipping`,
                job
              );
              continue;
            }

            log(`Generated story analysis for ID: ${story.newCastId}`, job);

            const storiesToInsert = analysis.map((storyAnalysis) =>
              prepareStoryForInsertion(storyAnalysis, grant.id, parentGrant.id)
            );

            await flowsDb
              .insert(stories)
              .values(storiesToInsert)
              .onConflictDoUpdate({
                target: [stories.id],
                set: {
                  title: sql`excluded.title`,
                  summary: sql`excluded.summary`,
                  keyPoints: sql`excluded.key_points`,
                  participants: sql`excluded.participants`,
                  headerImage: sql`excluded.header_image`,
                  timeline: sql`excluded.timeline`,
                  sentiment: sql`excluded.sentiment`,
                  completeness: sql`excluded.completeness`,
                  complete: sql`excluded.complete`,
                  updatedAt: sql`now()`,
                  sources: sql`excluded.sources`,
                  mediaUrls: sql`excluded.media_urls`,
                  author: sql`excluded.author`,
                  tagline: sql`excluded.tagline`,
                  edits: sql`excluded.edits`,
                  castHashes: sql`excluded.cast_hashes`,
                  infoNeededToComplete: sql`excluded.info_needed_to_complete`,
                  mintUrls: sql`excluded.mint_urls`,
                },
              });

            const castHashToStoryId = analysis.reduce(
              (acc, story, index) => {
                story.castHashes.forEach((hash) => {
                  acc[hash] = storiesToInsert[index].id;
                });
                return acc;
              },
              {} as Record<string, string>
            );

            for (const [hash, storyId] of Object.entries(castHashToStoryId)) {
              const castHash = getCastHash(hash);
              await farcasterDb
                .update(farcasterCasts)
                .set({
                  storyIds: sql`array_append(story_ids, ${storyId})`,
                })
                .where(eq(farcasterCasts.hash, castHash));
            }

            log(
              `Inserted ${storiesToInsert.length} stories into database`,
              job
            );

            embeddingJobs.push(...analysis.map(createEmbeddingJob));

            log(`Added story analysis to embedding queue`, job);

            results.push({
              id: story.newCastId,
              processed: true,
            });

            await releaseLock(redisClient, story.grantId);
          } catch (error) {
            await releaseLock(redisClient, story.grantId);
            console.error(`Error processing story ${story.newCastId}:`, error);
            throw error;
          }
        }

        const queueJobName = `embed-story-${Date.now()}`;
        const queueJob = await bulkEmbeddingsQueue.add(
          queueJobName,
          embeddingJobs
        );

        log(`Added ${embeddingJobs.length} embedding jobs to queue`, job);

        return {
          jobId: job.id,
          results,
          queueJobId: queueJob.id,
        };
      } catch (error) {
        console.error('Error processing stories:', error);
        throw error;
      }
    },
    {
      connection,
      concurrency: 50,
      lockDuration: 240000, // 4 minutes
      lockRenewTime: 120000, // 2 minutes
    }
  );
};
