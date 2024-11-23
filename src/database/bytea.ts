import { customType } from 'drizzle-orm/pg-core';

export const bytea = (name: string) =>
  customType<{ data: Buffer; driverData: Buffer }>({
    dataType() {
      return 'bytea';
    },
    toDriver(value: Buffer): Buffer {
      return value;
    },
    fromDriver(value: Buffer): Buffer {
      return value;
    },
  })(name);
