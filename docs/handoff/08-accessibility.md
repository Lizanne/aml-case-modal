# 08 · Accessibility

Everything here is enforced by `npm run verify:a11y`, which runs axe-core over
every state **and** drives real keyboard journeys — axe cannot tell you whether
Escape closes the right thing.

## The panels are not dialogs

Despite the name, the case panel and the SG alert panel carry **no**
`role="dialog"` and **no** `aria-modal`. They are inline workspace panels: the
page behind them stays live, the widget row stays clickable, nothing is trapped.

> **Why this matters:** `aria-modal` is a promise that everything else is inert.
> Asserting it without a focus trap is worse than not asserting it at all. The
> panels do not trap, so they do not claim it.

The five real dialogs — force unlock, severity, decision, and the attachment
preview — do claim it, and every one of them **earns** it.

## Landmarks and headings

| Landmark | Element |
|---|---|
| `main#workspace` | The page the skip link targets |
| `aside.shell__nav` → `nav[aria-label="Back office"]` | Side nav |
| `aside[aria-label="Prototype dev harness"]` | The state switcher — **outside the app shell**, so it is never mistaken for product content |

Heading order: `h1` player header → `h2` widget names, panel title, dialog titles
→ `h3` outcome card titles, record form title. No level is skipped.

## Skip link

`Skip to case workspace`, the first tab stop on the page, offscreen until
focused. Verified: **first Tab lands on it.**

> **Why `pendingFocus` is set by `open()` and `restore()` but never by `seed()`:**
> a dev scenario that loads with a panel already up has not *opened* anything.
> Stealing focus there would put a keyboard user past the skip link before they
> had pressed a key.

## Focus ring — one ring, everywhere, no exceptions

```scss
*:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
```

plus an explicit `!important` list covering `.mat-mdc-button-base`,
`.mat-button-toggle-button`, `.mdc-tab`, `.mat-mdc-menu-item` and
`.mdc-radio__native-control`.

> **Why the `!important`:** Angular Material resets `outline: none` inside its own
> component styles at a specificity a universal selector cannot reach, so every
> mat-button, tab and toggle came up with **no ring at all** under keyboard
> focus. It is scoped to `:focus-visible` only — it cannot paint a ring on a
> mouse click — and it exists to override a reset, not to win a design argument.

A radio's real control is a hidden input, so the ring is painted on the visible
button via `:has(.mdc-radio__native-control:focus-visible)`.

**There is no bare `outline: none` anywhere in the app.** Scroll containers that
take `tabindex="0"` (the expanded trigger list, the stream, `.info__body`) use
`outline-offset: -2px` so the ring reads inside the box rather than colliding
with the panel edge.

Verified by **walking** 60 tab stops in states 01, 02, 05, 06 and 09 and reading
the computed style of each — not by sampling.

## Keyboard

| Key | Behaviour |
|---|---|
| `Tab` | Logical order throughout; a full record-and-submit journey completes mouse-free |
| `Enter` / `Space` | Trigger strip divider toggles; both verified |
| `Escape` in a dialog | Dismisses it, focus returns to the opener |
| `Escape` on the page | Closes the **newest** visible panel |
| `↑` `↓` | Select within the lock-choice radio group |

> **Why the page-level Escape is guarded on `dialog-shell, attachment-preview`:**
> it is a `document` listener, so a keypress *outside* a dialog would otherwise
> take the panel out from under it. Losing the panel and its draft behind a
> preview you were only closing is the worst outcome of pressing Escape twice
> quickly.

**Non-interactive content stays out of the tab order.** Trigger rows, cells,
pills and timeline items are asserted to be neither focusable nor native
controls. See the inert table in [04-states-and-interactions.md](04-states-and-interactions.md).

## Dialogs

Rolled by hand rather than `MatDialog`, because the dev switcher needs to land
directly on states 00b / 05 / 06 with a dialog already open — which means
visibility has to be a signal, not an imperative service call. Rolling our own
means **owing** everything MatDialog would have provided:

- Real `cdkTrapFocus` behind the `aria-modal` claim
- `aria-labelledby` pointing at the actual heading, not a duplicated string
- Focus placed on the **first field**, except destructive confirmations which
  focus **Cancel**
- Focus handed back to the opener on close
- Escape dismisses
- **A click on the scrim does not dismiss** — that is a way to lose a
  half-written note to a stray click. Cancel, Close and Escape are the ways out.
- The scrim is `position: fixed` to the **viewport**, so what the screen says
  matches what the focus trap enforces

> **Why fixed and not scoped to the panel:** a scrim scoped to `.modal` left the
> widgets, the player bar and the nav outside it and still clickable — which is
> not what `aria-modal` claims.

Each of these is verified per dialog: labelled by its heading, focus starts
inside, focus cannot escape after 25 tabs, scrim covers the full viewport, scrim
click is inert, Escape closes.

## What gets announced

| Region | Mechanism | Note |
|---|---|---|
| Required actions bar | `role="status"` | Each chip names its own state: `"Note added: done"` |
| Lock status in the header | `role="status"` | `aria-label="Lock status: …"` |
| Attachment errors | `aria-live="assertive"` on the `<ul>` | **Not** `role="alert"` |
| Resync banner, warn notes, field errors | `role="alert"` | |

> **Why the chips must name their own state:** the visible chip carries no state
> *word* — an outlined ring and a green tick do that, and both icons are
> `aria-hidden`. The accessible name is therefore the **only** thing telling a
> screen reader whether an action is done.

> **Why attachment errors are `aria-live` and not `role="alert"`:** `role="alert"`
> **replaces** the list role on the element, orphaning the `<li>` children and
> breaking list semantics. `aria-live` announces without overwriting the role.

`aria-pressed` carries the outcome card's viewing state, because a label that
changes (`View snapshot` → `Viewing`) is not a state a screen reader can infer.

## Required fields

The visible "required" markers were removed from labels. The fields are still
required — Save stays disabled without them — so the requirement reaches a
screen reader via `aria-required="true"` on the textarea, or it reaches them not
at all. Asserted on the record form, the severity dialog and the decision dialog:
**marked programmatically, unmarked visually.**

## Contrast

Every state is swept by axe at WCAG 2.1 A + AA. Two places were computed by hand
because they are composited state layers axe cannot resolve:

| Surface | Ratio |
|---|---|
| Force unlock, rest | 6.47 : 1 |
| Force unlock, hover | 5.30 : 1 |
| Force unlock, focus | 5.28 : 1 |
| Force unlock, pressed (layer @ 0.08) | **4.68 : 1** |

At Material's default pressed opacity of 0.12 the label landed at **4.39 : 1** —
under AA. That is why the token is overridden.

The severity dialog's decision card is contrast-checked against its own tint
rather than white, with the large-text threshold applied only where the text is
actually large.

## Touch targets

The theme is built at **`density: -1`**. Sizes come from density tokens, not
hand-set heights.

> **Worked example — the tab header:** density -1 resolves the tab container to
> 44px. Setting `height: 48px` on the header alone would leave 44px tabs sitting
> in a 48px strip with the labels off centre. Moving
> `--mdc-secondary-navigation-tab-container-height` to 48px takes both.

The minimised bar's two icon buttons carry **44px of hit area** with the hover
square painted at 40px via `background-clip: content-box`, so the visible
highlight and the clickable area are concentric — one of the recurring bugs in
[06-edge-cases.md](06-edge-cases.md) was these two disagreeing.

Side-nav items are `min-height: 44px`.

## Motion

See [07-motion.md](07-motion.md). `prefers-reduced-motion: reduce` is honoured
everywhere, watched at runtime via `matchMedia`, and nothing in this panel
flashes.

---

## Accessibility testing checklist

### Automated
- [ ] `npm run verify:a11y` — axe-core, WCAG 2.1 A + AA, over all 14 switchable
      states (12 and 13 are reached via their tabs)
- [ ] Zero unnamed interactive controls
- [ ] Zero page errors in the console

### Keyboard
- [ ] First Tab reaches the skip link
- [ ] Tab through every state — order is logical, no traps outside dialogs
- [ ] Record an outcome and submit a decision **without a mouse**
- [ ] Enter and Space both toggle the trigger strip divider
- [ ] Arrow keys select within the lock-choice radio group
- [ ] Escape closes the newest panel; Escape inside a dialog closes only the
      dialog
- [ ] Dialog focus returns to the control that opened it
- [ ] Every tab stop paints a visible ring — **walked, not sampled**

### Screen reader
- [ ] Navigate by heading: h1 → h2 → h3, no skipped level
- [ ] Navigate by landmark: main, nav, the dev aside
- [ ] Required chips announce `done` / `pending`
- [ ] Lock status announces on change
- [ ] Attachment errors announce **and** the list keeps its `li` children
- [ ] Textareas announce as required in all three forms

### Visual
- [ ] Zoom to 200% — layout usable at every threshold in
      [05-responsive.md](05-responsive.md)
- [ ] High contrast mode — content readable
- [ ] Colour blindness — severity is never carried by hue alone; the pill's
      **label** carries it

### Motion
- [ ] `prefers-reduced-motion: reduce` — panel animation disabled, widget
      controls instant, no bar pulse
- [ ] Toggle the OS setting **without reloading** — it takes effect live
- [ ] Nothing flashes more than three times per second
