# 01 · Layout

Measurements are read from `aml-case-modal/src/app/**` and
`aml-case-modal/src/styles.scss`. Where a Figma Notes card states a different
number, both are given and the disagreement is listed in
[09-unresolved.md](09-unresolved.md).

## The panel in the page

The panel is **not an overlay**. It lives inside the main content column, below
the player bar and beside the nav, so it can never cover either and the nav
stays reachable throughout.

> **Why:** frame 09's composition puts a nav beside the panel. A panel that
> covered it would make the agent leave the case to navigate.

```
┌─ app top bar ──────────────────────────────────────────┐  --top-bar-h
├──────────┬─────────────────────────────────────────────┤
│          │  player bar (black)                         │  --player-bar-h
│  side    ├─────────────────────────────────────────────┤
│  nav     │  .page                                      │
│          │    back-office-widgets   (the widget row)   │
│ --nav-w  │    .stage                                   │
│          │      aml-case-modal  [ sg-alert-modal ]     │
│          │    .dock  (minimised bars, absolute)        │
└──────────┴─────────────────────────────────────────────┘
```

`.page` is a flex column, `gap: 16px`, `padding: 16px 20px 20px`, and
`overflow: hidden`. It is the box both the widget row and the stage are laid out
in, which is what makes their edges the *same* edges rather than two expressions
that happen to agree.

Below `1199.98px` the side gutters drop to `16px`. Below `1023.98px` the nav is
removed — there is no room for a 256px nav beside a panel, and the panel is the
point of the page.

## Panel width

There is no fixed panel width. The panel is sized as CSS **relative to the
stage**, so it tracks the widget row above it by construction.

| Panels visible | Width | Constant |
|---|---|---|
| One | `min(100%, 1080px)`, docked right | `SOLO_MAX_PX` |
| Two | `calc(50% - 8px)` each | `MODAL_GAP_PX` = 16 |

> **Why relative, not a measured pixel count:** reading the live width during the
> 300ms reflow would sweep the panel through the 720px breakpoint and flip its
> layout mid-animation. The target is stable from the first frame.

Figma's measurement frame draws the panel at **1078** wide inside a 1440
viewport, which is what `min(100%, 1080px)` yields there once the nav and
gutters are taken out. The figures agree.

`:host` carries `max-width: 100vw` as a backstop: whatever the width rule says,
the panel never exceeds the viewport and never creates a horizontal scrollbar.

## Vertical structure

```
aml-case-modal .modal          height: 100%; max-height: calc(100% - --dock-h)
├── case-header                65 tall
└── .body                      flex: 1, min-height: 0
    ├── .body__left            flex: 0 0 420px  (+1px right border = 421)
    │   ├── trigger-strip      flex: none
    │   └── player-info-panel  flex: 1, min-height: 0
    └── workflow-panel         flex: 1 1 auto, min-width: 0
```

`--dock-h` is published by the app shell as the height the minimised bars
occupy, so a docked bar can never cover the workflow footer — which is exactly
the control the agent needs.

### The left column

`420px` fixed (`421` including its `1px` right hairline, which is the number
Figma records). It is a flex **column**: the trigger strip at `flex: none`, the
player-info panel taking what is left with `min-height: 0` so its internal
scroller can actually shrink.

> **Why the strip is in the column and not across the panel:** it used to span
> both columns, which charged the workflow that height for a list the workflow
> never reads. The workflow now starts at the top of the body, directly under
> the header.

### The workflow column

Fills the remainder — `657` at panel width 1078, which is the figure Figma
records. Three regions:

| Region | Height | Pinned |
|---|---|---|
| `required-chips .chip-bar` | `--panel-bar-h` (48) min, `padding: 12px 20px` | pinned |
| `workflow-panel .stream` | fills | **scrolls** |
| `workflow-panel .footer` | `padding: 16px 20px`, `gap: 12px` | pinned |

The stream is the only scrolling region between them. `padding: 20px`,
`gap: 16px`, `grid-template-columns: minmax(0, 1fr)`.

> **Why `minmax(0, 1fr)` is load-bearing:** an `auto` track floors at the largest
> min-content among its children, so one nowrap flex child sized the column for
> every sibling and scrolled the stream sideways.

The stream's bottom inset derives from the footer's **rendered** height, not a
literal, so the last card is never clipped behind a footer that has wrapped.

## Pinned vs scrolling, in one list

| Element | Behaviour |
|---|---|
| `case-header` | Fixed; never scrolls |
| `trigger-strip` collapsed | No scroll — renders exactly two rows and a divider |
| `trigger-strip` expanded | Internal scroll, five rows plus the divider |
| `player-info-panel .info__body` | Scrolls independently |
| `required-chips` | Pinned to the top of the workflow column |
| `workflow-panel .stream` | Scrolls |
| `workflow-panel .footer` | Pinned to the bottom |
| The page itself | Locked while a panel is open |

> **Why the page locks:** a tall panel would otherwise drag the whole page and
> take the player bar off screen with it. The nav scrolls itself; the panel
> scrolls internally.

## Radius

Three tiers by surface scale, and no other values:

| Tier | Radius | Applies to |
|---|---|---|
| Controls | 4px | buttons, inputs, attachment buttons, menus |
| Cards | 12px | widgets, minimised bars, outcome cards, placeholders, notices |
| Surfaces | 16px | the panel, dialogs, bottom sheets |
| Pills | 999px | every pill and badge |

**The panel's own radius is conditional.** Solo it is `0`; in dual it is `12px`.

> **Why:** solo, the panel is flush to the viewport on three sides, and a corner
> radius on an edge with nothing beyond it just cuts a notch out of the screen.
> In dual the panels are two cards on a page, so they keep the radius.

This is a three-way disagreement with Figma — see
[09-unresolved.md](09-unresolved.md).

## The widget row

The row above the stage is sized to **the same box the panels occupy**
(`rowCss`), so its edges are the panel area's edges.

| Cards on the row | Track |
|---|---|
| One | `min(100%, 640px)`, `justify-self: end` |
| Two | `repeat(auto-fit, minmax(min(260px, 100%), 1fr))`, gap `MODAL_GAP_PX` |

> **Why a lone card is capped:** a single card stretched across 1080px is a 32px
> icon, two short lines and several hundred pixels of nothing before the buttons.

A widget renders only when its item is present on the surface **and its own
panel is not open** — see [06-edge-cases.md](06-edge-cases.md).
