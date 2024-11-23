import { Job } from 'bullmq';
import { RedisClientType } from 'redis';
import { StoryAnalysis } from './story-analysis';
import { getMediaUrls } from '../media-urls/get-media-urls';
import { buildParticipantsMap } from '../participants/build-participants-map';
import { getHeaderImage } from '../header-image/get-header-image';
import { DR_GONZO_ADDRESS } from '../config';

type LimitedStory = Omit<StoryAnalysis, 'id' | 'mediaUrls' | 'headerImage'> & {
  storyId?: string;
};

export async function populateGeneratedStories(
  object: {
    stories: LimitedStory[];
  },
  stories: LimitedStory[],
  job: Job,
  redisClient: RedisClientType
): Promise<StoryAnalysis[]> {
  const [participantsMap, mediaUrls] = await Promise.all([
    buildParticipantsMap(object),
    Promise.all(stories.map((story) => getMediaUrls(story, job, redisClient))),
  ]);

  const headerImages = await Promise.all(
    stories.map((story, index) =>
      getHeaderImage(story, mediaUrls[index] || [], job, redisClient)
    )
  );

  return object.stories.map((story, index) => ({
    ...story,
    author: DR_GONZO_ADDRESS,
    headerImage: headerImages[index] || '',
    participants: story.participants
      .map((participant) => participantsMap[participant] || '')
      .filter(Boolean),
    id: story.storyId || '',
    mediaUrls: mediaUrls[index] || [],
    complete: headerImages[index] ? story.complete : false,
    infoNeededToComplete: headerImages[index]
      ? story.infoNeededToComplete
      : story.infoNeededToComplete || 'No header image available',
  }));
}
