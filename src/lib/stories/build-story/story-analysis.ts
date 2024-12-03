import { Job } from 'bullmq';
import { storyGenerationPrompt } from './prompts/generate-story';
import { GrantStories } from '../../../database/queries/stories/get-grant-stories';
import { anthropicModelWithFallback } from '../../models';
import { DR_GONZO_ADDRESS } from '../config';
import { StringOutputParser } from '@langchain/core/output_parsers';
import {
  anthropicModel,
  openAIModel,
  googleAiStudioModel,
  retryAiCallWithBackoff,
} from '../../ai';
import { generateObject } from 'ai';
import { getStoryObjectSchema } from './schemas';
import { getSystemMessage, getUserMessage } from './prompts/story-object';
import { log } from '../../helpers';
import { processStoryEdits } from './edits';

export async function generateStory(
  combinedContent: {
    content: string;
    timestamp: Date | null;
  }[],
  existingStories: GrantStories,
  grant: { description: string },
  parentGrant: { description: string },
  job: Job
) {
  const generationChain = storyGenerationPrompt
    .pipe(anthropicModelWithFallback)
    .pipe(new StringOutputParser());

  const result = await generationChain.invoke({
    existingStories: JSON.stringify(existingStories),
    combinedContent: JSON.stringify(combinedContent),
    grantDescription: grant.description,
    parentGrantDescription: parentGrant.description,
    authorAddress: DR_GONZO_ADDRESS,
  });

  console.log({ result });

  log('Generating story object', job);

  const { object } = await retryAiCallWithBackoff(
    (model) => () =>
      generateObject({
        model,
        schema: getStoryObjectSchema,
        messages: [
          {
            role: 'system',
            content: getSystemMessage(),
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: getUserMessage(result),
              },
            ],
          },
        ],
      }),
    job,
    [anthropicModel, openAIModel, googleAiStudioModel]
  );

  object.stories = await processStoryEdits(
    existingStories,
    object.stories,
    job
  );

  return object;
}
