import { generateObject } from 'ai';
import { RedisClientType } from 'redis';
import { Job } from 'bullmq';
import { CastForStory } from '../../../database/queries/casts/casts-for-story';
import { openAIModel, anthropicModel, retryAiCallWithBackoff } from '../../ai';
import { generateCastTextForStory } from '../../casts/utils';
import { GrantStories } from '../../../database/queries/stories/get-grant-stories';
import { log } from '../../helpers';
import { generateStoryText, StoryAnalysis } from './story-analysis';
import { populateGeneratedStories } from './populate-story-data';
import {
  getStoryObjectSchema,
  getStoryObjectSystemPrompt,
} from './story-object';
import { getRelatedCasts } from './get-related-casts';

export async function buildStories(
  redisClient: RedisClientType,
  casts: CastForStory[],
  job: Job,
  grant: { description: string },
  parentGrant: { description: string },
  existingStories: GrantStories
): Promise<StoryAnalysis[]> {
  return buildStory(
    redisClient,
    casts,
    job,
    grant,
    parentGrant,
    existingStories
  );
}

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
  existingStories: GrantStories
): Promise<StoryAnalysis[]> {
  if (!casts || casts.length === 0) {
    throw new Error('Stories data is required');
  }

  // Get cast text with summaries for all casts
  const castTextsPromises = casts.map((cast) =>
    generateCastTextForStory(cast, redisClient, job)
  );
  const castTexts = await Promise.all(castTextsPromises);

  // Combine all cast content and summaries
  const combinedContent = castTexts
    .map((text, index) => ({
      content: text,
      timestamp: casts[index].timestamp,
    }))
    .sort(
      (a, b) => (a.timestamp?.getTime() || 0) - (b.timestamp?.getTime() || 0)
    );

  log('Generating stories', job);

  const text = await generateStoryText(
    combinedContent,
    existingStories,
    grant,
    parentGrant,
    job
  );

  const { object } = await retryAiCallWithBackoff(
    (model) => () =>
      generateObject({
        model,
        schema: getStoryObjectSchema(),
        messages: [
          {
            role: 'system',
            content: getStoryObjectSystemPrompt(),
          },
          {
            role: 'user',
            content: text.text,
          },
        ],
        maxTokens: 4000,
      }),
    job,
    [anthropicModel, openAIModel]
  );

  console.log(JSON.stringify(object, null, 2));

  const stories = object.stories;
  const populatedStories = await populateGeneratedStories(
    object,
    stories,
    job,
    redisClient
  );

  // for (const story of populatedStories) {
  //   const relatedCasts = await getRelatedCasts(story, redisClient, job);
  //   console.log({ relatedCasts });
  //   throw new Error('stop');
  //   // story.relatedCasts = relatedCasts;
  // }

  return populatedStories;
}
