import { Job } from 'bullmq';
import { describeImage } from '../multi-media/image/describe-image';
import { RedisClientType } from 'redis';
import { describeVideo } from '../multi-media/video/describe-video';
import { safeTrim } from '../builders/utils';
import { farcasterDb } from '../../database/farcasterDb';
import { FarcasterCast, farcasterCasts } from '../../database/farcaster-schema';
import { log } from '../helpers';
import { eq, sql } from 'drizzle-orm';
import { describeZora } from '../multi-media/zora/describe-zora';

// Get URL summaries from a list of URLs
export const fetchUrlSummaries = async (
  redisClient: RedisClientType,
  job: Job,
  urls?: string[]
): Promise<string[]> => {
  const summaries: string[] = [];
  let type: 'image' | 'video' | null = null;

  if (urls && urls.length > 0) {
    // Process each URL
    for (const url of urls) {
      if (!url) continue;

      // Determine type and collect URLs
      if (url.includes('m3u8')) {
        type = 'video';
      } else {
        type = 'image';
      }

      if (url.includes('zora.co')) {
        const summary = await describeZora(url, redisClient, job);
        log(`Zora summary: ${summary}`, job);
        if (summary) {
          summaries.push(summary);
        }
      } else if (type === 'image') {
        const summary = await describeImage(url, redisClient, job);
        // Only add non-empty summaries that aren't just empty quotes
        if (summary && safeTrim(summary) !== '""' && safeTrim(summary) !== '') {
          summaries.push(summary);
        }
      } else if (type === 'video') {
        const summary = await describeVideo(url, redisClient, job);
        if (summary) {
          summaries.push(summary);
        }
      }
    }
  }

  return summaries;
};

export async function getAndSaveUrlSummaries(
  embeds: FarcasterCast['embeds'],
  embedSummaries: FarcasterCast['embedSummaries'],
  castId: FarcasterCast['id'],
  redisClient: RedisClientType,
  job: Job
) {
  if (!embeds) return [];

  const embedUrls = JSON.parse(embeds).map(
    (embed: { url: string }) => embed.url
  );
  const numEmbedSummaries = embedSummaries?.length || 0;
  const hasEmbedSummariesSaved = numEmbedSummaries > 0;

  const newEmbedSummaries =
    hasEmbedSummariesSaved && embedSummaries
      ? embedSummaries
      : await fetchUrlSummaries(redisClient, job, embedUrls);

  if (!hasEmbedSummariesSaved && (newEmbedSummaries.length || 0) > 0) {
    // ensure we don't save empty embed summaries
    const nonEmptyEmbedSummaries = newEmbedSummaries.filter(
      (summary) => summary.length > 0
    );

    await farcasterDb
      .update(farcasterCasts)
      .set({ embedSummaries: nonEmptyEmbedSummaries })
      .where(eq(farcasterCasts.id, Number(castId)));

    log(`Saved ${newEmbedSummaries.length} embed summaries to db`, job);
  }

  return newEmbedSummaries;
}

export async function saveUrlSummariesForCastHash(
  castHash: FarcasterCast['hash'],
  urls: string[],
  redisClient: RedisClientType,
  job: Job
) {
  if (!castHash) throw new Error('Cast hash is required');
  if (castHash.length !== 42) {
    throw new Error(
      `Cast hash is not valid length: ${castHash}, ${castHash.length}`
    );
  }

  // Get existing cast to check for embed summaries
  const existingCast = await farcasterDb
    .select({ embedSummaries: farcasterCasts.embedSummaries })
    .from(farcasterCasts)
    .where(eq(farcasterCasts.hash, castHash))
    .limit(1);

  if (!existingCast.length) {
    throw new Error(`Cast not found for hash: ${castHash}`);
  }

  // Return existing summaries if present
  // but if the urls include zora.co, then don't return existing summaries
  if (
    existingCast[0].embedSummaries &&
    existingCast[0].embedSummaries.length > 0
  ) {
    return existingCast[0].embedSummaries;
  }

  const summaries = await fetchUrlSummaries(redisClient, job, urls);

  const d = await farcasterDb
    .update(farcasterCasts)
    .set({ embedSummaries: summaries })
    .where(eq(farcasterCasts.hash, castHash));

  log(`Saved ${d.rowCount} embed summaries to db`, job);

  return summaries;
}
