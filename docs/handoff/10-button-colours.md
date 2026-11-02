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

`mat-stroked-button` — Unlock, Adjust severity, Add action, Add files, Resync
(in the Risk assessment header).

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

## Resync, unavailable

`disabledInteractive` on the outlined button: Material's disabled look, with
the button left in the tab order and `aria-disabled="true"`.

| State | Background | Label | Border | Note |
|---|---|---|---|---|
| Unavailable | surface unchanged | `rgba(0,0,0,.38)` | 1px `rgba(0,0,0,.12)` | identical to Disabled above; `cursor: default`; no state layer, no ripple |
| Unavailable, focused | surface unchanged | `rgba(0,0,0,.38)` | 1px `rgba(0,0,0,.12)` | the global 2px `#1A73C9` ring - this is the state Disabled cannot have |

The reason it is unavailable is read with it (`aria-describedby`) and shown as
its tooltip.

## Risk status buttons

`risk-status` in its button form - the Risk flagged / No risk / Action
required control on a Risk assessment row. Each status keeps its own hue in
every state; hover deepens the fill rather than greying it. Pressed is the
hover fill at `scale(0.97)`; focus is the hover fill plus the ring. Labels are
12px 600, so the AA bar is 4.5.

| Status | State | Background | Label | Rim (1px) | Contrast |
|---|---|---|---|---|---|
| Risk flagged | Rest | `#FEF2F2` (`--danger-bg`) | `#B91C1C` | `#FECACA` | 5.91 |
| Risk flagged | Hover / pressed / focus | `#FEE2E2` (`--danger-bg-strong`) | `#B91C1C` | `#FECACA` | 5.30 |
| No risk | Rest | **none** - the panel's `#FFFFFF` (`#F4F5F7` in the stream) | `#14532D` | `--success` at 32% = `#B3C8BB` on white (1.77) | 9.11 (8.35 on the stream) |
| No risk | Hover / pressed / focus | `#F0FDF4` (`--success-bg-subtle`) | `#14532D` | as rest | 8.70 |
| Action required | Rest | `#FEF3C7` (`--warn-bg`) | `#78350F` | `#FDE68A` | 8.15 |
| Action required | Hover / pressed / focus | `#EDDCAD` (`color-mix` 88% fill, 12% `--warn`) | `#78350F` | `#FDE68A` | 6.67 |

The red and amber rims are deliberately faint (1.12–1.32 against their fills):
the fill and the word identify the status, the rim only draws its edge. No
risk has no fill, so its rim does more work and is darker - 1.77:1 on white,
1.75 on the stream - though the word and tick still carry it.

The label form (no edit glyph, not a button) has the Rest row only.

> **Why `color-mix` and not another token.** The amber hover fill and the
> green rim exist nowhere else yet. If a second surface wants them they become
> tokens and the mixes go.

## Risk assessment info button

| State | Background | Glyph | Contrast |
|---|---|---|---|
| Rest | transparent on `#FFFFFF` | `#52525B` | 7.73 |
| Hover | `#F0F0F0` (`--colors-alpha-alpha-soft-hover`, black 6%) | `#09090B` | 17.46 |
| Focus | as rest | `#52525B` | ring, offset 0 (the button is a 24px circle; the 40px hit area is a pseudo-element) |

## The open Risk assessment row

Not a button, but a tinted surface text sits on, so it belongs with these.

| Element | On `#DBEAFE` (`--color-background-info`) | Contrast |
|---|---|---|
| Label | `#09090B` | 16.31 |
| Value lines | `#52525B` | 6.34 |
| `Assessing` | `#1E3A8A` (`--color-foreground-on-info`) | 8.49 |
| The status button | its own fill, unchanged - the pill carries its own ground | as above |

## Focus returned by a dialog

Material paints the focus state layer on keyboard focus only - except on a
`disabledInteractive` button, which it paints on plain `:focus`. Resync is
one, so after its dialog returned focus it sat at black 12% until the next
click. One global rule (`styles.scss`, beside the focus-ring block) limits
that layer to `:focus-visible`: a mouse user sees the button return to rest,
a keyboard user still gets the layer and the ring. The other dialog openers
were never affected. Hover 0.04 and press 0.12 are unchanged.

## The focus ring

`2px solid var(--primary)` at `outline-offset: 2px`, on **every** focusable
element, via `:focus-visible` only. Scroll containers and inset controls use
`outline-offset: -2px` (the divider) or `-4px` (bar icon buttons) so the ring
reads inside the box. There is no bare `outline: none` anywhere.

## Two things still on Material's defaults

Worth a decision, neither is a contrast problem:

1. **Outlined and text labels are pure `#000000`** — Material's default
   `--mdc-outlined-button-label-text-color: black`, not `--foreground-primary` (`#09090B`).
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
