import { OpenAI } from 'openai';
import { RedisClientType } from 'redis';
import { Job } from 'bullmq';
import { db } from '../../../database/db';
import { embeddings } from '../../../database/schema';
import { and, asc, sql } from 'drizzle-orm';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY environment variable is required');
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function getRelatedCasts(
  story: {
    summary: string;
  },
  redisClient: RedisClientType,
  job: Job
) {
  // Get embedding for story summary
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: story.summary,
  });

  const embedding = response.data[0].embedding;
  const vectorQuery = `[${embedding.join(',')}]`;

  // Query database for similar casts
  const similarCasts = await db
    .select({
      id: embeddings.id,
      content: embeddings.content,
      externalId: embeddings.externalId,
      users: embeddings.users,
      groups: embeddings.groups,
      urls: embeddings.urls,
      url_summaries: embeddings.url_summaries,
      similarity: sql<number>`1 - (embeddings.embedding <=> ${vectorQuery}::vector)`,
    })
    .from(embeddings)
    .where(and(sql`embeddings.type = 'cast'`))
    .orderBy(asc(sql`embeddings.embedding <=> ${vectorQuery}::vector`))
    .limit(10);

  return similarCasts.map((cast) => ({
    id: cast.id,
    content: cast.content,
    externalId: cast.externalId,
    similarity: cast.similarity,
    users: cast.users,
    groups: cast.groups,
    urls: cast.urls,
    url_summaries: cast.url_summaries,
  }));
}
