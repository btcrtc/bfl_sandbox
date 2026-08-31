import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  generationAssets,
  storyboardScenes,
  storyboards,
  storyboardTakes,
} from '@/db/schema';
import { EXAMPLE_FRAME_STACK_BASE_PATH } from '@/lib/example-frame-stack';
import { registerExampleFrameStack } from '@/lib/example-frame-stack-store';

// Hydrates the bundled Clockmaker exploration as real scene takes. This is
// intentionally idempotent: old example boards gain the same branches as new
// boards, while non-example scenes remain untouched.
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; sceneId: string }> },
) {
  const user = await getChatGPTUser();
  if (!user)
    return NextResponse.json(
      { error: 'Sign in to open Frame Stack.' },
      { status: 401 },
    );

  const { id, sceneId } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(
    user.userId,
    user.displayName,
  );
  const db = getDb();

  const [storyboard] = await db
    .select()
    .from(storyboards)
    .where(eq(storyboards.id, id))
    .limit(1);
  if (!storyboard || storyboard.workspaceId !== workspaceId) {
    return NextResponse.json(
      { error: 'Storyboard not found.' },
      { status: 404 },
    );
  }
  const [scene] = await db
    .select()
    .from(storyboardScenes)
    .where(
      and(
        eq(storyboardScenes.id, sceneId),
        eq(storyboardScenes.storyboardId, id),
      ),
    )
    .limit(1);
  if (!scene)
    return NextResponse.json({ error: 'Scene not found.' }, { status: 404 });

  const storedTakes = await db
    .select({
      generationId: storyboardTakes.generationId,
      r2Key: generationAssets.r2Key,
    })
    .from(storyboardTakes)
    .innerJoin(
      generationAssets,
      eq(generationAssets.generationId, storyboardTakes.generationId),
    )
    .where(eq(storyboardTakes.sceneId, sceneId));

  const baseGenerationId = storedTakes.find(
    (take) => take.r2Key === `static:${EXAMPLE_FRAME_STACK_BASE_PATH}`,
  )?.generationId;
  if (!baseGenerationId) {
    return NextResponse.json({ supported: false, added: 0 });
  }

  const added = await registerExampleFrameStack({
    workspaceId,
    userId: user.userId,
    storyboardId: id,
    sceneId,
    scenePrompt: scene.prompt,
    seed: scene.seed ?? storyboard.seed,
    baseGenerationId,
  });
  return NextResponse.json({ supported: true, added });
}
