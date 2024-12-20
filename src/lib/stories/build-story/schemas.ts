import { z } from 'zod';
import { DR_GONZO_ADDRESS } from '../../config';
import { StructuredOutputParser } from '@langchain/core/output_parsers';

const storyEdit = z.object({
  message: z.string().describe('The edit message'),
  address: z.string().describe('The address of the editor'),
  timestamp: z.string().describe('The timestamp of the edit'),
});

export const storyEditsSchema = z.object({
  edits: z.array(storyEdit),
});

export const getStoryObjectSchema = z.object({
  stories: z.array(
    z.object({
      title: z.string().describe('A concise title for the story'),
      summary: z.string().describe('A comprehensive summary of all events'),
      keyPoints: z.array(z.string()).describe('Key points from the story'),
      tagline: z.string().describe('A short tagline for the story'),
      timeline: z
        .array(
          z.object({
            timestamp: z.string(),
            event: z.string(),
          })
        )
        .describe('Timeline of major events'),
      castHashes: z
        .array(z.string())
        .describe('The ids of the casts that are part of the story'),
      sentiment: z
        .enum(['positive', 'negative', 'neutral'])
        .describe('Overall sentiment of the story'),
      completeness: z.number().min(0).max(1).describe('Story completeness'),
      sources: z
        .array(z.string())
        .describe(
          'Sources of the story, including the cast URLs if applicable'
        ),
      infoNeededToComplete: z
        .string()
        .describe('Information needed to complete the story')
        .optional(),
      mintUrls: z
        .array(z.string())
        .describe('Mint urls from the story')
        .optional(),
      author: z
        .string()
        .describe(
          'The ETH address of the author (yours is ' + DR_GONZO_ADDRESS + ')'
        )
        .optional(),
    })
  ),
});

export const storyObjectParser =
  StructuredOutputParser.fromZodSchema(getStoryObjectSchema);
