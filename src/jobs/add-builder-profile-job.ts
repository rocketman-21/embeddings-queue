import { Queue } from 'bullmq';
import { FastifyReply, FastifyRequest } from 'fastify';
import { BuilderProfileJobBody } from '../types/job';

export const handleBuilderProfileJob = (
  queue: Queue<BuilderProfileJobBody[]>
) => {
  return async (
    req: FastifyRequest<{ Body: { jobs: BuilderProfileJobBody[] } }>,
    reply: FastifyReply
  ) => {
    const { jobs } = req.body;

    // Validate each job in the array
    for (const job of jobs) {
      const { fid } = job;

      if (!fid) {
        reply.status(400).send({
          error: 'Missing required field: fid',
        });
        return;
      }

      // Validate fid is a number or can be converted to one
      if (isNaN(Number(fid))) {
        reply.status(400).send({
          error: 'fid must be a valid number',
        });
        return;
      }
    }

    const jobName = `builder-profile-${Date.now()}`;
    const job = await queue.add(jobName, jobs);

    reply.send({
      ok: true,
      jobName,
      jobId: job.id,
    });
  };
};
