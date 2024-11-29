import { asc, eq } from 'drizzle-orm';
import { farcasterCasts, farcasterProfiles } from '../../farcaster-schema';
import { farcasterDb } from '../../farcasterDb';
import { alias } from 'drizzle-orm/pg-core';

const selectCasts = () => {
  const parentCastsAlias = alias(farcasterCasts, 'parentCasts');
  const profilesAlias = alias(farcasterProfiles, 'profiles');
  return {
    parentCastsAlias,
    profilesAlias,
    select: {
      id: farcasterCasts.id,
      createdAt: farcasterCasts.createdAt,
      updatedAt: farcasterCasts.updatedAt,
      deletedAt: farcasterCasts.deletedAt,
      timestamp: farcasterCasts.timestamp,
      fid: farcasterCasts.fid,
      hash: farcasterCasts.hash,
      parentHash: farcasterCasts.parentHash,
      parentFid: farcasterCasts.parentFid,
      parentUrl: farcasterCasts.parentUrl,
      text: farcasterCasts.text,
      embeds: farcasterCasts.embeds,
      mentionedFids: farcasterCasts.mentionedFids,
      mentionsPositionsArray: farcasterCasts.mentionsPositionsArray,
      rootParentHash: farcasterCasts.rootParentHash,
      rootParentUrl: farcasterCasts.rootParentUrl,
      computedTags: farcasterCasts.computedTags,
      embedSummaries: farcasterCasts.embedSummaries,
      storyIds: farcasterCasts.storyIds,
      impactVerifications: farcasterCasts.impactVerifications,
      profile: {
        fid: farcasterProfiles.fid,
        fname: farcasterProfiles.fname,
      },
      parentCast: {
        text: parentCastsAlias.text,
        fname: profilesAlias.fname,
        embedSummaries: parentCastsAlias.embedSummaries,
        embeds: parentCastsAlias.embeds,
        fid: parentCastsAlias.fid,
        id: parentCastsAlias.id,
      },
    },
  };
};

export const getAllCastsWithParents = async (fid: number) => {
  const { parentCastsAlias, profilesAlias, select } = selectCasts();

  const casts = await farcasterDb
    .select(select)
    .from(farcasterCasts)
    .leftJoin(
      parentCastsAlias,
      eq(farcasterCasts.parentHash, parentCastsAlias.hash)
    )
    .leftJoin(profilesAlias, eq(parentCastsAlias.fid, profilesAlias.fid))
    .leftJoin(farcasterProfiles, eq(farcasterCasts.fid, farcasterProfiles.fid))
    .where(eq(farcasterCasts.fid, fid))
    .orderBy(asc(farcasterCasts.timestamp));

  return casts;
};

export type CastWithParent = Awaited<
  ReturnType<typeof getAllCastsWithParents>
>[number];
