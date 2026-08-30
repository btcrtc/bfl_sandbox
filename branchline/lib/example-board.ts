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
    'Hyper-realistic 35mm cinema still in Martin Scorsese’s register, shot like Rodrigo Prieto ' +
    '(Killers of the Flower Moon, The Irishman): Kodak Vision3 500T grain, anamorphic lens at ' +
    'T2.8, practical tungsten and kerosene light against cold overcast blue dawn, deep film ' +
    'blacks, muted earth palette, real skin pores, weathered fabric and wet stone texture, ' +
    'documentary period naturalism — a frame from a real film, never illustration or stylization.',
  seed: 1968,
  scenes: [
    {
      title: 'The stopped clock',
      prompt:
        'Dawn on the cobbled square of a Black Forest village, long-lens 75mm compression: a ' +
        'plain stone-and-timber clock tower with its hands stopped at 6:12, a small crowd of ' +
        'villagers in damp wool coats seen from behind at eye level looking up, wet cobblestones ' +
        'mirroring one burning gas lantern, fog sliding between half-timbered facades, cold ' +
        'overcast blue light.',
      durationSec: 6,
      still: '/example/scene-01.jpg',
    },
    {
      title: 'The verdict',
      prompt:
        'Inside a clockmaker’s workshop, 40mm at T2.8, shallow focus: an old master with cracked ' +
        'weathered hands and his apprentice — a young woman in her twenties, dark hair tied ' +
        'back, gray wool coat — lean over the tower clock’s opened brass movement on a ' +
        'workbench, motionless gears, tools laid out on linen, one tungsten work lamp, cold blue ' +
        'window light behind, dust drifting in the beam.',
      durationSec: 5,
      still: '/example/scene-02.jpg',
    },
    {
      title: 'Up the water line',
      prompt:
        'Handheld 35mm frame on a rain-soaked Black Forest slope: the apprentice — a young woman ' +
        'in her twenties, dark hair tied back, drenched gray wool coat — climbs uphill beside an ' +
        'old dry wooden water flume, kerosene lantern flaring into the lens, mud on her boots, ' +
        'breath visible, fog between towering pine trunks, documentary grit.',
      durationSec: 6,
      still: '/example/scene-03.jpg',
    },
    {
      title: 'The sluice',
      prompt:
        'At the mountain spring, fast shutter freezing the spray: the apprentice — a young woman ' +
        'in her twenties, dark hair tied back, soaked gray wool coat — strains on an iron bar ' +
        'levering a fallen pine off a wooden sluice gate, the first water bursting through onto ' +
        'the old mill wheel, lantern light on her wet exhausted face, dusk-blue forest behind, ' +
        'physical and gritty.',
      durationSec: 6,
      still: '/example/scene-04.jpg',
    },
    {
      title: 'Time returns',
      prompt:
        'The village square as first sunlight breaks the fog, 75mm: the old clockmaker and his ' +
        'apprentice — a young woman in her twenties, dark hair tied back, gray wool coat — stand ' +
        'among townsfolk looking up at the tower clock’s moving hands, warm light raking across ' +
        'half-timbered walls and tired real faces, honest period detail, film grain.',
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
