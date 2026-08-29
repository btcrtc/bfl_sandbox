import { asc, desc, eq } from 'drizzle-orm';

import { getDb } from '@/db/index';
import { listHistory, type HistoryRun } from '@/db/history';
import {
  storyboardClips,
  storyboardReferences,
  storyboardScenes,
  storyboards,
} from '@/db/schema';

export const MAX_STORYBOARD_REFERENCES = 3;

export type ClipDto = {
  id: string;
  tier: string;
  generationId: string;
  sourceClipId: string | null;
  createdAt: number;
  run: HistoryRun | null;
};

export type SceneDto = {
  id: string;
  sceneIndex: number;
  title: string;
  prompt: string;
  durationSec: number;
  seed: number | null;
  generationId: string | null;
  run: HistoryRun | null;
  clips: ClipDto[];
};

export type StoryboardDto = {
  id: string;
  title: string;
  styleNote: string | null;
  seed: number | null;
  references: Array<{ assetId: string; url: string }>;
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

  const [sceneRows, referenceRows, clipRows] = await Promise.all([
    db
      .select()
      .from(storyboardScenes)
      .where(eq(storyboardScenes.storyboardId, storyboardId))
      .orderBy(asc(storyboardScenes.sceneIndex)),
    db
      .select()
      .from(storyboardReferences)
      .where(eq(storyboardReferences.storyboardId, storyboardId))
      .orderBy(asc(storyboardReferences.refIndex)),
    db
      .select()
      .from(storyboardClips)
      .where(eq(storyboardClips.storyboardId, storyboardId))
      .orderBy(desc(storyboardClips.createdAt)),
  ]);

  // Scene stills reuse the shared generation pipeline; resolve their runs from
  // the same history source the playground uses.
  const runs = await listHistory(workspaceId, 100);
  const runsById = new Map(runs.map((run) => [run.id, run]));

  return {
    id: row.id,
    title: row.title,
    styleNote: row.styleNote,
    seed: row.seed,
    references: referenceRows.map((reference) => ({
      assetId: reference.assetId,
      url: `/api/assets/${reference.assetId}`,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    scenes: sceneRows.map((scene) => ({
      id: scene.id,
      sceneIndex: scene.sceneIndex,
      title: scene.title,
      prompt: scene.prompt,
      durationSec: scene.durationSec,
      seed: scene.seed,
      generationId: scene.generationId,
      run: scene.generationId ? (runsById.get(scene.generationId) ?? null) : null,
      clips: clipRows
        .filter((clip) => clip.sceneId === scene.id)
        .map((clip) => ({
          id: clip.id,
          tier: clip.tier,
          generationId: clip.generationId,
          sourceClipId: clip.sourceClipId,
          createdAt: clip.createdAt,
          run: runsById.get(clip.generationId) ?? null,
        })),
    })),
  };
}
