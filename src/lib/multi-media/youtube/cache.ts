import { Job } from 'bullmq';
import { log } from '../../helpers';
import { RedisClientType } from 'redis';
import { cacheResult, getCachedResult } from '../../cache/cacheResult';

const YOUTUBE_DESCRIPTION_CACHE_PREFIX = 'ai-studio-youtube-description:';

export async function getCachedYoutubeDescription(
  redisClient: RedisClientType,
  videoUrl: string,
  job: Job
): Promise<string | null> {
  log(`Checking cache for YouTube video description: ${videoUrl}`, job);
  return await getCachedResult<string>(
    redisClient,
    videoUrl,
    YOUTUBE_DESCRIPTION_CACHE_PREFIX
  );
}

export async function cacheYoutubeDescription(
  redisClient: RedisClientType,
  videoUrl: string,
  description: string,
  job: Job
): Promise<void> {
  log(`Caching YouTube video description for: ${videoUrl}`, job);
  await cacheResult(
    redisClient,
    videoUrl,
    YOUTUBE_DESCRIPTION_CACHE_PREFIX,
    async () => description
  );
  log('YouTube video description cached successfully', job);
}
