import { flowsDb } from '../../flowsDb';
import { grant } from '../../flows-schema';
import { inArray, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

export const getGrantsByAddresses = async (
  addresses: string[]
): Promise<GrantWithParent[]> => {
  const grantTable = grant;
  const parentGrantTable = alias(grant, 'parentGrant');

  const grantsWithParents = await flowsDb
    .select({
      grant: grantTable,
      parentGrant: parentGrantTable,
    })
    .from(grantTable)
    .where(inArray(grantTable.recipient, addresses))
    .leftJoin(parentGrantTable, eq(grantTable.flowId, parentGrantTable.id))
    .execute();

  if (!grantsWithParents || grantsWithParents.length === 0) {
    return [];
  }

  return grantsWithParents.map((result) => ({
    ...result.grant,
    parentGrant: result.parentGrant,
  }));
};

export type GrantWithParent = typeof grant.$inferSelect & {
  parentGrant: typeof grant.$inferSelect | null;
};
