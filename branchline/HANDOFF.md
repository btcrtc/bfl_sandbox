# Branchline handoff

## Checkpoint

Branchline is a BFL-inspired visual workflow playground with a compact, tokenized product UI, shared generation history, and a live BFL generation path. The current checkpoint is on `main`; use `git log -1 --oneline` for the exact handoff commit.

The repository is expected to be clean at handoff. No production Sites deployment was created in this workstream.

## Run and verify

```bash
npm install
npm run dev
npm run lint
npm run build
```

The local app runs at `http://localhost:3000`. `/` redirects to `/playground`.

## Product routes

- `/playground` — node canvas, model inspector, two-stage parameter editors, shared history and BFL run action.
- `/workflows` — reusable graph summaries with labelled Input, Model and Output nodes.
- `/assets` — generated outputs and references using project-local sample imagery.
- `/runs` — execution history table.
- `/components` — living design-system specimen.
- `/settings` — workspace and server-behaviour mock settings.

## Architecture

- Vinext, React 19, Tailwind CSS 4, Base UI and shadcn-style primitives.
- Product tokens and shell rules: `app/globals.css` and `DESIGN_SYSTEM.md`.
- Shared shell/components: `components/product-system.tsx`.
- Main product UI: `components/playground-shell.tsx`.
- Secondary product routes: `components/section-page.tsx`.
- D1 persistence and Drizzle schema: `db/schema.ts`.
- R2-backed generated assets: `app/api/assets/[id]/route.ts`.
- BFL client and model mapping: `lib/bfl.ts`.
- Generation lifecycle: `app/api/generations/route.ts` and `app/api/generations/[id]/route.ts`.
- Realtime: authenticated WebSocket endpoint at `app/api/realtime/route.ts`, with a 15-second client polling fallback.
- ChatGPT identity is read from trusted `oai-authenticated-user-*` request headers in `app/chatgpt-auth.ts`.

## Environment and safety

- Local secrets belong in `.dev.vars`; it is gitignored. `BFL_API_KEY` is already configured in the current local checkout.
- Never put the BFL key in client code, fixtures, commits or screenshots.
- Clicking **Run workflow** with a valid key starts paid BFL generation. Browser QA intentionally does not click it.
- Without authenticated ChatGPT headers, `/api/history` and `/api/realtime` correctly return `401`; the UI uses sample history and polling fallback locally.
- `.openai/hosting.json` declares the `DB` D1 binding and `FILES` R2 binding. Add a Sites project ID only through the Sites lifecycle when deployment is explicitly taken on.

## Interaction rules worth preserving

- Select and menu surfaces are anchored 5 px below their trigger.
- Select lists do not overlap the trigger. Near the viewport edge they remain below and become scrollable.
- Aspect ratio is intentionally two-stage: parameter chip → editor popover → ratio value list.
- Compact parameter chips are 28 px high; primary inspector controls are 36 px.
- Generated sample images live under `public/generated/` and are used by Assets and Shared history.

## Verified at handoff

- All six product routes render without runtime errors, broken images or horizontal overflow at 1280 px.
- Command palette, workspace menu, two-stage Aspect ratio and Shared history open successfully.
- Dropdown direction and trigger spacing were measured in the browser.
- `npm run lint`, `git diff --check` and `npm run build` pass.
