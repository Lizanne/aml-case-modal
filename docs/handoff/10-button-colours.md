# 10 · Button colours and states

Every value here was **measured in the browser**, not read off the stylesheet.
Material composites a semi-transparent *state layer* over the button on hover,
press and focus, so the effective colour is never what any single declaration
says. Each figure below is the composited result, with the layer that produced
it named beside it.

Contrast is label against that composited background. **AA for normal text is
4.5 : 1**, and it applies in *every* state, not just at rest.

> **Worst enabled contrast anywhere in the panel: 4.61 : 1.** Every button
> clears AA in every interactive state.

---

## Primary filled

`mat-flat-button color="primary"` — Lock to me, Record, Save outcome, Submit
decision, Open case.

| State | Background | Label | Layer | Ring | Contrast |
|---|---|---|---|---|---|
| Rest | `#1A73C9` | `#FFFFFF` | — | — | 4.84 |
| Hover | `#186AB9` | `#FFFFFF` | black @ 0.08 | — | 5.54 |
| Pressed | `#1765B1` | `#FFFFFF` | black @ 0.12 | — | 5.93 |
| Focus | `#1765B1` | `#FFFFFF` | black @ 0.12 | 2px `#1A73C9` | 5.93 |
| Disabled | `rgba(0,0,0,.12)` → `#E0E0E0` on panel, `#D7D8D9` on stream | `rgba(0,0,0,.38)` | — | — | n/a |

> **Why the state layer is black and not Material's white.** Material's filled
> button lightens under interaction, which on a primary fill with a white label
> walks the contrast *down*: 4.84 at rest, 4.51 hovered, **3.93 pressed and
> focused** — under AA in the two states an agent is most likely looking at.
> Swapping the layer to black moves the fill toward `--primary-ink`, which is
> the direction the spec always described, and every state now clears AA by a
> wider margin than rest does.

## Outlined

`mat-stroked-button` — Unlock, Adjust severity, Add action, Add files, View
snapshot.

| State | Background | Label | Border | Layer | Ring | Contrast |
|---|---|---|---|---|---|---|
| Rest | surface (`#FFFFFF` panel, `#F4F5F7` stream) | `#000000` | 1px `rgba(0,0,0,.12)` | — | — | 21 |
| Hover | `#F5F5F5` | `#000000` | 1px `rgba(0,0,0,.12)` | black @ 0.04 | — | 19.23 |
| Pressed | `#E0E0E0` | `#000000` | 1px `rgba(0,0,0,.12)` | black @ 0.12 | — | 15.97 |
| Focus | `#E0E0E0` | `#000000` | 1px `rgba(0,0,0,.12)` | black @ 0.12 | 2px `#1A73C9` | 15.97 |
| Disabled | surface unchanged | `rgba(0,0,0,.38)` | 1px `rgba(0,0,0,.12)` | — | — | n/a |

## Text

`mat-button` — Cancel. Identical to Outlined with no border.

| State | Background | Label | Layer | Ring |
|---|---|---|---|---|
| Rest | surface | `#000000` | — | — |
| Hover | `#F5F5F5` | `#000000` | black @ 0.04 | — |
| Pressed | `#E0E0E0` | `#000000` | black @ 0.12 | — |
| Focus | `#E0E0E0` | `#000000` | black @ 0.12 | 2px `#1A73C9` |

## Force unlock

`.danger-button` — demoted at rest, danger on interaction.

| State | Background | Label | Border | Layer | Contrast |
|---|---|---|---|---|---|
| Rest | surface | `#B91C1C` | 1px `#B91C1C` | — | 6.47 |
| Hover | `#FEE2E2` | `#B91C1C` | 1px `#B91C1C` | — | 5.30 |
| Pressed | `#F8D2D2` | `#B91C1C` | 1px `#B91C1C` | danger @ **0.08** | 4.68 |
| Focus | `#F7E4E4` | `#B91C1C` | 1px `#B91C1C` | danger @ 0.12 | 5.28 |

> **Why 0.08 pressed and not Material's 0.12.** Pressing implies hovering, so
> the layer stacks on the hover fill. At 0.12 the label landed at 4.39 : 1.

## Danger filled

`.danger-button-filled` — the `Unlock case` confirm.

| State | Background | Label | Layer | Contrast |
|---|---|---|---|---|
| Rest | `#B91C1C` (`--danger`) | `#FFFFFF` | — | 6.47 |
| Hover | `#991B1B` (`--danger-strong`) | `#FFFFFF` | none — layer zeroed | 8.31 |
| Pressed | `#7F1D1D` (`--danger-pressed`) | `#FFFFFF` | none — layer zeroed | 10.02 |
| Focus | `#A31919` | `#FFFFFF` | black @ 0.12 | 7.77 |
| Focus + hover | `#871818` | `#FFFFFF` | black @ 0.12 over `--danger-strong` | 9.70 |

> **Why named fills instead of a composited layer.** This button steps down its
> own red family — `--danger`, `--danger-strong`, `--danger-pressed` — so each
> state is a colour someone chose, not wherever 4% and 12% black happened to
> land. The hover and pressed layers are zeroed so nothing tints on top.
> **Focus still uses Material's layer**, so its two values (`#A31919` alone,
> `#871818` when also hovered) remain composites rather than named steps.

> `--danger-pressed` shares a value with `--sev-edd` and is deliberately **not**
> aliased to it: severity tokens are only ever for severity.

## Icon buttons

Header minimise and close; minimised-bar restore and close. No Material state
layer — these paint their own tint.

| State | Background | Glyph | Contrast |
|---|---|---|---|
| Rest | transparent | `#52525B` | 7.73 |
| Hover | header `rgba(0,0,0,.05)` → `#F2F2F2`; bar `rgba(0,0,0,.06)` → `#F0F0F0` | `#09090B` | 17.81 / 17.41 |
| Pressed | as hover | `#09090B` | 17.81 / 17.41 |
| Focus | transparent | `#52525B` | 7.73, plus 2px `#1A73C9` ring |

The tint fills the whole button, so the visible highlight and the hit area are
the same box.

## Trigger strip divider

The one control in the strip.

| State | Background | Label | Contrast |
|---|---|---|---|
| Rest | `#F9FAFB` (`--strip-bg`) | `#175FA8` | 6.20 |
| Hover | `#EAF2FB` (`--primary-bg`) | `#175FA8` | 5.74 |
| Pressed | `#EAF2FB` | `#175FA8` | 5.74 |
| Focus | `#EAF2FB` + 2px `#1A73C9` ring, inset | `#175FA8` | 5.74 |

> **Why the label is `--primary-ink` and not `--primary`.** The moment the row
> is hovered or focused the label sits on `--primary-bg`, and `--primary` is
> only **4.28 : 1** on its own tint. `--primary-ink` is the token that exists
> for precisely this, and it clears AA on the strip tint too.

The hover tint covers the **full row including its hairlines**, not just the
label.

## View snapshot, selected

`.card__snap--on` — persistent while that card's snapshot is up.

Sits on a card filled with `--color-background-info` (`#DBEAFE`), and its own
12% primary tint composites over that.

| State | Background | Label | Border | Layer | Contrast |
|---|---|---|---|---|---|
| Rest | `#C4DCF8` | `#1E3A8A` | 1px `#1A73C9` (3.43) | — | 7.35 |
| Hover | `#BDD8F6` | `#1E3A8A` | 1px `#1A73C9` (3.29) | primary @ 0.04 | 7.04 |
| Pressed | `#BAD5F5` | `#1E3A8A` | 1px `#1A73C9` (3.22) | primary @ 0.06 | 6.88 |
| Focus | `#BAD5F5` | `#1E3A8A` | 1px `#1A73C9` (3.22) | primary @ 0.06 | 6.88 |

> **Why the layer is primary and not black.** On a button already carrying a
> blue tint, a black layer greys it down instead of deepening it. A primary
> layer stays in the same hue.

> **Why the label is `--color-foreground-on-info` and not `--primary-ink`.**
> The card underneath is `--color-background-info`, and this button's tint sits
> on top of it, so the ground is darker than it was on the old `--primary-bg`
> card. `--primary-ink` measured **4.41 hovered and 4.31 pressed** there —
> under AA. `foreground-on-info` is the token that pairs with this background
> by name, and it clears AA in every state with room to spare.

> The 1px border is non-text, so it is held to 3:1, not 4.5. It clears that in
> every state but with little margin — 3.22 at its tightest.

---

## The focus ring

`2px solid var(--primary)` at `outline-offset: 2px`, on **every** focusable
element, via `:focus-visible` only. Scroll containers and inset controls use
`outline-offset: -2px` (the divider) or `-4px` (bar icon buttons) so the ring
reads inside the box. There is no bare `outline: none` anywhere.

## Two things still on Material's defaults

Worth a decision, neither is a contrast problem:

1. **Outlined and text labels are pure `#000000`** — Material's default
   `--mdc-outlined-button-label-text-color: black`, not `--ink` (`#09090B`).
2. **The outlined border is `rgba(0,0,0,.12)`** — Material's default, not
   `--line` (`#E4E4E7`).

So every secondary button sits on Material defaults rather than the panel's own
tokens. They read correctly, but they are not tokenised.

## Copy discrepancy

The header's unlocked action renders **`Lock to me`**. The handoff docs, the
Figma spec cards and the component descriptions all say **`Lock case`**. One of
the two is wrong; not reconciled here.

---

## How to re-measure

Composite the state layer before comparing anything. The layer lives on a child
element's `::before`, so:

```js
const ripple = btn.querySelector('.mat-mdc-button-persistent-ripple');
const { backgroundColor, opacity } = getComputedStyle(ripple, '::before');
// composite that over the button's own background, over its surface if transparent
```

Measure `pressed` with the pointer held down and **no** keyboard focus applied,
and `focus` with the pointer parked away — otherwise the two states read
identically, because Material's focus and pressed opacities are both 0.12.
Release the pointer *off* the button, or the press registers as a click.
