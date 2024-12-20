import { Queue } from 'bullmq';
import { FastifyReply, FastifyRequest } from 'fastify';
import { JobBody, validTypes } from '../types/job';

export const handleBulkAddEmbeddingJob = (queue: Queue<JobBody[]>) => {
  return async (
    req: FastifyRequest<{ Body: { jobs: JobBody[] } }>,
    reply: FastifyReply
  ) => {
    const { jobs } = req.body;

    // Validate each job in the array
    for (const job of jobs) {
      const { type, content, groups, users, tags, externalId } = job;

      const missingFields = [];
      if (!type) missingFields.push('type');
      if (!content) missingFields.push('content');
      if (!externalId) missingFields.push('externalId');

      if (missingFields.length > 0) {
        reply.status(400).send({
          error: `Missing required fields in one or more jobs: ${missingFields.join(
            ', '
          )}`,
        });
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
        reply.status(400).send({
          error: 'Groups, users, and tags must be arrays in all jobs',
        });
        return;
      }
    }

    const jobName = `bulk-embedding-${Date.now()}`;
    const job = await queue.add(jobName, jobs);

    reply.send({
      ok: true,
      jobName,
      jobId: job.id,
    });
  };
};
