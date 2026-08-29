import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { storyboardScenes, storyboards } from '@/db/schema';
import { listStoryboards } from '@/lib/storyboard-service';

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view storyboards.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  return NextResponse.json({ storyboards: await listStoryboards(workspaceId) });
}

const STARTER_SCENES = [
  { title: 'Establishing', prompt: 'Wide establishing shot introducing the subject in its world.' },
  { title: 'Detail', prompt: 'Close-up on the defining detail, shallow depth of field.' },
  { title: 'Payoff', prompt: 'Hero shot, dramatic light, the subject at its most iconic.' },
];

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to create a storyboard.' }, { status: 401 });

  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const title =
    body && typeof body.title === 'string' && body.title.trim().length > 0
      ? body.title.trim().slice(0, 120)
      : 'Untitled storyboard';

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const now = Date.now();
  const storyboardId = crypto.randomUUID();

  await db.insert(storyboards).values({
    id: storyboardId,
    workspaceId,
    createdBy: user.userId,
    title,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(storyboardScenes).values(
    STARTER_SCENES.map((scene, sceneIndex) => ({
      id: crypto.randomUUID(),
      storyboardId,
      sceneIndex,
      title: scene.title,
      prompt: scene.prompt,
      durationSec: 5,
      createdAt: now,
      updatedAt: now,
    })),
  );

  return NextResponse.json({ id: storyboardId }, { status: 201 });
}
