import { CastForStory } from '../../../database/queries/casts/casts-for-story';
import { RedisClientType } from 'redis';
import { Job } from 'bullmq';
import { generateCastTextForStory } from '../../casts/utils';
import { log } from '../../helpers';

export async function prepareCastData(
  casts: CastForStory[],
  redisClient: RedisClientType,
  job: Job
) {
  if (!casts || casts.length === 0) {
    throw new Error('Casts data is required');
  }

  // Get cast text with summaries for all casts
  const castPromises = casts.map((cast) =>
    generateCastTextForStory(cast, redisClient, job)
  );
  const castDetails = await Promise.all(castPromises);

  log(`Preparing cast data for ${casts.length} casts`, job);

  // Combine all cast content and summaries
  return castDetails
    .map((text, index) => ({
      content: text,
      timestamp: casts[index].timestamp,
    }))
    .sort(
      (a: CastData, b: CastData) =>
        (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
    );
}

interface CastData {
  content: string;
  timestamp: Date | null;
}
