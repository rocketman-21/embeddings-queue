import { generateObject, generateText } from 'ai';
import { z } from 'zod';
import { IsGrantUpdateJobBody } from '../../../types/job';
import { log } from '../../helpers';
import { RedisClientType } from 'redis';
import { Job } from 'bullmq';
import { anthropicModel, retryAiCallWithBackoff } from '../../ai';
import { googleAiStudioModel, openAIModel } from '../../ai';
import { cacheCastAnalysis, CastAnalysis } from '../cache';
import { getCachedCastAnalysis } from '../cache';
import { saveUrlSummariesForCastHash } from '../../url-summaries/attachments';
import { getBuilderProfile } from '../../../database/queries/profiles/get-builder-profile';
import { updateCastImpactVerifications } from '../impact-verification';
import { getCastHash } from '../utils';
import { getGrantsByAddresses } from '../../../database/queries/grants/get-grant-by-addresses';
import { getFarcasterProfile } from '../../../database/queries/profiles/get-profile';
import { getTextFromCastContent } from './prompt-text';

const PROMPT_VERSION = '1.1';

// version history
// 1.1 - Added multiple grant support to prevent duplicates for builders receiving multiple grants

export async function analyzeCast(
  redisClient: RedisClientType,
  data: IsGrantUpdateJobBody,
  job: Job
): Promise<CastAnalysis> {
  if (!data.castContent && data.urls.length === 0) {
    throw new Error('Cast content or urls are required');
  }

  const fid = data.builderFid.toString();

  const profile = await getFarcasterProfile(parseInt(fid));

  if (!profile?.verifiedAddresses?.length) {
    throw new Error(
      `Builder profile cannot be linked to any grants: ${JSON.stringify(profile)}`
    );
  }

  const grants = await getGrantsByAddresses(profile.verifiedAddresses);

  if (!grants?.length) {
    throw new Error(
      `Builder profile is linked to grants but no grants were found: ${JSON.stringify(
        profile
      )}`
    );
  }

  const castHash = getCastHash(data.castHash);

  // Check cache first
  const cachedAnalysis = await getCachedCastAnalysis(redisClient, castHash);
  if (cachedAnalysis) {
    log('Returning cached cast analysis', job);
    return cachedAnalysis;
  }

  const [summaries, builderProfile] = await Promise.all([
    saveUrlSummariesForCastHash(castHash, data.urls, redisClient, job),
    getBuilderProfile(parseInt(data.builderFid)),
  ]);

  log('Working on detailed cast analysis', job);

  const castText = getTextFromCastContent(
    data.castContent,
    grants,
    summaries,
    { fname: profile.fname, fid: profile.fid, bio: profile.bio },
    builderProfile
  );

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
                text: castText,
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
          grantId: z
            .string()
            .describe('Grant ID that the cast most qualifies for'),
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
  };

  // Cache the analysis
  await cacheCastAnalysis(redisClient, castHash, result);

  await updateCastImpactVerifications(
    castHash,
    result,
    anthropicModel.modelId,
    PROMPT_VERSION,
    job
  );

  return result;
}
