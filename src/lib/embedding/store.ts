import { db } from '../../database/db';
import { embeddings } from '../../database/schema';
import { JobBody } from '../../types/job';
import { EMBEDDING_CACHE_VERSION } from './cache';
import { eq, and } from 'drizzle-orm';

// Store embedding in database
export const storeEmbedding = async (
  embedding: number[],
  input: string,
  urlSummaries: string[],
  job: JobBody,
  contentHash: string
) => {
  if (job.type === 'builder-profile') {
    // we only want to store one builder profile per fid
    // assumes externalId is fid
    await deleteEmbeddingForBuilderProfile(job.externalId);
  } else if (job.type === 'story') {
    await deleteEmbeddingForStory(job.externalId);
  }

  await db
    .insert(embeddings)
    .values({
      id: crypto.randomUUID(),
      type: job.type,
      content: input,
      rawContent: job.rawContent,
      url_summaries: urlSummaries,
      urls: job.urls,
      contentHash: contentHash,
      embedding: embedding,
      version: EMBEDDING_CACHE_VERSION,
      groups: Array.from(
        new Set(job.groups.map((group) => group.toLowerCase()))
      ),
      users: Array.from(new Set(job.users.map((user) => user.toLowerCase()))),
      tags: Array.from(new Set(job.tags.map((tag) => tag.toLowerCase()))),
      externalId: job.externalId,
      externalUrl: job.externalUrl,
    })
    .onConflictDoUpdate({
      target: [embeddings.contentHash],
      set: {
        embedding: embedding,
        version: EMBEDDING_CACHE_VERSION,
        url_summaries: urlSummaries,
        urls: job.urls,
        groups: Array.from(
          new Set(job.groups.map((group) => group.toLowerCase()))
        ),
        users: Array.from(new Set(job.users.map((user) => user.toLowerCase()))),
        tags: Array.from(new Set(job.tags.map((tag) => tag.toLowerCase()))),
        externalId: job.externalId,
        externalUrl: job.externalUrl,
      },
    });
};

// Delete embedding from database by external ID for builder profiles
export const deleteEmbeddingForBuilderProfile = async (externalId: string) => {
  await db
    .delete(embeddings)
    .where(
      and(
        eq(embeddings.type, 'builder-profile'),
        eq(embeddings.externalId, externalId)
      )
    );
};

export const deleteEmbeddingForStory = async (id: string) => {
  await db
    .delete(embeddings)
    .where(eq(embeddings.type, 'story') && eq(embeddings.externalId, id));
};
