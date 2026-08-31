import { eq } from 'drizzle-orm';

import { getDb } from '@/db/index';
import {
  generationAssets,
  generationJobs,
  generations,
  storyboards,
  storyboardTakes,
} from '@/db/schema';
import { EXAMPLE_FRAME_STACK_VARIANTS } from '@/lib/example-frame-stack';

type StoredFrameStackParameters = {
  frameStackKey?: unknown;
};

function readFrameStackKey(parametersJson: string): string | null {
  try {
    const parsed = JSON.parse(parametersJson) as StoredFrameStackParameters;
    return typeof parsed.frameStackKey === 'string'
      ? parsed.frameStackKey
      : null;
  } catch {
    return null;
  }
}

// Persists the bundled exploration as ordinary takes. Both the example-board
// seed path and the legacy-board hydration endpoint call this function so the
// standalone demo and the scene editor cannot drift into separate datasets.
export async function registerExampleFrameStack(input: {
  workspaceId: string;
  userId: string;
  storyboardId: string;
  sceneId: string;
  scenePrompt: string;
  seed: number | null;
  baseGenerationId: string;
}) {
  const {
    workspaceId,
    userId,
    storyboardId,
    sceneId,
    scenePrompt,
    seed,
    baseGenerationId,
  } = input;
  const db = getDb();
  const storedTakes = await db
    .select({
      generationId: storyboardTakes.generationId,
      parametersJson: generations.parametersJson,
    })
    .from(storyboardTakes)
    .innerJoin(generations, eq(generations.id, storyboardTakes.generationId))
    .where(eq(storyboardTakes.sceneId, sceneId));

  const generationByKey = new Map<string, string>();
  for (const take of storedTakes) {
    const key = readFrameStackKey(take.parametersJson);
    if (key) generationByKey.set(key, take.generationId);
  }

  const now = Date.now();
  let added = 0;
  for (const [index, variant] of EXAMPLE_FRAME_STACK_VARIANTS.entries()) {
    if (generationByKey.has(variant.key)) continue;
    const parentGenerationId =
      variant.parentKey === 'base'
        ? baseGenerationId
        : generationByKey.get(variant.parentKey);
    if (!parentGenerationId) continue;

    const generationId = `frame-stack:${sceneId}:${variant.key}`;
    const jobId = `${generationId}:job`;
    const assetId = `${generationId}:asset`;
    const createdAt = now + index;
    const parametersJson = JSON.stringify({
      width: variant.width,
      height: variant.height,
      seed,
      output_format: 'jpeg',
      prompt_upsampling: false,
      refinedFrom: parentGenerationId,
      instruction: variant.instruction,
      frameStackKey: variant.key,
      frameStackTitle: variant.title,
    });

    await db.batch([
      db
        .insert(generations)
        .values({
          id: generationId,
          workspaceId,
          createdBy: userId,
          status: 'succeeded',
          origin: 'example',
          modelId: 'FLUX.2 [max]',
          prompt: `${scenePrompt}\n\n${variant.instruction}`,
          parametersJson,
          outputCount: 1,
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing(),
      db
        .insert(generationJobs)
        .values({
          id: jobId,
          generationId,
          outputIndex: 0,
          status: 'succeeded',
          createdAt,
          updatedAt: createdAt,
        })
        .onConflictDoNothing(),
      db
        .insert(generationAssets)
        .values({
          id: assetId,
          generationId,
          jobId,
          kind: 'image',
          r2Key: `static:${variant.path}`,
          mimeType: 'image/jpeg',
          width: variant.width,
          height: variant.height,
          createdAt,
        })
        .onConflictDoNothing(),
      db
        .insert(storyboardTakes)
        .values({
          id: `${generationId}:take`,
          storyboardId,
          sceneId,
          generationId,
          createdAt,
        })
        .onConflictDoNothing(),
    ]);
    generationByKey.set(variant.key, generationId);
    added += 1;
  }

  if (added > 0) {
    await db
      .update(storyboards)
      .set({ updatedAt: now })
      .where(eq(storyboards.id, storyboardId));
  }
  return added;
}
