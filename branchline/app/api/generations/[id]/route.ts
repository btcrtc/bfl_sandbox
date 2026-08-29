import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getHistoryRun } from '@/db/history';
import { getDb } from '@/db/index';
import { generationAssets, generationJobs, generations } from '@/db/schema';
import { pollBflGeneration } from '@/lib/bfl';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to view this run.' }, { status: 401 });

  const { id } = await context.params;
  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const [generation] = await db
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.workspaceId, workspaceId)))
    .limit(1);
  if (!generation) return NextResponse.json({ error: 'Run not found.' }, { status: 404 });

  const apiKey = env.BFL_API_KEY;
  if (apiKey && ['queued', 'running'].includes(generation.status)) {
    await refreshJobs(id, workspaceId, apiKey);
  }

  return NextResponse.json({ run: await getHistoryRun(workspaceId, id) });
}

// BFL polling URLs sign their results for ~10 minutes; a job that is still
// non-terminal well past that window will never deliver a retrievable asset.
const JOB_DEADLINE_MS = 15 * 60 * 1000;
const MODERATED_STATUSES = ['Request Moderated', 'Content Moderated'];
const MODERATION_MESSAGE =
  'Flagged by the safety filter — this is often a false positive. Try rephrasing the prompt (brand names, real people and logos trip it most) or raising safety tolerance by one.';

async function refreshJobs(generationId: string, workspaceId: string, apiKey: string) {
  const db = getDb();
  const jobs = await db.select().from(generationJobs).where(eq(generationJobs.generationId, generationId));

  for (const job of jobs) {
    if (!job.pollingUrl || !['queued', 'running'].includes(job.status)) continue;
    try {
      const result = await pollBflGeneration(apiKey, job.pollingUrl);
      if (result.status === 'Ready' && result.result?.sample) {
        await storeResult(workspaceId, generationId, job.id, result.result.sample);
        await db.update(generationJobs).set({ status: 'succeeded', errorMessage: null, updatedAt: Date.now() }).where(eq(generationJobs.id, job.id));
      } else if (MODERATED_STATUSES.includes(result.status)) {
        await db
          .update(generationJobs)
          .set({ status: 'moderated', errorMessage: MODERATION_MESSAGE, updatedAt: Date.now() })
          .where(eq(generationJobs.id, job.id));
      } else if (['Error', 'Failed'].includes(result.status)) {
        await db
          .update(generationJobs)
          .set({ status: 'failed', errorMessage: `BFL status: ${result.status}`, updatedAt: Date.now() })
          .where(eq(generationJobs.id, job.id));
      } else if (Date.now() - job.createdAt > JOB_DEADLINE_MS) {
        await db
          .update(generationJobs)
          .set({ status: 'failed', errorMessage: 'Timed out — the result link has likely expired. Re-run to generate again.', updatedAt: Date.now() })
          .where(eq(generationJobs.id, job.id));
      } else {
        await db.update(generationJobs).set({ status: 'running', updatedAt: Date.now() }).where(eq(generationJobs.id, job.id));
      }
    } catch (error) {
      const expired = Date.now() - job.createdAt > JOB_DEADLINE_MS;
      await db
        .update(generationJobs)
        .set({
          ...(expired ? { status: 'failed' } : {}),
          errorMessage: error instanceof Error ? error.message : 'Polling failed.',
          updatedAt: Date.now(),
        })
        .where(eq(generationJobs.id, job.id));
    }
  }

  const refreshed = await db.select().from(generationJobs).where(eq(generationJobs.generationId, generationId));
  const succeeded = refreshed.filter((job) => job.status === 'succeeded').length;
  const moderated = refreshed.filter((job) => job.status === 'moderated').length;
  const failed = refreshed.filter((job) => job.status === 'failed').length;
  const terminal = refreshed.length > 0 && succeeded + moderated + failed === refreshed.length;
  const status = terminal
    ? succeeded === refreshed.length
      ? 'succeeded'
      : succeeded > 0
        ? 'partial'
        : moderated > 0
          ? 'moderated'
          : 'failed'
    : 'running';
  const firstError = refreshed.find((job) => job.status === 'moderated' && job.errorMessage)?.errorMessage
    ?? refreshed.find((job) => job.status === 'failed' && job.errorMessage)?.errorMessage
    ?? null;
  const totalCost = refreshed.reduce((sum, job) => sum + Number(job.costCredits ?? 0), 0);
  await db
    .update(generations)
    .set({
      status,
      costCredits: totalCost ? String(totalCost) : null,
      // Observed completion time: creation until the poll that saw the last
      // job go terminal. An upper bound, not the model's own inference time.
      latencyMs: terminal ? Date.now() - Math.min(...refreshed.map((job) => job.createdAt)) : null,
      errorMessage: terminal && succeeded < refreshed.length ? firstError : null,
      updatedAt: Date.now(),
    })
    .where(eq(generations.id, generationId));
}

async function storeResult(workspaceId: string, generationId: string, jobId: string, sourceUrl: string) {
  const db = getDb();
  const [existing] = await db.select().from(generationAssets).where(eq(generationAssets.jobId, jobId)).limit(1);
  if (existing) return;

  const url = new URL(sourceUrl);
  if (url.protocol !== 'https:') throw new Error('BFL returned an invalid asset URL.');
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not retrieve generated asset (${response.status}).`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > 20 * 1024 * 1024) throw new Error('Generated asset exceeds the 20 MB limit.');

  const mimeType = response.headers.get('content-type')?.split(';')[0] || 'image/jpeg';
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  // Deterministic per-job asset id and R2 key: concurrent observers (two tabs
  // polling the same run) write the same key and the insert is a no-op, so a
  // job can never grow duplicate asset rows or orphaned blobs.
  const assetId = jobId;
  const r2Key = `${workspaceId}/${generationId}/${jobId}.${extension}`;
  await env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: mimeType, cacheControl: 'private, max-age=3600' },
    customMetadata: { generationId, workspaceId },
  });
  await db
    .insert(generationAssets)
    .values({
      id: assetId,
      generationId,
      jobId,
      kind: 'image',
      r2Key,
      mimeType,
      createdAt: Date.now(),
    })
    .onConflictDoNothing();
}
