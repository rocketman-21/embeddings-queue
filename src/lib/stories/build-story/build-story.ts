import { RedisClientType } from 'redis';
import { Job } from 'bullmq';
import { CastForStory } from '../../../database/queries/casts/casts-for-story';
import { GrantStories } from '../../../database/queries/stories/get-grant-stories';
import { log } from '../../helpers';
import { generateStory } from './story-analysis';
import { populateGeneratedStories } from './populate-story-data';
import { StoryAnalysis } from './types';
import { prepareCastData } from './casts-data';

async function buildStory(
  redisClient: RedisClientType,
  casts: CastForStory[],
  job: Job,
  grant: {
    description: string;
  },
  parentGrant: {
    description: string;
  },
  existingStories: GrantStories,
  builderAddresses: string[]
): Promise<StoryAnalysis[]> {
  if (!casts || casts.length === 0) {
    throw new Error('Stories data is required');
  }

  log('Preparing cast data', job);

  const combinedContent = await prepareCastData(casts, redisClient, job);

  log('Generating stories', job);

  const result = await generateStory(
    combinedContent,
    existingStories,
    grant,
    parentGrant,
    job
  );

  const populatedStories = await populateGeneratedStories(
    result.stories,
    job,
    redisClient,
    casts,
    builderAddresses
  );

  return populatedStories;
}

export async function buildStories(
  redisClient: RedisClientType,
  casts: CastForStory[],
  job: Job,
  grant: { description: string },
  parentGrant: { description: string },
  existingStories: GrantStories,
  builderAddresses: string[]
): Promise<StoryAnalysis[]> {
  return buildStory(
    redisClient,
    casts,
    job,
    grant,
    parentGrant,
    existingStories,
    builderAddresses
  );
}
