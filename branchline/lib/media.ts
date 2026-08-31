import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';

import { getDb } from '@/db/index';
import { generationAssets, generations } from '@/db/schema';

// Media inlined into BFL requests as data URIs; keep well under Workers'
// request-body comfort zone.
export const MAX_INLINE_MEDIA_BYTES = 8 * 1024 * 1024;

// Loads a workspace-owned asset from R2 as a base64 data URI, or null when it
// is missing, foreign, or too large to inline.
export async function loadAssetDataUri(
  workspaceId: string,
  assetId: string,
  publicOrigin?: string,
): Promise<string | null> {
  const db = getDb();
  const [asset] = await db
    .select({ r2Key: generationAssets.r2Key, mimeType: generationAssets.mimeType })
    .from(generationAssets)
    .innerJoin(generations, eq(generations.id, generationAssets.generationId))
    .where(and(eq(generationAssets.id, assetId), eq(generations.workspaceId, workspaceId)))
    .limit(1);
  if (!asset) return null;

  if (asset.r2Key.startsWith('static:')) {
    const staticPath = asset.r2Key.slice('static:'.length);
    const override = await env.FILES.get(`example-overrides${staticPath}`);
    if (override) {
      return bufferToDataUri(
        await override.arrayBuffer(),
        override.httpMetadata?.contentType || asset.mimeType,
      );
    }
    if (!publicOrigin) return null;
    const response = await fetch(new URL(staticPath, publicOrigin));
    if (!response.ok) return null;
    return bufferToDataUri(
      await response.arrayBuffer(),
      response.headers.get('content-type') || asset.mimeType,
    );
  }

  const object = await env.FILES.get(asset.r2Key);
  if (!object) return null;
  return bufferToDataUri(await object.arrayBuffer(), asset.mimeType);
}

function bufferToDataUri(bytes: ArrayBuffer, mimeType: string) {
  if (bytes.byteLength > MAX_INLINE_MEDIA_BYTES) return null;
  return `data:${mimeType};base64,${arrayBufferToBase64(bytes)}`;
}

export function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}
