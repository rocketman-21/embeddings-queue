import { flowsDb } from '../../flowsDb';
import { stories } from '../../flows-schema';
import { arrayContains } from 'drizzle-orm';

export const getGrantStories = async (grantId: string) => {
  const storiesResult = await flowsDb
    .select()
    .from(stories)
    .where(arrayContains(stories.grantIds, [grantId]))
    .execute();

  if (!storiesResult || storiesResult.length === 0) {
    return [];
  }

  return storiesResult;
};

export type GrantStories = Awaited<ReturnType<typeof getGrantStories>>;
