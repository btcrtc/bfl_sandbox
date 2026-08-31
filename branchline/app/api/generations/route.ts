import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getHistoryRun } from '@/db/history';
import { BFL_ENDPOINTS, MODEL_CAPS, type BflModel } from '@/lib/bfl';
import { loadAssetDataUri } from '@/lib/media';
import { checkDailyBudget, submitGeneration } from '@/lib/run-service';

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
  parentRunId?: unknown;
  parentAssetId?: unknown;
  variationType?: unknown;
  variationLabel?: unknown;
  variationPrompt?: unknown;
};

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to run a workflow.' }, { status: 401 });

  const parsed = validate((await request.json().catch(() => null)) as CreateBody | null);
  if ('error' in parsed) return NextResponse.json(parsed, { status: 400 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);

  const budget = await checkDailyBudget(workspaceId);
  if (!budget.ok) return NextResponse.json({ error: budget.message }, { status: 429 });

  let inputImages: string[] | null = null;
  if (parsed.branch.parentRunId) {
    const parent = await getHistoryRun(workspaceId, parsed.branch.parentRunId);
    if (!parent) return NextResponse.json({ error: 'Parent frame not found.' }, { status: 404 });
    if (parsed.branch.parentAssetId) {
      if (!parent.assets.some((asset) => asset.id === parsed.branch.parentAssetId)) {
        return NextResponse.json({ error: 'Parent asset does not belong to that frame.' }, { status: 400 });
      }
      const dataUri = await loadAssetDataUri(workspaceId, parsed.branch.parentAssetId);
      if (!dataUri) return NextResponse.json({ error: 'Parent frame is unavailable.' }, { status: 404 });
      inputImages = [dataUri];
    }
  }

  const result = await submitGeneration({
    workspaceId,
    createdBy: user.userId,
    model: parsed.model,
    prompt: parsed.prompt,
    outputs: parsed.outputs,
    parameters: parsed.parameters,
    inputImages,
    extraParameters: parsed.branch.parentRunId
      ? {
          parentRunId: parsed.branch.parentRunId,
          variationType: parsed.branch.variationType,
          variationLabel: parsed.branch.variationLabel,
          variationPrompt: parsed.branch.variationPrompt,
        }
      : undefined,
  });

  return NextResponse.json(result, { status: 202 });
}

function validate(body: CreateBody | null) {
  if (
    !body ||
    typeof body.prompt !== 'string' ||
    body.prompt.trim().length < 3 ||
    body.prompt.length > 10_000
  ) {
    return { error: 'Prompt must be between 3 and 10,000 characters.' } as const;
  }
  const model = typeof body.model === 'string' ? body.model : 'FLUX.2 [max]';
  if (!(model in BFL_ENDPOINTS)) return { error: 'Unsupported model.' } as const;

  const width = dimension(body.width, 1024);
  const height = dimension(body.height, 768);
  if (!width || !height)
    return { error: 'Width and height must be 256–2048 and divisible by 32.' } as const;
  const outputs = Number(body.outputs ?? 2);
  if (!Number.isInteger(outputs) || outputs < 1 || outputs > 4)
    return { error: 'Outputs must be between 1 and 4.' } as const;
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
  const parentRunId =
    typeof body.parentRunId === 'string' && body.parentRunId.length <= 100
      ? body.parentRunId
      : null;
  const parentAssetId =
    typeof body.parentAssetId === 'string' && body.parentAssetId.length <= 100
      ? body.parentAssetId
      : null;
  const variationType =
    body.variationType === 'object' ||
    body.variationType === 'camera' ||
    body.variationType === 'lens' ||
    body.variationType === 'light' ||
    body.variationType === 'color' ||
    body.variationType === 'refine'
      ? body.variationType
      : null;
  const variationLabel =
    typeof body.variationLabel === 'string'
      ? body.variationLabel.trim().slice(0, 80)
      : null;
  const variationPrompt =
    typeof body.variationPrompt === 'string'
      ? body.variationPrompt.trim().slice(0, 800)
      : null;
  if ((parentAssetId || variationType || variationLabel || variationPrompt) && !parentRunId) {
    return { error: 'A variation needs a parent run.' } as const;
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
    branch: { parentRunId, parentAssetId, variationType, variationLabel, variationPrompt },
  };
}

function dimension(value: unknown, fallback: number) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number >= 256 && number <= 2048 && number % 32 === 0
    ? number
    : null;
}
