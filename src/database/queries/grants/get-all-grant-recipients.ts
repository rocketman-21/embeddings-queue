import { flowsDb } from '../../flowsDb';
import { grant } from '../../flows-schema';
import { desc } from 'drizzle-orm';

export const getAllGrantRecipients = async () => {
  const recipients = await flowsDb
    .select({
      address: grant.recipient,
    })
    .from(grant)
    .orderBy(desc(grant.createdAt));

  return recipients;
};
