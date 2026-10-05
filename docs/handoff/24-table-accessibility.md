# 24 · Accessibility

What the table commits to, what proves it, and what has not been proved. The
modal's own sheet is [08](08-accessibility.md); the two share the rules.

## Requirements, per element

| Element | Semantic | Name / state | Keyboard | Target | Contrast |
|---|---|---|---|---|---|
| Table | `table` in a `region` named *Cases table*; `th scope="col"`; sortable headers carry `aria-sort` | — | The scroll container is `cdkScrollable`; the header buttons are real buttons | — | Header 14px `--foreground-primary` on `--surface-header` |
| Sort | `button.th-sort` inside the `th` | Label is the column name; `aria-sort` on the `th` | Tab, Enter/Space | Full header | Arrow at opacity .5 is decoration; the label is the control |
| Player link | `a.linkish` with a real `href` | The id; full id on `title` | Tab, Enter; context menu works | Text link | `#1D4ED8` on white 6.7:1 |
| Status | text | — | — | — | `--foreground-secondary` 7.7:1 on white, 7.09:1 on the header tint |
| Severity / SLA pills | `ui-pill` | Text is the value | — | — | SLA text ≥ 4.5:1 on each tint; breached `--danger-deep` on solid |
| Priority | text + `button.prio__info` | *Score breakdown for N*; `aria-expanded` from MatMenuTrigger | Tab, Enter/Space; Escape closes | 24px round | Glyph `--foreground-secondary` 7.09:1 (was `currentColor` at .5 opacity, 2.28:1 — a 1.4.11 failure, fixed) |
| Work | wrapper `aria-label` sentence; spans `aria-hidden` | *3 required actions, 2 to do: …; done: …; N more in the timeline* | Only the count is focusable | — | To-do `--foreground-primary`; done `--foreground-secondary` |
| Count buttons | `button` | *Show all N triggers* / *Show all work items*; tooltip; `aria-expanded`, `aria-haspopup="menu"` from the trigger | Tab, Enter/Space; Escape closes and returns focus | **32×≥30** (2.5.8 met; 2.5.5's 44 not targeted) | `--foreground-subtle` 5.0:1 at rest, primary on hover |
| Lock disc | `button`; `aria-pressed="true"` when yours | *Lock case* / *Locked to you, click to unlock* / *Locked to M. Torres 1 day ago, click to force unlock* — spelled out, because a reader says "1d" as the letter d | Tab, Enter/Space | 32px round | Initials `--success` on `--success-bg-subtle`; primary on `--background-tertiary` 18.1:1 |
| Open case | `button` | *Open AML case in new tab* (the visible tooltip is the widget's *Open case*) | Tab, Enter/Space | 32px square | White on `--primary` |
| Popovers | mat-menu panel; Triggers list `role="list"` with `tabindex="0"` when it scrolls, labelled *Triggers, scrollable list*; Work lists `aria-labelledby` their group labels | — | Escape closes, focus returns to the button; one open at a time | — | Labels `--foreground-secondary` 7.7:1; entries primary |
| Empty state | `p` | The sentence | — | — | `--foreground-secondary` |
| Focus | every control: `outline: 2px solid var(--primary)`, `outline-offset: 2px`; the sort button and the lock disc too | | | | |
| Motion | every transition in the component is listed in **one** `prefers-reduced-motion` block at the end of the styles — scattered guards had rotted (a guard at line 1290 cannot override a rule at 1653). Colours still change; they stop easing. Refresh swaps its spin for a pulse; Open case animates in only when motion is welcome | | | | |
| Colour never alone | Urgent is weight + an icon; completion is a tick + position; SLA bands carry the time as text; lock states carry different glyphs/initials and different names | | | | |

## What proves it

| Claim | Proof |
|---|---|
| Names, roles, `aria-sort`, `aria-pressed`, `aria-expanded` follow the panel | `verify:table` — read from the DOM for each state |
| 24px and 32px targets; 52px rows; nothing clipped without an ellipsis | `verify:table`, `verify:stress` (every row, both fixtures, sub-pixel) |
| Contrast of the specific pairs above | `verify:table` computes the ratios it quotes; `verify:a11y` runs axe over the table and the popovers |
| Escape closes and focus returns; one popover at a time; scroll closes | `verify:table` |
| Reduced motion: every transitioning class is in the guard | `verify:table` reads the stylesheet |
| 200% zoom (800 CSS px) and 1024px: table scrolls, sticky holds, Actions reachable | `verify:stress` cases 14 and 15 |
| Painted, not computed: the sticky edge actually renders | `verify:table` decodes the PNG and samples pixels — a computed-style check once passed while nothing painted |

## Not verified — needs a human or a tool this repo does not run

- Screen reader walk (VoiceOver, NVDA): announcement order down a row, the
  Work sentence, the group labels, "1 day ago" vs "1d".
- `forced-colors` / Windows high contrast: the sticky edge, the SLA dot and
  the lock disc backgrounds all depend on colour; no `forced-colors` rules exist.
- A live region for row movement (rule 7, rule 8): rows that change tab or
  leave on resolution are not announced. Nothing in the table has
  `aria-live`.
- A skip link past the sidebar to the table region.
- `inert` on the table while the force-unlock confirm is open — the dialog
  traps focus, but the table is not marked inert.
- Tooltips on focus for the icon-only buttons: Material shows them on focus;
  not asserted.
- Colour-vision simulation of the SLA tints.

## Testing checklist

### Automated
- [x] axe on the table and each popover — `verify:a11y`
- [x] Contrast of every text/background pair the table introduces — `verify:table`
- [x] Targets ≥ 24px on every control; 32px on the ones the brief sets — `verify:table`

### Keyboard
- [x] Tab order: title link → tabs → refresh → sort headers → per row: player link, breakdown, counts, lock, open case — `verify:table` walks part of this
- [x] Every control activates with Enter/Space; Escape closes every popover and returns focus
- [ ] No trap with a popover open and the table scrolled — *not asserted*
- [x] Focus visible on every control, including on the hovered row

### Screen reader
- [ ] Row read in order; the Work sentence read once; group labels with counts
- [ ] Lock states distinguishable by name alone (two agents with the same initials — stress case 10 proves the names differ; the announcement is not tested)
- [ ] Sort change announced through `aria-sort`

### Visual
- [x] 200% zoom — `verify:stress`
- [ ] High contrast / forced colours
- [ ] Colour-blindness simulation of SLA tints

### Motion
- [x] `prefers-reduced-motion`: no easing anywhere in the component; refresh pulses
- [x] Nothing flashes: the arrival flash was rejected (D-13)
