import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  storyboardClips,
  storyboardScenes,
  storyboardSubtitles,
  storyboards,
  storyboardTakes,
} from '@/db/schema';

async function loadScene(workspaceId: string, storyboardId: string, sceneId: string) {
  const db = getDb();
  const [storyboard] = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.id, storyboardId))
    .limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) return null;
  const [scene] = await db
    .select()
    .from(storyboardScenes)
    .where(and(eq(storyboardScenes.id, sceneId), eq(storyboardScenes.storyboardId, storyboardId)))
    .limit(1);
  return scene ?? null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to edit this scene.' }, { status: 401 });

  const { id, sceneId } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const scene = await loadScene(workspaceId, id, sceneId);
  if (!scene) return NextResponse.json({ error: 'Scene not found.' }, { status: 404 });

  const body = ((await request.json().catch(() => null)) ?? {}) as {
    title?: unknown;
    prompt?: unknown;
    videoPrompt?: unknown;
    durationSec?: unknown;
    trimStartMs?: unknown;
    trimEndMs?: unknown;
    seed?: unknown;
    activeGenerationId?: unknown;
  };
  const patch: Partial<typeof storyboardScenes.$inferInsert> = {
    updatedAt: Date.now(),
  };
  if (typeof body.activeGenerationId === 'string') {
    // Switching the active take: only a generation already recorded as a take
    // of this scene (or the current active one) qualifies.
    const db = getDb();
    const [take] = await db
      .select({ id: storyboardTakes.id })
      .from(storyboardTakes)
      .where(
        and(
          eq(storyboardTakes.sceneId, sceneId),
          eq(storyboardTakes.generationId, body.activeGenerationId),
        ),
      )
      .limit(1);
    if (!take && scene.generationId !== body.activeGenerationId) {
      return NextResponse.json(
        { error: 'That take does not belong to this scene.' },
        { status: 400 },
      );
    }
    patch.generationId = body.activeGenerationId;
  }
  if (typeof body.title === 'string' && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 80);
  }
  if (typeof body.prompt === 'string') patch.prompt = body.prompt.trim().slice(0, 2_000);
  if (body.videoPrompt === null) patch.videoPrompt = null;
  if (typeof body.videoPrompt === 'string') {
    patch.videoPrompt = body.videoPrompt.trim().slice(0, 2_000) || null;
  }
  let nextDurationSec = scene.durationSec;
  let trimStartMs = scene.trimStartMs ?? 0;
  let trimEndMs = scene.trimEndMs ?? scene.durationSec * 1_000;
  let trimTouched = false;
  if (body.durationSec != null) {
    const durationSec = Number(body.durationSec);
    // FLUX 3 Video clips are 5–20 seconds.
    if (!Number.isInteger(durationSec) || durationSec < 5 || durationSec > 20) {
      return NextResponse.json({ error: 'Duration must be 5–20 seconds.' }, { status: 400 });
    }
    nextDurationSec = durationSec;
    patch.durationSec = durationSec;
    // A different source render starts with a clean, full-length cut.
    trimStartMs = 0;
    trimEndMs = durationSec * 1_000;
    trimTouched = true;
  }
  if (body.trimStartMs != null) {
    trimStartMs = Number(body.trimStartMs);
    trimTouched = true;
  }
  if (body.trimEndMs !== undefined) {
    trimEndMs = body.trimEndMs === null ? nextDurationSec * 1_000 : Number(body.trimEndMs);
    trimTouched = true;
  }
  if (trimTouched) {
    const sourceDurationMs = nextDurationSec * 1_000;
    if (
      !Number.isInteger(trimStartMs) ||
      !Number.isInteger(trimEndMs) ||
      trimStartMs < 0 ||
      trimEndMs > sourceDurationMs ||
      trimEndMs - trimStartMs < 1_000
    ) {
      return NextResponse.json(
        {
          error: 'Trim points must stay inside the source and keep at least 1 second.',
        },
        { status: 400 },
      );
    }
    patch.trimStartMs = trimStartMs;
    patch.trimEndMs = trimEndMs === sourceDurationMs ? null : trimEndMs;
  }
  if (body.seed === null) patch.seed = null;
  if (typeof body.seed === 'number') {
    if (!Number.isSafeInteger(body.seed) || body.seed < 0 || body.seed > 2 ** 32 - 1) {
      return NextResponse.json(
        { error: 'Seed must be an integer between 0 and 4294967295.' },
        { status: 400 },
      );
    }
    patch.seed = body.seed;
  }

  const db = getDb();
  await db.update(storyboardScenes).set(patch).where(eq(storyboardScenes.id, sceneId));
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to edit this scene.' }, { status: 401 });

  const { id, sceneId } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const scene = await loadScene(workspaceId, id, sceneId);
  if (!scene) return NextResponse.json({ error: 'Scene not found.' }, { status: 404 });

  const db = getDb();
  await db.batch([
    db.delete(storyboardClips).where(eq(storyboardClips.sceneId, sceneId)),
    db.delete(storyboardSubtitles).where(eq(storyboardSubtitles.sceneId, sceneId)),
    db.delete(storyboardTakes).where(eq(storyboardTakes.sceneId, sceneId)),
    db.delete(storyboardScenes).where(eq(storyboardScenes.id, sceneId)),
  ]);
  return NextResponse.json({ ok: true });
}
