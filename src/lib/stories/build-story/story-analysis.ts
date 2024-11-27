import { Job } from 'bullmq';
import { storyGenerationPrompt } from './prompts/generate-story';
import { GrantStories } from '../../../database/queries/stories/get-grant-stories';
import { anthropicModelWithFallback } from '../../models';
import { DR_GONZO_ADDRESS } from '../config';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnableSequence } from '@langchain/core/runnables';
import { storyObjectParser } from './schemas';
import { storyObjectPrompt } from './prompts/story-object';
import { log } from '../../helpers';

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

  const objectChain = storyObjectPrompt
    .pipe(anthropicModelWithFallback)
    .pipe(storyObjectParser);

  const storyChain = RunnableSequence.from([
    generationChain,
    (input) => {
      console.log(`input: ${input}`);
      return {
        storyGenerationText: input,
        format_instructions: storyObjectParser.getFormatInstructions(),
      };
    },
    objectChain,
  ]);

  const result = await storyChain.invoke({
    existingStories: JSON.stringify(existingStories),
    combinedContent: JSON.stringify(combinedContent),
    grantDescription: grant.description,
    parentGrantDescription: parentGrant.description,
    authorAddress: DR_GONZO_ADDRESS,
  });

  log(`result: ${JSON.stringify(result)}`, job);

  return result;
}
