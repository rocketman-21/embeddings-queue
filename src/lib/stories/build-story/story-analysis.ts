import { Job } from 'bullmq';
import { GrantStories } from '../../../database/queries/stories/get-grant-stories';
import { DR_GONZO_ADDRESS } from '../config';
import {
  anthropicModel,
  openAIModel,
  googleAiStudioModel,
  retryAiCallWithBackoff,
} from '../../ai';
import { generateObject, generateText } from 'ai';
import { getStoryObjectSchema } from './schemas';
import {
  getStoryObjectSystemMessage,
  getStoryObjectMessage,
} from './prompts/story-object';
import {
  getGenerateStorySystemMessage,
  getGenerateStoryMessage,
} from './prompts/generate-story';
import { log } from '../../helpers';
import { processStories } from './edits';
import { LimitedStory } from './populate-story-data';

export async function generateStory(
  combinedContent: {
    content: string;
    timestamp: Date | null;
  }[],
  existingStories: GrantStories,
  grant: { description: string },
  parentGrant: { description: string },
  job: Job
): Promise<LimitedStory[]> {
  const result = await retryAiCallWithBackoff(
    (model) => () =>
      generateText({
        model,
        messages: [
          {
            role: 'system',
            content: getGenerateStorySystemMessage(),
          },
          {
            role: 'user',
            content: getGenerateStoryMessage(
              existingStories,
              combinedContent,
              grant.description,
              parentGrant.description,
              DR_GONZO_ADDRESS
            ),
          },
        ],
      }),
    job,
    [anthropicModel]
  );

  log('Generated story data', job);
  log(result.text, job);

  log('Generating story object', job);

  const { object } = await retryAiCallWithBackoff(
    (model) => () =>
      generateObject({
        model,
        schema: getStoryObjectSchema,
        messages: [
          {
            role: 'system',
            content: getStoryObjectSystemMessage(),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: getStoryObjectMessage(result.text, existingStories),
              },
            ],
          },
        ],
      }),
    job,
    [anthropicModel, openAIModel, googleAiStudioModel]
  );

  const newStories = await processStories(existingStories, object.stories, job);

  return newStories;
}
