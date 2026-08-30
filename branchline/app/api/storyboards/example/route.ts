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
  title: 'The Valley Keeps Time',
  idea:
    'A Black Forest village keeps time by one great tower clock, driven since anyone can ' +
    'remember by water from a mountain spring. At dawn the clock stops and the valley goes ' +
    'unnaturally silent: the flume from the spring has run dry. The old clockmaker reads the ' +
    'still gears and sends his apprentice up the water line — through storm-bent pines and fog ' +
    'to the source, where a fallen tree has jammed the sluice. She heaves it free, the wheel ' +
    'shudders back to life, and the bells return to the valley with the sunrise.',
  styleNote:
    'In the key of Scorsese: Hugo’s clockwork warmth — tungsten and brass against cobalt-blue ' +
    'dawn, luminous halation, deep film blacks, slow confident push-ins — with the fog-drowned ' +
    'forest register of Silence. 35mm grain.',
  seed: 1968,
  scenes: [
    {
      title: 'The stopped clock',
      prompt:
        'Blue-hour square of a Black Forest village: half-timbered houses around a great ' +
        'astronomical tower clock frozen mid-swing, villagers in wool coats looking up, ' +
        'unnaturally still fog sliding between the rooftops, amber lanterns burning against ' +
        'cobalt dawn.',
      durationSec: 6,
      still: '/example/scene-01.jpg',
    },
    {
      title: 'The verdict',
      prompt:
        'Inside the clockmaker’s workshop: an old master and his young apprentice open the tower ' +
        'clock’s brass movement, motionless gears reflected in his round glasses, tools laid out ' +
        'like surgery, one warm tungsten lamp against tall blue windows.',
      durationSec: 5,
      still: '/example/scene-02.jpg',
    },
    {
      title: 'Up the water line',
      prompt:
        'The apprentice climbs beside a dry wooden water flume through storm-bent Black Forest ' +
        'pines, lantern held high, rain streaking through the fog between the trunks, the empty ' +
        'channel running uphill into darkness.',
      durationSec: 6,
      still: '/example/scene-03.jpg',
    },
    {
      title: 'The sluice',
      prompt:
        'At the mountain spring a fallen pine jams the water-wheel sluice; the apprentice heaves ' +
        'it free with a long iron bar, water bursting silver through the gate, the great wooden ' +
        'wheel shuddering back into motion, spray catching her lantern light.',
      durationSec: 6,
      still: '/example/scene-04.jpg',
    },
    {
      title: 'Time returns',
      prompt:
        'Sunrise tearing the fog open over the valley: the tower clock’s hands sweep back to ' +
        'life and the bells ring, townsfolk gathering on the square below, the old clockmaker ' +
        'with his apprentice beside him, warm light flooding the half-timbered facades.',
      durationSec: 7,
      still: '/example/scene-05.jpg',
    },
  ],
};

// Registers a bundled example still as a completed FLUX.2 [max] run for this
// workspace. The asset row points straight at the static file
// (r2Key `static:/example/…`; the assets route redirects) — no self-fetch, no
// R2 copy, works identically on every host.
async function registerExampleStill(input: {
  workspaceId: string;
  userId: string;
  scene: (typeof EXAMPLE.scenes)[number];
  sceneIndex: number;
  now: number;
}): Promise<string> {
  const { workspaceId, userId, scene, sceneIndex, now } = input;
  const db = getDb();
  const generationId = crypto.randomUUID();
  const jobId = crypto.randomUUID();
  const r2Key = `static:${scene.still}`;
  const prompt = `${scene.prompt} Style: ${EXAMPLE.styleNote}`;
  const seed = EXAMPLE.seed + sceneIndex;

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

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to create a storyboard.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const now = Date.now();
  const storyboardId = crypto.randomUUID();

  const generationIds: string[] = [];
  for (const [sceneIndex, scene] of EXAMPLE.scenes.entries()) {
    generationIds.push(
      await registerExampleStill({ workspaceId, userId: user.userId, scene, sceneIndex, now }),
    );
  }

  const sceneIds = EXAMPLE.scenes.map(() => crypto.randomUUID());
  const takeRows = generationIds.map((generationId, sceneIndex) => ({
    id: crypto.randomUUID(),
    storyboardId,
    sceneId: sceneIds[sceneIndex],
    generationId,
    createdAt: now,
  }));
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
