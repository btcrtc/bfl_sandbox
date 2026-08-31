import {
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
} from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  displayName: text('display_name').notNull(),
  provider: text('provider').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// Product-level workspaces and projects deliberately sit above the legacy
// `workspaces` table. The latter remains a private data namespace used by all
// generation/storyboard queries, while a studio project points at exactly one
// such namespace. This keeps every existing ownership check effective and
// makes project isolation structural rather than a client-side filter.
export const studioWorkspaces = sqliteTable('studio_workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('personal'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const studioWorkspaceMembers = sqliteTable(
  'studio_workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => studioWorkspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull(),
    role: text('role').notNull().default('owner'),
    joinedAt: integer('joined_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.workspaceId, table.userId] }),
    index('studio_workspace_members_user_idx').on(table.userId),
  ],
);

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

export const studioProjects = sqliteTable(
  'studio_projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => studioWorkspaces.id, { onDelete: 'cascade' }),
    dataWorkspaceId: text('data_workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull().default('standard'),
    createdBy: text('created_by').notNull(),
    seededAt: integer('seeded_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('studio_projects_workspace_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
    index('studio_projects_data_workspace_idx').on(table.dataWorkspaceId),
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
    index('generations_workspace_created_idx').on(
      table.workspaceId,
      table.createdAt,
    ),
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
  (table) => [
    index('storyboards_workspace_idx').on(table.workspaceId, table.createdAt),
  ],
);

// A saved look: the style essence crafted in the Playground — style prompt,
// seed, model and the rendered frame that proves it. Scenes boards apply a
// look in one move (style note + seed + that frame as reference).
export const looks = sqliteTable(
  'looks',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    createdBy: text('created_by').notNull(),
    name: text('name').notNull(),
    styleNote: text('style_note').notNull(),
    seed: integer('seed'),
    modelId: text('model_id').notNull(),
    assetId: text('asset_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('looks_workspace_idx').on(table.workspaceId, table.createdAt),
  ],
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
    index('storyboard_references_storyboard_idx').on(
      table.storyboardId,
      table.refIndex,
    ),
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
  (table) => [
    index('storyboard_clips_scene_idx').on(table.sceneId, table.createdAt),
  ],
);

// Timed dialogue/caption cues are first-class edit data. A cue can follow the
// scene's active cut (clip_id = null), or be authored for one concrete clip
// version when draft/HD/FHD timing differs.
export const storyboardSubtitles = sqliteTable(
  'storyboard_subtitles',
  {
    id: text('id').primaryKey(),
    storyboardId: text('storyboard_id')
      .notNull()
      .references(() => storyboards.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull(),
    clipId: text('clip_id'),
    startMs: integer('start_ms').notNull().default(0),
    endMs: integer('end_ms').notNull(),
    text: text('text').notNull(),
    speaker: text('speaker'),
    language: text('language').notNull().default('en'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('storyboard_subtitles_scene_idx').on(table.sceneId, table.startMs),
  ],
);

// Every rendered still for a scene is kept as a take; the scene's
// generation_id points at the active one, so re-renders branch instead of
// overwriting.
export const storyboardTakes = sqliteTable(
  'storyboard_takes',
  {
    id: text('id').primaryKey(),
    storyboardId: text('storyboard_id')
      .notNull()
      .references(() => storyboards.id, { onDelete: 'cascade' }),
    sceneId: text('scene_id').notNull(),
    generationId: text('generation_id').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    index('storyboard_takes_scene_idx').on(table.sceneId, table.createdAt),
  ],
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
    // Motion-only direction for image-to-video. The still prompt describes
    // what is already in frame; this describes what changes over time.
    videoPrompt: text('video_prompt'),
    prompt: text('prompt').notNull(),
    durationSec: integer('duration_sec').notNull().default(5),
    // Non-destructive edit points for the assembled reel. duration_sec stays
    // the generated source length; the cut can use any range inside it.
    trimStartMs: integer('trim_start_ms').notNull().default(0),
    trimEndMs: integer('trim_end_ms'),
    // Per-scene override; falls back to the storyboard seed when null.
    seed: integer('seed'),
    generationId: text('generation_id'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => [
    index('storyboard_scenes_storyboard_idx').on(
      table.storyboardId,
      table.sceneIndex,
    ),
  ],
);

export const generationAssets = sqliteTable(
  'generation_assets',
  {
    id: text('id').primaryKey(),
    generationId: text('generation_id')
      .notNull()
      .references(() => generations.id, { onDelete: 'cascade' }),
    jobId: text('job_id').references(() => generationJobs.id, {
      onDelete: 'set null',
    }),
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
