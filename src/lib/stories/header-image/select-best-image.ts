import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from 'langchain/output_parsers';
import { Job } from 'bullmq';
import { MediaInfo } from '../utils/media-utils';
import { LimitedStory } from '../build-story/populate-story-data';
import { anthropicModelWithFallback } from '../../models';
import { storyDataPrompt, storySelectionSystemMessage } from './prompts';
import { imageSelectionSchema } from './schemas';

export const selectBestImage = async (
  imageUrls: MediaInfo[],
  story: Pick<LimitedStory, 'title' | 'summary'>,
  job: Job
): Promise<string | null> => {
  if (imageUrls.length === 0) {
    return null;
  }

  const parser = StructuredOutputParser.fromZodSchema(imageSelectionSchema);

  const chain = storySelectionPrompt
    .pipe(anthropicModelWithFallback)
    .pipe(parser);

  const result = await chain.invoke({
    title: story.title,
    summary: story.summary,
    images: imageUrls
      .map(
        (img) => `${img.url}${img.description ? ` - ${img.description}` : ''}`
      )
      .join('\n'),
    format_instructions: parser.getFormatInstructions(),
  });

  return result.bestImageUrl || null;
};

const storySelectionPrompt = ChatPromptTemplate.fromMessages([
  storySelectionSystemMessage,
  storyDataPrompt,
]);
