import { env } from 'cloudflare:workers';
import { and, eq, gt } from 'drizzle-orm';

import { getDb } from '@/db/index';
import { generationJobs, generations } from '@/db/schema';
import { createBflGeneration, type BflModel } from './bfl';

export type GenerationParameters = {
  width: number;
  height: number;
  outputFormat: 'jpeg' | 'png' | 'webp';
  safetyTolerance: number;
  promptUpsampling: boolean;
  seed: number | null;
  guidance: number | null;
};

// Live-generation budget: a portfolio deployment runs on the owner's BFL key,
// so cap paid runs per workspace per rolling 24h. Drafts and samples are free.
const DEFAULT_DAILY_RUN_LIMIT = 40;

export async function checkDailyBudget(
  workspaceId: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!env.BFL_API_KEY) return { ok: true };
  const db = getDb();
  const dailyLimit = Number(env.DAILY_RUN_LIMIT ?? DEFAULT_DAILY_RUN_LIMIT);
  const recentLive = await db
    .select({ id: generations.id })
    .from(generations)
    .where(
      and(
        eq(generations.workspaceId, workspaceId),
        eq(generations.origin, 'live'),
        gt(generations.createdAt, Date.now() - 24 * 60 * 60 * 1000),
      ),
    );
  if (recentLive.length >= dailyLimit) {
    return {
      ok: false,
      message: `Daily budget reached: this demo caps live generation at ${dailyLimit} runs per workspace per 24 hours. Try again later.`,
    };
  }
  return { ok: true };
}

export async function submitGeneration(options: {
  workspaceId: string;
  createdBy: string;
  model: BflModel;
  prompt: string;
  outputs: number;
  parameters: GenerationParameters;
  inputImages?: string[] | null;
  // Extra keys persisted into parameters_json (e.g. storyboard/scene linkage).
  extraParameters?: Record<string, unknown>;
}): Promise<{ id: string; status: string; mode: 'preview' | 'live' }> {
  const db = getDb();
  const now = Date.now();
  const generationId = crypto.randomUUID();
  const apiKey = env.BFL_API_KEY;

  await db.insert(generations).values({
    id: generationId,
    workspaceId: options.workspaceId,
    createdBy: options.createdBy,
    status: apiKey ? 'queued' : 'draft',
    origin: apiKey ? 'live' : 'preview',
    modelId: options.model,
    prompt: options.prompt,
    parametersJson: JSON.stringify({
      ...options.parameters,
      ...(options.inputImages?.length ? { references: options.inputImages.length } : {}),
      ...options.extraParameters,
    }),
    outputCount: options.outputs,
    errorMessage: apiKey
      ? null
      : 'BFL_API_KEY is not configured yet. This run is saved as a shared draft.',
    createdAt: now,
    updatedAt: now,
  });

  if (!apiKey) {
    return { id: generationId, status: 'draft', mode: 'preview' };
  }

  const results = await Promise.allSettled(
    Array.from({ length: options.outputs }, (_, outputIndex) =>
      createBflGeneration(apiKey, {
        model: options.model,
        prompt: options.prompt,
        ...options.parameters,
        // Derive a distinct seed per output; identical seeds would return
        // N identical images from the same prompt.
        seed:
          options.parameters.seed == null
            ? null
            : (options.parameters.seed + outputIndex) % 2 ** 32,
        inputImages: options.inputImages ?? null,
      }),
    ),
  );

  await db.insert(generationJobs).values(
    results.map((result, outputIndex) => ({
      id: crypto.randomUUID(),
      generationId,
      outputIndex,
      status: result.status === 'fulfilled' ? 'running' : 'failed',
      providerRequestId: result.status === 'fulfilled' ? result.value.id : null,
      pollingUrl: result.status === 'fulfilled' ? result.value.polling_url : null,
      costCredits:
        result.status === 'fulfilled' && result.value.cost != null
          ? String(result.value.cost)
          : null,
      errorMessage: result.status === 'rejected' ? errorMessage(result.reason) : null,
      createdAt: now,
      updatedAt: Date.now(),
    })),
  );

  const anyRunning = results.some((result) => result.status === 'fulfilled');
  await db
    .update(generations)
    .set({ status: anyRunning ? 'running' : 'failed', updatedAt: Date.now() })
    .where(eq(generations.id, generationId));

  return { id: generationId, status: anyRunning ? 'running' : 'failed', mode: 'live' };
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown generation error.';
}
