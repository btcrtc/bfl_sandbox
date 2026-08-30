import { desc, eq, inArray } from 'drizzle-orm';

import { getDb } from './index';
import { generationAssets, generationJobs, generations } from './schema';

export type GenerationStatus =
  | 'draft'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'partial'
  | 'moderated'
  | 'failed';

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'moderated' | 'failed';

export type HistoryRun = {
  id: string;
  status: GenerationStatus;
  origin: string;
  modelId: string;
  prompt: string;
  parameters: Record<string, unknown>;
  outputCount: number;
  costCredits: string | null;
  latencyMs: number | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
  assets: Array<{
    id: string;
    jobId: string | null;
    url: string;
    mimeType: string;
    width: number | null;
    height: number | null;
  }>;
  jobs: Array<{ id: string; outputIndex: number; status: JobStatus; errorMessage: string | null }>;
};

type GenerationRow = typeof generations.$inferSelect;
type AssetRow = typeof generationAssets.$inferSelect;
type JobRow = typeof generationJobs.$inferSelect;

export async function listHistory(workspaceId: string, limit = 50): Promise<HistoryRun[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(generations)
    .where(eq(generations.workspaceId, workspaceId))
    .orderBy(desc(generations.createdAt))
    .limit(limit);
  if (!rows.length) return [];

  const ids = rows.map((row) => row.id);
  const [assetRows, jobRows] = await Promise.all([
    db.select().from(generationAssets).where(inArray(generationAssets.generationId, ids)),
    db.select().from(generationJobs).where(inArray(generationJobs.generationId, ids)),
  ]);

  return rows.map((row) => mapRun(row, assetRows, jobRows));
}

// Resolves a specific set of runs regardless of how deep they sit in history —
// storyboards reference generations by id and must not lose them to a window.
export async function listRunsByIds(
  workspaceId: string,
  generationIds: string[],
): Promise<HistoryRun[]> {
  if (!generationIds.length) return [];
  const db = getDb();
  const rows = await db
    .select()
    .from(generations)
    .where(inArray(generations.id, generationIds));
  const owned = rows.filter((row) => row.workspaceId === workspaceId);
  if (!owned.length) return [];

  const ids = owned.map((row) => row.id);
  const [assetRows, jobRows] = await Promise.all([
    db.select().from(generationAssets).where(inArray(generationAssets.generationId, ids)),
    db.select().from(generationJobs).where(inArray(generationJobs.generationId, ids)),
  ]);
  return owned.map((row) => mapRun(row, assetRows, jobRows));
}

export async function getHistoryRun(workspaceId: string, generationId: string): Promise<HistoryRun | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(generations)
    .where(eq(generations.id, generationId))
    .limit(1);
  if (!row || row.workspaceId !== workspaceId) return null;

  const [assetRows, jobRows] = await Promise.all([
    db.select().from(generationAssets).where(eq(generationAssets.generationId, generationId)),
    db.select().from(generationJobs).where(eq(generationJobs.generationId, generationId)),
  ]);
  return mapRun(row, assetRows, jobRows);
}

function mapRun(row: GenerationRow, assetRows: AssetRow[], jobRows: JobRow[]): HistoryRun {
  return {
    id: row.id,
    status: row.status as GenerationStatus,
    origin: row.origin,
    modelId: row.modelId,
    prompt: row.prompt,
    parameters: safeJson(row.parametersJson),
    outputCount: row.outputCount,
    costCredits: row.costCredits,
    latencyMs: row.latencyMs,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    assets: assetRows
      .filter((asset) => asset.generationId === row.id)
      .map((asset) => ({
        id: asset.id,
        jobId: asset.jobId,
        url: `/api/assets/${asset.id}`,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      })),
    jobs: jobRows
      .filter((job) => job.generationId === row.id)
      .sort((a, b) => a.outputIndex - b.outputIndex)
      .map((job) => ({
        id: job.id,
        outputIndex: job.outputIndex,
        status: job.status as JobStatus,
        errorMessage: job.errorMessage,
      })),
  };
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
