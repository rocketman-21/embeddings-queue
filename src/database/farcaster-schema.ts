import { text, timestamp, integer, pgSchema, jsonb } from 'drizzle-orm/pg-core';
import { bytea } from './bytea';

// Define the schema
const productionSchema = pgSchema('production');

export const channelMembers = productionSchema.table('channel_members', {
  id: integer('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  timestamp: timestamp('timestamp'),
  fid: integer('fid'),
  channelId: text('channel_id'),
});

export const farcasterProfiles = productionSchema.table('farcaster_profile', {
  fname: text('fname'),
  displayName: text('display_name'),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  verifiedAddresses: text('verified_addresses').array(),
  updatedAt: timestamp('updated_at'),
  fid: integer('fid').primaryKey(),
});

export const farcasterCasts = productionSchema.table('farcaster_casts', {
  id: integer('id').primaryKey(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  deletedAt: timestamp('deleted_at'),
  timestamp: timestamp('timestamp'),
  fid: integer('fid'),
  hash: bytea('hash'),
  parentHash: text('parent_hash'),
  parentFid: integer('parent_fid'),
  parentUrl: text('parent_url'),
  text: text('text'),
  embeds: text('embeds'),
  mentions: text('mentions'),
  mentionsPositions: text('mentions_positions'),
  rootParentHash: text('root_parent_hash'),
  rootParentUrl: text('root_parent_url'),
  computedTags: text('computed_tags').array(),
  embedSummaries: text('embed_summaries').array(),
  storyIds: text('story_ids').array(),
  impactVerifications: jsonb('impact_verifications'),
});

export type FarcasterCast = typeof farcasterCasts.$inferSelect;
export type FarcasterProfile = typeof farcasterProfiles.$inferSelect;
