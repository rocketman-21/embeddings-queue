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
const onchainSchema = pgSchema('onchain');

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

export const grant = onchainSchema.table('Grant', {
  id: text('id').primaryKey(),
  recipient: text('recipient').notNull(),
  flowId: text('flow_id').notNull(),
  submitter: text('submitter').notNull(),
  parentContract: text('parent_contract').notNull(),
  isTopLevel: integer('is_top_level').notNull(),
  isFlow: integer('is_flow').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  image: text('image').notNull(),
  tagline: text('tagline'),
  url: text('url'),
  isRemoved: integer('is_removed').notNull(),
  isActive: integer('is_active').notNull(),
  votesCount: text('votes_count').notNull(),
  monthlyIncomingFlowRate: text('monthly_incoming_flow_rate').notNull(),
  monthlyIncomingBaselineFlowRate: text(
    'monthly_incoming_baseline_flow_rate'
  ).notNull(),
  monthlyIncomingBonusFlowRate: text(
    'monthly_incoming_bonus_flow_rate'
  ).notNull(),
  monthlyOutgoingFlowRate: text('monthly_outgoing_flow_rate').notNull(),
  monthlyRewardPoolFlowRate: text('monthly_reward_pool_flow_rate').notNull(),
  monthlyBaselinePoolFlowRate: text(
    'monthly_baseline_pool_flow_rate'
  ).notNull(),
  monthlyBonusPoolFlowRate: text('monthly_bonus_pool_flow_rate').notNull(),
  bonusMemberUnits: text('bonus_member_units').notNull(),
  baselineMemberUnits: text('baseline_member_units').notNull(),
  totalEarned: text('total_earned').notNull(),
  activeRecipientCount: integer('active_recipient_count').notNull(),
  awaitingRecipientCount: integer('awaiting_recipient_count').notNull(),
  challengedRecipientCount: integer('challenged_recipient_count').notNull(),
  tcr: text('tcr').unique().notNull(),
  erc20: text('erc20').unique().notNull(),
  arbitrator: text('arbitrator').unique().notNull(),
  tokenEmitter: text('token_emitter').unique().notNull(),
  status: integer('status').notNull(),
  challengePeriodEndsAt: integer('challenge_period_ends_at').notNull(),
  isDisputed: integer('is_disputed').notNull(),
  isResolved: integer('is_resolved').notNull(),
  evidenceGroupId: text('evidence_group_id').unique().notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  baselinePool: text('baseline_pool').notNull(),
  bonusPool: text('bonus_pool').notNull(),
  managerRewardPool: text('manager_reward_pool').notNull(),
  superToken: text('super_token').notNull(),
  managerRewardSuperfluidPool: text('manager_reward_superfluid_pool').notNull(),
  managerRewardPoolFlowRatePercent: integer(
    'manager_reward_pool_flow_rate_percent'
  ).notNull(),
  baselinePoolFlowRatePercent: integer(
    'baseline_pool_flow_rate_percent'
  ).notNull(),
});
