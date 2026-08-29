import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { storyboardScenes, storyboards } from '@/db/schema';

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
    durationSec?: unknown;
    seed?: unknown;
  };
  const patch: Partial<typeof storyboardScenes.$inferInsert> = { updatedAt: Date.now() };
  if (typeof body.title === 'string' && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 80);
  }
  if (typeof body.prompt === 'string') patch.prompt = body.prompt.trim().slice(0, 2_000);
  if (body.durationSec != null) {
    const durationSec = Number(body.durationSec);
    // FLUX 3 Video clips are 5–20 seconds.
    if (!Number.isInteger(durationSec) || durationSec < 5 || durationSec > 20) {
      return NextResponse.json({ error: 'Duration must be 5–20 seconds.' }, { status: 400 });
    }
    patch.durationSec = durationSec;
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
  await db.delete(storyboardScenes).where(eq(storyboardScenes.id, sceneId));
  return NextResponse.json({ ok: true });
}
