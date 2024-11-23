import fastify, { FastifyInstance } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';
import { Queue } from 'bullmq';
import {
  createQueue,
  setupQueueProcessor,
  setupDeletionQueueProcessor,
  setupBulkQueueProcessor,
  setupIsGrantUpdateQueueProcessor,
  setupBuilderProfileQueueProcessor,
  setupStoryQueueProcessor,
} from './queue';
import 'dotenv/config';
import { handleAddEmbeddingJob } from './jobs/addEmbeddingJob';
import { handleDeleteEmbedding } from './jobs/deleteEmbedding';
import { setupBullBoard, validateApiKey, handleError } from './lib/helpers';
import {
  addJobSchema,
  deleteEmbeddingSchema,
  bulkAddJobSchema,
  isGrantUpdateSchema,
  builderProfileSchema,
  storySchema,
} from './lib/schemas';
import { handleBulkAddEmbeddingJob } from './jobs/addBulkEmbeddingJob';
import { handleBulkAddIsGrantUpdateJob } from './jobs/add-bulk-is-grant-update-job';
import { handleBuilderProfileJob } from './jobs/add-builder-profile-job';
import {
  BuilderProfileJobBody,
  DeletionJobBody,
  IsGrantUpdateJobBody,
  JobBody,
  StoryJobBody,
} from './types/job';
import { handleBulkAddStoryJob } from './jobs/add-bulk-story-job';

const setupQueue = async () => {
  const embeddingsQueue = createQueue<JobBody>('EmbeddingsQueue');
  const deletionQueue = createQueue<DeletionJobBody>('DeletionQueue');
  const bulkEmbeddingsQueue = createQueue<JobBody[]>('BulkEmbeddingsQueue');
  const isGrantUpdateQueue =
    createQueue<IsGrantUpdateJobBody[]>('IsGrantUpdateQueue');
  const builderProfileQueue = createQueue<BuilderProfileJobBody[]>(
    'BuilderProfileQueue'
  );
  const storyQueue = createQueue<StoryJobBody[]>('StoryQueue');

  await setupQueueProcessor(embeddingsQueue.name);
  await setupDeletionQueueProcessor(deletionQueue.name);
  await setupBulkQueueProcessor(bulkEmbeddingsQueue.name);

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
  };
};

const setupServer = (queues: {
  embeddingsQueue: Queue;
  deletionQueue: Queue;
  bulkEmbeddingsQueue: Queue;
  isGrantUpdateQueue: Queue;
  builderProfileQueue: Queue;
  storyQueue: Queue;
}) => {
  const server: FastifyInstance<Server, IncomingMessage, ServerResponse> =
    fastify();

  setupBullBoard(server, [
    queues.embeddingsQueue,
    queues.deletionQueue,
    queues.bulkEmbeddingsQueue,
    queues.isGrantUpdateQueue,
    queues.builderProfileQueue,
    queues.storyQueue,
  ]);

  server.post(
    '/add-job',
    {
      preHandler: validateApiKey,
      schema: addJobSchema,
    },
    handleAddEmbeddingJob(queues.embeddingsQueue)
  );

  server.post(
    '/bulk-add-job',
    {
      preHandler: validateApiKey,
      schema: bulkAddJobSchema,
    },
    handleBulkAddEmbeddingJob(queues.bulkEmbeddingsQueue)
  );

  server.post(
    '/delete-embedding',
    {
      preHandler: validateApiKey,
      schema: deleteEmbeddingSchema,
    },
    handleDeleteEmbedding(queues.deletionQueue)
  );

  server.post(
    '/bulk-add-is-grants-update',
    {
      preHandler: validateApiKey,
      schema: isGrantUpdateSchema,
    },
    handleBulkAddIsGrantUpdateJob(queues.isGrantUpdateQueue)
  );

  server.post(
    '/bulk-add-builder-profile',
    {
      preHandler: validateApiKey,
      schema: builderProfileSchema,
    },
    handleBuilderProfileJob(queues.builderProfileQueue)
  );

  server.post(
    '/bulk-add-story',
    {
      preHandler: validateApiKey,
      schema: storySchema,
    },
    handleBulkAddStoryJob(queues.storyQueue)
  );

  server.setErrorHandler(handleError);

  return server;
};

const run = async () => {
  if (!process.env.API_KEY) {
    throw new Error('API_KEY environment variable is required');
  }

  const queues = await setupQueue();
  const server = setupServer(queues);

  await server.listen({ port: Number(process.env.PORT), host: '::' });
  console.log(
    `Server running on port ${process.env.PORT}. POST requests to ${process.env.RAILWAY_STATIC_URL}/add-job`
  );
};

run().catch((e) => {
  console.error('Application startup failed:');
  console.error(e);
  console.error('Stack trace:', e.stack);
  process.exit(1);
});
