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
2. Multi-reference: FLUX.2 accepts `input_image` … `input_image_8`. Allow pinning up to
   3 references per storyboard (subject + style + palette). Schema: new
   `storyboard_references` table (additive DDL) or a JSON column on `storyboards`; prefer
   the table. UI: reference rail instead of a single slot.
3. Per-scene seed override (falls back to the storyboard seed) so one bad still can be
   re-rolled without breaking the board's continuity.
4. Acceptance: three consecutive scene renders visibly share the subject; a failed/
   moderated scene shows guidance and a retry; re-render with the same seeds is
   pixel-stable.

## Stage 2 — video draft → enhance behind a flag (2 days)

Goal: the CONCEPT label comes off the plan bar for accounts with video access.

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
