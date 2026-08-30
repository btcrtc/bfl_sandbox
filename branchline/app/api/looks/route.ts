import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generationAssets, generations, looks } from '@/db/schema';

export type LookDto = {
  id: string;
  name: string;
  styleNote: string;
  seed: number | null;
  modelId: string;
  assetId: string;
  assetUrl: string;
  createdAt: number;
};

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view looks.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const rows = await db
    .select()
    .from(looks)
    .where(eq(looks.workspaceId, workspaceId))
    .orderBy(desc(looks.createdAt))
    .limit(50);

  return NextResponse.json({
    looks: rows.map(
      (row): LookDto => ({
        id: row.id,
        name: row.name,
        styleNote: row.styleNote,
        seed: row.seed,
        modelId: row.modelId,
        assetId: row.assetId,
        assetUrl: `/api/assets/${row.assetId}`,
        createdAt: row.createdAt,
      }),
    ),
  });
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to save a look.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const body = ((await request.json().catch(() => null)) ?? {}) as {
    name?: unknown;
    styleNote?: unknown;
    seed?: unknown;
    modelId?: unknown;
    assetId?: unknown;
  };

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  const styleNote = typeof body.styleNote === 'string' ? body.styleNote.trim().slice(0, 1_000) : '';
  const modelId = typeof body.modelId === 'string' ? body.modelId.slice(0, 40) : '';
  const assetId = typeof body.assetId === 'string' ? body.assetId : '';
  if (!name || !styleNote || !modelId || !assetId) {
    return NextResponse.json(
      { error: 'A look needs a name, style note, model and reference frame.' },
      { status: 400 },
    );
  }
  let seed: number | null = null;
  if (typeof body.seed === 'number') {
    if (!Number.isSafeInteger(body.seed) || body.seed < 0 || body.seed > 2 ** 32 - 1) {
      return NextResponse.json({ error: 'Seed out of range.' }, { status: 400 });
    }
    seed = body.seed;
  }

  // The reference frame must be this workspace's own image asset.
  const db = getDb();
  const [asset] = await db
    .select({ id: generationAssets.id, mimeType: generationAssets.mimeType })
    .from(generationAssets)
    .innerJoin(generations, eq(generations.id, generationAssets.generationId))
    .where(and(eq(generationAssets.id, assetId), eq(generations.workspaceId, workspaceId)))
    .limit(1);
  if (!asset || asset.mimeType.startsWith('video/')) {
    return NextResponse.json({ error: 'Pick an image output as the look frame.' }, { status: 400 });
  }

  const id = crypto.randomUUID();
  await db.insert(looks).values({
    id,
    workspaceId,
    createdBy: user.userId,
    name,
    styleNote,
    seed,
    modelId,
    assetId,
    createdAt: Date.now(),
  });
  return NextResponse.json({ id }, { status: 201 });
}
