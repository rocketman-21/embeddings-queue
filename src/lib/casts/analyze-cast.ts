import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { IsGrantUpdateJobBody } from '../../types/job';
import { log } from '../helpers';
import { RedisClientType } from 'redis';
import { Job } from 'bullmq';
import { anthropicModel, retryAiCallWithBackoff } from '../ai';
import { googleAiStudioModel, openAIModel } from '../ai';
import { cacheCastAnalysis, CastAnalysis } from './cache';
import { getCachedCastAnalysis } from './cache';
import { saveUrlSummariesForCastHash } from '../url-summaries/attachments';
import { getBuilderProfile } from '../../database/queries/profiles/get-builder-profile';
import { updateCastImpactVerifications } from './impact-verification';
import { getCastHash } from './utils';

const PROMPT_VERSION = '1.0';

export async function analyzeCast(
  redisClient: RedisClientType,
  data: IsGrantUpdateJobBody,
  job: Job
): Promise<CastAnalysis> {
  if (!data.castContent && data.urls.length === 0) {
    throw new Error('Cast content or urls are required');
  }

  const castHash = getCastHash(data.castHash);

  // Check cache first
  const cachedAnalysis = await getCachedCastAnalysis(
    redisClient,
    castHash,
    data.grantId
  );
  if (cachedAnalysis) {
    log('Returning cached cast analysis', job);
    return cachedAnalysis;
  }

  const [summaries, builderProfile] = await Promise.all([
    saveUrlSummariesForCastHash(castHash, data.urls, redisClient, job),
    getBuilderProfile(parseInt(data.builderFid)),
  ]);

  log('Working on detailed cast analysis', job);

  const text = await retryAiCallWithBackoff(
    (model) => () =>
      generateText({
        model,
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: getTextFromCastContent(
                  data.castContent,
                  data.grantId,
                  data.grantDescription,
                  data.parentFlowDescription,
                  summaries,
                  builderProfile
                ),
              },
            ],
          },
          {
            role: 'assistant',
            content: [
              {
                type: 'text',
                text: '<detailed_analysis>',
              },
            ],
          },
        ],
        maxTokens: 1500,
      }),
    job,
    [anthropicModel, openAIModel, googleAiStudioModel]
  );

  const { object } = await retryAiCallWithBackoff(
    (model) => () =>
      generateObject({
        model,
        schema: z.object({
          isGrantUpdate: z.boolean(),
          reason: z
            .string()
            .describe("Reason for why it's a grant update, or not"),
          confidenceScore: z
            .number()
            .describe("Confidence score whether it's a grant update or not"),
        }),
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant that is receiving a detailed analysis of a cast and needs to determine if it qualifies as a grant update.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: text.text,
              },
            ],
          },
        ],
      }),
    job,
    [anthropicModel, openAIModel, googleAiStudioModel]
  );

  const result = {
    ...object,
    castHash: data.castHash,
    grantId: data.grantId,
  };

  // Cache the analysis
  await cacheCastAnalysis(redisClient, castHash, data.grantId, result);

  await updateCastImpactVerifications(
    castHash,
    result,
    anthropicModel.modelId,
    PROMPT_VERSION,
    job
  );

  return result;
}

function getTextFromCastContent(
  castContent: string,
  grantId: string,
  grantDescription: string,
  parentFlowDescription: string,
  summaries: string[],
  builderProfile: { content: string | null }
): string {
  const prompt = `You are an AI assistant tasked with analyzing social media posts ("casts") to determine if they qualify as updates for specific grants. Your goal is to accurately identify genuine grant updates while filtering out unrelated content or general comments about grant programs.

Here's the information you'll be working with:

1. Cast Content:
<cast_content>
${castContent || 'NO CAST CONTENT PROVIDED'}
</cast_content>

2. Grant Description:
<grant_description>
Grant ID: ${grantId}
Description: ${grantDescription}
Parent Flow Description: ${parentFlowDescription}
</grant_description>

3. Builder Profile:
<builder_profile>
${builderProfile?.content}
</builder_profile>

4. Attachments:
${
  summaries.length
    ? `The update contains the following attachments posted by the user: ${summaries.join(', ')}`
    : 'The update contains no attachments'
}

Please analyze the cast content to determine if it qualifies as a grant update. Follow these steps in your analysis:

1. Review the cast content, grant description, and builder profile carefully.
2. List relevant quotes from each source.
3. Determine if the cast is related to the grant work described in the grant description.
4. Verify that the work or activity described in the cast is being done by the grant recipient themselves.
5. Check if the work falls within the scope of the grant and parent flow requirements.
6. Consider any images or attachments mentioned in the cast as part of your analysis.
7. List pros and cons for whether the cast qualifies as a grant update.
8. Be absolutely sure that the work or impact being shared is not just re-posted work of others.

Wrap your analysis in <detailed_analysis> tags. After your analysis, provide your determination:

<determination>
grantId: [grantId if it's a grant update, empty string if not]
confidence_score: [your confidence score if it's a grant update, on a scale of 0-100]
explanation: [brief explanation of your decision]
</determination>

Important considerations:

- If the cast content is not provided, there must be attachments to determine if it's a grant update
- The cast must describe concrete actions, progress, or tangible contributions related to the grant's goals
- Do not count as updates:
  - Generic comments about grants program
  - Work not done by the grant recipient themselves
  - Token minting unless they authored the media
  - Statements only expressing:
    - General enthusiasm
    - Future intentions 
    - Motivational phrases
    - Slogans/catchphrases
    - Personal philosophies
  - Side projects mentioned in grant description
  
- You can count as updates:
  - Community building activities involving others if led by recipient
  - Work within Nouns sub-cultures (Gnars DAO for extreme sports, Vrbs for public good/artists) if grant-related
  - Basic logical assumptions (e.g. buying supplies without mentioning grant)

If unsure, err on the side of not counting it as an update. The builder profile may be a few days old.

Please begin your analysis now.`;

  return prompt;
}
