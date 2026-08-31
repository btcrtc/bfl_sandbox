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
      videoPrompt:
        'Single continuous six-second shot from the supplied start frame. Begin almost locked, then make an imperceptibly slow aerial push toward the isolated amber workshop. Low fog streams left to right between the ridges, treetops move slightly in a cold wind, and the workshop light breathes once. Preserve the valley geography and the tiny scale of the building; no new objects and no cut. Sound: distant wind through firs and a nearly inaudible clock pulse.',
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
      videoPrompt:
        'Single continuous six-second shot. Make a restrained lateral dolly to the right while the clockmaker selects one brass gear, seats it in the movement and turns the screwdriver once. The candle flutters and a narrow rack focus travels from his eye to his fingertips. Keep his profile, hands, tools and bench geometry stable; no cut and no added action. Sound: soft tool contact, cloth movement and one tentative tick.',
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
      videoPrompt:
        'Five-second locked overhead shot. The left hand steadies the movement while the right hand tightens a single screw; the balance wheel begins to oscillate and the gear train engages in a controlled sequence. Dust motes cross the tungsten pool and the focus breathes once, but the camera does not travel. Preserve every tool and finger. Sound: precise metal clicks resolving into an even mechanical heartbeat.',
      durationSec: 5,
      still: '/scenes/ads-art/scene-03.webp',
      subtitle: { speaker: null, text: 'Wir bauten der Dunkelheit ein Herz.' },
    },
    {
      title: 'The witnesses arrive',
      prompt:
        'Night exterior in snow. The workshop door throws a warm rectangle across the yard while a ' +
        'tall dark figure carrying a cabinet of clocks waits at the edge of the blue forest.',
      videoPrompt:
        'Single six-second slow push across the snow toward the waiting figure. Snow falls diagonally; the figure takes one measured step toward the workshop and the clocks in the carried cabinet sway by a few millimetres. The door opens slightly so its warm rectangle lengthens across the ground. Maintain the figure facing screen-right toward the workshop and keep the forest line fixed. Sound: winter wind, leather straps and several unsynchronised ticks.',
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
      videoPrompt:
        'Five-second macro shot with a minute forward creep. The balance wheel pulses, the celestial disc turns only a few degrees and the candle reflection glides across the brass rim as the flame flickers. Keep the background clocks soft and stationary and preserve all engravings; no morphing or new parts. Sound: intimate escapement ticks with a faint glass resonance.',
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
      videoPrompt:
        'Single continuous six-second reverse dolly, moving backward just ahead of the opening door. The clockmaker pulls it fully open and steps aside as cold blue mist enters around his coat. Behind him, the archive cabinet wakes row by row from bottom to top without changing shape. Preserve the doorway axis and carry the warm-inside, cold-outside contrast from the previous shot. Sound: timber creak, a low relay hum and hundreds of quiet ticks joining together.',
      durationSec: 15,
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
      videoPrompt:
        'Single continuous six-second shot from the supplied frame. Begin nearly locked, then make an extremely slow, controlled push-in toward the brass memory machine. The holographic image cells flicker asynchronously, briefly stutter like damaged film, then awaken one by one: forest mist drifts, water ripples, the star field slowly breathes, and the fragmented eyes blink once. Let subtle scan-line interference and light glitches pass across the holograms without moving their borders. Keep the brass cage and the entire machine perfectly rigid and identical to the source frame—no new panels, no warping, no morphing and no cut. Sound: low mechanical hum, soft projector chatter, tiny electrical glitches and a clock tick gradually forming into a pulse.',
      durationSec: 15,
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
      videoPrompt:
        'Single six-second semicircular dolly around the table. The amber volume slowly rotates and expands once like a breath, sending a warm reflection across the tabletop; server indicators answer in a restrained ripple and the forest reflection shifts on the glass. Keep the room empty and all architecture fixed. Sound: sub-bass electrical resonance, distant cooling fans and one deep pulse.',
      durationSec: 15,
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
      videoPrompt:
        'Six-second very wide aerial creep forward, using the same valley geography established in scene one. Fog crosses the ridge in slow layers and the warm interior light pulses almost imperceptibly. A tiny silhouette inside turns toward the window and becomes still. Preserve the building silhouette, scale and horizon; no camera roll and no cut. Sound: remote wind, a buried electrical hum and the clock pulse now slightly louder.',
      durationSec: 6,
      still: '/scenes/ads-art/scene-09.webp',
      subtitle: { speaker: null, text: 'Jetzt sieht es uns an.' },
    },
    {
      title: 'The work awakens',
      prompt:
        'Hold on the same remote workshop and valley after the revelation. Fog drifts between the ' +
        'ridges while the lit room remains still, letting the audience decide what is watching.',
      videoPrompt:
        'Seven-second locked aftermath with only an imperceptible pullback. Fog climbs between the foreground ridges and gradually veils the workshop. The interior light dims until two small warm points remain aligned in the window; hold them motionless for two seconds, then let one point blink mechanically. Keep the effect ambiguous and preserve the exact building and landscape—nothing emerges. Sound: the ticking stops, silence holds, then one quiet intake of air.',
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
