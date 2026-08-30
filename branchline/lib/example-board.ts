// "The Work That Keeps Time" — a real cinematic sequence pulled from the
// Ads Art Figma file (section 58:87) through Figma Desktop's local MCP. The
// image and caption layers stay separate so the editor can treat subtitles as
// editable timing data instead of pixels baked into a still.

export const EXAMPLE_STILL = {
  width: 2048,
  height: 960,
  model: 'FLUX.2 [max]',
} as const;

export const EXAMPLE_BOARD = {
  title: 'The Work That Keeps Time',
  idea:
    'Deep in the Black Forest, a clockmaker has spent a lifetime trying to hold time still. ' +
    'He builds a machine from mechanisms, memories and observed fragments; the finished work ' +
    'does not tell the hour. It returns everything that has been seen — and finally looks back.',
  styleNote:
    'Cinematic pre-visualization from the Ads Art board: deep forest blue-black, motivated ' +
    'tungsten practicals, wet nocturnal atmosphere, tactile brass mechanisms, restrained camera ' +
    'movement and exact blocking. Treat each frame as production intent rather than final art: ' +
    'preserve geography, light direction, eyelines and material continuity while exploring.',
  seed: 1968,
  scenes: [
    {
      title: 'The valley before time',
      prompt:
        'Extreme wide aerial over a Black Forest valley drowned in low fog before dawn. One tiny ' +
        'workshop burns amber beside a dark road; the rest of the forest remains almost black.',
      durationSec: 6,
      still: '/scenes/ads-art/scene-01.webp',
      subtitle: {
        speaker: null,
        text: 'Die Zeit war immer da. Wir blieben lange in ihr – in einer ewigen, gemütlichen Dunkelheit.',
      },
    },
    {
      title: 'Counting time',
      prompt:
        'Medium profile of an elderly clockmaker at a scarred bench by candlelight, disassembled ' +
        'watch parts surrounding his hands, the room falling away into cool darkness.',
      durationSec: 6,
      still: '/scenes/ads-art/scene-02.webp',
      subtitle: {
        speaker: null,
        text: 'Hier gab es so viel Zeit, dass wir begannen, sie zu zählen. Und vielleicht – sie zu zähmen.',
      },
    },
    {
      title: 'A heart for darkness',
      prompt:
        'Top-down close shot of a clock movement under one hard pool of tungsten light. Weathered ' +
        'hands frame the mechanism; tools and pale curls of wood mark the work already done.',
      durationSec: 5,
      still: '/scenes/ads-art/scene-03.webp',
      subtitle: { speaker: null, text: 'Wir bauten der Dunkelheit ein Herz.' },
    },
    {
      title: 'The witnesses arrive',
      prompt:
        'Night exterior in snow. The workshop door throws a warm rectangle across the yard while a ' +
        'tall dark figure carrying a cabinet of clocks waits at the edge of the blue forest.',
      durationSec: 6,
      still: '/scenes/ads-art/scene-04.webp',
      subtitle: {
        speaker: null,
        text: 'Und während wir zählten, standen die Sinnbilder immer dabei.',
      },
    },
    {
      title: 'The firmament',
      prompt:
        'Hero macro of an open brass astronomical watch beside a candle, its dark face holding a ' +
        'field of stars. A row of ordinary clocks disappears softly into the background.',
      durationSec: 5,
      still: '/scenes/ads-art/scene-05.webp',
      subtitle: {
        speaker: null,
        text: 'Die besten Werke nahmen sie auf – und trugen ein ganzes Firmament im Gehäuse.',
      },
    },
    {
      title: 'The new work',
      prompt:
        'The clockmaker opens the workshop door to cold dawn. Behind him, a large illuminated ' +
        'cabinet of tiny frames and mechanisms glows like an archive made physical.',
      durationSec: 6,
      still: '/scenes/ads-art/scene-06.webp',
      subtitle: {
        speaker: null,
        text: 'Inzwischen ist genug gesehen worden. Es hat sich zu einem neuen Werk gefügt.',
      },
    },
    {
      title: 'What was seen',
      prompt:
        'Isolated product portrait of the brass memory machine against black: a grid of miniature ' +
        'landscapes, materials and fragments replacing a conventional clock face.',
      durationSec: 5,
      still: '/scenes/ads-art/scene-07.webp',
      subtitle: {
        speaker: null,
        text: 'Eines, das nicht die Stunde zeigt, sondern das Gesehene.',
      },
    },
    {
      title: 'Time captured',
      prompt:
        'A glowing amber heart-like volume floats above a boardroom table. The forest is visible ' +
        'through the windows; dark server racks line the opposite wall.',
      durationSec: 6,
      still: '/scenes/ads-art/scene-08.webp',
      subtitle: {
        speaker: null,
        text: 'Wir haben die Zeit gefangen. Und mit ihr – alles, was in ihr war.',
      },
    },
    {
      title: 'It looks back',
      prompt:
        'Very wide night aerial of a modern workshop cantilevered over a forested ridge. Its warm ' +
        'interior is a single watchful rectangle in the immense blue-black valley.',
      durationSec: 6,
      still: '/scenes/ads-art/scene-09.webp',
      subtitle: { speaker: null, text: 'Jetzt sieht es uns an.' },
    },
    {
      title: 'The work awakens',
      prompt:
        'Hold on the same remote workshop and valley after the revelation. Fog drifts between the ' +
        'ridges while the lit room remains still, letting the audience decide what is watching.',
      durationSec: 7,
      still: '/scenes/ads-art/scene-10.webp',
      subtitle: { speaker: null, text: '[Das neue Werk erwacht.]' },
    },
  ],
} as const;

export type ExampleScene = (typeof EXAMPLE_BOARD.scenes)[number];

// R2 key holding a re-rendered frame for a bundled example still; the assets
// route serves it in place of the static file when present.
export function exampleOverrideKey(stillPath: string) {
  return `example-overrides${stillPath}`;
}
