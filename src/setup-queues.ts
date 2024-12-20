import {
  createQueue,
  setupQueueProcessor,
  setupDeletionQueueProcessor,
  setupBulkQueueProcessor,
  setupIsGrantUpdateQueueProcessor,
  setupBuilderProfileQueueProcessor,
  setupStoryQueueProcessor,
  setupFarcasterAgentQueueProcessor,
} from './queue';
import 'dotenv/config';
import {
  BuilderProfileJobBody,
  DeletionJobBody,
  FarcasterAgentJobBody,
  IsGrantUpdateJobBody,
  JobBody,
  StoryJobBody,
} from './types/job';

export const setupQueues = async () => {
  const embeddingsQueue = createQueue<JobBody>('EmbeddingsQueue');
  const deletionQueue = createQueue<DeletionJobBody>('DeletionQueue');
  const bulkEmbeddingsQueue = createQueue<JobBody[]>('BulkEmbeddingsQueue');
  const isGrantUpdateQueue =
    createQueue<IsGrantUpdateJobBody[]>('IsGrantUpdateQueue');
  const builderProfileQueue = createQueue<BuilderProfileJobBody[]>(
    'BuilderProfileQueue'
  );
  const storyQueue = createQueue<StoryJobBody[]>('StoryQueue');
  const farcasterAgentQueue = createQueue<FarcasterAgentJobBody>(
    'FarcasterAgentQueue'
  );

  await setupQueueProcessor(embeddingsQueue.name);
  await setupDeletionQueueProcessor(deletionQueue.name);
  await setupBulkQueueProcessor(bulkEmbeddingsQueue.name);
  await setupFarcasterAgentQueueProcessor(farcasterAgentQueue.name);
  await setupIsGrantUpdateQueueProcessor(isGrantUpdateQueue.name, storyQueue);
  await setupBuilderProfileQueueProcessor(
    builderProfileQueue.name,
    bulkEmbeddingsQueue
  );
  await setupStoryQueueProcessor(storyQueue.name, bulkEmbeddingsQueue);

  return {
    embeddingsQueue,
    deletionQueue,
    bulkEmbeddingsQueue,
    isGrantUpdateQueue,
    builderProfileQueue,
    storyQueue,
    farcasterAgentQueue,
  };
};
