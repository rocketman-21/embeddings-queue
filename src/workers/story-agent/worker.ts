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
import { InferInsertModel, sql } from 'drizzle-orm';
import { getGrantStories } from '../../database/queries/stories/get-grant-stories';
import { farcasterDb } from '../../database/farcasterDb';
import { farcasterCasts } from '../../database/farcaster-schema';
import { getCastHash } from '../../lib/casts/utils';
import { cleanTextForEmbedding } from '../../lib/embedding/utils';

const STORY_LOCK_PREFIX = 'story-locked-v1:';
const LOCK_TTL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

interface LockData {
  timestamp: number;
  ttl: number;
}

// Helper function to normalize hashes
function normalizeHash(hash: string): string {
  return hash.replace(/^0x/, '').toLowerCase();
}

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
          // Check if this story is already being processed
          const lockKey = `${STORY_LOCK_PREFIX}${story.grantId}`;
          // Attempt to acquire the lock
          const lockAcquired = await redisClient.set(lockKey, 'locked', {
            NX: true,
            PX: LOCK_TTL,
          });

          if (!lockAcquired) {
            log(
              `Story ${story.grantId} is already being processed or was recently processed, skipping`,
              job
            );
            continue; // Skip to the next story
          }

          try {
            log(`Processing story event: ${story.newCastId}`, job);
            const existingStories = await getGrantStories(story.grantId);

            // log how many existing stories
            log(
              `Found ${existingStories.length} existing stories for grant: ${story.grantId}`,
              job
            );

            const rawCasts = await getAllCastsForStories(story.grantId);

            if (!rawCasts.length) {
              log(
                `No casts found for story event: ${story.newCastId}, skipping`,
                job
              );
              continue;
            }

            // Filter out casts that already belong to existing stories
            const relevantCasts = rawCasts.filter((cast) => {
              // If cast has no storyIds or empty array, include it
              if (!cast.storyIds || cast.storyIds.length === 0) return true;

              const castHash = cast.hash
                ? normalizeHash(cast.hash.toString('hex'))
                : '';

              // Check if cast belongs to any existing story by story ID
              const belongsToStoryById = existingStories.some((story) =>
                cast.storyIds?.includes(story.id)
              );

              // Check if cast hash is in any of the existing story's sources
              const hashInSources = existingStories.some((story) =>
                story.sources?.some((source) => source.includes(castHash))
              );

              // Return true if cast doesn't belong to any story and isn't referenced in sources
              return !belongsToStoryById && !hashInSources;
            });

            // log how many filtered out
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
                `No grant or parent grant found for story event: ${story.newCastId}`
              );
            }

            // Generate story analysis
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
              existingStories,
              [grant.recipient]
            );

            if (!analysis) {
              throw new Error(
                `No analysis found for story event: ${story.newCastId}`
              );
            }

            if (!analysis.length) {
              log(
                `No stories found for story event: ${story.newCastId}, skipping`,
                job
              );
              continue;
            }

            log(`Generated story analysis for ID: ${story.newCastId}`, job);
            type StoryInsertModel = InferInsertModel<typeof stories>;

            // Bulk insert stories into flowsDb
            const storiesToInsert: StoryInsertModel[] = analysis.map(
              (storyAnalysis) => ({
                id: storyAnalysis.id || crypto.randomUUID(),
                title: storyAnalysis.title,
                summary: storyAnalysis.summary,
                createdAt: new Date(storyAnalysis.createdAt),
                updatedAt: new Date(storyAnalysis.createdAt),
                keyPoints: storyAnalysis.keyPoints,
                participants: storyAnalysis.participants,
                headerImage: storyAnalysis.headerImage,
                timeline: storyAnalysis.timeline,
                sentiment: storyAnalysis.sentiment,
                completeness: storyAnalysis.completeness.toString(),
                complete: storyAnalysis.complete,
                sources: Array.from(new Set(storyAnalysis.sources)),
                mediaUrls: Array.from(new Set(storyAnalysis.mediaUrls)),
                author: storyAnalysis.author?.toLowerCase(),
                grantIds: [grant.id],
                parentFlowIds: [parentGrant.id],
                tagline: storyAnalysis.tagline,
                edits: storyAnalysis.edits,
                castHashes: Array.from(new Set(storyAnalysis.castHashes)),
                infoNeededToComplete: storyAnalysis.infoNeededToComplete,
                mintUrls: storyAnalysis.mintUrls,
              })
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

            // Create mapping of cast hashes to story IDs
            const castHashToStoryId = analysis.reduce(
              (acc, story, index) => {
                story.castHashes.forEach((hash) => {
                  acc[hash] = storiesToInsert[index].id;
                });
                return acc;
              },
              {} as Record<string, string>
            );

            // Update each cast with its corresponding story ID
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

            // Add to embedding jobs queue
            analysis.forEach((storyAnalysis) => {
              embeddingJobs.push({
                type: 'story',
                content: cleanTextForEmbedding(storyAnalysis.summary),
                rawContent: storyAnalysis.summary,
                externalId: storyAnalysis.id,
                groups: [],
                users: storyAnalysis.participants,
                externalUrl: `https://flows.wtf/story/${storyAnalysis.id}`,
                tags: [],
                urls: storyAnalysis.mediaUrls,
              });
            });

            log(`Added story analysis to embedding queue`, job);

            results.push({
              id: story.newCastId,
              processed: true,
            });

            await redisClient.del(lockKey);
          } catch (error) {
            // Clear lock if there's an error
            await redisClient.del(lockKey);
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
