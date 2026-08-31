# Branchline Design System

Branchline uses a dense working-surface system distilled from the rendered BFL dashboard. It reproduces interaction grammar and measurable UI rules without copying private application source or branding assets.

## Foundations

- Shell: 48 px header, 48 px icon rail, 344 px inspector, 320 px history panel.
- Spacing: 4, 6, 8, 10, 12, 16, 20, 24 and 32 px. Prefer 12–16 px inside working panels and 20 px inside focused cards.
- Typography: system sans for UI and system mono for technical metadata.
- Labels: 10/14 px mono, uppercase, wide tracking, muted.
- Body: 13/20 px. Compact support text: 11/16 px. Controls: 11–14 px.
- Headings: 24/32 px for workspace pages; 28/42 px for focused creation prompts.
- Controls: 28 px compact and 36 px primary. Control radius is 6 px.
- Surfaces: 8 px radius, 1 px neutral border, restrained 1 px shadow. Floating cards use the shared 12/30 shadow and must still read as part of the canvas.
- Theme: light is the studio default regardless of OS preference. Dark is an explicit user choice and persists locally.

## Color roles

- Background and elevated surface: white.
- Working surface: 98% neutral.
- Border and input: 90% neutral.
- Foreground: very dark green, `hsl(147 43% 7%)`.
- Muted copy: 50% neutral.
- Accent: quiet mint, `hsl(150 27% 88%)`.
- Active rail: slightly deeper mint, `hsl(151 21% 81%)`.

Color is structural. Mint marks selection and context; dark green is reserved for primary actions, graph activity and high-confidence status.

## Composition rules

1. Group by task before adding borders. A label, control and help text form one group.
2. Use a single elevated surface inside a neutral panel; avoid nested card-on-card styling unless the child is an opened parameter editor.
3. Parameter summaries are 28 px chips. Complex parameters use two stages: the chip opens a 12 px padded editor anchored 5 px below it, then the editor's field opens its value list.
4. Align actions to the edge of the surface they affect. Workspace actions live in page headers; generation actions stay pinned to the inspector footer.
5. Use tooltips for icon-only controls and visible labels for all consequential actions.
6. Selects and menus align to their trigger edge and open 5 px below it. Select value lists never overlap their trigger; near the viewport edge they remain below and become scrollable.
7. Do not invent one-off font sizes or radii. Extend the scale in this document first.
8. Never expose disabled roadmap controls. A visible action must work now, explain a current state, or be removed.
9. Keep one editing context per surface. Page actions operate on the page, node actions on the selected node, and reel actions on the reel.
10. Loading, empty, error and signed-out states preserve the same hierarchy as populated content and always explain the next valid action.

## Product shell

- The header owns identity, workspace context, one page-level search or breadcrumb, sync/theme status and identity.
- The rail is navigation only. Active destinations use mint fill; icon-only destinations expose tooltips and semantic links.
- Workspace pages use a 24/32 heading and one primary action. If no real primary action exists, the header stays quiet.
- Canvas screens may pin contextual controls, but those controls must identify the selected node and the decision they will create.

## State model

- **Loading:** use structural skeletons in the final layout; do not replace a whole page with a spinner.
- **Empty:** name what is empty, explain how data arrives, and offer one valid next step.
- **Error:** preserve the user’s context, state that data is safe when true, and give a retry path.
- **Signed out:** explain the workspace boundary before asking the visitor to authenticate.
- **Selected:** use border, mint context and concise status copy; do not rely on color alone.

## Implementation

- Global tokens live in `app/globals.css`.
- Shared product primitives live in `components/product-system.tsx`.
- The `/components` route is the living specimen and visual regression surface.
- Base controls in `components/ui` own interaction behavior; product primitives own Branchline composition.
