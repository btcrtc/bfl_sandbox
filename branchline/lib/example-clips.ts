import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db/index';
import {
  generationAssets,
  generationJobs,
  generations,
  storyboardClips,
  storyboards,
} from '@/db/schema';
import { EXAMPLE_BOARD } from '@/lib/example-board';

export const EXAMPLE_DRAFT_CLIPS = [
  { sceneIndex: 0, path: '/scenes/ads-art/scene-01-draft.mp4', durationSec: 6 },
  { sceneIndex: 1, path: '/scenes/ads-art/scene-02-draft.mp4', durationSec: 6 },
  { sceneIndex: 2, path: '/scenes/ads-art/scene-03-draft.mp4', durationSec: 5 },
  { sceneIndex: 3, path: '/scenes/ads-art/scene-04-draft.mp4', durationSec: 6 },
] as const;

type SceneRef = {
  id: string;
  sceneIndex: number;
  title: string;
  prompt: string;
  videoPrompt: string | null;
  durationSec: number;
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
    .select({ sceneId: storyboardClips.sceneId })
    .from(storyboardClips)
    .where(
      and(
        eq(storyboardClips.storyboardId, input.storyboardId),
        eq(storyboardClips.tier, 'draft'),
      ),
    );
  const occupiedSceneIds = new Set(existingDrafts.map((clip) => clip.sceneId));
  const attached: Array<{ sceneId: string; clipId: string }> = [];
  const now = Date.now();

  for (const draft of EXAMPLE_DRAFT_CLIPS) {
    const scene = input.scenes.find((candidate) => candidate.sceneIndex === draft.sceneIndex);
    const expected = EXAMPLE_BOARD.scenes[draft.sceneIndex];
    if (!scene || scene.title !== expected.title || occupiedSceneIds.has(scene.id)) continue;

    const generationId = crypto.randomUUID();
    const jobId = crypto.randomUUID();
    const assetId = crypto.randomUUID();
    const clipId = crypto.randomUUID();
    const createdAt = now + draft.sceneIndex;
    const prompt = scene.videoPrompt?.trim() || scene.prompt.trim();

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
    attached.push({ sceneId: scene.id, clipId });
  }

  if (attached.length) {
    await db
      .update(storyboards)
      .set({ updatedAt: Date.now() })
      .where(eq(storyboards.id, input.storyboardId));
  }

  return { attached };
}
