import { and, eq, isNull } from 'drizzle-orm';

import { getDb } from '@/db/index';
import {
  generationAssets,
  generationJobs,
  generations,
  storyboardClips,
  storyboardScenes,
  storyboardSubtitles,
  storyboards,
} from '@/db/schema';
import { EXAMPLE_BOARD } from '@/lib/example-board';

export const EXAMPLE_DRAFT_CLIPS = [
  { sceneIndex: 0, path: '/scenes/ads-art/scene-01-draft.mp4', durationSec: 6 },
  { sceneIndex: 1, path: '/scenes/ads-art/scene-02-draft.mp4', durationSec: 6 },
  { sceneIndex: 2, path: '/scenes/ads-art/scene-03-draft.mp4', durationSec: 5 },
  { sceneIndex: 3, path: '/scenes/ads-art/scene-04-draft.mp4', durationSec: 6 },
  {
    sceneIndex: 5,
    path: '/scenes/ads-art/scene-06-draft.mp4',
    durationSec: 15,
    syncScene: true,
  },
  {
    sceneIndex: 6,
    path: '/scenes/ads-art/scene-07-draft.mp4',
    durationSec: 15,
    syncScene: true,
    syncVideoPrompt: true,
  },
  {
    sceneIndex: 7,
    path: '/scenes/ads-art/scene-08-draft.mp4',
    durationSec: 15,
    syncScene: true,
  },
  {
    sceneIndex: 9,
    path: '/scenes/ads-art/scene-10-draft.mp4',
    durationSec: 15,
    syncScene: true,
    syncVideoPrompt: true,
    trimStartMs: 8_000,
    trimEndMs: null,
    clearLegacySubtitle: '[Das neue Werk erwacht.]',
  },
  {
    sceneIndex: 8,
    sourceSceneIndex: 9,
    durationSec: 15,
    syncScene: true,
    syncVideoPrompt: true,
    trimStartMs: 0,
    trimEndMs: 8_000,
  },
] as const;

type SceneRef = {
  id: string;
  sceneIndex: number;
  title: string;
  prompt: string;
  videoPrompt: string | null;
  durationSec: number;
  trimStartMs: number;
  trimEndMs: number | null;
  seed: number | null;
};

// Registers bundled MP4s through the same generation/job/asset/clip model as
// live BFL output. The UI therefore treats them as completed draft renders:
// they appear in the Draft stage, pipeline state, reel and shared history.
export async function registerBundledExampleClips(input: {
  workspaceId: string;
  userId: string;
  storyboardId: string;
  scenes: SceneRef[];
}) {
  const db = getDb();
  const existingDrafts = await db
    .select({
      id: storyboardClips.id,
      sceneId: storyboardClips.sceneId,
      generationId: storyboardClips.generationId,
    })
    .from(storyboardClips)
    .where(
      and(
        eq(storyboardClips.storyboardId, input.storyboardId),
        eq(storyboardClips.tier, 'draft'),
      ),
    );
  const occupiedSceneIds = new Set(existingDrafts.map((clip) => clip.sceneId));
  const draftBySceneId = new Map(
    existingDrafts.map((clip) => [clip.sceneId, clip]),
  );
  const attached: Array<{ sceneId: string; clipId: string }> = [];
  const updatedScenes: string[] = [];
  const now = Date.now();

  for (const draft of EXAMPLE_DRAFT_CLIPS) {
    const scene = input.scenes.find(
      (candidate) => candidate.sceneIndex === draft.sceneIndex,
    );
    const expected = EXAMPLE_BOARD.scenes[draft.sceneIndex];
    if (!scene || scene.title !== expected.title) continue;

    const syncVideoPrompt = 'syncVideoPrompt' in draft && draft.syncVideoPrompt;
    const syncTrim = 'trimStartMs' in draft;
    const canonicalVideoPrompt = expected.videoPrompt.trim();
    const shouldSyncScene =
      'syncScene' in draft &&
      draft.syncScene &&
      (scene.durationSec !== draft.durationSec ||
        (syncVideoPrompt &&
          scene.videoPrompt?.trim() !== canonicalVideoPrompt) ||
        (syncTrim &&
          (scene.trimStartMs !== draft.trimStartMs ||
            scene.trimEndMs !== draft.trimEndMs)));
    if (shouldSyncScene) {
      await db
        .update(storyboardScenes)
        .set({
          durationSec: draft.durationSec,
          ...(syncVideoPrompt ? { videoPrompt: canonicalVideoPrompt } : {}),
          ...(syncTrim
            ? { trimStartMs: draft.trimStartMs, trimEndMs: draft.trimEndMs }
            : {}),
          updatedAt: now + draft.sceneIndex,
        })
        .where(eq(storyboardScenes.id, scene.id));
      updatedScenes.push(scene.id);
    }

    if ('clearLegacySubtitle' in draft) {
      await db
        .delete(storyboardSubtitles)
        .where(
          and(
            eq(storyboardSubtitles.sceneId, scene.id),
            isNull(storyboardSubtitles.clipId),
            eq(storyboardSubtitles.text, draft.clearLegacySubtitle),
          ),
        );
    }

    if (occupiedSceneIds.has(scene.id)) continue;

    if ('sourceSceneIndex' in draft) {
      const sourceScene = input.scenes.find(
        (candidate) => candidate.sceneIndex === draft.sourceSceneIndex,
      );
      const sourceClip = sourceScene
        ? draftBySceneId.get(sourceScene.id)
        : null;
      if (!sourceClip) continue;

      const clipId = crypto.randomUUID();
      await db.insert(storyboardClips).values({
        id: clipId,
        storyboardId: input.storyboardId,
        sceneId: scene.id,
        tier: 'draft',
        generationId: sourceClip.generationId,
        sourceClipId: sourceClip.id,
        createdAt: now + draft.sceneIndex,
      });
      occupiedSceneIds.add(scene.id);
      const linkedClip = {
        id: clipId,
        sceneId: scene.id,
        generationId: sourceClip.generationId,
      };
      draftBySceneId.set(scene.id, linkedClip);
      attached.push({ sceneId: scene.id, clipId });
      continue;
    }

    const generationId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const assetId = crypto.randomUUID();
    const clipId = crypto.randomUUID();
    const createdAt = now + draft.sceneIndex;
    const prompt = syncVideoPrompt
      ? canonicalVideoPrompt
      : scene.videoPrompt?.trim() || scene.prompt.trim();

    await db.batch([
      db.insert(generations).values({
        id: generationId,
        workspaceId: input.workspaceId,
        createdBy: input.userId,
        status: 'succeeded',
        origin: 'example',
        modelId: 'FLUX 3 Video [draft]',
        prompt,
        parametersJson: JSON.stringify({
          mode: 'i2v',
          draft: true,
          durationSec: draft.durationSec,
          resolution: '720p',
          storyboardId: input.storyboardId,
          sceneId: scene.id,
          sceneIndex: scene.sceneIndex,
          seed: scene.seed,
          promptKind: 'image-to-video',
          source: 'bundled-example',
        }),
        outputCount: 1,
        createdAt,
        updatedAt: createdAt,
      }),
      db.insert(generationJobs).values({
        id: jobId,
        generationId,
        outputIndex: 0,
        status: 'succeeded',
        createdAt,
        updatedAt: createdAt,
      }),
      db.insert(generationAssets).values({
        id: assetId,
        generationId,
        jobId,
        kind: 'video',
        r2Key: `static:${draft.path}`,
        mimeType: 'video/mp4',
        createdAt,
      }),
      db.insert(storyboardClips).values({
        id: clipId,
        storyboardId: input.storyboardId,
        sceneId: scene.id,
        tier: 'draft',
        generationId,
        createdAt,
      }),
    ]);
    occupiedSceneIds.add(scene.id);
    draftBySceneId.set(scene.id, {
      id: clipId,
      sceneId: scene.id,
      generationId,
    });
    attached.push({ sceneId: scene.id, clipId });
  }

  if (attached.length || updatedScenes.length) {
    await db
      .update(storyboards)
      .set({ updatedAt: Date.now() })
      .where(eq(storyboards.id, input.storyboardId));
  }

  return { attached, updatedScenes };
}
