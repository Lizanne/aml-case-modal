# 02 · Tokens

All tokens are CSS custom properties declared on `:root` in
`aml-case-modal/src/styles.scss`. **Reference them by name.** No component may
restate a value; every hex in a component stylesheet is a bug waiting to drift.

## Ink and line

| Token | Meaning |
|---|---|
| `--ink` | Primary text |
| `--ink-2` | Secondary text |
| `--ink-3` | Muted text, placeholders, timestamps |
| `--line` | Default hairline |
| `--line-strong` | Input borders, dashed placeholder borders |

> `--ink-3` is currently the same value as `--ink-2`. It was darkened because
> the original was 4.83:1 on `--panel` but only 4.43:1 on `--page` and 4.32:1 on
> the warn tint — both under AA, and muted text lands on those surfaces
> constantly. Keep the two names: they carry different intent, and `--ink-3` may
> lighten again if the surfaces it sits on do.

## Surfaces

| Token | Meaning |
|---|---|
| `--panel` | Cards, dialogs, the panel itself |
| `--page` | The app ground behind the panel |
| `--stream-bg` | The workflow stream's recessed well |
| `--strip-bg` | The trigger strip — one step lighter than `--stream-bg` |

> **Why the strip and the stream are a pair, not two choices:** they are the
> panel's two recessive surfaces and they sit in adjacent columns. The strip is
> context you read past; the stream is the surface being worked in, so the
> stream is the deeper recess of the two.

> **Why `--strip-bg` is not `--page`:** `--page` is the neutral at that
> lightness, and it would put a different hue beside `--stream-bg`'s blue cast —
> the pair would read as two greys rather than one scale.

## Severity — category only, never rank

| Token pair | Category |
|---|---|
| `--sev-aml` / `--sev-aml-bg` | AML |
| `--sev-edd` / `--sev-edd-bg` | EDD |
| `--sev-compliance` / `--sev-compliance-bg` | COMPLIANCE |

**Severity colours identify category and never rank.** Rank direction is carried
by the escalation badge and its arrow, derived from a single `SEVERITY_RANK`
constant.

> **Why:** direction carried by colour dies with colour blindness, and it breaks
> the day the ranking changes. The confirmed ranking, lowest to highest, is
> AML → EDD → COMPLIANCE.

> ⚠️ **The AML and EDD colour values are swapped relative to the Figma
> Foundations card.** Figma says "AML red, EDD amber"; the code has AML on amber
> and EDD on red. The swap was deliberate (`c9a3362`), done at the token values
> rather than in each selector so pills, widget tiles, glyphs and event rows all
> moved together, and each foreground stayed on its own background so contrast
> is unchanged — amber 5.66:1, red 8.6:1. **This needs a decision**, see
> [09-unresolved.md](09-unresolved.md).

## State colour

| Token | Meaning |
|---|---|
| `--foreground-success` / `--success-bg-subtle` | "You can act here" |
| `--warn` / `--warn-bg` | Warn state, and severity EDD |
| `--danger` / `--danger-bg` | Destructive intent |
| `--danger-strong` / `--danger-bg-strong` | The stronger step, used for hover on danger |

**Success green means one thing: you can act here.** Locked to you, completed
required actions, the resolved decision card.

> **Why a resolved case's status is muted grey and not green:** a resolved case
> is precisely where you *cannot* act.

**Amber is severity EDD and the warn state**, so it is never used for neutral
counts.

## Primary and link

| Token | Meaning |
|---|---|
| `--primary` | Primary actions, active tab underline, focus ring |
| `--primary-bg` | Primary hover tint |
| `--primary-ink` | Primary hover fill (the darker step) |
| `--link` / `--link-hover` | Text links |

SG-alert material stays in the primary blue family and never takes a severity
colour.

## Chrome — not part of the case language

`--brand-bar`, `--brand-bar-ink`, `--brand-bar-accent`, `--player-bar`,
`--player-bar-ink`. Sampled from the host app. **Nothing inside a panel may use
these.**

## Metrics

| Token | Value | Use |
|---|---|---|
| `--nav-w` | 256px | Side nav |
| `--top-bar-h` | 56px | App top bar |
| `--player-bar-h` | 64px | Black player bar |
| `--panel-bar-h` | 48px | The resting height of a panel's own bars |

> `--panel-bar-h` is shared by the required-actions bar and — historically — the
> trigger strip header. It is a **minimum**, not a height: the chip bar wraps
> when labels are long and has to stay free to grow.

Component-scoped metrics published as host bindings on `trigger-strip`:

| Property | Value | Use |
|---|---|---|
| `--trigger-row-height` | 40px | A row in the three-column grid layout |
| `--trigger-row-height-stacked` | 63px | A row once stacked (10 padding ×2 + two 20px lines + 2 row-gap + 1 rule) |
| `--trigger-gap-height` | 32px | The divider — chrome inside the scroller, **not** a row |
| `--trigger-collapsed-rows` | 2 | `TRIGGER_COLLAPSED_ROWS` |
| `--trigger-expanded-rows` | 5 | `TRIGGER_EXPANDED_ROWS` |

## Layout constants

Declared in `aml-case-modal/src/app/core/models.ts`:

| Constant | Value | Use |
|---|---|---|
| `MODAL_GAP_PX` | 16 | Gap between two docked panels, and the widget row's gap |
| `SOLO_MAX_PX` | 1080 | A single panel's cap |
| `WIDGET_SOLO_MAX_PX` | 640 | A lone widget card's cap |
| `MIN_DUAL_PANEL_PX` | 560 | Narrowest a panel gets while two still fit |
| `STACK_AUTO_MINIMISE_PX` | `MIN_DUAL_PANEL_PX * 2 + MODAL_GAP_PX` | Below this stage width, only one panel is allowed |
| `NARROW_BREAKPOINT_PX` | 720 | Below this **panel** width, the segmented layout |
| `TRIGGER_COLLAPSED_ROWS` | 2 | |
| `TRIGGER_EXPANDED_ROWS` | 5 | |
| `ATTACHMENT_MAX_MB` | 10 | Open question 5 — one named constant |
| `REFLOW_MS` | 300 | Kept here so CSS and timing logic agree |

> **Why `STACK_AUTO_MINIMISE_PX` is derived and not a flat number:** it was 1200,
> chosen when the stage was the whole page. Frame 09 then put a 256px nav beside
> it, which left the stage at 1144 on a 1440 desktop — so the dual layout
> auto-collapsed at the very width frame 09 is drawn at.

## Control sizing — Material density, never hand-set heights

| Tier | Height | Used for |
|---|---|---|
| Default | 40px | Footer actions, dialog actions |
| Smallest | 32px | In-card and in-strip controls, lock action, icon buttons |

**One primary per surface**, given to whichever action moves the agent forward:
`Lock case` when unlocked, `Open case` when locked to you, `Record` in a
placeholder, `Submit decision` in the footer, `Resync` when the snapshot is
stale.

## Pills

`ui-pill` is the single component for every pill and badge. Two sizes:

| Size | Height | Padding | Type | Used |
|---|---|---|---|---|
| `md` (default) | 24px | `0 8px` | 14px/20px, 600 | Panel header |
| `sm` | 20px | `0 6px` | 12px/16px, 600 | Widget title rows, list rows |

Radius `999px`. Vertical padding is deliberately absent — it would fight the
fixed height.

> **Never `mat-chip`.** Chips carry hover, focus, ripple and listbox semantics
> that these do not earn. They are static styled spans.

## Type

There is no type scale token set; sizes are stated per component in
[03-components.md](03-components.md). The recurring pairs are:

| Pair | Use |
|---|---|
| 20px / 30px, 600 | Panel title |
| 16px / 24px, 600 | Card title |
| 14px / 20px | Body, row text, buttons, tabs |
| 12px / 16px | Timestamps, meta, helper text, `sm` pills |
