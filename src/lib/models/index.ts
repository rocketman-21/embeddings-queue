import { ChatAnthropic } from '@langchain/anthropic';
import { ChatOpenAI } from '@langchain/openai';

const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
const openaiApiKey = process.env.OPENAI_API_KEY;
const googleAiStudioKey = process.env.GOOGLE_AI_STUDIO_KEY;

if (!anthropicApiKey || !openaiApiKey || !googleAiStudioKey) {
  const missingKeys = [
    !anthropicApiKey && 'ANTHROPIC_API_KEY',
    !openaiApiKey && 'OPENAI_API_KEY',
    !googleAiStudioKey && 'GOOGLE_AI_STUDIO_KEY',
  ].filter(Boolean);
  throw new Error(`Missing required API keys: ${missingKeys.join(', ')}`);
}

export const anthropicModel = new ChatAnthropic({
  apiKey: anthropicApiKey,
  model: 'claude-3-5-sonnet-20241022',
  maxTokens: 8192,
  cache: false,
});

export const openAIModel = new ChatOpenAI({
  apiKey: openaiApiKey,
  model: 'gpt-4o-2024-11-20',
  maxTokens: 8192,
  cache: false,
});

// Combine the primary model with the fallback
export const anthropicModelWithFallback = anthropicModel.withFallbacks([
  openAIModel,
]);
