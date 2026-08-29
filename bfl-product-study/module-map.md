# Module map

## Observed route boundaries

The deployed application uses Next.js App Router. The client assets reveal this route shape:

```text
app/
├── layout
├── error
├── global-error
└── (dashboard)/
    ├── layout
    ├── error
    ├── page
    └── [orgId]/
        ├── page
        ├── playground/page
        └── [projectId]/
            ├── playground/layout
            ├── playground/page
            ├── customization/loras
            ├── api/usage
            ├── api/keys
            ├── members
            └── settings
```

The platform layout owns navigation, organization/project switching, command palette, auth refresh, theme, analytics identity, credits and global feedback. The Playground route owns the model workflow.

## Observed domain boundaries

### App providers

- Theme provider wrapping a class-based theme implementation.
- TanStack Query provider with:
  - `staleTime`: 60 seconds;
  - `gcTime`: 5 minutes;
  - one retry, except authenticated 401 failures;
  - refetch on window focus;
  - shared mutation error handling.
- Global Toaster.
- PostHog identity and session refresh behaviors.

### Dashboard shell

- Responsive/collapsible sidebar.
- Organization and project context.
- Command registry grouped as Actions, Account, Organization, Project and Resources.
- Credits/billing entry points.
- Feature-flagged navigation.

### API layer

The client uses a small wrapper over native `fetch`:

1. Always sends cookie credentials.
2. On 401, calls the auth refresh endpoint once.
3. Retries the original request once.
4. Redirects to sign-in if refresh fails.
5. Normalizes JSON/text responses into an `ApiError` with status, message, code and raw detail.

This is intentionally smaller than a generated SDK.

### Model registry

A central registry describes models instead of hardcoding each form. Entries include concepts such as:

- id and display name;
- API endpoint;
- capability family (text-to-image, text-to-video, video-to-video, upscale);
- parameter schema and defaults;
- media input slots;
- output formats and aspect ratios;
- cost unit;
- speed/quality positioning;
- feature gating and legacy state.

The same registry can drive the picker, inspector controls, request payload, cost estimate and “Get code” output. This is the most valuable architectural pattern to reproduce.

### Playground orchestration

- `PlaygroundToolProvider` stores tool, organization, project and gating context.
- A dedicated tracking hook emits tool/task/generation lifecycle events.
- Generation history is project-scoped and stored through a repository-like localStorage adapter.
- Stored records are parsed through a Zod discriminated union before use.
- Signed media URLs are refreshed through a server endpoint.
- Generations have explicit pending/success/comparison shapes; comparison sides have independent pending/success/failed status.
- Page UI includes migration banners, model selection, prompt/media inputs, schema-driven parameters, generation actions, code export and result history.

### Shared UI

- Source-owned primitives: Button, Input, Textarea, Label, Dialog, Alert, Card, Form and Separator.
- Headless primitives: Radix, cmdk, Vaul.
- Utility layer: `cn`, class-variance-authority, Tailwind animation utilities.
- Product components: sidebar, resizable panel, parameter editor, media input, model picker, code dialog, result cards.

## Architecture concern worth improving

The main Playground route compiles into one very large client module. For a take-home, keep the data-driven behavior but show a cleaner split: server shell, small client editor, domain services and lazy feature dialogs.

## Clean-room architecture for the portfolio project

```text
src/
├── app/
│   ├── layout.tsx
│   ├── globals.css
│   └── editor/
│       ├── layout.tsx
│       └── page.tsx
├── components/
│   ├── ui/                  # source-owned primitives
│   ├── shell/               # header, rail, command palette
│   └── graph/               # canvas chrome shared by node types
├── features/
│   ├── workflow/
│   │   ├── model/
│   │   │   ├── workflow.ts
│   │   │   ├── node.ts
│   │   │   └── edge.ts
│   │   ├── store/
│   │   │   ├── workflow-reducer.ts
│   │   │   └── workflow-selectors.ts
│   │   ├── canvas/
│   │   │   ├── workflow-canvas.tsx
│   │   │   └── node-registry.ts
│   │   └── persistence/
│   │       ├── workflow-repository.ts
│   │       └── local-workflow-repository.ts
│   ├── nodes/
│   │   ├── prompt/
│   │   ├── reference-media/
│   │   ├── model/
│   │   ├── parameter-map/
│   │   ├── generate/
│   │   ├── compare/
│   │   ├── upscale/
│   │   └── export/
│   ├── inspector/
│   │   ├── inspector.tsx
│   │   ├── schema-control-registry.ts
│   │   └── controls/
│   ├── runs/
│   │   ├── run-types.ts
│   │   ├── run-reducer.ts
│   │   ├── run-orchestrator.ts
│   │   └── run-repository.ts
│   ├── model-catalog/
│   │   ├── catalog.ts
│   │   ├── capability-schema.ts
│   │   └── cost-estimator.ts
│   ├── code-export/
│   └── command-palette/
├── lib/
│   ├── api/
│   │   ├── client.ts
│   │   └── errors.ts
│   ├── analytics/
│   ├── query/
│   └── cn.ts
└── styles/
    ├── tokens.css
    ├── graph-tokens.css
    └── themes.css
```

## Key interfaces to design first

```ts
type NodeKind =
  | "prompt"
  | "reference-media"
  | "model"
  | "parameter-map"
  | "generate"
  | "compare"
  | "upscale"
  | "export";

type Run =
  | { kind: "idle" }
  | { kind: "queued"; runId: string }
  | { kind: "running"; runId: string; progress?: number }
  | { kind: "succeeded"; runId: string; outputs: Output[] }
  | { kind: "failed"; runId: string; error: RunError };

interface ModelDefinition {
  id: string;
  label: string;
  capabilities: Capability[];
  inputPorts: PortDefinition[];
  outputPorts: PortDefinition[];
  parameterSchema: unknown;
  estimate(input: EstimateInput): CostEstimate;
}
```

These types are deliberately original. They preserve the strongest BFL lesson—schema-driven product behavior—while adapting it to a graph.

## Suggested implementation decisions

- Next.js App Router + React 19, using a currently patched compatible release.
- Tailwind plus source-owned shadcn-style primitives.
- Geist through the official package.
- `@xyflow/react` for graph interaction; it is MIT-licensed and provides selection, pan/zoom, custom nodes and edges.
- Zod for persisted workflow/run validation.
- TanStack Query for remote run status; a reducer or small local store for graph editing.
- React Hook Form only inside complex inspector forms; do not put every node drag update through it.
- Keep API, storage and analytics behind interfaces so the prototype can run entirely with a mock adapter.

