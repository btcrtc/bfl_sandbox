// "The Valley Keeps Time" — the example board's content, shared by the seed
// route (which registers it per workspace) and the render endpoint (which
// re-renders the frames with FLUX.2 [max] into R2 overrides).

export const EXAMPLE_STILL = {
  width: 1344,
  height: 768,
  model: 'FLUX.2 [max]',
} as const;

export const EXAMPLE_BOARD = {
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
} as const;

export type ExampleScene = (typeof EXAMPLE_BOARD.scenes)[number];

// R2 key holding a re-rendered frame for a bundled example still; the assets
// route serves it in place of the static file when present.
export function exampleOverrideKey(stillPath: string) {
  return `example-overrides${stillPath}`;
}
