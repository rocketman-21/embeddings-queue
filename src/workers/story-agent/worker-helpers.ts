import { RedisClientType } from 'redis';
import { JobBody } from '../../types/job';
import { StoryAnalysis } from '../../lib/stories/build-story/types';
import { InferInsertModel } from 'drizzle-orm';
import { stories } from '../../database/flows-schema';
import { cleanTextForEmbedding } from '../../lib/embedding/utils';
import { CastForStory } from '../../database/queries/casts/casts-for-story';
import { GrantStories } from '../../database/queries/stories/get-grant-stories';

const STORY_LOCK_PREFIX = 'story-locked-v1:';
const LOCK_TTL = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

// Helper function to normalize hashes
export function normalizeHash(hash: string): string {
  return hash.replace(/^0x/, '').toLowerCase();
}

// Helper function to acquire a lock
export async function acquireLock(
  redisClient: RedisClientType,
  grantId: string
): Promise<string | null> {
  const lockKey = `${STORY_LOCK_PREFIX}${grantId}`;
  return await redisClient.set(lockKey, 'locked', {
    NX: true,
    PX: LOCK_TTL,
  });
}

// Helper function to release a lock
export async function releaseLock(
  redisClient: RedisClientType,
  grantId: string
): Promise<void> {
  const lockKey = `${STORY_LOCK_PREFIX}${grantId}`;
  await redisClient.del(lockKey);
}

// Helper function to filter relevant casts
export function filterRelevantCasts(
  rawCasts: CastForStory[],
  existingStories: GrantStories
) {
  return rawCasts.filter((cast) => {
    if (!cast.storyIds || cast.storyIds.length === 0) return true;

    const castHash = cast.hash ? normalizeHash(cast.hash.toString('hex')) : '';

    const belongsToStoryById = existingStories.some((story) =>
      cast.storyIds?.includes(story.id)
    );

    const hashInSources = existingStories.some((story) =>
      story.sources?.some((source) => source.includes(castHash))
    );

    return !belongsToStoryById && !hashInSources;
  });
}

// Helper function to prepare story for insertion
export function prepareStoryForInsertion(
  storyAnalysis: StoryAnalysis,
  grantId: string,
  parentGrantId: string
): InferInsertModel<typeof stories> {
  return {
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
    grantIds: [grantId],
    parentFlowIds: [parentGrantId],
    tagline: storyAnalysis.tagline,
    edits: storyAnalysis.edits,
    castHashes: Array.from(new Set(storyAnalysis.castHashes)),
    infoNeededToComplete: storyAnalysis.infoNeededToComplete,
    mintUrls: Array.from(new Set(storyAnalysis.mintUrls)),
  };
}

// Helper function to create embedding job
export function createEmbeddingJob(storyAnalysis: StoryAnalysis): JobBody {
  return {
    type: 'story',
    content: cleanTextForEmbedding(storyAnalysis.summary),
    rawContent: storyAnalysis.summary,
    externalId: storyAnalysis.id,
    groups: [],
    users: storyAnalysis.participants,
    externalUrl: `https://flows.wtf/story/${storyAnalysis.id}`,
    tags: [],
    urls: storyAnalysis.mediaUrls,
  };
}
