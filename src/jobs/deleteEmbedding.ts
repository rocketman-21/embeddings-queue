import { Queue } from 'bullmq';
import { FastifyReply, FastifyRequest } from 'fastify';
import { DeletionJobBody, validTypes } from '../types/job';

export const handleDeleteEmbedding = (
  deletionQueue: Queue<DeletionJobBody>
) => {
  return async (
    req: FastifyRequest<{
      Body: DeletionJobBody;
    }>,
    reply: FastifyReply
  ) => {
    console.log('handleDeleteEmbedding');
    console.log(req.body);
    const { contentHash, type } = req.body;

    if (!contentHash || !type) {
      reply.status(400).send({ error: 'Content hash and type are required' });
      return;
    }

    if (!validTypes.includes(type)) {
      reply.status(400).send({
        error: `Type must be one of: ${validTypes.join(', ')}`,
      });
      return;
    }

    const jobName = `delete-${type}-${Date.now()}`;
    const job = await deletionQueue.add(jobName, {
      contentHash,
      type,
    });

    reply.send({
      ok: true,
      jobName,
      jobId: job.id,
      contentHash,
      type,
    });
  };
};
