import { Job } from 'bullmq';
import { describeImage } from '../multi-media/image/describe-image';
import { RedisClientType } from 'redis';
import { describeVideo } from '../multi-media/video/describe-video';
import { safeTrim } from '../builders/utils';
import { farcasterDb } from '../../database/farcasterDb';
import { FarcasterCast, farcasterCasts } from '../../database/farcaster-schema';
import { log } from '../helpers';
import { eq } from 'drizzle-orm';
import { describeZora } from '../multi-media/zora/describe-zora';
import { describeYoutubeVideo } from '../multi-media/youtube/describe';
import { describeCast } from '../casts/describe-cast';

// Get URL summaries from a list of URLs
export const fetchUrlSummaries = async (
  redisClient: RedisClientType,
  job: Job,
  urls?: string[]
): Promise<string[]> => {
  if (!urls?.length) return [];

  const summaries = await Promise.all(
    urls.map(async (url) => {
      if (!url) return null;

      let summary: string | null = null;

      if (isCastUrl(url)) {
        summary = await describeCast(url, redisClient, job);
        summary = `Quoted post: ${summary}`;
      } else if (url.includes('zora.co')) {
        summary = await describeZora(url, redisClient, job);
        summary = `Zora mint: ${summary}`;
      } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        summary = await describeYoutubeVideo(url, redisClient, job);
        summary = `Youtube video: ${summary}`;
      } else if (url.includes('m3u8')) {
        summary = await describeVideo(url, redisClient, job);
        summary = `Attached video: ${summary}`;
      } else {
        summary = await describeImage(url, redisClient, job);
        if (summary && safeTrim(summary) === '""') {
          summary = null;
        }
      }

      return summary;
    })
  );

  return summaries.filter((s): s is string => !!s && safeTrim(s) !== '');
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
  if (castHash.length !== 20) {
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

export function isCastUrl(url: string): boolean {
  // Match both short and full hash formats
  // e.g. warpcast.com/username/0x8646adad or warpcast.com/username/0x8646adadbef1bdc9a8daf15f70994c36de823543
  const castUrlPattern =
    /^https?:\/\/(?:www\.)?warpcast\.com\/[\w-]+\/0x[a-fA-F0-9]{8,40}$/;
  return castUrlPattern.test(url);
}
