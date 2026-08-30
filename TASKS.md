# CURRENT ITERATION — takes, compact strip, reel timeline (DONE — shipped to main)

> Shipped in one pass on top of the sequence redesign:
>
> - **Takes** — re-rendering a scene still branches instead of overwriting. New
>   `storyboard_takes` table (runtime DDL in `db/ensure.ts`); the generate route inserts a
>   take per render and backfills the pre-takes still lazily; `PATCH scene
>   {activeGenerationId}` switches the active take (validated against the scene's takes);
>   breakdown/scene-delete batches sweep takes. UI: takes thumbnails under the Still stage,
>   `N takes` badge on strip nodes, step 1 relabels to "Render new take".
> - **Compact strip** — board-bar toggle (Shrink/Expand icons, persisted in
>   `localStorage: branchline-scenes-density`) switches nodes to thumbnail-first w-28 cards
>   so 6+ scene boards fit without horizontal scrolling.
> - **Reel timeline + animatic** — in the Reel node: scene blocks sized by duration
>   (22px/s), right-edge drag handle trims 5–20s (arrow keys too; PATCHes durationSec),
>   clicking a block jumps back to that scene's notes. "Play animatic" plays the cut from
>   stills in real time (per-scene progress sweep, `reel-progress` keyframes in
>   globals.css) — the cheapest possible preview of the edit before any video credit.
> - **Example scenario v3 — "The Valley Keeps Time"**: one concrete plot with a conflict
>   (the spring-driven tower clock stops; the apprentice climbs the flume through the storm
>   forest and frees the jammed sluice; time returns at sunrise). Forest-heavy, no direct
>   lab analogy, style note commits to Scorsese explicitly (Hugo's clockwork warmth +
>   Silence's fog register). Stills render via the `Render example stills` workflow
>   (dispatch with key input, or `BFL_API_KEY` repo secret + touching
>   `.github/render-request`).

# NEXT — Playground tab → Lookdev (decision written, not started)

The first tab today is a generic single-model run canvas; after Scenes it reads redundant.
Direction: evolve it into **Lookdev** — the place where a LOOK is crafted before a board
uses it. Film-workflow framing, real utility, keeps all existing receipts/canvas work:

1. **Looks library.** New `looks` table (name, styleNote, referenceAssetIds up to 3, seed,
   model, params). "Save as Look" action in the run-detail dialog captures the current
   recipe. Looks list lives in the rail (replaces mock-y bits of the old tab framing).
2. **Scenes attach a Look.** Style chip on the board bar gets "Apply look" (fills
   styleNote + references + seed in one move). The board stores which look it came from.
3. **Scene ⇄ Lookdev roundtrip.** "Open in Lookdev" from a scene seeds the canvas with the
   scene's prompt+style+refs; "Send back as take" registers the chosen frame as a new take
   for that scene (POST reusing storyboard_takes).

Sequencing note: 1 is standalone; 2 depends on 1; 3 depends on takes (shipped). Naming in
UI: rename nav item "Playground" → "Lookdev" only when 1+2 land, not before.

---

# PREVIOUS ITERATION — Scenes sequence redesign (DONE — shipped to main)

> Both halves landed: server (Mistral breakdown, idea column, breakdown route) and the
> full client rewrite (board bar with chips, sequence strip with idea/scene/reel nodes,
> drill-in detail panel with pipeline steps, arrow-key navigation, board JSON export).
> Boards now start empty — the sequence is written from the idea. Remaining follow-ups
> live in the roadmap: first live video validation, typed run channel, reel playback.

**Why.** Product feedback: the current /scenes layout (left panel with references/style,
right side a grid of scene tiles) reads as meaningless blocks. Scenes must become a tool
for people who build video sequences: ONE core idea → a sequential chain of scene nodes
(like the playground canvas, one node after another) → drill into a node to iterate
(still → refine still → draft clip → enhance). Scene prompts are WRITTEN FROM the idea by
an LLM.

**Server — DONE (committed on this branch):**

- `lib/llm.ts` — `breakdownIdea({idea, sceneCount, apiKey})`: Mistral
  (`mistral-small-latest`, `response_format: json_object`, returns
  `{style_note, scenes:[{title,prompt,duration_sec}]}`) with a deterministic beat-template
  fallback when no key / on any error. Returns `{source: 'mistral'|'template', breakdown}`.
  Mistral is the deliberate choice: FLUX.2's own text encoder is Mistral-Small.
- `db`: `storyboards.idea TEXT` column (in CREATE TABLE + post-batch
  `ALTER TABLE … ADD COLUMN` swallow-error migration in `db/ensure.ts`); exposed as
  `StoryboardDto.idea` in `lib/storyboard-service.ts`.
- `POST /api/storyboards/[id]/breakdown` — body `{idea: string(10–2000), sceneCount: 2–8}`:
  saves idea, REPLACES all scenes (and their clips) with the generated sequence, fills
  styleNote only if it was empty, returns `{source, storyboard}`. Client must confirm
  before calling when any scene has renders.
- `PATCH /api/storyboards/[id]` now also accepts `idea` (blur-save from the idea editor).
- `env`: `MISTRAL_API_KEY` (optional).

**Client — TO DO: full rewrite of `components/scenes-shell.tsx`** (everything else stays):

Layout (kills the left aside entirely):

```
ProductHeader (unchanged: ThemeToggle + viewer)
[rail | main column]
main:
  BoardBar (h-12, border-b, px-6): board Select + "New" · inline title Input ·
    chips w/ popovers: References (n/3 → 3-slot rail + picker dialog), Seed, Style · refresh
  scrollable content:
    SEQUENCE STRIP (horizontal, overflow-x-auto):
      [IDEA node] ─ [SCENE 01] ─ [SCENE 02] ─ … ─ [+ add] ─ [REEL node]
      connectors = thin border lines; nodes w-44, selected = brand ring
      SceneNode: mono "SCENE NN" + status dot, aspect-video thumb (still img /
        clip video / status icon), truncated title, pipeline dots (still·draft·HD),
        duration chip
      IdeaNode: Lightbulb, idea excerpt or "Describe the film…"
      ReelNode: Film, total seconds + draft/HD cost
    DETAIL PANEL below the strip, driven by selection
      Selection = {kind:'idea'} | {kind:'scene', id} | {kind:'reel'}; default 'idea' when
      board has no scenes, else first scene; normalize when selected scene disappears.
      IdeaDetail: big idea textarea (blur → PATCH idea), scene-count Select (2–8),
        "Write scene sequence" (Sparkles) → POST breakdown (window.confirm if any scene
        has run/clips), select first scene after; notice shows source (mistral/template).
      SceneDetail (key={scene.id}): grid [stage | controls]
        stage: tabs Still / Draft / HD / FHD (default = best available), <img>/<video>
          with running/error placeholders; mono meta line under (status, seed, cost)
        controls: Title input, Prompt textarea, Duration select + per-scene seed
          (existing popover control) + Trash delete; pipeline action rows:
          1. Render/Re-render still ~$0.05 (generateScene)
          2. Draft clip ~$(dur×0.06) — needs still; videoEnabled-gated (draftClip)
          3. Enhance HD/FHD ~$(dur×0.17/0.29) — needs finished draft (enhanceClip)
          inline errors from run.errorMessage / clip.run.errorMessage
      ReelDetail: read-only mini strip of thumbs + durations, totals, Assemble button
        (same assembleReel), per-clip status list.
  VideoPlanBar at the bottom — unchanged component/props.
Dialogs: ReferencePickerDialog — unchanged.
```

Reuse the existing state/actions verbatim (they are all in the current file): loadList,
loadStoryboard (stale-guard via activeIdRef), createStoryboard, patchStoryboard,
patchScene (+reload), addScene, deleteScene, generateScene, draftClip, enhanceClip,
assembleReel, markVideoBusy, polling effect (ids computed INSIDE the effect from
storyboard — lint requirement), videoEnabled prop from `app/scenes/page.tsx`.

New action:

```ts
writeSequence(idea, sceneCount): confirm-if-rendered → POST breakdown →
  setStoryboard(data.storyboard); select first scene; notice by data.source
```

Icons (all verified in this lucide build): Lightbulb, Sparkles, ChevronRight, ArrowRight,
Clapperboard, Film, Dices, ImagePlus, Images, Loader2, Play, Plus, RefreshCw, ShieldAlert,
Trash2, X, Pencil, Type.

Gotchas that already bit us (do not regress):
- oxlint react-compiler: no sync setState in effects (wrap first loads in
  `setTimeout(…, 0)`); no unmemoized helpers in useCallback deps; `<video>` needs
  `<track kind="captions">` or `muted`; conditionally-mounted dialogs reset their own
  state (mount fresh instead of `open` prop).
- Select onValueChange gets `string | null` — guard.
- NextImage on `/api/assets/*` needs `unoptimized`.
- Verify: `cd branchline && npx tsc --noEmit && npm run lint && npm run build` — all
  must be clean before commit. Push branch `claude/portfolio-job-application-51wh8j`,
  then merge to `main` (owner approved pushing main).

**Acceptance:** open /scenes → type an idea → Write scene sequence → chain of nodes
appears left-to-right → click node 2 → edit prompt, Render still → thumb fills in the
strip → Draft clip → player in the stage → HD. No grid of tiles anywhere; no dead
controls; signed-out preview describes the idea→sequence flow.

---

# Task: Scenes — from carcass to flagship

Owner: —
Branch base: `claude/portfolio-job-application-51wh8j`
Estimated effort: 2 + 2 + 1 days (three independent stages; each ships on its own)

## Context

`/scenes` is the flagship concept surface: pin one generated image as a reference, write a
scene list, render stills that keep the subject consistent, and plan the video reel at
draft→enhance economics. The carcass is live and real:

- Data: `storyboards` + `storyboard_scenes` tables (runtime DDL in `db/ensure.ts`, typed in
  `db/schema.ts`).
- API: `app/api/storyboards/**` — CRUD plus `POST .../scenes/[sceneId]/generate`, which
  loads the pinned reference from R2, inlines it as a `data:` URI into the FLUX.2 request
  (`input_image`), pins the storyboard seed, appends the style note, and submits through
  the shared pipeline in `lib/run-service.ts`.
- UI: `components/scenes-shell.tsx` — storyboard list, reference picker (from shared
  history), style/seed controls, scene cards with duration and live still status, and a
  reel plan bar priced from `lib/pricing.ts` (`VIDEO_RATES_PER_SEC`).

What is honestly labeled CONCEPT today: the **Assemble draft reel** button.

## Stage 1 — prove the reference loop end-to-end (2 days)

Goal: a recorded 60-second demo: generate hero in Playground → pin in Scenes → render
3 stills → the same subject appears in three different settings.

1. Run the flow against the live key. Fix whatever breaks first (most likely candidates:
   FLUX.2 rejecting large `input_image` payloads → downscale the reference server-side
   before base64; moderation on scene prompts → surface the existing humane moderation
   copy on the scene card, it is already plumbed through `run.errorMessage`).
2. ✅ Multi-reference — done: `storyboard_references` table, up to 3 pins sent as
   `input_image` 1–3, reference rail in the UI.
3. ✅ Per-scene seed override — done: `seed` column on scenes, seed chip with re-roll /
   board-default on every card.
4. Acceptance: three consecutive scene renders visibly share the subject; a failed/
   moderated scene shows guidance and a retry; re-render with the same seeds is
   pixel-stable.

## Stage 2 — video draft → enhance behind a flag (2 days)

Goal: the CONCEPT label comes off the plan bar for accounts with video access.

> **Status: built, flag-gated, awaiting first live run.** Set `VIDEO_ENABLED=true` on the
> deployment. The `flux-3-video` contract (mode t2v/i2v/draft_enhance, keyframes as
> [seconds, dataURI], draft:true → draft_cache) was assembled from BFL's public docs and
> lives in one place — `lib/bfl.ts` — so if the first live call 4xxes, the fix is local.

1. Verify the FLUX 3 Video API contract against docs.bfl.ai with the real key first
   (endpoint names, draft tier parameter, `draft_enhance` + `draft_cache` mechanics,
   image-to-video input shape). Do not build against guessed shapes — that was the
   explicit reason this stage was deferred.
2. Extend `lib/bfl.ts` with a video submit/poll pair; jobs go through the existing
   `generations`/`generation_jobs` rows (`kind: 'video'` on the asset). Server-side R2
   capture already fits minutes-long jobs; raise the 20 MB asset cap for video via
   streaming `put`.
3. Per-scene "Draft clip" button: image-to-video from the scene still, duration from the
   card. Reel bar's "Assemble draft reel" = sequential drafts for all scenes with a
   confirm dialog showing the exact total from `estimateVideoCostUsd`.
4. "Enhance kept shots": checkbox per clip, one action re-renders only checked clips at
   HD/FHD via `draft_enhance`. This is the money moment — spend $0.06/s exploring,
   $0.29/s only on keepers.
5. Guardrails: video runs count against `DAILY_RUN_LIMIT` with a separate, lower default
   (e.g. 10/day); the whole stage ships behind `env.VIDEO_ENABLED`.
6. Acceptance: with the flag off, today's honest CONCEPT state is unchanged; with it on,
   one scene goes prompt → still → draft clip → HD clip, and every step's cost matches
   the estimate shown before the click.

## Stage 3 — polish that makes it a portfolio moment (1 day)

1. Reel preview: sequential `<video>` playback of draft clips in scene order (accept the
   gap between clips; do not fight gapless playback).
2. Storyboard export: one-click JSON of the full board (references, seeds, prompts,
   durations, per-scene request payloads) — the Scenes counterpart of the playground's
   "Copy as curl".
3. Empty/loading/error states pass the same bar as the playground; dark mode check;
   record the 60–90s walkthrough GIF for the README.

## Out of scope (do not build)

- Drag-and-drop scene reordering (nice, not load-bearing; `scene_index` PATCH is enough).
- Multiplayer editing of a storyboard.
- Any Durable Objects migration — blocked by the hosting platform; documented in README.
- C2PA/content-credential claims of any kind.

## Verification checklist for every stage

`npm run typecheck && npm run lint && npm run build` clean; the signed-out preview still
renders without any fetch; no new dead affordances — every visible control works or is
explicitly labeled planned.
