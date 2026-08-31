import { and, asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generationAssets, storyboardReferences, storyboardScenes, storyboards, storyboardTakes } from '@/db/schema';
import { loadAssetDataUri } from '@/lib/media';
import { checkDailyBudget, submitGeneration } from '@/lib/run-service';

// Scene stills are film frames: 16:9 at ~1MP, one output per scene.
const SCENE_FRAME = { width: 1344, height: 768 } as const;

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to generate scenes.' }, { status: 401 });

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

  // Optional refinement: image-to-image on top of the active take — the
  // current frame rides along as the first reference and the instruction
  // tells FLUX.2 what to add, remove or change while keeping the shot.
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    instruction?: unknown;
    parentGenerationId?: unknown;
    activate?: unknown;
  };
  const instruction =
    typeof body.instruction === 'string' ? body.instruction.trim().slice(0, 500) : '';
  const requestedParentId =
    typeof body.parentGenerationId === 'string' ? body.parentGenerationId : null;
  // A brand-new root must become visible on the scene. Only refinements can
  // be rendered as non-active preview branches.
  const activate = instruction ? body.activate !== false : true;

  let refinementParentId = scene.generationId;
  if (instruction && requestedParentId) {
    const [parentTake] = await db
      .select({ id: storyboardTakes.id })
      .from(storyboardTakes)
      .where(
        and(
          eq(storyboardTakes.sceneId, sceneId),
          eq(storyboardTakes.generationId, requestedParentId),
        ),
      )
      .limit(1);
    if (!parentTake && scene.generationId !== requestedParentId) {
      return NextResponse.json(
        { error: 'That parent frame does not belong to this scene.' },
        { status: 400 },
      );
    }
    refinementParentId = requestedParentId;
  }

  let basePrompt = scene.prompt.trim();
  if (instruction) {
    basePrompt = `${basePrompt}\n\nUsing the first reference image as the exact shot to keep, apply this change and nothing else: ${instruction}`;
  }
  const prompt = [basePrompt, storyboard.styleNote?.trim()].filter(Boolean).join('\n\nStyle: ');
  if (prompt.length < 3) {
    return NextResponse.json({ error: 'Write a scene prompt first.' }, { status: 400 });
  }

  const budget = await checkDailyBudget(workspaceId);
  if (!budget.ok) return NextResponse.json({ error: budget.message }, { status: 429 });

  const publicOrigin = new URL(request.url).origin;
  const referenceImages = await loadReferenceDataUris(workspaceId, id, publicOrigin);
  let inputImages = referenceImages;
  if (instruction) {
    if (!refinementParentId) {
      return NextResponse.json({ error: 'Render a still before refining it.' }, { status: 400 });
    }
    const [activeAsset] = await db
      .select({ id: generationAssets.id })
      .from(generationAssets)
      .where(eq(generationAssets.generationId, refinementParentId))
      .limit(1);
    const activeDataUri = activeAsset
      ? await loadAssetDataUri(workspaceId, activeAsset.id, publicOrigin)
      : null;
    if (!activeDataUri) {
      return NextResponse.json({ error: 'The active take has no stored frame yet.' }, { status: 400 });
    }
    // Active frame first; board references fill the remaining slots.
    inputImages = [activeDataUri, ...referenceImages.slice(0, 2)];
  }

  const result = await submitGeneration({
    workspaceId,
    createdBy: user.userId,
    model: 'FLUX.2 [pro]',
    prompt,
    outputs: 1,
    parameters: {
      ...SCENE_FRAME,
      outputFormat: 'png',
      safetyTolerance: 2,
      // Scene prompts are deliberate; upsampling would drift the shared style.
      promptUpsampling: false,
      // Per-scene override wins; the storyboard seed keeps the board coherent.
      seed: scene.seed ?? storyboard.seed,
      guidance: null,
    },
    inputImages,
    extraParameters: {
      storyboardId: id,
      sceneId,
      sceneIndex: scene.sceneIndex,
      ...(instruction ? { refinedFrom: refinementParentId, instruction } : {}),
    },
  });

  const now = Date.now();
  // Renders branch instead of overwriting: the previous still (from before
  // takes existed) is backfilled as a take, the new one is added and made
  // active.
  const takeInserts = [
    db.insert(storyboardTakes).values({
      id: crypto.randomUUID(),
      storyboardId: id,
      sceneId,
      generationId: result.id,
      createdAt: now,
    }),
  ];
  if (scene.generationId) {
    const [existingTake] = await db
      .select({ id: storyboardTakes.id })
      .from(storyboardTakes)
      .where(
        and(
          eq(storyboardTakes.sceneId, sceneId),
          eq(storyboardTakes.generationId, scene.generationId),
        ),
      )
      .limit(1);
    if (!existingTake) {
      takeInserts.push(
        db.insert(storyboardTakes).values({
          id: crypto.randomUUID(),
          storyboardId: id,
          sceneId,
          generationId: scene.generationId,
          createdAt: scene.updatedAt,
        }),
      );
    }
  }
  await db.batch([
    db
      .update(storyboardScenes)
      .set(activate ? { generationId: result.id, updatedAt: now } : { updatedAt: now })
      .where(eq(storyboardScenes.id, sceneId)),
    db.update(storyboards).set({ updatedAt: now }).where(eq(storyboards.id, id)),
    ...takeInserts,
  ]);

  return NextResponse.json({ ...result, sceneId, active: activate }, { status: 202 });
}

async function loadReferenceDataUris(
  workspaceId: string,
  storyboardId: string,
  publicOrigin: string,
): Promise<string[]> {
  const db = getDb();
  const referenceRows = await db
    .select()
    .from(storyboardReferences)
    .where(eq(storyboardReferences.storyboardId, storyboardId))
    .orderBy(asc(storyboardReferences.refIndex));

  const dataUris: string[] = [];
  for (const reference of referenceRows) {
    const dataUri = await loadAssetDataUri(workspaceId, reference.assetId, publicOrigin);
    if (dataUri) dataUris.push(dataUri);
  }
  return dataUris;
}
