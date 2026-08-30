import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  storyboardClips,
  storyboardScenes,
  storyboardSubtitles,
  storyboards,
} from '@/db/schema';
import { getStoryboard } from '@/lib/storyboard-service';

type CueInput = {
  id?: unknown;
  startMs?: unknown;
  endMs?: unknown;
  text?: unknown;
  speaker?: unknown;
  language?: unknown;
};

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to edit subtitles.' }, { status: 401 });

  const { id, sceneId } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, id)).limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  }
  const [scene] = await db
    .select()
    .from(storyboardScenes)
    .where(and(eq(storyboardScenes.id, sceneId), eq(storyboardScenes.storyboardId, id)))
    .limit(1);
  if (!scene) return NextResponse.json({ error: 'Scene not found.' }, { status: 404 });

  const body = ((await request.json().catch(() => null)) ?? {}) as {
    clipId?: unknown;
    cues?: unknown;
  };
  const clipId = typeof body.clipId === 'string' && body.clipId ? body.clipId : null;
  if (clipId) {
    const [clip] = await db
      .select({ id: storyboardClips.id })
      .from(storyboardClips)
      .where(and(eq(storyboardClips.id, clipId), eq(storyboardClips.sceneId, sceneId)))
      .limit(1);
    if (!clip) return NextResponse.json({ error: 'Clip not found.' }, { status: 404 });
  }
  if (!Array.isArray(body.cues) || body.cues.length > 30) {
    return NextResponse.json({ error: 'Subtitles must contain at most 30 cues.' }, { status: 400 });
  }

  const parsed: Array<{
    id: string;
    startMs: number;
    endMs: number;
    text: string;
    speaker: string | null;
    language: string;
  }> = [];
  for (const raw of body.cues as CueInput[]) {
    const startMs = Number(raw.startMs);
    const endMs = Number(raw.endMs);
    const text = typeof raw.text === 'string' ? raw.text.trim() : '';
    if (
      !Number.isInteger(startMs) ||
      !Number.isInteger(endMs) ||
      startMs < 0 ||
      endMs <= startMs ||
      endMs > scene.durationSec * 1_000 ||
      !text ||
      text.length > 240
    ) {
      return NextResponse.json(
        { error: `Each cue needs valid timing inside this ${scene.durationSec}s scene and 1–240 characters.` },
        { status: 400 },
      );
    }
    parsed.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : crypto.randomUUID(),
      startMs,
      endMs,
      text,
      speaker:
        typeof raw.speaker === 'string' && raw.speaker.trim()
          ? raw.speaker.trim().slice(0, 50)
          : null,
      language:
        typeof raw.language === 'string' && raw.language.trim()
          ? raw.language.trim().slice(0, 8)
          : 'en',
    });
  }

  const scope = clipId
    ? and(
        eq(storyboardSubtitles.storyboardId, id),
        eq(storyboardSubtitles.sceneId, sceneId),
        eq(storyboardSubtitles.clipId, clipId),
      )
    : and(
        eq(storyboardSubtitles.storyboardId, id),
        eq(storyboardSubtitles.sceneId, sceneId),
        isNull(storyboardSubtitles.clipId),
      );
  await db.delete(storyboardSubtitles).where(scope);
  const now = Date.now();
  if (parsed.length) {
    await db.insert(storyboardSubtitles).values(
      parsed.map((cue) => ({
        ...cue,
        storyboardId: id,
        sceneId,
        clipId,
        createdAt: now,
        updatedAt: now,
      })),
    );
  }
  await db.update(storyboards).set({ updatedAt: now }).where(eq(storyboards.id, id));
  return NextResponse.json({ storyboard: await getStoryboard(workspaceId, id) });
}
