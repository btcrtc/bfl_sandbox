import { and, eq, inArray } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  generationAssets,
  generations,
  storyboardReferences,
  storyboardScenes,
  storyboards,
  storyboardTakes,
} from '@/db/schema';

export type GenerationUsage = {
  generationId: string;
  kind: 'scene' | 'reference';
  storyboardId: string;
  storyboardTitle: string;
  sceneId: string | null;
  sceneTitle: string | null;
  sceneIndex: number | null;
  active: boolean;
};

export async function GET(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to inspect frame usage.' }, { status: 401 });

  const requested = (new URL(request.url).searchParams.get('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const ids = [...new Set(requested)].slice(0, 50);
  if (!ids.length) return NextResponse.json({ usage: {} });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const ownedRows = await db
    .select({ id: generations.id })
    .from(generations)
    .where(and(eq(generations.workspaceId, workspaceId), inArray(generations.id, ids)));
  const ownedIds = ownedRows.map((row) => row.id);
  if (!ownedIds.length) return NextResponse.json({ usage: {} });

  const [takeRows, activeRows, referenceRows] = await Promise.all([
    db
      .select({
        generationId: storyboardTakes.generationId,
        storyboardId: storyboards.id,
        storyboardTitle: storyboards.title,
        sceneId: storyboardScenes.id,
        sceneTitle: storyboardScenes.title,
        sceneIndex: storyboardScenes.sceneIndex,
        activeGenerationId: storyboardScenes.generationId,
      })
      .from(storyboardTakes)
      .innerJoin(storyboards, eq(storyboards.id, storyboardTakes.storyboardId))
      .innerJoin(storyboardScenes, eq(storyboardScenes.id, storyboardTakes.sceneId))
      .where(
        and(
          eq(storyboards.workspaceId, workspaceId),
          inArray(storyboardTakes.generationId, ownedIds),
        ),
      ),
    db
      .select({
        generationId: storyboardScenes.generationId,
        storyboardId: storyboards.id,
        storyboardTitle: storyboards.title,
        sceneId: storyboardScenes.id,
        sceneTitle: storyboardScenes.title,
        sceneIndex: storyboardScenes.sceneIndex,
      })
      .from(storyboardScenes)
      .innerJoin(storyboards, eq(storyboards.id, storyboardScenes.storyboardId))
      .where(
        and(
          eq(storyboards.workspaceId, workspaceId),
          inArray(storyboardScenes.generationId, ownedIds),
        ),
      ),
    db
      .select({
        generationId: generationAssets.generationId,
        storyboardId: storyboards.id,
        storyboardTitle: storyboards.title,
      })
      .from(storyboardReferences)
      .innerJoin(generationAssets, eq(generationAssets.id, storyboardReferences.assetId))
      .innerJoin(storyboards, eq(storyboards.id, storyboardReferences.storyboardId))
      .where(
        and(
          eq(storyboards.workspaceId, workspaceId),
          inArray(generationAssets.generationId, ownedIds),
        ),
      ),
  ]);

  const usage = Object.fromEntries(ownedIds.map((id) => [id, [] as GenerationUsage[]]));
  const seen = new Set<string>();
  const add = (entry: GenerationUsage) => {
    const key = [entry.generationId, entry.kind, entry.storyboardId, entry.sceneId].join(':');
    if (seen.has(key)) return;
    seen.add(key);
    usage[entry.generationId]?.push(entry);
  };

  for (const row of takeRows) {
    add({
      generationId: row.generationId,
      kind: 'scene',
      storyboardId: row.storyboardId,
      storyboardTitle: row.storyboardTitle,
      sceneId: row.sceneId,
      sceneTitle: row.sceneTitle,
      sceneIndex: row.sceneIndex,
      active: row.activeGenerationId === row.generationId,
    });
  }
  // Legacy active frames may predate storyboard_takes; include them too.
  for (const row of activeRows) {
    if (!row.generationId) continue;
    add({
      generationId: row.generationId,
      kind: 'scene',
      storyboardId: row.storyboardId,
      storyboardTitle: row.storyboardTitle,
      sceneId: row.sceneId,
      sceneTitle: row.sceneTitle,
      sceneIndex: row.sceneIndex,
      active: true,
    });
  }
  for (const row of referenceRows) {
    add({
      generationId: row.generationId,
      kind: 'reference',
      storyboardId: row.storyboardId,
      storyboardTitle: row.storyboardTitle,
      sceneId: null,
      sceneTitle: null,
      sceneIndex: null,
      active: false,
    });
  }

  return NextResponse.json({ usage });
}
