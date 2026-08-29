import { env } from 'cloudflare:workers';
import { and, eq, gt } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { generationJobs, generations } from '@/db/schema';
import { BFL_ENDPOINTS, MODEL_CAPS, createBflGeneration, type BflModel } from '@/lib/bfl';

// Live-generation budget: a portfolio deployment runs on the owner's BFL key,
// so cap paid runs per workspace per rolling 24h. Drafts and samples are free.
const DEFAULT_DAILY_RUN_LIMIT = 40;

type CreateBody = {
  prompt?: unknown;
  model?: unknown;
  width?: unknown;
  height?: unknown;
  outputs?: unknown;
  outputFormat?: unknown;
  safetyTolerance?: unknown;
  promptUpsampling?: unknown;
  seed?: unknown;
  guidance?: unknown;
};

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to run a workflow.' }, { status: 401 });

  const parsed = validate((await request.json().catch(() => null)) as CreateBody | null);
  if ('error' in parsed) return NextResponse.json(parsed, { status: 400 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const now = Date.now();
  const generationId = crypto.randomUUID();
  const apiKey = env.BFL_API_KEY;

  if (apiKey) {
    const dailyLimit = Number(env.DAILY_RUN_LIMIT ?? DEFAULT_DAILY_RUN_LIMIT);
    const recentLive = await db
      .select({ id: generations.id })
      .from(generations)
      .where(
        and(
          eq(generations.workspaceId, workspaceId),
          eq(generations.origin, 'live'),
          gt(generations.createdAt, now - 24 * 60 * 60 * 1000),
        ),
      );
    if (recentLive.length >= dailyLimit) {
      return NextResponse.json(
        {
          error: `Daily budget reached: this demo caps live generation at ${dailyLimit} runs per workspace per 24 hours. Try again later.`,
        },
        { status: 429 },
      );
    }
  }

  await db.insert(generations).values({
    id: generationId,
    workspaceId,
    createdBy: user.userId,
    status: apiKey ? 'queued' : 'draft',
    origin: apiKey ? 'live' : 'preview',
    modelId: parsed.model,
    prompt: parsed.prompt,
    parametersJson: JSON.stringify(parsed.parameters),
    outputCount: parsed.outputs,
    errorMessage: apiKey ? null : 'BFL_API_KEY is not configured yet. This run is saved as a shared draft.',
    createdAt: now,
    updatedAt: now,
  });

  if (!apiKey) {
    return NextResponse.json({ id: generationId, status: 'draft', mode: 'preview' }, { status: 202 });
  }

  const results = await Promise.allSettled(
    Array.from({ length: parsed.outputs }, (_, outputIndex) =>
      createBflGeneration(apiKey, {
        model: parsed.model,
        prompt: parsed.prompt,
        ...parsed.parameters,
        // Derive a distinct seed per output; identical seeds would return
        // N identical images from the same prompt.
        seed: parsed.parameters.seed == null ? null : (parsed.parameters.seed + outputIndex) % 2 ** 32,
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
        result.status === 'fulfilled' && result.value.cost != null ? String(result.value.cost) : null,
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

  return NextResponse.json(
    { id: generationId, status: anyRunning ? 'running' : 'failed', mode: 'live' },
    { status: 202 },
  );
}

function validate(body: CreateBody | null) {
  if (!body || typeof body.prompt !== 'string' || body.prompt.trim().length < 3 || body.prompt.length > 10_000) {
    return { error: 'Prompt must be between 3 and 10,000 characters.' } as const;
  }
  const model = typeof body.model === 'string' ? body.model : 'FLUX.2 [max]';
  if (!(model in BFL_ENDPOINTS)) return { error: 'Unsupported model.' } as const;

  const width = dimension(body.width, 1024);
  const height = dimension(body.height, 768);
  if (!width || !height) return { error: 'Width and height must be 256–2048 and divisible by 32.' } as const;
  const outputs = Number(body.outputs ?? 2);
  if (!Number.isInteger(outputs) || outputs < 1 || outputs > 4) return { error: 'Outputs must be between 1 and 4.' } as const;
  const outputFormat: 'jpeg' | 'png' | 'webp' =
    body.outputFormat === 'jpeg' || body.outputFormat === 'webp' ? body.outputFormat : 'png';
  const safetyTolerance = Number(body.safetyTolerance ?? 2);
  if (!Number.isInteger(safetyTolerance) || safetyTolerance < 0 || safetyTolerance > 6) {
    return { error: 'Safety tolerance must be between 0 and 6.' } as const;
  }
  const promptUpsampling = body.promptUpsampling !== false;
  const seed = body.seed == null ? null : Number(body.seed);
  if (seed != null && (!Number.isSafeInteger(seed) || seed < 0 || seed > 2 ** 32 - 1)) {
    return { error: 'Seed must be an integer between 0 and 4294967295.' } as const;
  }
  const guidance = body.guidance == null ? null : Number(body.guidance);
  if (guidance != null && (!Number.isFinite(guidance) || guidance < 1.5 || guidance > 5)) {
    return { error: 'Guidance must be between 1.5 and 5.' } as const;
  }

  return {
    prompt: body.prompt.trim(),
    model: model as BflModel,
    outputs,
    parameters: {
      width,
      height,
      outputFormat,
      safetyTolerance,
      promptUpsampling,
      seed,
      guidance: MODEL_CAPS[model as BflModel].guidance ? guidance : null,
    },
  };
}

function dimension(value: unknown, fallback: number) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number >= 256 && number <= 2048 && number % 32 === 0 ? number : null;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown generation error.';
}
