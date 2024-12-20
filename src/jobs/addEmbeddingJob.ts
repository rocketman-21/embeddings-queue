import { Queue } from 'bullmq';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JobBody, validTypes } from '../types/job';

export const handleAddEmbeddingJob = (queue: Queue<JobBody>) => {
  return async (
    req: FastifyRequest<{ Body: JobBody }>,
    reply: FastifyReply
  ) => {
    const { type, content, groups, users, tags, externalId, hashSuffix, urls } =
      req.body;

    if (!type || !content || !externalId) {
      reply.status(400).send({ error: 'Missing required fields' });
      return;
    }

    if (!validTypes.includes(type)) {
      reply.status(400).send({
        error: `Type must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    if (
      !Array.isArray(groups) ||
      !Array.isArray(users) ||
      !Array.isArray(tags)
    ) {
      reply
        .status(400)
        .send({ error: 'Groups, users, and tags must be arrays' });
      return;
    }

    const jobName = `${type}-${Date.now()}`;
    const job = await queue.add(jobName, {
      type,
      content,
      groups,
      users,
      tags,
      externalId,
      hashSuffix,
      urls,
    });

    reply.send({
      ok: true,
      jobName,
      jobId: job.id,
    });
  };
};
