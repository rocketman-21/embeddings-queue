import { getCast } from '../../database/queries/casts/get-cast';
import { formatCastMainDescription, getCastHash } from './utils';
import { RedisClientType } from 'redis';
import { Job } from 'bullmq';
import { cacheResult } from '../cache/cacheResult';
import { log } from '../helpers';
import { insertMentionsIntoText } from '../mentions/add-mentions';
import { getFarcasterProfilesByFids } from '../../database/queries/profiles/get-profile';

export async function describeCast(
  castUrl: string,
  redisClient: RedisClientType,
  job: Job
): Promise<string> {
  // Check if the URL is in the format https://warpcast.com/jrf/0x99bfa139
  if (/https:\/\/warpcast\.com\/[a-zA-Z0-9]+\/0x[a-fA-F0-9]{8}/.test(castUrl)) {
    log(`Skipping cast ${castUrl} because it is incorrect format`, job);
    return '';
  }

  // Extract cast hash from URL
  const hashMatch = castUrl.match(/\/0x([a-fA-F0-9]{40})/);
  if (!hashMatch) {
    throw new Error(`Invalid cast URL format: ${castUrl}`);
  }

  const castHashStr = hashMatch[1];
  const castHash = getCastHash(castHashStr);

  log(`Describing cast with hash: ${castHashStr}`, job);

  // Get cast data from cache or fetch fresh
  const cast = await cacheResult(redisClient, castHashStr, 'cast:', () =>
    getCast(castHash)
  );

  if (!cast) {
    log(`Cast not found for hash: ${castHashStr}`, job);
    return '';
  }

  if (!cast.timestamp) {
    throw new Error('Cast timestamp is required');
  }

  let castContent = cast.text;

  // Insert mentions into content for production format
  if (cast.mentionsPositionsArray && cast.mentionedFids && castContent) {
    const fnames = await getFarcasterProfilesByFids(cast.mentionedFids);
    castContent = insertMentionsIntoText(
      castContent,
      cast.mentionsPositionsArray,
      cast.mentionedFids,
      fnames.map((f) => f.fname ?? f.fid.toString())
    );
  }

  // Generate description text
  const description = formatCastMainDescription(
    cast.timestamp,
    castContent,
    cast.profile?.fname ?? '',
    cast.hash,
    cast.embedSummaries ?? [],
    cast.embeds
      ? JSON.parse(cast.embeds).map((e: { url: string }) => e.url)
      : []
  );

  log(`Generated description for cast ${castHashStr}: ${description}`, job);

  return description;
}
