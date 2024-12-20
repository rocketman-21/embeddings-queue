import { Queue } from 'bullmq';
import { FastifyReply, FastifyRequest } from 'fastify';
import { FarcasterAgentJobBody } from '../types/job';

export const handleBulkAddFarcasterAgentJob = (
  queue: Queue<FarcasterAgentJobBody>
) => {
  return async (
    req: FastifyRequest<{ Body: { jobs: FarcasterAgentJobBody[] } }>,
    reply: FastifyReply
  ) => {
    const { jobs } = req.body;

    // Validate each job in the array
    for (const job of jobs) {
      const { agentFid, customInstructions, replyToCastId, postToChannelId } =
        job;

      const missingFields = [];
      if (!agentFid) missingFields.push('agentFid');
      if (!customInstructions) missingFields.push('customInstructions');

      if (missingFields.length > 0) {
        reply.status(400).send({
          error: `Missing required fields in one or more jobs: ${missingFields.join(
            ', '
          )}`,
        });
        return;
      }

      // Validate agentFid is a number
      if (typeof agentFid !== 'number') {
        reply.status(400).send({
          error: 'agentFid must be a number',
        });
        return;
      }

      // Validate customInstructions is a string
      if (typeof customInstructions !== 'string') {
        reply.status(400).send({
          error: 'customInstructions must be a string',
        });
        return;
      }

      // Validate replyToCastId is a number or null if provided
      if (replyToCastId !== null && typeof replyToCastId !== 'number') {
        reply.status(400).send({
          error: 'replyToCastId must be a number or null',
        });
        return;
      }

      // Validate postToChannelId is a string or null if provided
      if (postToChannelId !== null && typeof postToChannelId !== 'string') {
        reply.status(400).send({
          error: 'postToChannelId must be a string or null',
        });
        return;
      }
    }

    const addedJobs = await Promise.all(
      jobs.map(async (job) => {
        const jobName = `farcaster-agent-${Date.now()}-${job.agentFid}`;
        return queue.add(jobName, job);
      })
    );

    reply.send({
      ok: true,
      jobs: addedJobs.map((job) => ({
        jobName: job.name,
        jobId: job.id,
      })),
    });
  };
};
