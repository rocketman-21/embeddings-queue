import { StoryAnalysis } from '../build-story/story-analysis';
import { anthropicModel, openAIModel, retryAiCallWithBackoff } from '../../ai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { Job } from 'bullmq';
import { MediaInfo } from '../utils/media-utils';

export const selectBestImage = async (
  imageUrls: MediaInfo[],
  story: Omit<StoryAnalysis, 'headerImage' | 'id' | 'mediaUrls'>,
  job: Job
): Promise<string | null> => {
  const { object } = await retryAiCallWithBackoff(
    (model) => () =>
      generateObject({
        model,
        schema: z.object({
          bestImageUrl: z.string().describe('URL of the best image for header'),
          reason: z.string().describe('Reason this image was selected'),
        }),
        messages: [
          {
            role: 'system',
            content:
              'You are an AI assistant that analyzes images to select the best header image for a story.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Story Title: ${story.title}
  Story Summary: ${story.summary}
  Available Images: ${imageUrls.map((img) => `${img.url}${img.description ? ` - ${img.description}` : ''}`).join('\n')}
  
  Please analyze these images and select the best one for the story header based on:
  1. Image quality and resolution
  2. Relevance to story content
  3. Visual appeal and composition
  4. Professional appearance
  5. Ability to capture reader attention
  
  Select the image that best represents the story's main theme or impact.`,
              },
            ],
          },
        ],
        maxTokens: 1000,
      }),
    job,
    [anthropicModel, openAIModel]
  );

  return object.bestImageUrl;
};
