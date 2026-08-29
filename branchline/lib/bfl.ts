export const BFL_ENDPOINTS = {
  'FLUX.2 [max]': 'flux-2-max',
  'FLUX.2 [pro]': 'flux-2-pro-preview',
  'FLUX.2 [flex]': 'flux-2-flex',
  'FLUX.2 [klein]': 'flux-2-klein-4b',
} as const;

export type BflModel = keyof typeof BFL_ENDPOINTS;

// Per-model parameter support; the inspector hides controls a model ignores
// and the server refuses to forward them.
export const MODEL_CAPS: Record<BflModel, { guidance: boolean }> = {
  'FLUX.2 [max]': { guidance: false },
  'FLUX.2 [pro]': { guidance: false },
  'FLUX.2 [flex]': { guidance: true },
  'FLUX.2 [klein]': { guidance: false },
};

type BflCreateResponse = {
  id: string;
  polling_url: string;
  cost?: number | null;
};

export type BflPollResponse = {
  status: string;
  // sample: signed media URL (~10 min). draft_cache: bundle reference returned
  // by draft video runs; replaying it via mode "draft_enhance" reproduces the
  // exact shot (seed, motion, audio) at full quality.
  result?: { sample?: string; draft_cache?: string } | null;
};

export async function createBflGeneration(
  apiKey: string,
  input: {
    model: BflModel;
    prompt: string;
    width: number;
    height: number;
    outputFormat: 'jpeg' | 'png' | 'webp';
    safetyTolerance: number;
    promptUpsampling: boolean;
    seed: number | null;
    guidance?: number | null;
    // Base64 data URIs (or URLs) used as FLUX.2 reference images for
    // character/style continuity; sent as input_image, input_image_2, …
    inputImages?: string[] | null;
  },
) {
  const endpoint = BFL_ENDPOINTS[input.model];
  const response = await fetch(`https://api.bfl.ai/v1/${endpoint}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-key': apiKey },
    body: JSON.stringify({
      prompt: input.prompt,
      width: input.width,
      height: input.height,
      output_format: input.outputFormat,
      safety_tolerance: input.safetyTolerance,
      prompt_upsampling: input.promptUpsampling,
      seed: input.seed,
      ...(input.guidance != null && MODEL_CAPS[input.model].guidance
        ? { guidance: input.guidance }
        : {}),
      ...Object.fromEntries(
        (input.inputImages ?? []).map((image, imageIndex) => [
          imageIndex === 0 ? 'input_image' : `input_image_${imageIndex + 1}`,
          image,
        ]),
      ),
    }),
  });

  if (!response.ok) throw new Error(await providerError(response));
  const data = (await response.json()) as BflCreateResponse;
  if (!data.id || !data.polling_url) throw new Error('BFL returned an incomplete generation response.');
  return data;
}

// FLUX 3 Video: one endpoint, mode-shaped requests. Contract assembled from
// BFL's public docs/examples (mode t2v/i2v/draft_enhance; i2v takes keyframes
// as [seconds, dataURI] pairs; draft:true returns a draft_cache the enhance
// call replays). Flag-gated via VIDEO_ENABLED until exercised end-to-end.
const FLUX3_VIDEO_ENDPOINT = 'flux-3-video';

export type VideoResolution = '720p' | '1080p';

export async function createBflVideoDraft(
  apiKey: string,
  input: {
    prompt: string;
    // [seconds, base64 data URI] pairs; a single [0, image] makes it the
    // start frame. Present => i2v, absent => t2v.
    keyframes?: Array<[number, string]> | null;
    durationSec: number;
    seed?: number | null;
    generateAudio?: boolean;
  },
) {
  const response = await fetch(`https://api.bfl.ai/v1/${FLUX3_VIDEO_ENDPOINT}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-key': apiKey },
    body: JSON.stringify({
      mode: input.keyframes?.length ? 'i2v' : 't2v',
      prompt: input.prompt,
      ...(input.keyframes?.length ? { keyframes: input.keyframes } : {}),
      duration: input.durationSec,
      resolution: '720p',
      draft: true,
      generate_audio: input.generateAudio !== false,
      ...(input.seed != null ? { seed: input.seed } : {}),
      safety_tolerance: 2,
    }),
  });

  if (!response.ok) throw new Error(await providerError(response));
  const data = (await response.json()) as BflCreateResponse;
  if (!data.id || !data.polling_url) throw new Error('BFL returned an incomplete video response.');
  return data;
}

export async function enhanceBflVideoDraft(
  apiKey: string,
  input: { draftCache: string; resolution: VideoResolution },
) {
  const response = await fetch(`https://api.bfl.ai/v1/${FLUX3_VIDEO_ENDPOINT}`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-key': apiKey },
    body: JSON.stringify({
      mode: 'draft_enhance',
      draft_cache: input.draftCache,
      resolution: input.resolution,
      safety_tolerance: 2,
    }),
  });

  if (!response.ok) throw new Error(await providerError(response));
  const data = (await response.json()) as BflCreateResponse;
  if (!data.id || !data.polling_url) throw new Error('BFL returned an incomplete enhance response.');
  return data;
}

export async function pollBflGeneration(apiKey: string, pollingUrl: string) {
  const url = new URL(pollingUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.bfl.ai')) {
    throw new Error('BFL returned an invalid polling URL.');
  }
  const response = await fetch(url, { headers: { accept: 'application/json', 'x-key': apiKey } });
  if (!response.ok) throw new Error(await providerError(response));
  return (await response.json()) as BflPollResponse;
}

async function providerError(response: Response) {
  const responseText = (await response.text()).slice(0, 400);
  return `BFL API ${response.status}: ${responseText || response.statusText}`;
}
