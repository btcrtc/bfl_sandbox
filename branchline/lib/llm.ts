// Scene breakdown: turns one idea into an ordered shot list. Uses Mistral
// when a key is configured — a deliberate pairing, since FLUX.2's own text
// encoder is a Mistral-Small VLM — and falls back to a deterministic beat
// template so the flow works on keyless deployments.

export type SceneBreakdown = {
  styleNote: string | null;
  scenes: Array<{ title: string; prompt: string; durationSec: number }>;
};

export async function breakdownIdea(input: {
  idea: string;
  sceneCount: number;
  apiKey?: string | null;
}): Promise<{ source: 'mistral' | 'template'; breakdown: SceneBreakdown }> {
  const sceneCount = Math.min(8, Math.max(2, Math.round(input.sceneCount)));
  if (input.apiKey) {
    try {
      const breakdown = await mistralBreakdown(input.apiKey, input.idea, sceneCount);
      // The model can return fewer usable scenes than requested; pad from the
      // beat template so the board always matches the asked-for count.
      if (breakdown.scenes.length < sceneCount) {
        breakdown.scenes.push(
          ...templateBreakdown(input.idea, sceneCount).scenes.slice(breakdown.scenes.length),
        );
      }
      return { source: 'mistral', breakdown };
    } catch {
      // Fall through to the template — a storyboard beats an error message.
    }
  }
  return { source: 'template', breakdown: templateBreakdown(input.idea, sceneCount) };
}

async function mistralBreakdown(
  apiKey: string,
  idea: string,
  sceneCount: number,
): Promise<SceneBreakdown> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      temperature: 0.7,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a film director breaking an idea into a shot list for an AI video pipeline.',
            `Return strict JSON: {"style_note": string, "scenes": [{"title": string, "prompt": string, "duration_sec": number}]} with exactly ${sceneCount} scenes.`,
            'Each scene prompt is a self-contained visual description of ONE shot (subject, setting, camera, light, motion), 1-3 sentences, no numbering, no dialogue.',
            'The scenes must read as a continuous sequence: establishing first, payoff last.',
            'style_note is one short sentence of shared visual grammar (film stock, palette, light) applied to every shot.',
            'duration_sec is an integer between 5 and 20.',
          ].join(' '),
        },
        { role: 'user', content: idea },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Mistral API ${response.status}: ${(await response.text()).slice(0, 200)}`);
  }
  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Mistral returned no content.');
  const parsed = JSON.parse(content) as {
    style_note?: unknown;
    scenes?: Array<{ title?: unknown; prompt?: unknown; duration_sec?: unknown }>;
  };
  const scenes = (parsed.scenes ?? [])
    .filter((scene) => typeof scene.prompt === 'string' && scene.prompt.trim())
    .slice(0, sceneCount)
    .map((scene, index) => ({
      title:
        typeof scene.title === 'string' && scene.title.trim()
          ? scene.title.trim().slice(0, 80)
          : `Scene ${index + 1}`,
      prompt: String(scene.prompt).trim().slice(0, 2_000),
      durationSec: clampDuration(Number(scene.duration_sec)),
    }));
  if (!scenes.length) throw new Error('Mistral returned no usable scenes.');
  return {
    styleNote:
      typeof parsed.style_note === 'string' && parsed.style_note.trim()
        ? parsed.style_note.trim().slice(0, 600)
        : null,
    scenes,
  };
}

const BEATS: Array<{ title: string; frame: (idea: string) => string }> = [
  {
    title: 'Establishing',
    frame: (idea) =>
      `Wide establishing shot introducing the world of: ${idea}. Slow push-in, natural light, the subject small in a telling environment.`,
  },
  {
    title: 'Arrival',
    frame: (idea) =>
      `The subject of "${idea}" enters the frame. Medium shot, deliberate movement, environment reacting subtly.`,
  },
  {
    title: 'Detail',
    frame: (idea) =>
      `Extreme close-up on the defining detail of: ${idea}. Shallow depth of field, texture and material visible, quiet motion.`,
  },
  {
    title: 'Turn',
    frame: (idea) =>
      `The moment everything shifts in: ${idea}. Dynamic camera, contrast of light and shadow, motion accelerating.`,
  },
  {
    title: 'Struggle',
    frame: (idea) =>
      `Tension peaks for the subject of: ${idea}. Handheld energy, tighter framing, movement against resistance.`,
  },
  {
    title: 'Payoff',
    frame: (idea) =>
      `Hero shot resolving: ${idea}. The subject at its most iconic, dramatic light, camera settling into stillness.`,
  },
];

function templateBreakdown(idea: string, sceneCount: number): SceneBreakdown {
  const cleaned = idea.trim().replace(/\s+/g, ' ');
  // Pick evenly spaced beats so 3 scenes still get a beginning, middle, end.
  const picked = Array.from({ length: sceneCount }, (_, index) => {
    const beatIndex = Math.round((index * (BEATS.length - 1)) / Math.max(1, sceneCount - 1));
    return BEATS[beatIndex];
  });
  return {
    styleNote: null,
    scenes: picked.map((beat) => ({
      title: beat.title,
      prompt: beat.frame(cleaned).slice(0, 2_000),
      durationSec: 5,
    })),
  };
}

function clampDuration(value: number) {
  if (!Number.isFinite(value)) return 5;
  return Math.min(20, Math.max(5, Math.round(value)));
}
