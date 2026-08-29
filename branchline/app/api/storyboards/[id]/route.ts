import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generationAssets, generations, storyboards } from '@/db/schema';
import { getStoryboard } from '@/lib/storyboard-service';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view this storyboard.' }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const storyboard = await getStoryboard(workspaceId, id);
  if (!storyboard) return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  return NextResponse.json({ storyboard });
}

type PatchBody = {
  title?: unknown;
  styleNote?: unknown;
  seed?: unknown;
  referenceAssetId?: unknown;
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to edit this storyboard.' }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const [existing] = await db.select().from(storyboards).where(eq(storyboards.id, id)).limit(1);
  if (!existing || existing.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  }

  const body = ((await request.json().catch(() => null)) ?? {}) as PatchBody;
  const patch: Partial<typeof storyboards.$inferInsert> = { updatedAt: Date.now() };

  if (typeof body.title === 'string' && body.title.trim()) {
    patch.title = body.title.trim().slice(0, 120);
  }
  if (typeof body.styleNote === 'string') {
    patch.styleNote = body.styleNote.trim().slice(0, 600) || null;
  }
  if (body.seed === null) patch.seed = null;
  if (typeof body.seed === 'number') {
    if (!Number.isSafeInteger(body.seed) || body.seed < 0 || body.seed > 2 ** 32 - 1) {
      return NextResponse.json({ error: 'Seed must be an integer between 0 and 4294967295.' }, { status: 400 });
    }
    patch.seed = body.seed;
  }
  if (body.referenceAssetId === null) patch.referenceAssetId = null;
  if (typeof body.referenceAssetId === 'string') {
    // The reference must be an asset in this workspace.
    const [asset] = await db
      .select({ id: generationAssets.id })
      .from(generationAssets)
      .innerJoin(generations, eq(generations.id, generationAssets.generationId))
      .where(
        and(eq(generationAssets.id, body.referenceAssetId), eq(generations.workspaceId, workspaceId)),
      )
      .limit(1);
    if (!asset) return NextResponse.json({ error: 'Reference asset not found.' }, { status: 404 });
    patch.referenceAssetId = asset.id;
  }

  await db.update(storyboards).set(patch).where(eq(storyboards.id, id));
  return NextResponse.json({ storyboard: await getStoryboard(workspaceId, id) });
}
