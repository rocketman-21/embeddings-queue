import { RedisClientType } from 'redis';
import { cacheResult, getCachedResult } from '../cache/cacheResult';

const CAST_ANALYSIS_CACHE_PREFIX = 'ai-cast-analysis-v3:';

export interface CastAnalysis {
  grantId?: string;
  isGrantUpdate: boolean;
  reason: string;
  confidenceScore: number;
  castHash: string;
}

export async function getCachedCastAnalysis(
  redisClient: RedisClientType,
  castHash: Buffer,
  grantId: string
): Promise<CastAnalysis | null> {
  return await getCachedResult<CastAnalysis>(
    redisClient,
    `${castHash.toString('hex')}:${grantId}`,
    CAST_ANALYSIS_CACHE_PREFIX
  );
}

export async function cacheCastAnalysis(
  redisClient: RedisClientType,
  castHash: Buffer,
  grantId: string,
  analysis: CastAnalysis
): Promise<void> {
  await cacheResult(
    redisClient,
    `${castHash.toString('hex')}:${grantId}`,
    CAST_ANALYSIS_CACHE_PREFIX,
    async () => analysis
  );
}
