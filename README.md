# Branchline

An independent concept study of what a next-generation **visual generation workspace** could
look like: a node-based playground for FLUX.2 image generation with durable shared history,
plus **Scenes** — a reference-driven storyboard surface that carries one subject through a
whole sequence and prices the resulting reel at video draft→enhance economics.

> **Not affiliated with Black Forest Labs.** This is a portfolio prototype built against the
> public BFL API. FLUX is a trademark of Black Forest Labs. No BFL code, assets, or copy are
> used; see [`bfl-product-study/`](./bfl-product-study/) for the observed-patterns study and
> clean-room rules.

## What works end-to-end (live API) vs. what is concept

| Surface | Status |
| --- | --- |
| Playground: prompt → FLUX.2 run → durable history | **Live.** Async submit, server-side polling of BFL, results persisted to R2 before the 10-minute signed-URL expiry |
| Run detail: outputs, EXIF-style receipt, seed reuse, copy as curl/JSON | **Live** |
| Moderation UX: distinct `moderated` status, humane guidance, retry at safety +1 | **Live** |
| Realtime: WebSocket history updates with 15s polling fallback | **Live** (per-socket D1 polling — see tradeoffs below) |
| Scenes: idea → sequential shot list (Mistral, with a keyless template fallback) | **Live** |
| Scenes: node-by-node drill-in — refine prompt, render still, per-scene seed, up to 3 pinned references sent as FLUX.2 `input_image` 1–3 | **Live** |
| Scenes: FLUX 3 Video draft clip per scene → `draft_enhance` to HD/FHD | **Built, flag-gated** — `VIDEO_ENABLED=true`; contract assembled from public docs, first live call is the real test |
| Workflows / Assets / Runs pages, node editing on the canvas | **Concept** — labeled in-UI |

## Why these features

Built against documented friction in the current developer experience of image APIs:

- **Results expire in ~10 minutes** → every finished job is copied into R2 immediately and
  served from the workspace, so history never rots.
- **Moderation false positives read as raw provider errors** → a distinct `moderated` state
  with human guidance and a one-click retry at a higher safety tolerance.
- **Polling-only async** → a WebSocket channel pushes history changes; the client keeps a
  backoff-polling fallback and resumes in-flight runs from any tab.
- **No official SDK** → every run exposes its byte-exact request as copyable curl/JSON.
- **Reproducibility** → seeds are first-class: visible, editable, derived per output
  (`seed + i`), reusable from any past run.
- **Multi-reference + video direction** → Scenes is a sequence tool, not a tile grid: one
  idea becomes an ordered chain of shot nodes (written by Mistral — the same model family
  that encodes prompts inside FLUX.2), each node drills into still → draft clip ($0.06/s)
  → enhance (HD $0.17/s, FHD $0.29/s). Approve the cut at draft rate, spend on
  enhancement only for keepers.

## Architecture

```
Next.js (vinext) on Cloudflare Workers
├── app/api/generations      submit → BFL async API → D1 (generations/jobs)
├── app/api/generations/[id] server-side poll → R2 asset capture → status rollup
├── app/api/realtime         WebSocketPair; pushes history:changed
├── app/api/storyboards/**   Scenes CRUD + scene still rendering (shared run-service)
├── lib/run-service.ts       one generation pipeline for Playground and Scenes
├── D1 (SQLite)              workspaces, generations, jobs, assets, storyboards
└── R2                       generated media, served via authenticated /api/assets/[id]
```

Known tradeoffs, on purpose and documented rather than hidden:

- Job state only advances while someone polls (a tab or the WS tick). The structural fix is
  a Durable Object per generation with `alarm()`-driven polling — not deployable on the
  current hosting platform, which is exactly the kind of constraint the roadmap notes.
- Realtime is per-socket D1 polling under a WebSocket. The idiomatic fix is a workspace
  Durable Object with write-time notify and socket hibernation.
- A per-workspace daily budget (default 40 live runs/24h, `DAILY_RUN_LIMIT`) caps spend on
  a public deployment.

## Running it

```
cd branchline
npm install
npm run dev        # requires Cloudflare bindings: DB (D1), FILES (R2)
npm run typecheck  # tsc --noEmit
npm run lint       # oxlint
```

Environment variables:

- `BFL_API_KEY` — enables live generation; without it every run is saved as a shared draft
  so the whole UI stays walkable with zero spend.
- `MISTRAL_API_KEY` — optional; powers the idea → shot-list breakdown in Scenes (falls
  back to deterministic beat templates without it).
- `VIDEO_ENABLED=true` — turns on the FLUX 3 Video draft → enhance pipeline in Scenes.
- `DAILY_RUN_LIMIT` / `VIDEO_DAILY_LIMIT` — per-workspace 24h spend caps (default 40
  stills / 10 clips).

## Roadmap (next, in order)

1. **First live video validation** — exercise the flag-gated FLUX 3 Video contract with a
   real key; the whole contract lives in `lib/bfl.ts`, so a mismatch is a local fix.
2. **Typed run channel** — replace the coarse `history:changed` ping with per-run events
   (`job:status`, `job:asset`, `run:completed`) and delete client polling.
3. **Reel playback & export** — sequential playback of finished clips in scene order and a
   downloadable cut list.

## Repo layout

- [`branchline/`](./branchline/) — the app.
- [`bfl-product-study/`](./bfl-product-study/) — product teardown of the real playground
  surface: design system notes, module map, and the concept doc this build follows.
