import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
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
import { EXAMPLE_BOARD, EXAMPLE_STILL, type ExampleScene } from '@/lib/example-board';
import { registerBundledExampleClips } from '@/lib/example-clips';

// A finished-looking board for first contact: the layout reads instantly
// without spending a single credit. Content lives in lib/example-board.ts;
// frames come from the bundled statics, or their R2 re-rendered overrides.

// Registers a bundled example still as a completed FLUX.2 [max] run for this
// workspace. The asset row points straight at the static file
// (r2Key `static:/example/…`; the assets route redirects) — no self-fetch, no
// R2 copy, works identically on every host.
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
  const r2Key = `static:${scene.still}`;
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
      r2Key,
      mimeType: 'image/webp',
      width: EXAMPLE_STILL.width,
      height: EXAMPLE_STILL.height,
      createdAt: now,
    }),
  ]);

  return generationId;
}

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to create a storyboard.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const now = Date.now();
  const storyboardId = crypto.randomUUID();

  const generationIds: string[] = [];
  for (const [sceneIndex, scene] of EXAMPLE_BOARD.scenes.entries()) {
    generationIds.push(
      await registerExampleStill({ workspaceId, userId: user.userId, scene, sceneIndex, now }),
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
    seed: EXAMPLE_BOARD.seed + sceneIndex,
    generationId: generationIds[sceneIndex],
    createdAt: now,
    updatedAt: now,
  }));
  const subtitleRows = EXAMPLE_BOARD.scenes.map((scene, sceneIndex) => ({
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
  }));
  // D1 caps bound variables per SQL statement. Ten cinematic frames exceed
  // that cap when emitted as one multi-row insert, so keep each statement
  // deliberately small while retaining a single batched round trip.
  const chunks = <T,>(rows: T[], size: number) =>
    Array.from({ length: Math.ceil(rows.length / size) }, (_, index) =>
      rows.slice(index * size, index * size + size),
    );
  await db.batch([
    db.insert(storyboards).values({
      id: storyboardId,
      workspaceId,
      createdBy: user.userId,
      title: EXAMPLE_BOARD.title,
      idea: EXAMPLE_BOARD.idea,
      styleNote: EXAMPLE_BOARD.styleNote,
      seed: EXAMPLE_BOARD.seed,
      createdAt: now,
      updatedAt: now,
    }),
    ...chunks(sceneRows, 4).map((rows) => db.insert(storyboardScenes).values(rows)),
    ...chunks(takeRows, 8).map((rows) => db.insert(storyboardTakes).values(rows)),
    ...chunks(subtitleRows, 4).map((rows) => db.insert(storyboardSubtitles).values(rows)),
  ]);

  await registerBundledExampleClips({
    workspaceId,
    userId: user.userId,
    storyboardId,
    scenes: sceneRows,
  });

  return NextResponse.json({ id: storyboardId }, { status: 201 });
}
