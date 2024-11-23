import { Job } from 'bullmq';
import { getAndSaveUrlSummaries } from '../url-summaries/attachments';
import { RedisClientType } from 'redis';
import { CastWithParent } from '../../database/queries/casts/casts-with-parent';
import { CastForStory } from '../../database/queries/casts/casts-for-story';
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

  const contentText = cast.text ? `CONTENT: ${cast.text}` : '';
  const castUrl = generateCastUrl(cast.profile?.fname ?? undefined, cast.hash);
  const attachments = embedSummaries.length
    ? `ATTACHMENTS: ${embedSummaries.join(' | ')}`
    : '';
  const attachmentUrls = embedUrls.length
    ? `ATTACHMENT_URLS: ${embedUrls.join(' | ')}`
    : '';
  const parentCastSection = formatParentCastSection(
    cast.parentCast,
    parentEmbedSummaries
  );

  return `TIMESTAMP: ${new Date(cast.timestamp).toISOString()}
${contentText}
CAST_URL: ${castUrl}
${attachments}
${attachmentUrls}
${parentCastSection}
---`;
}

function formatRepliesSection(
  replies:
    | { text: string | null; fid: number | null; hash: string | null }[]
    | null
): string {
  if (!replies || replies.length === 0) {
    return '';
  }

  const replyTexts = replies
    .filter((reply) => reply.text && reply.hash)
    .map((reply) => {
      const replyUrl = generateCastUrl(undefined, getCastHash(reply.hash!));
      return `REPLY: ${reply.text}
REPLY_URL: ${replyUrl}`;
    });

  return replyTexts.join('\n');
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

  const contentText = cast.text ? `CONTENT: ${cast.text}` : '';
  const castUrl = generateCastUrl(cast.profile?.fname ?? undefined, cast.hash);
  const attachments = embedSummaries.length
    ? `ATTACHMENTS: ${embedSummaries.join(' | ')}`
    : '';
  const attachmentUrls = embedUrls.length
    ? `ATTACHMENT_URLS: ${embedUrls.join(' | ')}`
    : '';

  const grantUpdateReason = JSON.stringify(
    (cast.impactVerifications as ImpactVerification[]).filter(
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
