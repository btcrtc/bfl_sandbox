import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generationAssets, storyboardClips, storyboardScenes, storyboards } from '@/db/schema';
import { createBflVideoDraft } from '@/lib/bfl';
import { loadAssetDataUri } from '@/lib/media';
import { checkDailyBudget, submitVideoJob } from '@/lib/run-service';

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  if (env.VIDEO_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Video rendering is disabled on this deployment (set VIDEO_ENABLED=true).' },
      { status: 403 },
    );
  }
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to render clips.' }, { status: 401 });
  if (!env.BFL_API_KEY) {
    return NextResponse.json({ error: 'BFL_API_KEY is required for video rendering.' }, { status: 400 });
  }

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
  if (!scene.generationId) {
    return NextResponse.json({ error: 'Render the scene still first.' }, { status: 409 });
  }

  // The finished still anchors the clip: it goes in as the start keyframe.
  const [stillAsset] = await db
    .select({ id: generationAssets.id })
    .from(generationAssets)
    .where(eq(generationAssets.generationId, scene.generationId))
    .limit(1);
  const stillDataUri = stillAsset
    ? await loadAssetDataUri(workspaceId, stillAsset.id, new URL(request.url).origin)
    : null;
  if (!stillDataUri) {
    return NextResponse.json({ error: 'The scene still is not stored yet — wait for it to finish.' }, { status: 409 });
  }

  const motionDirection = scene.videoPrompt?.trim() || scene.prompt.trim();
  const prompt = [motionDirection, storyboard.styleNote?.trim()]
    .filter(Boolean)
    .join('\n\nStyle: ');
  if (prompt.length < 3) {
    return NextResponse.json({ error: 'Write an image-to-video prompt first.' }, { status: 400 });
  }

  const budget = await checkDailyBudget(workspaceId, 'video');
  if (!budget.ok) return NextResponse.json({ error: budget.message }, { status: 429 });

  try {
    const result = await submitVideoJob({
      workspaceId,
      createdBy: user.userId,
      modelId: 'FLUX 3 Video [draft]',
      prompt,
      parameters: {
        tier: 'draft',
        durationSec: scene.durationSec,
        resolution: '720p',
        storyboardId: id,
        sceneId,
        sceneIndex: scene.sceneIndex,
        promptKind: scene.videoPrompt ? 'image-to-video' : 'scene-fallback',
      },
      submit: (apiKey) =>
        createBflVideoDraft(apiKey, {
          prompt,
          keyframes: [[0, stillDataUri]],
          durationSec: scene.durationSec,
          seed: scene.seed ?? storyboard.seed,
        }),
    });

    const now = Date.now();
    const clipId = crypto.randomUUID();
    await db.insert(storyboardClips).values({
      id: clipId,
      storyboardId: id,
      sceneId,
      tier: 'draft',
      generationId: result.id,
      createdAt: now,
    });
    await db.update(storyboards).set({ updatedAt: now }).where(eq(storyboards.id, id));

    return NextResponse.json({ ...result, sceneId, clipId }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start the draft clip.' },
      { status: 502 },
    );
  }
}
