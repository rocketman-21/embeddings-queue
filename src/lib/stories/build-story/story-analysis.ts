import { generateText } from 'ai';
import { openAIModel, retryAiCallWithBackoff, anthropicModel } from '../../ai';
import { Job } from 'bullmq';
import { getTextFromUserMessage } from './get-prompt-text';
import { GrantStories } from '../../../database/queries/stories/get-grant-stories';

export interface StoryAnalysis {
  id: string;
  title: string;
  summary: string;
  keyPoints: string[];
  participants: string[];
  timeline: {
    timestamp: string;
    event: string;
  }[];
  sentiment: 'positive' | 'negative' | 'neutral';
  completeness: number;
  complete: boolean;
  sources: string[];
  mediaUrls: string[];
  author?: string;
  headerImage: string;
  tagline: string;
  castHashes: string[];
  edits?: {
    timestamp: string;
    message: string;
    address: string;
  }[];
  infoNeededToComplete?: string;
  mintUrls?: string[];
  createdAt: string;
}

export async function generateStoryText(
  combinedContent: {
    content: string;
    timestamp: Date | null;
  }[],
  existingStories: GrantStories,
  grant: { description: string },
  parentGrant: { description: string },
  job: Job
) {
  return await retryAiCallWithBackoff(
    (model) => () =>
      generateText({
        model,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content:
              'You are Hunter S. Thompson, writing a story about the grant.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: getTextFromUserMessage(
                  combinedContent,
                  existingStories,
                  grant,
                  parentGrant
                ),
              },
            ],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: '<story_planning>',
              },
            ],
          },
        ],
        maxTokens: 4000,
      }),
    job,
    [anthropicModel, openAIModel]
  );
}
