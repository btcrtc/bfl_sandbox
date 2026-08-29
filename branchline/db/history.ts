import { desc, eq, inArray } from 'drizzle-orm';

import { getDb } from './index';
import { generationAssets, generations } from './schema';

export type HistoryRun = {
  id: string;
  status: string;
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
  assets: Array<{ id: string; url: string; mimeType: string; width: number | null; height: number | null }>;
};

export async function listHistory(workspaceId: string, limit = 50): Promise<HistoryRun[]> {
  const db = getDb();
  const rows = await db
    .select()
    .from(generations)
    .where(eq(generations.workspaceId, workspaceId))
    .orderBy(desc(generations.createdAt))
    .limit(limit);

  const assetRows = rows.length
    ? await db
        .select()
        .from(generationAssets)
        .where(inArray(generationAssets.generationId, rows.map((row) => row.id)))
    : [];

  return rows.map((row) => ({
    id: row.id,
    status: row.status,
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
        url: `/api/assets/${asset.id}`,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
      })),
  }));
}

export async function getHistoryRun(workspaceId: string, generationId: string) {
  const runs = await listHistory(workspaceId, 50);
  return runs.find((run) => run.id === generationId) ?? null;
}

function safeJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
