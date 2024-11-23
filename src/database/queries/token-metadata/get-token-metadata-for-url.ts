import { eq } from 'drizzle-orm';
import { farcasterDb } from '../../farcasterDb';
import { tokenMetadata } from '../../token-metadata-schema';

export const getTokenMetadataForUrl = async (url: string) => {
  const metadata = await farcasterDb
    .select()
    .from(tokenMetadata)
    .where(eq(tokenMetadata.url, url.split('?')[0]));

  return metadata[0];
};

export type TokenMetadataForUrl = Awaited<
  ReturnType<typeof getTokenMetadataForUrl>
>;
