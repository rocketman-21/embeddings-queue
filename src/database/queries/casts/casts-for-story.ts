import { asc, eq, sql } from 'drizzle-orm';
import { farcasterCasts, farcasterProfiles } from '../../farcaster-schema';
import { farcasterDb } from '../../farcasterDb';
import { alias } from 'drizzle-orm/pg-core';

const castsForStories = async (computedTag: string) => {
  const repliesAlias = alias(farcasterCasts, 'replies');

  const repliesSubquery = farcasterDb
    .select({
      text: repliesAlias.text,
      fid: repliesAlias.fid,
      hash: repliesAlias.hash,
      profile: {
        fid: farcasterProfiles.fid,
        fname: farcasterProfiles.fname,
      },
    })
    .from(repliesAlias)
    .leftJoin(farcasterProfiles, eq(repliesAlias.fid, farcasterProfiles.fid))
    .where(
      sql`${repliesAlias.rootParentHash} = ${farcasterCasts.hash} AND 
          ${repliesAlias.hash} != ${farcasterCasts.hash}`
    );

  const casts = await farcasterDb
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
      sql`${farcasterCasts.computedTags} @> ARRAY[${computedTag}]::text[] AND ${farcasterCasts.createdAt} >= NOW() - INTERVAL '3 months'`
    )
    .orderBy(asc(farcasterCasts.timestamp));

  return casts;
};

export const getAllCastsForStories = async (computedTag: string) => {
  return castsForStories(computedTag) as Promise<CastForStory[]>;
};

export type CastForStory = Omit<
  Awaited<ReturnType<typeof castsForStories>>[number],
  'replies'
> & {
  replies:
    | {
        text: string | null;
        fid: number | null;
        hash: string | null;
      }[]
    | null;
};
