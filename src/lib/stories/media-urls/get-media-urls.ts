import { farcasterCasts } from '../../../database/farcaster-schema';
import { inArray } from 'drizzle-orm';
import { Job } from 'bullmq';
import { farcasterDb } from '../../../database/farcasterDb';
import { RedisClientType } from 'redis';
import { log } from '../../helpers';
import { getCastHash } from '../../casts/utils';
import { MediaInfo, processEmbed, processZoraUrl } from '../utils/media-utils';
import { LimitedStory } from '../build-story/populate-story-data';

const isUrlInArray = (url: string, imageUrls: string[]) => {
  return imageUrls.some((img) => img === url);
};

export async function getMediaUrls(
  story: LimitedStory,
  job: Job,
  redisClient: RedisClientType
): Promise<string[]> {
  // Get all casts referenced in the story
  const castHashes = story.castHashes.map((hash) => getCastHash(hash));

  if (!castHashes.length) {
    return [];
  }

  const relevantCasts = await farcasterDb
    .select({
      embeds: farcasterCasts.embeds,
      text: farcasterCasts.text,
      embedSummaries: farcasterCasts.embedSummaries,
    })
    .from(farcasterCasts)
    .where(inArray(farcasterCasts.hash, castHashes));

  log(`Found ${relevantCasts.length} relevant casts`, job);

  // Extract media URLs from cast embeds
  const mediaUrls: string[] = [];
  const mediaDescriptions: MediaInfo[] = [];

  // Process cast embeds
  for (let i = 0; i < relevantCasts.length; i++) {
    const cast = relevantCasts[i];
    if (!cast.embeds) continue;

    const embedsArray = Array.isArray(cast.embeds)
      ? cast.embeds
      : JSON.parse(cast.embeds);

    for (const embed of embedsArray) {
      const result = await processEmbed(
        embed,
        mediaUrls,
        redisClient,
        job,
        false,
        cast.embedSummaries
      );
      if (result && !isUrlInArray(result.url, mediaUrls)) {
        mediaUrls.push(result.url);
        mediaDescriptions.push(result);
      }
    }
  }

  // Include any mint URLs from the story
  if (story.mintUrls) {
    for (const url of story.mintUrls) {
      if (url.includes('zora.co') && !isUrlInArray(url, mediaUrls)) {
        const result = await processZoraUrl(url, redisClient, job);
        if (result && !isUrlInArray(result.url, mediaUrls)) {
          mediaUrls.push(result.url);
          mediaDescriptions.push(result);
        }
      }
    }
  }

  return mediaUrls.sort((a, b) => {
    const aIsM3u8 = a.includes('m3u8');
    const bIsM3u8 = b.includes('m3u8');
    if (aIsM3u8 && !bIsM3u8) return -1;
    if (!aIsM3u8 && bIsM3u8) return 1;

    const aDesc = mediaDescriptions.find((m) => m.url === a)?.description || '';
    const bDesc = mediaDescriptions.find((m) => m.url === b)?.description || '';
    return bDesc.length - aDesc.length;
  });
}
