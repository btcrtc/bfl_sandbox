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
| Scenes: pinned reference sent as FLUX.2 `input_image`, pinned seed, style note, scene stills | **Live** |
| Scenes: assemble the reel via FLUX 3 Video draft → `draft_enhance` | **Concept** — cost model is real, the video API call is staged behind a flag |
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
- **Multi-reference + video direction** → Scenes turns FLUX.2's `input_image` continuity and
  FLUX 3 Video's draft ($0.06/s) → enhance (HD $0.17/s, FHD $0.29/s) economics into a
  planning surface: approve the cut at draft rate, spend on enhancement only for keepers.

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

Set `BFL_API_KEY` to enable live generation; without it every run is saved as a shared
draft so the whole UI stays walkable with zero spend.

## Roadmap (next, in order)

1. **Typed run channel** — replace the coarse `history:changed` ping with per-run events
   (`job:status`, `job:asset`, `run:completed`) and delete client polling.
2. **Video draft → enhance** — wire the FLUX 3 Video API behind the existing Scenes plan
   bar once the contract is verified; server-side capture already fits minutes-long jobs.
3. **Compare** — two branches race on the canvas, a winner is recorded, the graph exports
   as code.

## Repo layout

- [`branchline/`](./branchline/) — the app.
- [`bfl-product-study/`](./bfl-product-study/) — product teardown of the real playground
  surface: design system notes, module map, and the concept doc this build follows.
