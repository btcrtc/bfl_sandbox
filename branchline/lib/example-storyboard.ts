import { getDb } from '@/db/index';
import {
  generationAssets,
  generationJobs,
  generations,
  storyboards,
  storyboardScenes,
  storyboardSubtitles,
  storyboardTakes,
} from '@/db/schema';
import {
  EXAMPLE_BOARD,
  EXAMPLE_STILL,
  type ExampleScene,
} from '@/lib/example-board';
import { registerBundledExampleClips } from '@/lib/example-clips';

async function registerExampleStill(input: {
  workspaceId: string;
  userId: string;
  scene: ExampleScene;
  sceneIndex: number;
  now: number;
}): Promise<string> {
  const { workspaceId, userId, scene, sceneIndex, now } = input;
  const db = getDb();
  const generationId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const prompt = `${scene.prompt} Style: ${EXAMPLE_BOARD.styleNote}`;
  const seed = EXAMPLE_BOARD.seed + sceneIndex;

  await db.batch([
    db.insert(generations).values({
      id: generationId,
      workspaceId,
      createdBy: userId,
      status: 'succeeded',
      origin: 'example',
      modelId: EXAMPLE_STILL.model,
      prompt,
      parametersJson: JSON.stringify({
        width: EXAMPLE_STILL.width,
        height: EXAMPLE_STILL.height,
        seed,
        output_format: 'webp',
        prompt_upsampling: false,
      }),
      outputCount: 1,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(generationJobs).values({
      id: jobId,
      generationId,
      outputIndex: 0,
      status: 'succeeded',
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(generationAssets).values({
      id: jobId,
      generationId,
      jobId,
      kind: 'image',
      r2Key: `static:${scene.still}`,
      mimeType: 'image/webp',
      width: EXAMPLE_STILL.width,
      height: EXAMPLE_STILL.height,
      createdAt: now,
    }),
  ]);
  return generationId;
}

// Creates one complete, production-shaped example board. The same function is
// used by the explicit "Load example" action and the one-time demo bootstrap,
// so mock content never leaks into a user's blank project.
export async function createExampleStoryboard(input: {
  workspaceId: string;
  userId: string;
}): Promise<string> {
  const { workspaceId, userId } = input;
  const db = getDb();
  const now = Date.now();
  const storyboardId = crypto.randomUUID();
  const generationIds: string[] = [];

  for (const [sceneIndex, scene] of EXAMPLE_BOARD.scenes.entries()) {
    generationIds.push(
      await registerExampleStill({
        workspaceId,
        userId,
        scene,
        sceneIndex,
        now,
      }),
    );
  }

  const sceneIds = EXAMPLE_BOARD.scenes.map(() => crypto.randomUUID());
  const takeRows = generationIds.map((generationId, sceneIndex) => ({
    id: crypto.randomUUID(),
    storyboardId,
    sceneId: sceneIds[sceneIndex],
    generationId,
    createdAt: now,
  }));
  const sceneRows = EXAMPLE_BOARD.scenes.map((scene, sceneIndex) => ({
    id: sceneIds[sceneIndex],
    storyboardId,
    sceneIndex,
    title: scene.title,
    prompt: scene.prompt,
    videoPrompt: scene.videoPrompt,
    durationSec: scene.durationSec,
    trimStartMs: 'trimStartMs' in scene ? scene.trimStartMs : 0,
    trimEndMs: 'trimEndMs' in scene ? scene.trimEndMs : null,
    seed: EXAMPLE_BOARD.seed + sceneIndex,
    generationId: generationIds[sceneIndex],
    createdAt: now,
    updatedAt: now,
  }));
  const subtitleRows = EXAMPLE_BOARD.scenes.flatMap((scene, sceneIndex) =>
    scene.subtitle
      ? [
          {
            id: crypto.randomUUID(),
            storyboardId,
            sceneId: sceneIds[sceneIndex],
            clipId: null,
            startMs: 400,
            endMs: Math.min(scene.durationSec * 1_000 - 250, 3_800),
            text: scene.subtitle.text,
            speaker: scene.subtitle.speaker,
            language: 'de',
            createdAt: now,
            updatedAt: now,
          },
        ]
      : [],
  );
  const chunks = <T>(rows: T[], size: number) =>
    Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
      rows.slice(index * size, index * size + size),
    );

  await db.batch([
    db.insert(storyboards).values({
      id: storyboardId,
      workspaceId,
      createdBy: userId,
      title: EXAMPLE_BOARD.title,
      idea: EXAMPLE_BOARD.idea,
      styleNote: EXAMPLE_BOARD.styleNote,
      seed: EXAMPLE_BOARD.seed,
      createdAt: now,
      updatedAt: now,
    }),
    ...chunks(sceneRows, 4).map((rows) =>
      db.insert(storyboardScenes).values(rows),
    ),
    ...chunks(takeRows, 8).map((rows) =>
      db.insert(storyboardTakes).values(rows),
    ),
    ...chunks(subtitleRows, 4).map((rows) =>
      db.insert(storyboardSubtitles).values(rows),
    ),
  ]);

  await registerBundledExampleClips({
    workspaceId,
    userId,
    storyboardId,
    scenes: sceneRows,
  });
  return storyboardId;
}
