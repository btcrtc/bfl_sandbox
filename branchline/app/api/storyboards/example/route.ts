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
  storyboardTakes,
} from '@/db/schema';

// A finished-looking board for first contact: the layout reads instantly
// without spending a single credit. Stills are pre-rendered FLUX.2 [max]
// frames bundled as static assets and registered per viewer at seed time;
// when a bundle file is missing the scene simply seeds unrendered.
const STILL_WIDTH = 1344;
const STILL_HEIGHT = 768;
const STILL_MODEL = 'FLUX.2 [max]';

const EXAMPLE = {
  title: 'Clockmakers of Light',
  idea:
    'In a Freiburg atelier where Black Forest clockmakers once assembled time gear by gear, a ' +
    'small studio now crafts moving images with the same patience. On the eve of their first ' +
    'open-air premiere the dawn fog rolls off the pines into the old town; the team polishes ' +
    'their film frame by frame, climbs to the forest edge to check their light against the real ' +
    'one, and at night gives the city back its own morning on a screen beside the cathedral.',
  styleNote:
    'Scorsese key in the register of Hugo: slow confident push-ins, warm tungsten and brass ' +
    'against cobalt-blue dawn, glowing halation, deep film blacks, 35mm Kodak grain, carved ' +
    'wood and clockwork textures.',
  seed: 1968,
  scenes: [
    {
      title: 'Blue hour, Freiburg',
      prompt:
        'Wide establishing shot of Freiburg old town at blue-hour dawn: the gothic cathedral’s ' +
        'openwork spire rising from morning fog spilling down from Black Forest pine hills, wet ' +
        'cobblestone lanes with narrow water runnels catching first light, dark red-tile roofs, ' +
        'one workshop window glowing warm amber.',
      durationSec: 6,
      still: '/example/scene-01.jpg',
    },
    {
      title: 'The clockmaker’s heirs',
      prompt:
        'Interior of a former Black Forest clockmaker’s atelier turned digital image studio: ' +
        'carved wooden gears and antique regulator clocks on the wall beside modern color-grading ' +
        'monitors, a young engineer leaning into the glow adjusting a frame, brass desk lamps, ' +
        'steam rising from an espresso cup, cold dawn light through tall workshop windows.',
      durationSec: 5,
      still: '/example/scene-02.jpg',
    },
    {
      title: 'Frame by frame',
      prompt:
        'Close over-the-shoulder shot: a reference monitor showing a frame of misty pine forest ' +
        'being refined, an engineer’s fingers on a precision dial, her face reflected in the ' +
        'screen glass, two colleagues watching in concentrated silence, monitor glow carving warm ' +
        'light out of the workshop shadow.',
      durationSec: 5,
      still: '/example/scene-03.jpg',
    },
    {
      title: 'Against the real light',
      prompt:
        'Golden hour on a ridge path at the forest edge above the city: three friends with ' +
        'bicycles hold up a tablet comparing their rendered frame with the real fog-filled Black ' +
        'Forest valley below, low sun flaring through pine trunks, the image and the landscape in ' +
        'quiet agreement.',
      durationSec: 6,
      still: '/example/scene-04.jpg',
    },
    {
      title: 'The premiere',
      prompt:
        'Night on the cathedral square: a film projected onto a large outdoor screen beside the ' +
        'gothic minster showing a glowing forest dawn, a warm crowd of townspeople watching ' +
        'upturned, the small studio team standing together at the back, their faces lit by their ' +
        'own projected light.',
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

  const sceneIds = EXAMPLE.scenes.map(() => crypto.randomUUID());
  const takeRows = generationIds.flatMap((generationId, sceneIndex) =>
    generationId
      ? [
          {
            id: crypto.randomUUID(),
            storyboardId,
            sceneId: sceneIds[sceneIndex],
            generationId,
            createdAt: now,
          },
        ]
      : [],
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
        id: sceneIds[sceneIndex],
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
    ...(takeRows.length ? [db.insert(storyboardTakes).values(takeRows)] : []),
  ]);

  return NextResponse.json({ id: storyboardId }, { status: 201 });
}
