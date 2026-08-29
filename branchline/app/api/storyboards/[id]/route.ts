import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  generationAssets,
  generations,
  storyboardReferences,
  storyboards,
} from '@/db/schema';
import { MAX_STORYBOARD_REFERENCES, getStoryboard } from '@/lib/storyboard-service';

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
  referenceAssetIds?: unknown;
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
  if (Array.isArray(body.referenceAssetIds)) {
    const assetIds = body.referenceAssetIds.filter(
      (value): value is string => typeof value === 'string',
    );
    if (assetIds.length !== body.referenceAssetIds.length) {
      return NextResponse.json({ error: 'Reference ids must be strings.' }, { status: 400 });
    }
    const unique = [...new Set(assetIds)].slice(0, MAX_STORYBOARD_REFERENCES);
    if (unique.length > 0) {
      // Every reference must be an asset in this workspace.
      const owned = await db
        .select({ id: generationAssets.id })
        .from(generationAssets)
        .innerJoin(generations, eq(generations.id, generationAssets.generationId))
        .where(
          and(inArray(generationAssets.id, unique), eq(generations.workspaceId, workspaceId)),
        );
      if (owned.length !== unique.length) {
        return NextResponse.json({ error: 'Reference asset not found.' }, { status: 404 });
      }
    }
    const now = Date.now();
    await db.delete(storyboardReferences).where(eq(storyboardReferences.storyboardId, id));
    if (unique.length > 0) {
      await db.insert(storyboardReferences).values(
        unique.map((assetId, refIndex) => ({
          id: crypto.randomUUID(),
          storyboardId: id,
          refIndex,
          assetId,
          createdAt: now,
        })),
      );
    }
  }

  await db.update(storyboards).set(patch).where(eq(storyboards.id, id));
  return NextResponse.json({ storyboard: await getStoryboard(workspaceId, id) });
}
