import { eq, sql } from 'drizzle-orm';
import { farcasterCasts } from '../../database/farcaster-schema';
import { farcasterDb } from '../../database/farcasterDb';
import { CastAnalysis } from './cache';
import { Job } from 'bullmq';
import { log } from '../helpers';

export interface ImpactVerification {
  model: string;
  score: number;
  reason: string;
  is_grant_update: boolean;
  prompt_version: string;
  grant_id: string | undefined;
}

export async function updateCastImpactVerifications(
  castHash: Buffer,
  result: CastAnalysis,
  model: string,
  promptVersion: string,
  job: Job
): Promise<void> {
  if (!castHash) throw new Error('Cast hash is required');
  if (castHash.length !== 42) {
    throw new Error(
      `Cast hash is not valid length: ${castHash}, ${castHash.length}`
    );
  }

  const impactVerification: ImpactVerification = {
    model: model,
    score: result.confidenceScore,
    reason: result.reason,
    is_grant_update: result.isGrantUpdate,
    prompt_version: promptVersion,
    grant_id: result.grantId,
  };

  // Get the existing cast first
  const cast = await farcasterDb
    .select({ impactVerifications: farcasterCasts.impactVerifications })
    .from(farcasterCasts)
    .where(eq(farcasterCasts.hash, castHash))
    .limit(1);

  if (!cast || !cast[0]) {
    throw new Error(`Cast not found with hash ${castHash}`);
  }

  // Get existing verifications or empty array
  const existingVerifications = Array.isArray(cast[0].impactVerifications)
    ? (cast[0].impactVerifications as unknown as ImpactVerification[])
    : ([] as ImpactVerification[]);

  // Remove any existing verification with same model/version/grantId
  const filteredVerifications = existingVerifications.filter(
    (v: ImpactVerification) =>
      !(
        v.model === model &&
        v.prompt_version === promptVersion &&
        v.grant_id === result.grantId
      )
  );

  // Add the new verification
  const updatedVerifications = [...filteredVerifications, impactVerification];

  const res = await farcasterDb
    .update(farcasterCasts)
    .set({
      impactVerifications: updatedVerifications,
    })
    .where(eq(farcasterCasts.hash, castHash));

  log(
    `Updated impact verifications for cast ${castHash} on ${res.rowCount} rows`,
    job
  );
}
