# Portfolio concept: Branchline

## One-line pitch

Branchline is a node-based workspace for composing, comparing and exporting multimodal generation workflows.

It is an independent concept project, not affiliated with Black Forest Labs.

## Why this is a strong application project

It demonstrates that you can:

- understand BFL’s existing product grammar;
- work in a stack close to theirs;
- design a complex spatial interaction model;
- turn model capability schemas into UI;
- handle async jobs, partial failure, comparison and cost estimation;
- extend the product rather than reskin it.

## Core workflow

```text
Prompt ─────────────┐
Reference image ────┼─> Model ─> Generate ─┬─> Compare ─> Export
Parameter map ──────┘                      └─> Upscale ─> Export
```

## MVP node types

1. Prompt — text, variables and reusable prompt fragments.
2. Reference Media — image/video input with crop and role metadata.
3. Model — capability-aware selection driven by a registry.
4. Parameter Map — aspect, quality, duration, seed and advanced parameters.
5. Generate — async run status and estimated cost/time.
6. Compare — side-by-side outputs with one selected winner.
7. Upscale — output transform with resolution target.
8. Export — download, copy request or generate API code.

## Product shell

- 48px rail: workflows, assets, runs, presets and settings.
- Center canvas: node graph with restrained dot/grid background.
- 360px inspector: selected node schema and validation.
- Top command trigger: create node, focus node, run workflow, open preset.
- Bottom run bar: estimated cost, number of outputs and Run action.

## Visual adaptation

Keep:

- Geist Sans/Mono;
- semantic HSL tokens;
- neutral canvas and forest-green primary;
- 1px borders, quiet shadows and compact mono metadata;
- command palette and keyboard-first interaction.

Change:

- original name, icon and copy;
- mineral-blue graph accent for selected paths;
- color-coded node categories with very low saturation;
- 12px node cards and directional port shapes;
- animated edge progress only while a run is active;
- canvas composition instead of BFL’s centered single composer.

## Portfolio moments

### 1. Schema-driven inspector

Selecting a node renders controls from its model definition. Switching model capability changes ports and validation without branching the editor component.

### 2. Compare as a graph primitive

Comparison is visible in the workflow: two branches feed a Compare node, which records preference and can route only the chosen output onward.

### 3. Code export

The graph compiles to a readable execution plan and API request preview. This mirrors the useful “Get code” behavior while making it graph-native.

### 4. Failure recovery

Each node exposes queued/running/succeeded/failed state. A failed branch can be retried without rerunning the whole graph.

### 5. Cost and time model

Every node contributes an estimate; the run bar explains the total and highlights the expensive branch.

## Demo data strategy

The portfolio build should default to a deterministic mock execution adapter. It can simulate queueing, progress, success, partial failure and retry without requiring an API key or paid generation. A real BFL adapter can remain optional and local-only.

## Recommended milestones

1. Tokens, primitives and Storybook-like `/system` page.
2. App shell, command palette and resizable inspector.
3. Graph canvas with Prompt, Model and Generate nodes.
4. Schema-driven parameter controls and validation.
5. Run state machine with deterministic mock outputs.
6. Compare, Upscale and Code Export.
7. Keyboard shortcuts, empty/error/loading states and responsive polish.
8. Portfolio case study with architecture diagram and a short product walkthrough.

## Definition of “done”

- A reviewer understands the product in under 30 seconds.
- The main happy path works without credentials.
- Keyboard and pointer interactions are both complete.
- Empty, loading, partial-error and retry states are designed.
- Design tokens and primitives are visible on a dedicated system page.
- The repository explains which parts are observed patterns and which are original decisions.

