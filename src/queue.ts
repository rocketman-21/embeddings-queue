import { ConnectionOptions, Queue } from 'bullmq';
import { createClient, RedisClientType } from 'redis';
import OpenAI from 'openai';
import { deletionQueueWorker } from './workers/delete-embed';
import { bulkEmbeddingsWorker } from './workers/bulk-embeddings';
import { singleEmbeddingWorker } from './workers/single-embedding';
import { isGrantUpdateWorker } from './workers/grant-update/worker';
import { builderProfileWorker } from './workers/builder-profile/worker';
import { FarcasterAgentJobBody, JobBody, StoryJobBody } from './types/job';
import { storyAgentWorker } from './workers/story-agent/worker';
import { farcasterAgentWorker } from './workers/farcaster-agent/worker';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

if (!process.env.REDIS_URL) {
  throw new Error('REDIS_URL environment variable is required');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const connection: ConnectionOptions = {
  url: process.env.REDIS_URL,
};

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.error('Redis Client Error', err));

let redisConnected = false;
const ensureRedisConnected = async () => {
  if (!redisConnected) {
    await redisClient.connect();
    redisConnected = true;
  }
};

export const createQueue = <T>(name: string) =>
  new Queue<T>(name, { connection });

export const setupQueueProcessor = async (queueName: string) => {
  await ensureRedisConnected();

  singleEmbeddingWorker(
    queueName,
    connection,
    redisClient as RedisClientType,
    openai
  );
};

export const setupBulkQueueProcessor = async (queueName: string) => {
  await ensureRedisConnected();

  bulkEmbeddingsWorker(
    queueName,
    connection,
    redisClient as RedisClientType,
    openai
  );
};

export const setupDeletionQueueProcessor = async (queueName: string) => {
  await ensureRedisConnected();

  deletionQueueWorker(queueName, connection, redisClient as RedisClientType);
};

export const setupIsGrantUpdateQueueProcessor = async (
  queueName: string,
  storyAgentQueue: Queue<StoryJobBody[]>
) => {
  await ensureRedisConnected();

  isGrantUpdateWorker(
    queueName,
    connection,
    redisClient as RedisClientType,
    storyAgentQueue
  );
};

export const setupBuilderProfileQueueProcessor = async (
  queueName: string,
  bulkEmbeddingsQueue: Queue<JobBody[]>
) => {
  await ensureRedisConnected();

  builderProfileWorker(
    queueName,
    connection,
    redisClient as RedisClientType,
    bulkEmbeddingsQueue
  );
};

export const setupStoryQueueProcessor = async (
  queueName: string,
  bulkEmbeddingsQueue: Queue<JobBody[]>
) => {
  await ensureRedisConnected();

  storyAgentWorker(
    queueName,
    connection,
    redisClient as RedisClientType,
    bulkEmbeddingsQueue
  );
};

export const setupFarcasterAgentQueueProcessor = async (queueName: string) => {
  await ensureRedisConnected();

  farcasterAgentWorker(queueName, connection, redisClient as RedisClientType);
};
