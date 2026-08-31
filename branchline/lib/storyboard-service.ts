import { asc, desc, eq } from 'drizzle-orm';

import { getDb } from '@/db/index';
import { listRunsByIds, type HistoryRun } from '@/db/history';
import {
  storyboardClips,
  storyboardReferences,
  storyboardScenes,
  storyboardSubtitles,
  storyboards,
  storyboardTakes,
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

export type TakeDto = {
  id: string;
  generationId: string;
  createdAt: number;
  run: HistoryRun | null;
};

export type SubtitleDto = {
  id: string;
  clipId: string | null;
  startMs: number;
  endMs: number;
  text: string;
  speaker: string | null;
  language: string;
};

export type SceneDto = {
  id: string;
  sceneIndex: number;
  title: string;
  prompt: string;
  videoPrompt: string | null;
  durationSec: number;
  trimStartMs: number;
  trimEndMs: number | null;
  seed: number | null;
  generationId: string | null;
  run: HistoryRun | null;
  takes: TakeDto[];
  clips: ClipDto[];
  subtitles: SubtitleDto[];
};

export type StoryboardDto = {
  id: string;
  title: string;
  idea: string | null;
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

type TakeRow = typeof storyboardTakes.$inferSelect;
type SceneRow = typeof storyboardScenes.$inferSelect;

// A scene rendered before takes existed has an active generation without a
// take row; surface it as a synthetic take so the strip never loses history.
function buildTakes(
  scene: SceneRow,
  takeRows: TakeRow[],
  runsById: Map<string, HistoryRun>,
): TakeDto[] {
  const own = takeRows
    .filter((take) => take.sceneId === scene.id)
    .map((take) => ({
      id: take.id,
      generationId: take.generationId,
      createdAt: take.createdAt,
      run: runsById.get(take.generationId) ?? null,
    }));
  if (scene.generationId && !own.some((take) => take.generationId === scene.generationId)) {
    own.push({
      id: `legacy-${scene.id}`,
      generationId: scene.generationId,
      createdAt: scene.updatedAt,
      run: runsById.get(scene.generationId) ?? null,
    });
  }
  return own.sort((a, b) => a.createdAt - b.createdAt);
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

  const [sceneRows, referenceRows, clipRows, takeRows, subtitleRows] = await Promise.all([
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
    db
      .select()
      .from(storyboardTakes)
      .where(eq(storyboardTakes.storyboardId, storyboardId))
      .orderBy(asc(storyboardTakes.createdAt)),
    db
      .select()
      .from(storyboardSubtitles)
      .where(eq(storyboardSubtitles.storyboardId, storyboardId))
      .orderBy(asc(storyboardSubtitles.startMs)),
  ]);

  // Scene stills, takes and clips reuse the shared generation pipeline;
  // resolve their runs by id so nothing ages out of a history window.
  const referencedIds = [
    ...sceneRows.flatMap((scene) => (scene.generationId ? [scene.generationId] : [])),
    ...clipRows.map((clip) => clip.generationId),
    ...takeRows.map((take) => take.generationId),
  ];
  const runs = await listRunsByIds(workspaceId, [...new Set(referencedIds)]);
  const runsById = new Map(runs.map((run) => [run.id, run]));

  return {
    id: row.id,
    title: row.title,
    idea: row.idea,
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
      videoPrompt: scene.videoPrompt,
      durationSec: scene.durationSec,
      trimStartMs: scene.trimStartMs,
      trimEndMs: scene.trimEndMs,
      seed: scene.seed,
      generationId: scene.generationId,
      run: scene.generationId ? (runsById.get(scene.generationId) ?? null) : null,
      takes: buildTakes(scene, takeRows, runsById),
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
      subtitles: subtitleRows
        .filter((cue) => cue.sceneId === scene.id)
        .map((cue) => ({
          id: cue.id,
          clipId: cue.clipId,
          startMs: cue.startMs,
          endMs: cue.endMs,
          text: cue.text,
          speaker: cue.speaker,
          language: cue.language,
        })),
    })),
  };
}
