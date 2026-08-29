import { env } from 'cloudflare:workers';
import { and, desc, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generations, storyboardClips, storyboards } from '@/db/schema';
import { enhanceBflVideoDraft, type VideoResolution } from '@/lib/bfl';
import { checkDailyBudget, submitVideoJob } from '@/lib/run-service';

const TIER_RESOLUTION: Record<'hd' | 'fhd', VideoResolution> = {
  hd: '720p',
  fhd: '1080p',
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  if (env.VIDEO_ENABLED !== 'true') {
    return NextResponse.json(
      { error: 'Video rendering is disabled on this deployment (set VIDEO_ENABLED=true).' },
      { status: 403 },
    );
  }
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to render clips.' }, { status: 401 });
  if (!env.BFL_API_KEY) {
    return NextResponse.json({ error: 'BFL_API_KEY is required for video rendering.' }, { status: 400 });
  }

  const { id, sceneId } = await context.params;
  const body = ((await request.json().catch(() => null)) ?? {}) as { tier?: unknown };
  const tier = body.tier === 'fhd' ? 'fhd' : 'hd';

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();

  const [storyboard] = await db.select().from(storyboards).where(eq(storyboards.id, id)).limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) {
    return NextResponse.json({ error: 'Storyboard not found.' }, { status: 404 });
  }

  // Enhance replays the newest draft clip whose cache reference has landed.
  const draftClips = await db
    .select()
    .from(storyboardClips)
    .where(and(eq(storyboardClips.sceneId, sceneId), eq(storyboardClips.tier, 'draft')))
    .orderBy(desc(storyboardClips.createdAt))
    .limit(5);

  let draftCache: string | null = null;
  let sourceClip: (typeof draftClips)[number] | null = null;
  let durationSec: number | null = null;
  for (const clip of draftClips) {
    const [generation] = await db
      .select({ parametersJson: generations.parametersJson, status: generations.status })
      .from(generations)
      .where(eq(generations.id, clip.generationId))
      .limit(1);
    if (!generation || generation.status !== 'succeeded') continue;
    try {
      const parameters = JSON.parse(generation.parametersJson) as {
        draftCache?: string;
        durationSec?: number;
      };
      if (typeof parameters.draftCache === 'string' && parameters.draftCache) {
        draftCache = parameters.draftCache;
        sourceClip = clip;
        durationSec = typeof parameters.durationSec === 'number' ? parameters.durationSec : null;
        break;
      }
    } catch {
      // Malformed parameters — skip this clip.
    }
  }
  if (!draftCache || !sourceClip) {
    return NextResponse.json(
      { error: 'No finished draft clip to enhance yet — render a draft first and let it finish.' },
      { status: 409 },
    );
  }

  const budget = await checkDailyBudget(workspaceId, 'video');
  if (!budget.ok) return NextResponse.json({ error: budget.message }, { status: 429 });

  try {
    const cache = draftCache;
    const result = await submitVideoJob({
      workspaceId,
      createdBy: user.userId,
      modelId: `FLUX 3 Video [${tier}]`,
      prompt: `Enhance draft clip to ${tier.toUpperCase()}`,
      parameters: {
        tier,
        resolution: TIER_RESOLUTION[tier],
        ...(durationSec != null ? { durationSec } : {}),
        storyboardId: id,
        sceneId,
        sourceClipId: sourceClip.id,
      },
      submit: (apiKey) =>
        enhanceBflVideoDraft(apiKey, { draftCache: cache, resolution: TIER_RESOLUTION[tier] }),
    });

    const now = Date.now();
    const clipId = crypto.randomUUID();
    await db.insert(storyboardClips).values({
      id: clipId,
      storyboardId: id,
      sceneId,
      tier,
      generationId: result.id,
      sourceClipId: sourceClip.id,
      createdAt: now,
    });
    await db.update(storyboards).set({ updatedAt: now }).where(eq(storyboards.id, id));

    return NextResponse.json({ ...result, sceneId, clipId }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not start the enhance render.' },
      { status: 502 },
    );
  }
}
