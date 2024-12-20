import fastify, { FastifyInstance } from 'fastify';
import { Server, IncomingMessage, ServerResponse } from 'http';
import { Queue } from 'bullmq';
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
  farcasterAgentSchema,
} from './lib/api-schemas';
import { handleBulkAddEmbeddingJob } from './jobs/addBulkEmbeddingJob';
import { handleBulkAddIsGrantUpdateJob } from './jobs/add-bulk-is-grant-update-job';
import { handleBuilderProfileJob } from './jobs/add-builder-profile-job';
import { handleBulkAddStoryJob } from './jobs/add-bulk-story-job';
import { setupQueues } from './setup-queues';
import { handleBulkAddFarcasterAgentJob } from './jobs/add-bulk-farcaster-agent';
import {
  FarcasterAgentJobBody,
  StoryJobBody,
  BuilderProfileJobBody,
  IsGrantUpdateJobBody,
  JobBody,
  DeletionJobBody,
} from './types/job';

const setupServer = (queues: {
  embeddingsQueue: Queue<JobBody>;
  deletionQueue: Queue<DeletionJobBody>;
  bulkEmbeddingsQueue: Queue<JobBody[]>;
  isGrantUpdateQueue: Queue<IsGrantUpdateJobBody[]>;
  builderProfileQueue: Queue<BuilderProfileJobBody[]>;
  storyQueue: Queue<StoryJobBody[]>;
  farcasterAgentQueue: Queue<FarcasterAgentJobBody>;
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
    queues.farcasterAgentQueue,
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

  server.post(
    '/bulk-add-farcaster-agent',
    {
      preHandler: validateApiKey,
      schema: farcasterAgentSchema,
    },
    handleBulkAddFarcasterAgentJob(queues.farcasterAgentQueue)
  );

  server.setErrorHandler(handleError);

  return server;
};

const run = async () => {
  if (!process.env.API_KEY) {
    throw new Error('API_KEY environment variable is required');
  }

  const queues = await setupQueues();
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
