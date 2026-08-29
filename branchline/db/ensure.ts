import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';

import { getDb } from './index';
import { generations, workspaceMembers, workspaces } from './schema';

let ready: Promise<void> | null = null;

export function ensureDatabase() {
  ready ??= env.DB.batch([
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, created_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS workspace_members (workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', joined_at INTEGER NOT NULL, PRIMARY KEY(workspace_id, user_id))",
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS workspace_members_user_idx ON workspace_members(user_id)',
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, created_by TEXT NOT NULL, status TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'live', model_id TEXT NOT NULL, prompt TEXT NOT NULL, parameters_json TEXT NOT NULL, output_count INTEGER NOT NULL, cost_credits TEXT, latency_ms INTEGER, error_message TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS generations_workspace_created_idx ON generations(workspace_id, created_at)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS generation_jobs (id TEXT PRIMARY KEY NOT NULL, generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE, output_index INTEGER NOT NULL, status TEXT NOT NULL, provider_request_id TEXT, polling_url TEXT, cost_credits TEXT, error_message TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS generation_jobs_generation_idx ON generation_jobs(generation_id)',
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS generation_assets (id TEXT PRIMARY KEY NOT NULL, generation_id TEXT NOT NULL REFERENCES generations(id) ON DELETE CASCADE, job_id TEXT REFERENCES generation_jobs(id) ON DELETE SET NULL, kind TEXT NOT NULL DEFAULT 'image', r2_key TEXT NOT NULL, mime_type TEXT NOT NULL, width INTEGER, height INTEGER, created_at INTEGER NOT NULL)",
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS generation_assets_generation_idx ON generation_assets(generation_id)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS generation_assets_job_idx ON generation_assets(job_id)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS storyboards (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, created_by TEXT NOT NULL, title TEXT NOT NULL, style_note TEXT, seed INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS storyboards_workspace_idx ON storyboards(workspace_id, created_at)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS storyboard_references (id TEXT PRIMARY KEY NOT NULL, storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE, ref_index INTEGER NOT NULL, asset_id TEXT NOT NULL, created_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS storyboard_references_storyboard_idx ON storyboard_references(storyboard_id, ref_index)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS storyboard_scenes (id TEXT PRIMARY KEY NOT NULL, storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE, scene_index INTEGER NOT NULL, title TEXT NOT NULL, prompt TEXT NOT NULL, duration_sec INTEGER NOT NULL DEFAULT 5, seed INTEGER, generation_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS storyboard_scenes_storyboard_idx ON storyboard_scenes(storyboard_id, scene_index)',
    ),
  ]).then(() => undefined);

  return ready;
}

export async function ensurePersonalWorkspace(
  userId: string,
  displayName: string,
) {
  await ensureDatabase();
  const db = getDb();
  const workspaceId = `personal:${userId}`;
  const now = Date.now();

  // Fast path: workspace already provisioned — skip member/sample writes so
  // routine API requests cost one indexed read instead of three writes.
  const [existing] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  if (existing) return workspaceId;

  await db
    .insert(workspaces)
    .values({
      id: workspaceId,
      name: `${displayName}'s Studio`,
      createdAt: now,
    })
    .onConflictDoNothing();
  await db
    .insert(workspaceMembers)
    .values({ workspaceId, userId, role: 'owner', joinedAt: now })
    .onConflictDoNothing();

  const samples = [
    [
      'Soft industrial product portrait on warm mineral paper',
      'FLUX.2 [max]',
      2,
      18 * 60_000,
    ],
    [
      'Retro-futurist desktop machine, quiet studio light',
      'FLUX.2 [max]',
      2,
      24 * 60 * 60_000,
    ],
    [
      'Compact field recorder with tactile orange controls',
      'FLUX.2 [pro]',
      4,
      26 * 60 * 60_000,
    ],
    [
      'Brutalist perfume bottle with smoked glass and sharp caustics',
      'FLUX.2 [flex]',
      2,
      49 * 60 * 60_000,
    ],
    [
      'Wayfinding icons for an alpine research station',
      'FLUX.2 [klein]',
      4,
      3 * 24 * 60 * 60_000,
    ],
    [
      'Editorial still life in moss green, chalk and anodized aluminum',
      'FLUX.2 [pro]',
      2,
      4 * 24 * 60 * 60_000,
    ],
    [
      'Modular field camera photographed as an archival artifact',
      'FLUX.2 [max]',
      2,
      5 * 24 * 60 * 60_000,
    ],
    [
      'Folded-paper terrain system with embossed contour labels',
      'FLUX.2 [flex]',
      3,
      7 * 24 * 60 * 60_000,
    ],
  ] as const;

  const [existingSample] = await db
    .select({ id: generations.id })
    .from(generations)
    .where(eq(generations.id, `sample-${userId}-0`))
    .limit(1);

  if (!existingSample) {
    for (const [
      index,
      [prompt, modelId, outputCount, age],
    ] of samples.entries()) {
      await db
        .insert(generations)
        .values({
          id: `sample-${userId}-${index}`,
          workspaceId,
          createdBy: userId,
          status: 'succeeded',
          origin: 'sample',
          modelId,
          prompt,
          parametersJson: JSON.stringify({
            width: 1024,
            height: 768,
            outputFormat: 'png',
          }),
          outputCount,
          costCredits: modelId.includes('max')
            ? '38'
            : modelId.includes('flex')
              ? '32'
              : '24',
          latencyMs: 39_600,
          createdAt: now - age,
          updatedAt: now - age,
        })
        .onConflictDoNothing();
    }
  }

  return workspaceId;
}
