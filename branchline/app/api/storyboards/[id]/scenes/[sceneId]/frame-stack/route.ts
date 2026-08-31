import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  generationAssets,
  generationJobs,
  generations,
  storyboardScenes,
  storyboards,
  storyboardTakes,
} from '@/db/schema';
import {
  EXAMPLE_FRAME_STACK_BASE_PATH,
  EXAMPLE_FRAME_STACK_VARIANTS,
} from '@/lib/example-frame-stack';

type StoredFrameStackParameters = {
  frameStackKey?: unknown;
};

function readFrameStackKey(parametersJson: string): string | null {
  try {
    const parsed = JSON.parse(parametersJson) as StoredFrameStackParameters;
    return typeof parsed.frameStackKey === 'string' ? parsed.frameStackKey : null;
  } catch {
    return null;
  }
}

// Hydrates the bundled Clockmaker exploration as real scene takes. This is
// intentionally idempotent: old example boards gain the same branches as new
// boards, while non-example scenes remain untouched.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to open Frame Stack.' }, { status: 401 });

  const { id, sceneId } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();

  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, id)).limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  }
  const [scene] = await db
    .select()
    .from(storyboardScenes)
    .where(and(eq(storyboardScenes.id, sceneId), eq(storyboardScenes.storyboardId, id)))
    .limit(1);
  if (!scene) return NextResponse.json({ error: 'Scene not found.' }, { status: 404 });

  const storedTakes = await db
    .select({
      generationId: storyboardTakes.generationId,
      parametersJson: generations.parametersJson,
      r2Key: generationAssets.r2Key,
    })
    .from(storyboardTakes)
    .innerJoin(generations, eq(generations.id, storyboardTakes.generationId))
    .innerJoin(generationAssets, eq(generationAssets.generationId, storyboardTakes.generationId))
    .where(eq(storyboardTakes.sceneId, sceneId));

  const baseGenerationId = storedTakes.find(
    (take) => take.r2Key === `static:${EXAMPLE_FRAME_STACK_BASE_PATH}`,
  )?.generationId;
  if (!baseGenerationId) {
    return NextResponse.json({ supported: false, added: 0 });
  }

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
      seed: scene.seed ?? storyboard.seed,
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
          createdBy: user.userId,
          status: 'succeeded',
          origin: 'example',
          modelId: 'FLUX.2 [max]',
          prompt: `${scene.prompt}\n\n${variant.instruction}`,
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
          storyboardId: id,
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
    await db.update(storyboards).set({ updatedAt: now }).where(eq(storyboards.id, id));
  }
  return NextResponse.json({ supported: true, added });
}
