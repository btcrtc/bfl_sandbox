import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generationAssets, generations } from '@/db/schema';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view this asset.' }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const [asset] = await db
    .select({ r2Key: generationAssets.r2Key, mimeType: generationAssets.mimeType })
    .from(generationAssets)
    .innerJoin(generations, eq(generations.id, generationAssets.generationId))
    .where(and(eq(generationAssets.id, id), eq(generations.workspaceId, workspaceId)))
    .limit(1);
  if (!asset) return NextResponse.json({ error: 'Asset not found.' }, { status: 404 });

  // Bundled example media lives as static files; the asset row just points
  // there. A re-rendered override in R2 (written by /api/example/render)
  // wins over the bundled frame; otherwise hand the browser the static path.
  if (asset.r2Key.startsWith('static:')) {
    const staticPath = asset.r2Key.slice('static:'.length);
    const override = await env.FILES.get(`example-overrides${staticPath}`);
    if (override) {
      return new Response(override.body, {
        headers: {
          'content-type': override.httpMetadata?.contentType || asset.mimeType,
          'cache-control': 'private, max-age=300',
          etag: override.httpEtag,
        },
      });
    }
    return NextResponse.redirect(new URL(staticPath, request.url), 302);
  }

  const object = await env.FILES.get(asset.r2Key);
  if (!object) return NextResponse.json({ error: 'Asset blob is missing.' }, { status: 404 });

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType || asset.mimeType,
      'cache-control': 'private, max-age=3600',
      etag: object.httpEtag,
    },
  });
}
