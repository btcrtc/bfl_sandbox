import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generationAssets, generations, storyboardScenes, storyboards } from '@/db/schema';
import { checkDailyBudget, submitGeneration } from '@/lib/run-service';

// Reference images are inlined into the BFL request as data URIs; keep them
// well under Workers' request-body comfort zone.
const MAX_REFERENCE_BYTES = 8 * 1024 * 1024;

// Scene stills are film frames: 16:9 at ~1MP, one output per scene.
const SCENE_FRAME = { width: 1344, height: 768 } as const;

export async function POST(
  _request: Request,
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

  const prompt = [scene.prompt.trim(), storyboard.styleNote?.trim()]
    .filter(Boolean)
    .join('\n\nStyle: ');
  if (prompt.length < 3) {
    return NextResponse.json({ error: 'Write a scene prompt first.' }, { status: 400 });
  }

  const budget = await checkDailyBudget(workspaceId);
  if (!budget.ok) return NextResponse.json({ error: budget.message }, { status: 429 });

  const inputImage = await loadReferenceDataUri(workspaceId, storyboard.referenceAssetId);

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
      seed: storyboard.seed,
      guidance: null,
    },
    inputImage,
    extraParameters: { storyboardId: id, sceneId, sceneIndex: scene.sceneIndex },
  });

  const now = Date.now();
  await db
    .update(storyboardScenes)
    .set({ generationId: result.id, updatedAt: now })
    .where(eq(storyboardScenes.id, sceneId));
  await db.update(storyboards).set({ updatedAt: now }).where(eq(storyboards.id, id));

  return NextResponse.json({ ...result, sceneId }, { status: 202 });
}

async function loadReferenceDataUri(
  workspaceId: string,
  referenceAssetId: string | null,
): Promise<string | null> {
  if (!referenceAssetId) return null;
  const db = getDb();
  const [asset] = await db
    .select({ r2Key: generationAssets.r2Key, mimeType: generationAssets.mimeType })
    .from(generationAssets)
    .innerJoin(generations, eq(generations.id, generationAssets.generationId))
    .where(and(eq(generationAssets.id, referenceAssetId), eq(generations.workspaceId, workspaceId)))
    .limit(1);
  if (!asset) return null;

  const object = await env.FILES.get(asset.r2Key);
  if (!object) return null;
  const bytes = await object.arrayBuffer();
  if (bytes.byteLength > MAX_REFERENCE_BYTES) return null;
  return `data:${asset.mimeType};base64,${arrayBufferToBase64(bytes)}`;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
