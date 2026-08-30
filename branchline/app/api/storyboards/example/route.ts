import { env } from 'cloudflare:workers';
import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import {
  generationAssets,
  generationJobs,
  generations,
  storyboards,
  storyboardScenes,
} from '@/db/schema';

// A finished-looking board for first contact: the layout reads instantly
// without spending a single credit. Stills are pre-rendered FLUX.2 [max]
// frames bundled as static assets and registered per viewer at seed time;
// when a bundle file is missing the scene simply seeds unrendered.
const STILL_WIDTH = 1344;
const STILL_HEIGHT = 768;
const STILL_MODEL = 'FLUX.2 [max]';

const EXAMPLE = {
  title: 'The Last Signal',
  idea:
    'A lone lighthouse keeper on a storm-battered Atlantic island discovers that the light itself ' +
    'is alive: each night it paints scenes from his memories across the fog, and tonight it is ' +
    'painting his last day ashore — the harbor, the goodbye, the door he never opened.',
  styleNote:
    '35mm anamorphic, sodium-vapor warmth against storm blues, wet surfaces, heavy coastal ' +
    'atmosphere, subtle filmic grain.',
  seed: 1968,
  scenes: [
    {
      title: 'Establishing',
      prompt:
        'Wide establishing shot of a solitary lighthouse on a jagged Atlantic islet at dusk, ' +
        'storm front rolling in, beam cutting through rain, the keeper a tiny figure on the gallery rail.',
      durationSec: 6,
      still: '/example/scene-01.jpg',
    },
    {
      title: 'The keeper',
      prompt:
        'Interior close-up of the keeper winding the clockwork of the lamp, hands weathered, ' +
        'brass mechanisms glowing warm, storm light flickering across his face through the lens.',
      durationSec: 5,
      still: '/example/scene-02.jpg',
    },
    {
      title: 'The light speaks',
      prompt:
        'The rotating beam projects a translucent scene into the fog above the sea: a sunlit ' +
        'harbor from decades ago, fishing boats and a waving crowd painted in light, keeper watching.',
      durationSec: 6,
      still: '/example/scene-03.jpg',
    },
    {
      title: 'The goodbye',
      prompt:
        'Inside the fog projection: a young couple on a pier at golden hour, one boarding a small ' +
        'boat, the other holding a lantern, rendered as luminous fog with soft edges bleeding into rain.',
      durationSec: 5,
      still: '/example/scene-04.jpg',
    },
    {
      title: 'The door',
      prompt:
        'Final shot: the keeper opens the lighthouse door into pure white light, silhouette ' +
        'dissolving into the beam as the lamp completes one last rotation over calming water.',
      durationSec: 8,
      still: '/example/scene-05.jpg',
    },
  ],
};

// Fetches a bundled example still and registers it as a completed FLUX.2 [max]
// run for this workspace. Returns null (scene seeds unrendered) when the
// static file is not present in the build.
async function registerExampleStill(input: {
  requestUrl: string;
  workspaceId: string;
  userId: string;
  scene: (typeof EXAMPLE.scenes)[number];
  sceneIndex: number;
  now: number;
}): Promise<string | null> {
  const { requestUrl, workspaceId, userId, scene, sceneIndex, now } = input;
  let bytes: ArrayBuffer;
  try {
    const response = await fetch(new URL(scene.still, requestUrl));
    const contentType = response.headers.get('content-type') ?? '';
    if (!response.ok || !contentType.startsWith('image/')) return null;
    bytes = await response.arrayBuffer();
  } catch {
    return null;
  }

  const db = getDb();
  const generationId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const r2Key = `${workspaceId}/${generationId}/${jobId}.jpg`;
  const prompt = `${scene.prompt} Style: ${EXAMPLE.styleNote}`;
  const seed = EXAMPLE.seed + sceneIndex;

  await env.FILES.put(r2Key, bytes, {
    httpMetadata: { contentType: 'image/jpeg', cacheControl: 'private, max-age=3600' },
    customMetadata: { generationId, workspaceId },
  });

  await db.batch([
    db.insert(generations).values({
      id: generationId,
      workspaceId,
      createdBy: userId,
      status: 'succeeded',
      origin: 'example',
      modelId: STILL_MODEL,
      prompt,
      parametersJson: JSON.stringify({
        width: STILL_WIDTH,
        height: STILL_HEIGHT,
        seed,
        output_format: 'jpeg',
        prompt_upsampling: false,
      }),
      outputCount: 1,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(generationJobs).values({
      id: jobId,
      generationId,
      outputIndex: 0,
      status: 'succeeded',
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(generationAssets).values({
      id: jobId,
      generationId,
      jobId,
      kind: 'image',
      r2Key,
      mimeType: 'image/jpeg',
      width: STILL_WIDTH,
      height: STILL_HEIGHT,
      createdAt: now,
    }),
  ]);

  return generationId;
}

export async function POST(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to create a storyboard.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const now = Date.now();
  const storyboardId = crypto.randomUUID();

  const generationIds = await Promise.all(
    EXAMPLE.scenes.map((scene, sceneIndex) =>
      registerExampleStill({
        requestUrl: request.url,
        workspaceId,
        userId: user.userId,
        scene,
        sceneIndex,
        now,
      }),
    ),
  );

  await db.batch([
    db.insert(storyboards).values({
      id: storyboardId,
      workspaceId,
      createdBy: user.userId,
      title: EXAMPLE.title,
      idea: EXAMPLE.idea,
      styleNote: EXAMPLE.styleNote,
      seed: EXAMPLE.seed,
      createdAt: now,
      updatedAt: now,
    }),
    db.insert(storyboardScenes).values(
      EXAMPLE.scenes.map((scene, sceneIndex) => ({
        id: crypto.randomUUID(),
        storyboardId,
        sceneIndex,
        title: scene.title,
        prompt: scene.prompt,
        durationSec: scene.durationSec,
        seed: EXAMPLE.seed + sceneIndex,
        generationId: generationIds[sceneIndex],
        createdAt: now,
        updatedAt: now,
      })),
    ),
  ]);

  return NextResponse.json({ id: storyboardId }, { status: 201 });
}
