import {
  text,
  timestamp,
  integer,
  pgSchema,
  pgTable,
  boolean,
  jsonb,
  numeric,
  varchar,
} from 'drizzle-orm/pg-core';

const webSchema = pgSchema('web');

export const derivedData = webSchema.table('DerivedData', {
  id: text('id').primaryKey(),
  grantId: text('grantId').unique(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
  minimumSalary: integer('minimumSalary'),
  template: text('template'),
  lastBuilderUpdate: timestamp('lastBuilderUpdate'),
});

export const stories = webSchema.table('Stories', {
  id: varchar('id', { length: 36 }).primaryKey(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  keyPoints: text('key_points').array(),
  participants: text('participants').array(),
  headerImage: text('header_image'),
  timeline: jsonb('timeline'),
  sentiment: text('sentiment', { enum: ['positive', 'negative', 'neutral'] }),
  completeness: numeric('completeness', { precision: 3, scale: 2 }),
  complete: boolean('complete').notNull(),
  sources: text('sources').array(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
  mediaUrls: text('media_urls').array(),
  author: text('author'),
  grantIds: text('grant_ids').array(),
  parentFlowIds: text('parent_flow_ids').array(),
  tagline: text('tagline'),
  castHashes: text('cast_hashes').array(),
  mintUrls: text('mint_urls').array(),
  infoNeededToComplete: text('info_needed_to_complete'),
  edits: jsonb('edits'),
});

export const grant = pgTable('Grant', {
  id: text('id').primaryKey(),
  recipient: text('recipient').notNull(),
  flow_id: text('flow_id').notNull(),
  submitter: text('submitter').notNull(),
  parent_contract: text('parent_contract').notNull(),
  is_top_level: integer('is_top_level').notNull(),
  is_flow: integer('is_flow').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  image: text('image').notNull(),
  tagline: text('tagline'),
  url: text('url'),
  is_removed: integer('is_removed').notNull(),
  is_active: integer('is_active').notNull(),
  votes_count: text('votes_count').notNull(),
  monthly_incoming_flow_rate: text('monthly_incoming_flow_rate').notNull(),
  monthly_incoming_baseline_flow_rate: text(
    'monthly_incoming_baseline_flow_rate'
  ).notNull(),
  monthly_incoming_bonus_flow_rate: text(
    'monthly_incoming_bonus_flow_rate'
  ).notNull(),
  monthly_outgoing_flow_rate: text('monthly_outgoing_flow_rate').notNull(),
  monthly_reward_pool_flow_rate: text(
    'monthly_reward_pool_flow_rate'
  ).notNull(),
  monthly_baseline_pool_flow_rate: text(
    'monthly_baseline_pool_flow_rate'
  ).notNull(),
  monthly_bonus_pool_flow_rate: text('monthly_bonus_pool_flow_rate').notNull(),
  bonus_member_units: text('bonus_member_units').notNull(),
  baseline_member_units: text('baseline_member_units').notNull(),
  total_earned: text('total_earned').notNull(),
  active_recipient_count: integer('active_recipient_count').notNull(),
  awaiting_recipient_count: integer('awaiting_recipient_count').notNull(),
  challenged_recipient_count: integer('challenged_recipient_count').notNull(),
  tcr: text('tcr').unique().notNull(),
  erc20: text('erc20').unique().notNull(),
  arbitrator: text('arbitrator').unique().notNull(),
  token_emitter: text('token_emitter').unique().notNull(),
  status: integer('status').notNull(),
  challenge_period_ends_at: integer('challenge_period_ends_at').notNull(),
  is_disputed: integer('is_disputed').notNull(),
  is_resolved: integer('is_resolved').notNull(),
  evidence_group_id: text('evidence_group_id').unique().notNull(),
  created_at: integer('created_at').notNull(),
  updated_at: integer('updated_at').notNull(),
  baseline_pool: text('baseline_pool').notNull(),
  bonus_pool: text('bonus_pool').notNull(),
  manager_reward_pool: text('manager_reward_pool').notNull(),
  super_token: text('super_token').notNull(),
  manager_reward_superfluid_pool: text(
    'manager_reward_superfluid_pool'
  ).notNull(),
  manager_reward_pool_flow_rate_percent: integer(
    'manager_reward_pool_flow_rate_percent'
  ).notNull(),
  baseline_pool_flow_rate_percent: integer(
    'baseline_pool_flow_rate_percent'
  ).notNull(),
});
