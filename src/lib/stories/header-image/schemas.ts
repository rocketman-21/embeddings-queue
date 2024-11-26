import { z } from 'zod';

// Define the schema for the AI response
export const imageSelectionSchema = z.object({
  bestImageUrl: z.string().describe('URL of the best image for header'),
  reason: z.string().describe('Reason this image was selected'),
});
