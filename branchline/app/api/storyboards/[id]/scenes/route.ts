import { desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { storyboardScenes, storyboards } from '@/db/schema';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to edit this storyboard.' }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, id)).limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as {
    title?: unknown;
    prompt?: unknown;
  };
  const [lastScene] = await db
    .select({ sceneIndex: storyboardScenes.sceneIndex })
    .from(storyboardScenes)
    .where(eq(storyboardScenes.storyboardId, id))
    .orderBy(desc(storyboardScenes.sceneIndex))
    .limit(1);

  const now = Date.now();
  const sceneId = crypto.randomUUID();
  const sceneIndex = (lastScene?.sceneIndex ?? -1) + 1;
  await db.insert(storyboardScenes).values({
    id: sceneId,
    storyboardId: id,
    sceneIndex,
    title:
      typeof body.title === 'string' && body.title.trim()
        ? body.title.trim().slice(0, 80)
        : `Scene ${sceneIndex + 1}`,
    prompt:
      typeof body.prompt === 'string' && body.prompt.trim() ? body.prompt.trim().slice(0, 2_000) : '',
    durationSec: 5,
    createdAt: now,
    updatedAt: now,
  });
  await db.update(storyboards).set({ updatedAt: now }).where(eq(storyboards.id, id));

  return NextResponse.json({ id: sceneId }, { status: 201 });
}
