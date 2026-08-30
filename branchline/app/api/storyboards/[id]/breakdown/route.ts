import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { storyboardClips, storyboardScenes, storyboards, storyboardTakes } from '@/db/schema';
import { breakdownIdea } from '@/lib/llm';
import { getStoryboard } from '@/lib/storyboard-service';

// Writes the scene sequence from the core idea. Replaces the board's current
// scenes — the client confirms first when rendered work would be discarded.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to write a sequence.' }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, id)).limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as {
    idea?: unknown;
    sceneCount?: unknown;
  };
  const idea = typeof body.idea === 'string' ? body.idea.trim() : '';
  if (idea.length < 10 || idea.length > 2_000) {
    return NextResponse.json(
      { error: 'Describe the idea in 10–2000 characters first.' },
      { status: 400 },
    );
  }
  const sceneCount = Number(body.sceneCount ?? 4);
  if (!Number.isInteger(sceneCount) || sceneCount < 2 || sceneCount > 8) {
    return NextResponse.json({ error: 'Scene count must be between 2 and 8.' }, { status: 400 });
  }

  const { source, breakdown } = await breakdownIdea({
    idea,
    sceneCount,
    apiKey: env.MISTRAL_API_KEY,
  });

  const now = Date.now();
  // One atomic batch: a failure mid-way must not leave the board sceneless.
  // Deleting clips by storyboard id also sweeps rows orphaned by past scene
  // deletions.
  await db.batch([
    db.delete(storyboardClips).where(eq(storyboardClips.storyboardId, id)),
    db.delete(storyboardTakes).where(eq(storyboardTakes.storyboardId, id)),
    db.delete(storyboardScenes).where(eq(storyboardScenes.storyboardId, id)),
    db.insert(storyboardScenes).values(
      breakdown.scenes.map((scene, sceneIndex) => ({
        id: crypto.randomUUID(),
        storyboardId: id,
        sceneIndex,
        title: scene.title,
        prompt: scene.prompt,
        durationSec: scene.durationSec,
        createdAt: now,
        updatedAt: now,
      })),
    ),
    db
      .update(storyboards)
      .set({
        idea,
        // Keep a hand-written style note; only fill an empty one.
        ...(storyboard.styleNote || !breakdown.styleNote
          ? {}
          : { styleNote: breakdown.styleNote }),
        updatedAt: now,
      })
      .where(eq(storyboards.id, id)),
  ]);

  return NextResponse.json({
    source,
    storyboard: await getStoryboard(workspaceId, id),
  });
}
