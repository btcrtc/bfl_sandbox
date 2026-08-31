import { asc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { storyboardScenes, storyboards } from '@/db/schema';
import { registerBundledExampleClips } from '@/lib/example-clips';
import { getStoryboard } from '@/lib/storyboard-service';

// Attaches the bundled draft renders to an existing copy of the example
// board. Kept idempotent so a deploy or smoke test cannot duplicate clips.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to attach example clips.' }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, id)).limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  }
  const scenes = await db
    .select()
    .from(storyboardScenes)
    .where(eq(storyboardScenes.storyboardId, id))
    .orderBy(asc(storyboardScenes.sceneIndex));

  const result = await registerBundledExampleClips({
    workspaceId,
    userId: user.userId,
    storyboardId: id,
    scenes,
  });
  return NextResponse.json({
    ...result,
    storyboard: await getStoryboard(workspaceId, id),
  });
}
