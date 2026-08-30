import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { createBflGeneration, pollBflGeneration } from '@/lib/bfl';
import { EXAMPLE_BOARD, EXAMPLE_STILL, exampleOverrideKey } from '@/lib/example-board';

// Re-renders the five example frames with FLUX.2 [max] using THIS
// deployment's key and stores them as R2 overrides the assets route serves in
// place of the bundled statics — every example board (existing and future)
// picks the new frames up instantly. No repository commit, no extra secret:
// the key lives only in the deployment's environment.
//
// Long-poll loop is fine on the container runtime this demo deploys to;
// a real Cloudflare Workers deployment would move it into a queue/DO.

const RENDER_MARKER_KEY = 'example-overrides/.last-render';
const RENDER_COOLDOWN_MS = 15 * 60_000;
const POLL_DEADLINE_MS = 4 * 60_000;
const FAILED_STATUSES = ['Request Moderated', 'Content Moderated', 'Error', 'Failed', 'Task not found'];

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to render.' }, { status: 401 });
  if (!env.BFL_API_KEY) {
    return NextResponse.json(
      { error: 'BFL_API_KEY is not set on this deployment.' },
      { status: 400 },
    );
  }

  // One re-render per cooldown window — this endpoint spends real credits.
  const marker = await env.FILES.get(RENDER_MARKER_KEY);
  if (marker) {
    const last = Number(await marker.text());
    if (Number.isFinite(last) && Date.now() - last < RENDER_COOLDOWN_MS) {
      return NextResponse.json(
        { error: 'Example frames were re-rendered minutes ago — try again later.' },
        { status: 429 },
      );
    }
  }
  await env.FILES.put(RENDER_MARKER_KEY, String(Date.now()));

  const apiKey = env.BFL_API_KEY;
  const results = await Promise.all(
    EXAMPLE_BOARD.scenes.map(async (scene, sceneIndex) => {
      try {
        const submit = await createBflGeneration(apiKey, {
          model: EXAMPLE_STILL.model,
          prompt: `${scene.prompt} Style: ${EXAMPLE_BOARD.styleNote}`,
          width: EXAMPLE_STILL.width,
          height: EXAMPLE_STILL.height,
          outputFormat: 'jpeg',
          safetyTolerance: 2,
          promptUpsampling: false,
          seed: EXAMPLE_BOARD.seed + sceneIndex,
        });

        const deadline = Date.now() + POLL_DEADLINE_MS;
        while (Date.now() < deadline) {
          await new Promise((resolve) => setTimeout(resolve, 2_500));
          const poll = await pollBflGeneration(apiKey, submit.polling_url);
          if (poll.status === 'Ready') {
            const sample = poll.result?.sample;
            if (!sample) throw new Error('Ready without a sample URL.');
            const image = await fetch(sample);
            if (!image.ok) throw new Error(`Sample download failed (${image.status}).`);
            await env.FILES.put(exampleOverrideKey(scene.still), await image.arrayBuffer(), {
              httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=300' },
            });
            return { scene: scene.title, ok: true as const };
          }
          if (FAILED_STATUSES.includes(poll.status)) {
            throw new Error(poll.status);
          }
        }
        throw new Error('Timed out waiting for the render.');
      } catch (error) {
        return {
          scene: scene.title,
          ok: false as const,
          error: error instanceof Error ? error.message : 'Render failed.',
        };
      }
    }),
  );

  const rendered = results.filter((result) => result.ok).length;
  return NextResponse.json(
    { rendered, total: EXAMPLE_BOARD.scenes.length, results },
    { status: rendered > 0 ? 200 : 502 },
  );
}
