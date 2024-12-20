import { Queue } from 'bullmq';
import { FastifyReply, FastifyRequest } from 'fastify';
import { StoryJobBody } from '../types/job';

export const handleBulkAddStoryJob = (queue: Queue<StoryJobBody[]>) => {
  return async (
    req: FastifyRequest<{ Body: { jobs: StoryJobBody[] } }>,
    reply: FastifyReply
  ) => {
    const { jobs } = req.body;

    // Validate each job in the array
    for (const job of jobs) {
      const { newCastId, grantId } = job;

      const missingFields = [];
      if (!newCastId) missingFields.push('newCastId');
      if (!grantId) missingFields.push('grantId');

      if (missingFields.length > 0) {
        reply.status(400).send({
          error: `Missing required fields in one or more jobs: ${missingFields.join(
            ', '
          )}`,
        });
        return;
      }

      // Validate newCastId is a number
      if (typeof newCastId !== 'number') {
        reply.status(400).send({
          error: 'newCastId must be a number',
        });
        return;
      }

      // Validate grantId is a string
      if (typeof grantId !== 'string') {
        reply.status(400).send({
          error: 'grantId must be a string',
        });
        return;
      }
    }

    const jobName = `bulk-story-${Date.now()}`;
    const job = await queue.add(jobName, jobs);

    reply.send({
      ok: true,
      jobName,
      jobId: job.id,
    });
  };
};
