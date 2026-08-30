// Renders the five "Clockmakers of Light" example stills with FLUX.2 [max]
// and saves them into public/example/ — the example-board seed registers them
// as completed runs. Reproducible: fixed seeds, prompts identical to the seed
// route. Run from branchline/: `node scripts/render-example-stills.mjs`
// (reads BFL_API_KEY from the environment or .dev.vars).
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'example');

async function resolveKey() {
  if (process.env.BFL_API_KEY) return process.env.BFL_API_KEY;
  try {
    const vars = await readFile(join(root, '.dev.vars'), 'utf8');
    const match = vars.match(/^BFL_API_KEY=(.+)$/m);
    if (match) return match[1].trim();
  } catch {
    // fall through
  }
  throw new Error('BFL_API_KEY missing — export it or add it to .dev.vars');
}

const STYLE =
  'Scorsese key in the register of Hugo: slow confident push-ins, warm tungsten and brass ' +
  'against cobalt-blue dawn, glowing halation, deep film blacks, 35mm Kodak grain, carved ' +
  'wood and clockwork textures.';

const SCENES = [
  'Wide establishing shot of Freiburg old town at blue-hour dawn: the gothic cathedral’s openwork spire rising from morning fog spilling down from Black Forest pine hills, wet cobblestone lanes with narrow water runnels catching first light, dark red-tile roofs, one workshop window glowing warm amber.',
  'Interior of a former Black Forest clockmaker’s atelier turned digital image studio: carved wooden gears and antique regulator clocks on the wall beside modern color-grading monitors, a young engineer leaning into the glow adjusting a frame, brass desk lamps, steam rising from an espresso cup, cold dawn light through tall workshop windows.',
  'Close over-the-shoulder shot: a reference monitor showing a frame of misty pine forest being refined, an engineer’s fingers on a precision dial, her face reflected in the screen glass, two colleagues watching in concentrated silence, monitor glow carving warm light out of the workshop shadow.',
  'Golden hour on a ridge path at the forest edge above the city: three friends with bicycles hold up a tablet comparing their rendered frame with the real fog-filled Black Forest valley below, low sun flaring through pine trunks, the image and the landscape in quiet agreement.',
  'Night on the cathedral square: a film projected onto a large outdoor screen beside the gothic minster showing a glowing forest dawn, a warm crowd of townspeople watching upturned, the small studio team standing together at the back, their faces lit by their own projected light.',
];

const KEY = await resolveKey();

async function renderScene(index) {
  const prompt = `${SCENES[index]} Style: ${STYLE}`;
  const seed = 1968 + index;
  const submit = await fetch('https://api.bfl.ai/v1/flux-2-max', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', 'x-key': KEY },
    body: JSON.stringify({
      prompt,
      width: 1344,
      height: 768,
      output_format: 'jpeg',
      safety_tolerance: 2,
      prompt_upsampling: false,
      seed,
    }),
  });
  if (!submit.ok) {
    throw new Error(`scene ${index + 1} submit ${submit.status}: ${(await submit.text()).slice(0, 300)}`);
  }
  const { id, polling_url } = await submit.json();
  console.log(`scene ${index + 1}: submitted ${id}`);

  const deadline = Date.now() + 4 * 60 * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    const poll = await fetch(polling_url, { headers: { accept: 'application/json', 'x-key': KEY } });
    if (!poll.ok) throw new Error(`scene ${index + 1} poll ${poll.status}`);
    const data = await poll.json();
    if (data.status === 'Ready') {
      const sample = data.result?.sample;
      if (!sample) throw new Error(`scene ${index + 1}: Ready without sample`);
      const image = await fetch(sample);
      if (!image.ok) throw new Error(`scene ${index + 1} download ${image.status}`);
      const bytes = Buffer.from(await image.arrayBuffer());
      await writeFile(join(OUT, `scene-0${index + 1}.jpg`), bytes);
      console.log(`scene ${index + 1}: saved ${(bytes.length / 1024).toFixed(0)} KB`);
      return;
    }
    if (['Request Moderated', 'Content Moderated', 'Error', 'Failed'].includes(data.status)) {
      throw new Error(`scene ${index + 1}: ${data.status} ${JSON.stringify(data.details ?? {}).slice(0, 200)}`);
    }
  }
  throw new Error(`scene ${index + 1}: timeout`);
}

await mkdir(OUT, { recursive: true });
const results = await Promise.allSettled(SCENES.map((_, index) => renderScene(index)));
for (const [index, result] of results.entries()) {
  if (result.status === 'rejected') {
    console.error(`FAILED scene ${index + 1}:`, result.reason?.message ?? result.reason);
  }
}
if (results.some((result) => result.status === 'rejected')) process.exit(1);
console.log('all 5 rendered');
