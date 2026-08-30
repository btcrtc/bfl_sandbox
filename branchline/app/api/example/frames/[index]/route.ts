import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { EXAMPLE_BOARD, exampleOverrideKey } from '@/lib/example-board';

// Serves example frame N (1-based): the re-rendered R2 override when present,
// otherwise the bundled static. Stable URLs for syncing the repo statics with
// the latest renders.
export async function GET(request: Request, context: { params: Promise<{ index: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view frames.' }, { status: 401 });

  const { index } = await context.params;
  const frameIndex = Number(index);
  const scene = Number.isInteger(frameIndex)
    ? EXAMPLE_BOARD.scenes[frameIndex - 1]
    : undefined;
  if (!scene) return NextResponse.json({ error: 'No such frame.' }, { status: 404 });

  const override = await env.FILES.get(exampleOverrideKey(scene.still));
  if (override) {
    return new Response(override.body, {
      headers: {
        'content-type': override.httpMetadata?.contentType || 'image/jpeg',
        'cache-control': 'private, max-age=300',
        etag: override.httpEtag,
      },
    });
  }
  return NextResponse.redirect(new URL(scene.still, request.url), 302);
}
