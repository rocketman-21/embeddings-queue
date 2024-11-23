import { farcasterCasts } from '../../../database/farcaster-schema';
import { inArray } from 'drizzle-orm';
import { StoryAnalysis } from '../build-story/story-analysis';
import { Job } from 'bullmq';
import { farcasterDb } from '../../../database/farcasterDb';
import { RedisClientType } from 'redis';
import { log } from '../../helpers';
import { getCastHash } from '../../casts/utils';
import { getTokenMetadataForUrl } from '../../../database/queries/token-metadata/get-token-metadata-for-url';
import { describeZora } from '../../multi-media/zora/describe-zora';
import {
  MediaInfo,
  isImageUrl,
  processEmbed,
  processImageUrl,
  processZoraUrl,
} from '../utils/media-utils';
import { selectBestImage } from './utils';

const isUrlInArray = (url: string, imageUrls: MediaInfo[]) => {
  return imageUrls.some((img) => img.url === url);
};

export async function getHeaderImage(
  story: Omit<StoryAnalysis, 'headerImage' | 'id' | 'mediaUrls'>,
  mediaUrls: string[],
  job: Job,
  redisClient: RedisClientType
): Promise<string | null> {
  const castHashes = story.castHashes.map((hash) => getCastHash(hash));
  if (!castHashes.length) return null;

  const relevantCasts = await farcasterDb
    .select({
      embeds: farcasterCasts.embeds,
      text: farcasterCasts.text,
      embedSummaries: farcasterCasts.embedSummaries,
    })
    .from(farcasterCasts)
    .where(inArray(farcasterCasts.hash, castHashes));

  log(`Found ${relevantCasts.length} relevant casts`, job);

  const imageUrls: MediaInfo[] = [];

  // Process cast embeds
  for (const cast of relevantCasts) {
    if (!cast.embeds) continue;
    const embedsArray = Array.isArray(cast.embeds)
      ? cast.embeds
      : [cast.embeds];

    for (const embed of embedsArray) {
      const result = await processEmbed(
        embed,
        imageUrls.map((img) => img.url),
        redisClient,
        job,
        true,
        cast.embedSummaries
      );
      if (result) imageUrls.push(result);
    }
  }

  // Process media URLs
  if (mediaUrls) {
    for (const url of mediaUrls) {
      if (
        isImageUrl(url) &&
        !url.includes('zora.co') &&
        !isUrlInArray(url, imageUrls)
      ) {
        const result = await processImageUrl(url, redisClient, job);
        if (result) imageUrls.push(result);
      }
    }
  }

  // Process mint URLs
  if (story.mintUrls) {
    for (const url of story.mintUrls) {
      if (url.includes('zora.co') && !isUrlInArray(url, imageUrls)) {
        let metadata = await getTokenMetadataForUrl(url);
        if (!metadata) {
          await describeZora(url, redisClient, job);
          metadata = await getTokenMetadataForUrl(url);
        }
        if (metadata?.image) {
          const result = await processZoraUrl(url, redisClient, job);
          if (result) imageUrls.push(result);
        }
        // add support for animation urls
      }
    }
  }

  if (imageUrls.length === 0) return null;

  return selectBestImage(imageUrls, story, job);
}
