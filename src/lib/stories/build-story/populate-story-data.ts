import { Job } from 'bullmq';
import { RedisClientType } from 'redis';
import { StoryAnalysis } from './types';
import { getMediaUrls } from '../media-urls/get-media-urls';
import { getHeaderImage } from '../header-image/get-header-image';
import { DR_GONZO_ADDRESS } from '../config';
import { CastForStory } from '../../../database/queries/casts/casts-for-story';

export type LimitedStory = Omit<
  StoryAnalysis,
  'mediaUrls' | 'createdAt' | 'id' | 'complete'
> & { id?: string };

export async function populateGeneratedStories(
  stories: LimitedStory[],
  job: Job,
  redisClient: RedisClientType,
  casts: CastForStory[],
  builderAddresses: string[]
): Promise<StoryAnalysis[]> {
  const mediaUrls = await Promise.all(
    stories.map((story) => getMediaUrls(story, job, redisClient))
  );

  const headerImages = await Promise.all(
    stories.map((story, index) =>
      getHeaderImage(story, mediaUrls[index] || [], job, redisClient)
    )
  );

  return stories.map((story, index) => {
    const earliestTimestamp = getEarliestTimestamp(story.castHashes, casts);
    const participants = Array.from(
      new Set([...story.participants, ...builderAddresses])
    );

    const complete = isComplete(
      story,
      headerImages[index],
      story.infoNeededToComplete
    );

    return {
      ...story,
      author: DR_GONZO_ADDRESS,
      headerImage: headerImages[index] || '',
      participants,
      id: story.id || '',
      mediaUrls: mediaUrls[index] || [],
      complete,
      infoNeededToComplete: headerImages[index]
        ? story.infoNeededToComplete
        : story.infoNeededToComplete || 'No header image available',
      createdAt: earliestTimestamp.toISOString(),
    };
  });
}

function isComplete(
  story: LimitedStory,
  headerImage: string | null,
  infoNeededToComplete: string | undefined
): boolean {
  if (
    headerImage &&
    headerImage !== '' &&
    (!infoNeededToComplete || infoNeededToComplete === '') &&
    story.completeness >= 0.8
  ) {
    return true;
  }

  return false;
}

function getEarliestTimestamp(
  castHashes: string[],
  casts: CastForStory[]
): Date {
  const timestamps = castHashes
    .map(
      (hash) =>
        hash &&
        casts.find(
          (cast) => cast.hash?.toString('hex') === hash.replace('0x', '')
        )?.timestamp
    )
    .filter((timestamp): timestamp is Date => timestamp !== undefined);

  return timestamps.length > 0
    ? new Date(Math.min(...timestamps.map((d) => d.getTime())))
    : new Date();
}
