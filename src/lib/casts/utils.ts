import { Job } from 'bullmq';
import { getAndSaveUrlSummaries } from '../url-summaries/attachments';
import { RedisClientType } from 'redis';
import { CastWithParent } from '../../database/queries/casts/casts-with-parent';
import {
  CastForStory,
  StoryCastReply,
} from '../../database/queries/casts/casts-for-story';
import { ImpactVerification } from './impact-verification';

function getEmbedUrls(embeds: string | null): string[] {
  if (!embeds) return [];
  return JSON.parse(embeds).map((embed: { url: string }) => embed.url);
}

function generateCastUrl(
  fname: string | undefined,
  hash: Buffer | null
): string {
  return `https://warpcast.com/${fname}/0x${hash?.toString('hex')}`;
}

function formatParentCastSection(
  parentCast: CastWithParent['parentCast'],
  parentEmbedSummaries: string[]
): string {
  if (!parentCast?.text) return '';

  const parentAuthor = parentCast.fname
    ? `AUTHOR: ${parentCast.fname} (fid: ${parentCast.fid})`
    : '';
  const parentContent = `CONTENT: ${parentCast.text}`;
  const attachments = parentEmbedSummaries.length
    ? `ATTACHMENTS: ${parentEmbedSummaries.join(' | ')}`
    : '';

  return `PARENT_CAST: {
  ${parentAuthor}
  ${parentContent}
  ${attachments}
}`;
}

export async function generateCastText(
  cast: CastWithParent,
  redisClient: RedisClientType,
  job: Job
): Promise<string> {
  if (!cast.timestamp) {
    throw new Error('Cast timestamp is required');
  }

  const embedSummaries = await getAndSaveUrlSummaries(
    cast.embeds,
    cast.embedSummaries,
    cast.id,
    redisClient,
    job
  );

  const embedUrls = getEmbedUrls(cast.embeds);

  let parentEmbedSummaries: string[] = [];
  if (cast.parentCast?.id) {
    parentEmbedSummaries = await getAndSaveUrlSummaries(
      cast.parentCast.embeds,
      cast.parentCast.embedSummaries,
      cast.parentCast.id,
      redisClient,
      job
    );
  }

  if (!cast.timestamp) {
    throw new Error('Cast timestamp is required');
  }

  const mainSection = formatCastMainDescription(
    cast.timestamp,
    cast.text,
    cast.profile?.fname ?? '',
    cast.hash,
    embedSummaries,
    embedUrls
  );
  const parentCastSection = formatParentCastSection(
    cast.parentCast,
    parentEmbedSummaries
  );

  return `${mainSection}
${parentCastSection}
---`;
}

export function formatCastMainDescription(
  timestamp: Date,
  text: string | null,
  fname: string,
  hash: Buffer | null,
  embedSummaries: string[],
  embedUrls: string[]
): string {
  const contentText = text ? `CONTENT: ${text}` : '';
  const castUrl = generateCastUrl(fname, hash);
  const attachments = embedSummaries.length
    ? `ATTACHMENTS: ${embedSummaries.join(' | ')}`
    : '';
  const attachmentUrls = embedUrls.length
    ? `ATTACHMENT_URLS: ${embedUrls.join(' | ')}`
    : '';

  return `CAST_AUTHOR: ${fname}
TIMESTAMP: ${new Date(timestamp).toISOString()}
${contentText}
CAST_URL: ${castUrl}
${attachments}
${attachmentUrls}`;
}

export function formatRepliesSection(replies: StoryCastReply[] | null): string {
  if (!replies?.length) return '';

  return replies
    .filter((reply) => reply.text && reply.hash)
    .map(formatSingleReply)
    .join('\n');
}

function formatSingleReply(reply: StoryCastReply): string {
  if (!reply.fname) throw new Error('Reply author is required');

  const bufferHash =
    typeof reply.hash === 'string'
      ? Buffer.from(reply.hash.replace('0x', '').replace('\\x', ''), 'hex')
      : reply.hash;

  const replyUrl = generateCastUrl(reply.fname, bufferHash);

  const attachments = reply.embedSummaries?.length
    ? `REPLY_ATTACHMENTS: ${reply.embedSummaries.join(' | ')}`
    : '';

  const embedUrls = reply.embeds ? getEmbedUrls(reply.embeds) : [];
  const attachmentUrls = embedUrls.length
    ? `REPLY_ATTACHMENT_URLS: ${embedUrls.join(' | ')}`
    : '';

  const timestamp = reply.timestamp
    ? `TIMESTAMP: ${new Date(reply.timestamp).toISOString()}`
    : '';

  return `REPLY_AUTHOR: ${reply.fname}
${timestamp}
REPLY: ${reply.text}
REPLY_URL: ${replyUrl}
${attachments}
${attachmentUrls}`;
}

export async function generateCastTextForStory(
  cast: CastForStory,
  redisClient: RedisClientType,
  job: Job
): Promise<string> {
  if (!cast.timestamp) {
    throw new Error('Cast timestamp is required');
  }

  // Get embed summaries from cache or generate new ones
  const embedSummaries = await getAndSaveUrlSummaries(
    cast.embeds,
    cast.embedSummaries,
    cast.id,
    redisClient,
    job
  );

  const embedUrls = getEmbedUrls(cast.embeds);

  if (!cast.profile?.fname) throw new Error('Cast author is required');

  const contentText = cast.text ? `CONTENT: ${cast.text}` : '';
  const castUrl = generateCastUrl(cast.profile?.fname, cast.hash);
  const attachments = embedSummaries.length
    ? `ATTACHMENTS: ${embedSummaries.join(' | ')}`
    : '';
  const attachmentUrls = embedUrls.length
    ? `ATTACHMENT_URLS: ${embedUrls.join(' | ')}`
    : '';

  const grantUpdateReason = JSON.stringify(
    ((cast.impactVerifications as ImpactVerification[]) || []).filter(
      (v) =>
        v.is_grant_update &&
        v.grant_id &&
        cast.computedTags?.includes(v.grant_id)
    )
  );

  const repliesSection = cast.replies ? formatRepliesSection(cast.replies) : '';

  return `TIMESTAMP: ${new Date(cast.timestamp).toISOString()}
${contentText}
CAST_URL: ${castUrl}
${attachments}
${attachmentUrls}
${repliesSection}
${grantUpdateReason ? `IMPACT_VERIFICATION: ${grantUpdateReason}` : ''}
---`;
}

export function getCastHash(castHash: string): Buffer {
  return Buffer.from(castHash.replace('0x', ''), 'hex');
}
