import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { LanguageModelV1 } from 'ai';
import { Job } from 'bullmq';
import { log } from './helpers';

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

const anthropic = createAnthropic({
  apiKey: anthropicApiKey,
});

const openai = createOpenAI({
  apiKey: openaiApiKey,
});

const googleAiStudio = createGoogleGenerativeAI({
  apiKey: googleAiStudioKey,
});

export const anthropicModel = anthropic('claude-3-5-sonnet-20241022');
export const openAIModel = openai('gpt-4o-2024-11-20');
export const openAIModelO1Mini = openai('o1-mini');
export const googleAiStudioModel = googleAiStudio('gemini-1.5-pro');

export async function retryAiCallWithBackoff<T>(
  fnFactory: (model: any) => () => Promise<T>,
  job: Job,
  models: LanguageModelV1[],
  retries: number = 4,
  delay: number = 20000,
  modelIndex: number = 0
): Promise<T> {
  const currentModel = models[modelIndex];

  try {
    return await fnFactory(currentModel)();
  } catch (error: any) {
    const transientErrorCodes = [
      'ENOTFOUND',
      'ECONNRESET',
      'ETIMEDOUT',
      'EAI_AGAIN',
    ];

    const isTransientError =
      transientErrorCodes.includes(error.code) ||
      error.status >= 500 ||
      error.message?.includes('too_many_requests') ||
      error.message?.includes('rate limit') ||
      error.message?.includes('429');

    const status = error?.status || error?.code || 'Unknown';
    log(
      `Error with model ${currentModel.modelId}: ${error.message}. Status: ${status}. Retries left: ${retries}`,
      job
    );

    if (isRateLimitError(error) && modelIndex + 1 < models.length) {
      // Switch to the next model
      const nextModelIndex = modelIndex + 1;
      log(
        `Switching to model ${
          models[nextModelIndex].modelId
        } due to rate limit`,
        job
      );
      return retryAiCallWithBackoff(
        fnFactory,
        job,
        models,
        retries,
        delay,
        nextModelIndex
      );
    } else if (retries > 0 && isTransientError) {
      const retryDelay = isRateLimitError(error) ? delay * 4 : delay * 2;
      log(`Retrying after ${retryDelay} ms with model ${currentModel}...`, job);
      await new Promise((resolve) => setTimeout(resolve, retryDelay));
      return retryAiCallWithBackoff(
        fnFactory,
        job,
        models,
        retries - 1,
        retryDelay,
        modelIndex
      );
    } else {
      throw error;
    }
  }
}

function isRateLimitError(error: any): boolean {
  const errorMessage = error.message?.toLowerCase() || '';
  return (
    // OpenAI patterns
    errorMessage.includes('too_many_requests') ||
    errorMessage.includes('rate limit') ||
    errorMessage.includes('429') ||
    // Google patterns
    errorMessage.includes('resource_exhausted') ||
    errorMessage.includes('quota exceeded') ||
    // Anthropic patterns
    errorMessage.includes('rate_limit_error') ||
    errorMessage.includes('too_many_requests') ||
    // Generic status code check
    error.status === 429 ||
    error.code === 429
  );
}
