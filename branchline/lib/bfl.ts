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
  result?: { sample?: string } | null;
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
