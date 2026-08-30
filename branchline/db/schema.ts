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
    // The one-paragraph core idea the scene sequence is written from.
    idea: text('idea'),
    styleNote: text('style_note'),
    seed: integer('seed'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [index('storyboards_workspace_idx').on(table.workspaceId, table.createdAt)],
);

// Up to three pinned reference images per storyboard (subject / style /
// palette), sent to FLUX.2 as input_image, input_image_2, input_image_3.
export const storyboardReferences = sqliteTable(
  'storyboard_references',
  {
    id: text('id').primaryKey(),
    storyboardId: text('storyboard_id')
      .notNull()
      .references(() => storyboards.id, { onDelete: 'cascade' }),
    refIndex: integer('ref_index').notNull(),
    assetId: text('asset_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('storyboard_references_storyboard_idx').on(table.storyboardId, table.refIndex),
  ],
);

// Video clips rendered from a scene: draft first, then enhanced tiers that
// replay the draft's cache. source_clip_id links an enhance to its draft.
export const storyboardClips = sqliteTable(
  'storyboard_clips',
  {
    id: text('id').primaryKey(),
    storyboardId: text('storyboard_id')
      .notNull()
      .references(() => storyboards.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull(),
    tier: text('tier').notNull(),
    generationId: text('generation_id').notNull(),
    sourceClipId: text('source_clip_id'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('storyboard_clips_scene_idx').on(table.sceneId, table.createdAt)],
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
    // Per-scene override; falls back to the storyboard seed when null.
    seed: integer('seed'),
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
