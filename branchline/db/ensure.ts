import { env } from 'cloudflare:workers';

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
      'CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL, display_name TEXT NOT NULL, provider TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS studio_workspaces (id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'personal', created_by TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS studio_workspace_members (workspace_id TEXT NOT NULL REFERENCES studio_workspaces(id) ON DELETE CASCADE, user_id TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner', joined_at INTEGER NOT NULL, PRIMARY KEY(workspace_id, user_id))",
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS studio_workspace_members_user_idx ON studio_workspace_members(user_id)',
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS studio_projects (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES studio_workspaces(id) ON DELETE CASCADE, data_workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'standard', created_by TEXT NOT NULL, seeded_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS studio_projects_workspace_idx ON studio_projects(workspace_id, created_at)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS studio_projects_data_workspace_idx ON studio_projects(data_workspace_id)',
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
      'CREATE TABLE IF NOT EXISTS storyboards (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, created_by TEXT NOT NULL, title TEXT NOT NULL, idea TEXT, style_note TEXT, seed INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
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
      'CREATE TABLE IF NOT EXISTS storyboard_scenes (id TEXT PRIMARY KEY NOT NULL, storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE, scene_index INTEGER NOT NULL, title TEXT NOT NULL, video_prompt TEXT, prompt TEXT NOT NULL, duration_sec INTEGER NOT NULL DEFAULT 5, trim_start_ms INTEGER NOT NULL DEFAULT 0, trim_end_ms INTEGER, seed INTEGER, generation_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS storyboard_scenes_storyboard_idx ON storyboard_scenes(storyboard_id, scene_index)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS storyboard_clips (id TEXT PRIMARY KEY NOT NULL, storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE, scene_id TEXT NOT NULL, tier TEXT NOT NULL, generation_id TEXT NOT NULL, source_clip_id TEXT, created_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS storyboard_clips_scene_idx ON storyboard_clips(scene_id, created_at)',
    ),
    env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS storyboard_subtitles (id TEXT PRIMARY KEY NOT NULL, storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE, scene_id TEXT NOT NULL, clip_id TEXT, start_ms INTEGER NOT NULL DEFAULT 0, end_ms INTEGER NOT NULL, text TEXT NOT NULL, speaker TEXT, language TEXT NOT NULL DEFAULT 'en', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)",
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS storyboard_subtitles_scene_idx ON storyboard_subtitles(scene_id, start_ms)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS storyboard_takes (id TEXT PRIMARY KEY NOT NULL, storyboard_id TEXT NOT NULL REFERENCES storyboards(id) ON DELETE CASCADE, scene_id TEXT NOT NULL, generation_id TEXT NOT NULL, created_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS storyboard_takes_scene_idx ON storyboard_takes(scene_id, created_at)',
    ),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS looks (id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE, created_by TEXT NOT NULL, name TEXT NOT NULL, style_note TEXT NOT NULL, seed INTEGER, model_id TEXT NOT NULL, asset_id TEXT NOT NULL, created_at INTEGER NOT NULL)',
    ),
    env.DB.prepare(
      'CREATE INDEX IF NOT EXISTS looks_workspace_idx ON looks(workspace_id, created_at)',
    ),
  ])
    .then(async () => {
      // Additive migration for databases created before the idea column
      // existed; the error on re-run ("duplicate column") is expected.
      try {
        await env.DB.prepare(
          'ALTER TABLE storyboards ADD COLUMN idea TEXT',
        ).run();
      } catch {
        // Column already present.
      }
      try {
        await env.DB.prepare(
          'ALTER TABLE storyboard_scenes ADD COLUMN video_prompt TEXT',
        ).run();
      } catch {
        // Column already present.
      }
      try {
        await env.DB.prepare(
          'ALTER TABLE storyboard_scenes ADD COLUMN trim_start_ms INTEGER NOT NULL DEFAULT 0',
        ).run();
      } catch {
        // Column already present.
      }
      try {
        await env.DB.prepare(
          'ALTER TABLE storyboard_scenes ADD COLUMN trim_end_ms INTEGER',
        ).run();
      } catch {
        // Column already present.
      }
      // Sweep the fake sample runs earlier builds seeded into new
      // workspaces — Runs/Assets show real work or honest empty states.
      await env.DB.prepare(
        "DELETE FROM generations WHERE origin = 'sample'",
      ).run();
    })
    .then(() => undefined);

  return ready;
}

export async function ensurePersonalWorkspace(
  userId: string,
  displayName: string,
) {
  // Loaded lazily so studio bootstrap can call ensureDatabase without an ESM
  // initialization cycle between the migration and selection layers.
  const { resolveStudioContext } = await import('./studio');
  const context = await resolveStudioContext({
    userId,
    displayName,
    email: `${userId}@branchline.local`,
    fullName: displayName,
    provider: 'legacy',
  });
  return context.activeProject.dataWorkspaceId;
}
