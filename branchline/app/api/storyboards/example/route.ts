import { NextResponse } from 'next/server';

import { getChatGPTUser } from '@/app/chatgpt-auth';
import { ensurePersonalWorkspace } from '@/db/ensure';
import { getDb } from '@/db/index';
import { storyboards, storyboardScenes } from '@/db/schema';

// A finished-looking board for first contact: the layout reads instantly
// without spending a single credit. Stills stay unrendered on purpose — the
// pipeline steps show what each node can still do.
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
    },
    {
      title: 'The keeper',
      prompt:
        'Interior close-up of the keeper winding the clockwork of the lamp, hands weathered, ' +
        'brass mechanisms glowing warm, storm light flickering across his face through the lens.',
      durationSec: 5,
    },
    {
      title: 'The light speaks',
      prompt:
        'The rotating beam projects a translucent scene into the fog above the sea: a sunlit ' +
        'harbor from decades ago, fishing boats and a waving crowd painted in light, keeper watching.',
      durationSec: 6,
    },
    {
      title: 'The goodbye',
      prompt:
        'Inside the fog projection: a young couple on a pier at golden hour, one boarding a small ' +
        'boat, the other holding a lantern, rendered as luminous fog with soft edges bleeding into rain.',
      durationSec: 5,
    },
    {
      title: 'The door',
      prompt:
        'Final shot: the keeper opens the lighthouse door into pure white light, silhouette ' +
        'dissolving into the beam as the lamp completes one last rotation over calming water.',
      durationSec: 8,
    },
  ],
};

export async function POST() {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'Sign in to create a storyboard.' }, { status: 401 });

  const workspaceId = await ensurePersonalWorkspace(user.userId, user.displayName);
  const db = getDb();
  const now = Date.now();
  const storyboardId = crypto.randomUUID();

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
      EXAMPLE.scenes.map((scene, index) => ({
        id: crypto.randomUUID(),
        storyboardId,
        sceneIndex: index,
        title: scene.title,
        prompt: scene.prompt,
        durationSec: scene.durationSec,
        createdAt: now,
        updatedAt: now,
      })),
    ),
  ]);

  return NextResponse.json({ id: storyboardId }, { status: 201 });
}
