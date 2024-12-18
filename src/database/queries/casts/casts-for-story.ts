import { asc, eq, sql } from 'drizzle-orm';
import { farcasterCasts, farcasterProfiles } from '../../farcaster-schema';
import { farcasterDb } from '../../farcasterDb';
import { alias } from 'drizzle-orm/pg-core';

export interface CastForStory
  extends Omit<
    Awaited<ReturnType<typeof fetchCastsForStories>>[number],
    'replies'
  > {
  replies: StoryCastReply[] | null;
}

export interface StoryCastReply {
  text: string | null;
  fid: number | null;
  hash: string | null;
  fname: string | null;
  embeds: string | null;
  timestamp: Date | null;
  embedSummaries: string[] | null;
}

function createRepliesSubquery() {
  const repliesAlias = alias(farcasterCasts, 'replies');

  return farcasterDb
    .select({
      text: repliesAlias.text,
      fid: repliesAlias.fid,
      hash: repliesAlias.hash,
      profile: {
        fid: farcasterProfiles.fid,
        fname: farcasterProfiles.fname,
      },
      embeds: repliesAlias.embeds,
      embedSummaries: repliesAlias.embedSummaries,
      timestamp: repliesAlias.timestamp,
    })
    .from(repliesAlias)
    .leftJoin(farcasterProfiles, eq(repliesAlias.fid, farcasterProfiles.fid))
    .where(
      sql`${repliesAlias.rootParentHash} = ${farcasterCasts.hash}
        AND ${repliesAlias.hash} != ${farcasterCasts.hash}
        AND ${repliesAlias.fid} = ${farcasterCasts.fid}`
    );
}

async function fetchCastsForStories(computedTag: string) {
  const repliesSubquery = createRepliesSubquery();

  return farcasterDb
    .select({
      id: farcasterCasts.id,
      createdAt: farcasterCasts.createdAt,
      timestamp: farcasterCasts.timestamp,
      fid: farcasterCasts.fid,
      hash: farcasterCasts.hash,
      embeds: farcasterCasts.embeds,
      embedSummaries: farcasterCasts.embedSummaries,
      text: farcasterCasts.text,
      computedTags: farcasterCasts.computedTags,
      storyIds: farcasterCasts.storyIds,
      impactVerifications: farcasterCasts.impactVerifications,
      profile: {
        fid: farcasterProfiles.fid,
        fname: farcasterProfiles.fname,
      },
      replies: sql`(
        SELECT json_agg(row_to_json(replies_subquery))
        FROM (${repliesSubquery}) AS replies_subquery
      )`.as('replies'),
    })
    .from(farcasterCasts)
    .leftJoin(farcasterProfiles, eq(farcasterCasts.fid, farcasterProfiles.fid))
    .where(
      sql`${farcasterCasts.computedTags} @> ARRAY[${computedTag}]::text[]
        AND ${farcasterCasts.createdAt} >= NOW() - INTERVAL '1 month'`
    )
    .orderBy(asc(farcasterCasts.timestamp));
}

export async function getAllCastsForStories(
  computedTag: string
): Promise<CastForStory[]> {
  return fetchCastsForStories(computedTag) as Promise<CastForStory[]>;
}
