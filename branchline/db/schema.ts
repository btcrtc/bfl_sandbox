import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('owner'),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('workspace_members_user_idx').on(table.userId),
  ],
);

export const generations = sqliteTable(
  'generations',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    status: text('status').notNull(),
    origin: text('origin').notNull().default('live'),
    modelId: text('model_id').notNull(),
    prompt: text('prompt').notNull(),
    parametersJson: text('parameters_json').notNull(),
    outputCount: integer('output_count').notNull(),
    costCredits: text('cost_credits'),
    latencyMs: integer('latency_ms'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('generations_workspace_created_idx').on(table.workspaceId, table.createdAt),
  ],
);

export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    id: text('id').primaryKey(),
    generationId: text('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    outputIndex: integer('output_index').notNull(),
    status: text('status').notNull(),
    providerRequestId: text('provider_request_id'),
    pollingUrl: text('polling_url'),
    costCredits: text('cost_credits'),
    errorMessage: text('error_message'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('generation_jobs_generation_idx').on(table.generationId)],
);

export const storyboards = sqliteTable(
  'storyboards',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    title: text('title').notNull(),
    referenceAssetId: text('reference_asset_id'),
    styleNote: text('style_note'),
    seed: integer('seed'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('storyboards_workspace_idx').on(table.workspaceId, table.createdAt)],
);

export const storyboardScenes = sqliteTable(
  'storyboard_scenes',
  {
    id: text('id').primaryKey(),
    storyboardId: text('storyboard_id')
      .notNull()
      .references(() => storyboards.id, { onDelete: 'cascade' }),
    sceneIndex: integer('scene_index').notNull(),
    title: text('title').notNull(),
    prompt: text('prompt').notNull(),
    durationSec: integer('duration_sec').notNull().default(5),
    generationId: text('generation_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('storyboard_scenes_storyboard_idx').on(table.storyboardId, table.sceneIndex)],
);

export const generationAssets = sqliteTable(
  'generation_assets',
  {
    id: text('id').primaryKey(),
    generationId: text('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    jobId: text('job_id').references(() => generationJobs.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().default('image'),
    r2Key: text('r2_key').notNull(),
    mimeType: text('mime_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('generation_assets_generation_idx').on(table.generationId),
    index('generation_assets_job_idx').on(table.jobId),
  ],
);
