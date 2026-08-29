import { asc, desc, eq } from 'drizzle-orm';

import { getDb } from '@/db/index';
import { listHistory, type HistoryRun } from '@/db/history';
import { storyboardScenes, storyboards } from '@/db/schema';

export type SceneDto = {
  id: string;
  sceneIndex: number;
  title: string;
  prompt: string;
  durationSec: number;
  generationId: string | null;
  run: HistoryRun | null;
};

export type StoryboardDto = {
  id: string;
  title: string;
  styleNote: string | null;
  seed: number | null;
  referenceAssetId: string | null;
  referenceUrl: string | null;
  createdAt: number;
  updatedAt: number;
  scenes: SceneDto[];
};

export async function listStoryboards(workspaceId: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.workspaceId, workspaceId))
    .orderBy(desc(storyboards.createdAt))
    .limit(25);
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function getStoryboard(
  workspaceId: string,
  storyboardId: string,
): Promise<StoryboardDto | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.id, storyboardId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;

  const sceneRows = await db
    .select()
    .from(storyboardScenes)
    .where(eq(storyboardScenes.storyboardId, storyboardId))
    .orderBy(asc(storyboardScenes.sceneIndex));

  // Scene stills reuse the shared generation pipeline; resolve their runs from
  // the same history source the playground uses.
  const runs = await listHistory(workspaceId, 100);
  const runsById = new Map(runs.map((run) => [run.id, run]));

  return {
    id: row.id,
    title: row.title,
    styleNote: row.styleNote,
    seed: row.seed,
    referenceAssetId: row.referenceAssetId,
    referenceUrl: row.referenceAssetId ? `/api/assets/${row.referenceAssetId}` : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    scenes: sceneRows.map((scene) => ({
      id: scene.id,
      sceneIndex: scene.sceneIndex,
      title: scene.title,
      prompt: scene.prompt,
      durationSec: scene.durationSec,
      generationId: scene.generationId,
      run: scene.generationId ? (runsById.get(scene.generationId) ?? null) : null,
    })),
  };
}
