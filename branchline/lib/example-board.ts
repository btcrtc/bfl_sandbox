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
    'Shot on Kodak Vision3 500T 35mm through Panavision C-Series anamorphic glass: fine grain ' +
    'rising in the shadows, subtle gate weave, oval bokeh, halation blooming only around ' +
    'practical light sources. ENR silver-retention grade — desaturated slate blue and raw umber, ' +
    'protected warm skin tones, deep matte blacks, zero digital sharpness. Physically believable ' +
    'light: soft specular roll-off on wet stone, subsurface scattering in skin, every source ' +
    'motivated and diffused by volumetric fog. The register of Martin Scorsese photographed by ' +
    'Rodrigo Prieto (Killers of the Flower Moon, The Irishman) — a production still from a real ' +
    'film; never illustration, CGI gloss or stylization.',
  seed: 1968,
  scenes: [
    {
      title: 'The stopped clock',
      prompt:
        'Establishing wide at 6:12 a.m. Camera under a dripping first-floor eave across the ' +
        'square, 35mm anamorphic at T4, deep focus, a rain-beaded wrought-iron lantern bracket ' +
        'breaking the left foreground out of focus. The cobbled Black Forest square recedes on a ' +
        'diagonal to a plain stone-and-timber clock tower on the upper-third line, hands frozen ' +
        'at 6:12; a loose arc of twelve villagers stands with backs to camera, motionless, their ' +
        'stillness the subject. Light: one 2800K gas lantern is the only warm point in a 6500K ' +
        'pre-dawn overcast field, its reflection threading the wet basalt cobbles toward camera; ' +
        'ground fog holds the tower at half contrast. Texture in the halftones: rain-dark loden ' +
        'wool absorbing light, zinc gutters carrying specular runoff, moss in the mortar joints, ' +
        'slate roofs going umber in shadow.',
      durationSec: 6,
      still: '/example/scene-01.jpg',
    },
    {
      title: 'The verdict',
      prompt:
        'Interior two-shot at workbench height, camera shooting through the opened brass ' +
        'movement, 50mm anamorphic at T2.3, focus plane locked on the old master’s eyes while ' +
        'the front gear train dissolves into oval bokeh. Blocking: the master leans in from left ' +
        'in profile, his apprentice — a young woman in her twenties, dark hair tied back in a ' +
        'low knot, gray loden coat — mirrors him from the right, eyelines converging on the ' +
        'stopped escapement between them. Light: a single 2900K tungsten work lamp low over the ' +
        'bench keys at 4:1 against 6000K window fill, dust motes crossing the beam; brass ' +
        'bounces warm uplight onto both faces like candlelight. Materials: oiled brass with ' +
        'fingerprints and micro-scratches, hand-cut steel pinions, a waxed-linen tool roll, his ' +
        'cracked knuckles, beads of melted fog still on her wool shoulders.',
      durationSec: 5,
      still: '/example/scene-02.jpg',
    },
    {
      title: 'Up the water line',
      prompt:
        'Handheld tracking shot climbing with her, camera half a step behind her shoulder ' +
        'swinging to a three-quarter profile, 40mm anamorphic at T2.8, 180-degree shutter ' +
        'leaving motion blur at the frame edges. The apprentice — a young woman in her twenties, ' +
        'dark hair tied back in a low knot, drenched gray loden coat — climbs the muddy service ' +
        'path; the dry wooden flume cuts the frame corner to corner, leading uphill into fog ' +
        'between towering pine trunks. Light: her swinging 2200K kerosene lantern is the only ' +
        'key, streaking a horizontal anamorphic flare and refracting in the raindrops on her ' +
        'hood’s fibers; 6800K storm daylight rims the canopy far above. Texture: sodden loden ' +
        'weave read in halftone, lanolin wool beading water, black mud pulling at boot welts, ' +
        'wet bark glistening where the lantern passes.',
      durationSec: 6,
      still: '/example/scene-03.jpg',
    },
    {
      title: 'The sluice',
      prompt:
        'Low three-quarter angle from water level, 40mm anamorphic at T2.8, 45-degree shutter ' +
        'freezing every droplet mid-air. Blocking: the apprentice — a young woman in her ' +
        'twenties, dark hair tied back in a low knot, soaked gray loden coat gone almost black — ' +
        'throws her full weight onto a two-meter hand-forged iron bar wedged under a fallen ' +
        'pine, back arched, boots slipping on wet granite; the sluice gate bursts open ' +
        'screen-right and water explodes onto the moss-black mill wheel. Light: a lantern hung ' +
        'on the sluice post keys her strained face at 2200K; each frozen droplet refracts it ' +
        'into amber caustics against the 6500K dusk, and the turning wheel throws off silver ' +
        'specular arcs. Materials: rust-scaled iron, waterlogged pine bark, granite sparkling ' +
        'where spray lands, her wet lashes catching the lantern.',
      durationSec: 6,
      still: '/example/scene-04.jpg',
    },
    {
      title: 'Time returns',
      prompt:
        'Resolution shot: 75mm anamorphic from knee height behind the old master and the ' +
        'apprentice — a young woman in her twenties, dark hair tied back in a low knot, gray ' +
        'loden coat — two dark shoulders framing the clock tower between them as its minute hand ' +
        'visibly steps forward; townsfolk turn to one another in soft-focus midground. Light: ' +
        'first 5600K sunlight tears the fog at a 45-degree rake, carving visible volumetric ' +
        'shafts, gilding the half-timber and splitting every face half warm, half shadow-blue; ' +
        'one hard glint off the bell bronze in the belfry. Texture: steam beginning to lift off ' +
        'the wet cobbles and off their wool shoulders, tired real faces with wet lashes, the ' +
        'amber lantern from the opening now pale against the sun.',
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
