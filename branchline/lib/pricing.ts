import type { BflModel } from './bfl';

// Estimated USD price per generated image: first megapixel at the base rate,
// each additional megapixel at the incremental rate. Derived from BFL's
// published FLUX.2 rates (mid-2026). The UI always labels output as "~".
const RATES: Record<BflModel, { baseUsd: number; extraMpUsd: number }> = {
  'FLUX.2 [max]': { baseUsd: 0.07, extraMpUsd: 0.035 },
  'FLUX.2 [pro]': { baseUsd: 0.03, extraMpUsd: 0.015 },
  'FLUX.2 [flex]': { baseUsd: 0.05, extraMpUsd: 0.025 },
  'FLUX.2 [klein]': { baseUsd: 0.015, extraMpUsd: 0.001 },
};

export function estimateImageCostUsd(model: BflModel, width: number, height: number) {
  const rate = RATES[model];
  const megapixels = (width * height) / 1_000_000;
  return rate.baseUsd + Math.max(0, megapixels - 1) * rate.extraMpUsd;
}

export function estimateRunCostUsd(model: BflModel, width: number, height: number, outputs: number) {
  return estimateImageCostUsd(model, width, height) * outputs;
}

export function formatUsd(value: number) {
  return `$${value.toFixed(2)}`;
}

// BFL reports cost in credits; 1 credit = $0.01.
export function creditsToUsd(credits: number) {
  return credits / 100;
}
