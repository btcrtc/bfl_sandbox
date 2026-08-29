# Design-system distillation

## Design character

The interface is quiet, technical and editorial rather than “AI-neon”. It combines a nearly monochrome shell with restrained forest green, generous empty space, precise 1px borders and small mono labels. Elevation is rare and soft.

## Color tokens

Values below were read from the compiled CSS. HSL is the source-of-truth format used by the application.

### Light / platform

| Token | HSL | Approx. hex | Role |
| --- | --- | --- | --- |
| `background` | `0 0% 100%` | `#ffffff` | app canvas |
| `foreground` | `147 43% 7%` | `#0a1a11` | primary ink and dark CTA |
| `card` | `0 0% 100%` | `#ffffff` | card surface |
| `primary` | `0 0% 18%` | `#2e2e2e` | neutral primary outside Playground |
| `secondary` | `0 0% 92%` | `#ebebeb` | neutral secondary |
| `muted` | `0 0% 96%` | `#f5f5f5` | muted background |
| `muted-foreground` | `0 0% 60%` | `#999999` | secondary copy |
| `accent` | `151 47% 30%` | `#29704e` | platform green |
| `border` / `input` | `0 0% 90%` | `#e6e6e6` | standard 1px border |
| `destructive` | `0 84.2% 60.2%` | `#ef4444` | destructive action |
| `radius` | — | `8px` | global radius |

### Playground light override

| Token | HSL | Approx. hex | Role |
| --- | --- | --- | --- |
| `secondary` | `0 0% 94%` | `#f0f0f0` | control surface |
| `muted-foreground` | `0 0% 50%` | `#808080` | technical labels |
| `accent` | `150 27% 88%` | `#d8e9e0` | pale green selection/hover |
| `alt` | `151 47% 30%` | `#29704e` | saturated green action/status |
| `sidebar-accent` | `151 21% 81%` | `#c4d9cf` | selected rail item |
| `playground-surface` | `0 0% 98%` | `#fafafa` | composer/inspector surface |
| `playground-surface-elevated` | `0 0% 100%` | `#ffffff` | inputs on surface |
| `playground-success` | `151 65% 26%` | `#176d44` | success |
| `playground-warning` | `38 92% 40%` | `#c47f08` | warning |
| `playground-error` | `0 78% 50%` | `#e31c1c` | error |

### Dark

| Token | HSL | Approx. hex |
| --- | --- | --- |
| `background` | `0 0% 7%` | `#121212` |
| `foreground` | `0 0% 98%` | `#fafafa` |
| `card` / `popover` | `0 0% 10%` | `#1a1a1a` |
| `muted` | `0 0% 12%` | `#1f1f1f` |
| `border` | `0 0% 20%` | `#333333` |
| `accent` / `alt` | `150 43% 18%` | `#1a422e` |
| `playground-surface` | `0 0% 9%` | `#171717` |
| `playground-surface-elevated` | `0 0% 11%` | `#1c1c1c` |
| `playground-success` | `151 55% 48%` | `#37be7d` |
| `playground-warning` | `38 92% 60%` | `#f7b23b` |
| `playground-error` | `0 78% 56%` | `#e63737` |

## Typography

- Sans: Geist variable, weight 100–900.
- Mono: Geist Mono variable, weight 100–900.
- Display heading: 28/42, 600, tracking `-0.7px`.
- Default product text: mostly 13–14px; 16px remains the browser/base size.
- Field text: 14/20.
- Technical labels: Geist Mono, 10/15, uppercase, `0.5px` tracking.
- Code preview: Geist Mono, 11px with relaxed leading.
- Metadata and helper copy: 11–12px, muted.

Use the official [`geist`](https://www.npmjs.com/package/geist) package. Geist is distributed under the SIL Open Font License 1.1; keep the license file in the repository.

## Layout grammar

| Element | Observed metric |
| --- | --- |
| Header | 48px |
| Collapsed navigation rail | 48px |
| Expanded parameter inspector | 360px at the sampled viewport |
| Main composer max width | 720px |
| Composer padding | 20px |
| Main canvas padding | 24px horizontal / 48px vertical |
| Main prompt area | 130px sampled height |
| Default control height | 36px |
| Small control height | 32px |
| Large control height | 40px |
| Standard radius | 8px containers, 6px compact controls |
| Standard border | 1px `border` token |

The page shell is fixed; the central surface scrolls. The left rail is icon-first and expands by CSS variables. The parameter inspector is a resizable sibling of the canvas, not a modal.

## Core component grammar

### Button

Observed variant vocabulary:

- `default`, `dark`, `light`
- `secondary`, `outline`, `ghost`
- `destructive`
- `link`, `backgroundLink`
- `transparent`, `transparentColored`, `borderedOpaque`

Observed sizes:

- default 36px, small 32px, large 40px, icon 36×36, inline.

Buttons use 500 weight, a 1px focus ring and restrained shadow. The Playground CTA uses the dark green `foreground` token. Split actions use a `button-group` plus 1px separator.

### Input / textarea

- Elevated white surface over a `#fafafa` parent surface.
- 1px neutral border, 6px radius, tiny shadow.
- Focus is a 1px semantic ring rather than a heavy glow.
- Prompt composer reserves bottom space for count and keyboard hint.

### Composer card

- 720px maximum width, 20px padding, 8px radius.
- Surface `#fafafa`, 1px border.
- Signature shadow: `0 24px 60px -32px rgba(0,0,0,.18)`.
- Large whitespace around the card matters more than the card decoration.

### Navigation shell

- 48px icon rail with 16px Lucide icons.
- Active item uses pale green fill; copy and icons remain near-black.
- Groups are separated with thin neutral rules.
- Search/command trigger is centered in the top header and exposes `⌘K`.

### Inspector

- 360px, resizable, `playground-surface` background.
- Sections: model, prompt, media inputs, parameters, action footer.
- Parameter rows open a focused detail editor instead of expanding every control inline.
- Media inputs are capability-driven and use compact empty upload tiles.

### Dialog / command palette

- Radix Dialog semantics and focus management.
- Standard dialog max-width ranges from 520px to 672px.
- Command palette uses cmdk, grouped results, separators and keyboard sequences.
- Open/close: fade + 95% scale + subtle slide; reduced-motion is respected.

### Feedback

- Sonner-style notifications for feature events.
- Platform shell still contains a second legacy toaster; a clean implementation should consolidate on one system.
- Inline status banners use a 7px green dot, 14px copy and low-contrast green surface.

## Motion

- Default transition: colors and opacity, roughly 200ms.
- Panels and canvas states: 300ms ease-out.
- Dialogs/popovers: fade, scale 95→100 and small directional slide.
- Icons may translate 2px on hover; avoid decorative motion elsewhere.
- Fast spinner is a custom utility; pulse/spin remain standard Tailwind keyframes.

## Recommended clean-room changes

To make the portfolio system recognizably yours:

1. Keep the neutral/green discipline but introduce one original graph accent, such as mineral blue or warm amber.
2. Use a 12px node radius while keeping 6–8px controls, giving the graph its own hierarchy.
3. Replace BFL’s logo geometry and copy with an original mark and vocabulary.
4. Extend tokens with graph semantics: `node-input`, `node-model`, `node-transform`, `edge-active`, `edge-error`.
5. Preserve the 48px shell, 360px inspector and command palette because those are product patterns, not brand assets.

