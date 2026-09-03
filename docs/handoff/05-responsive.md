# 05 · Responsive behaviour

## The governing rule: width, never device

Every threshold in this panel is driven by the width of the **box being laid
out**, not by the viewport and never by a device class.

> **Why:** one rule then serves a narrow viewport and the dual-panel layout
> alike. A 564px panel on a 1440px screen is narrow, and a device query cannot
> see that.

Two of these are **container queries**, because the element is narrow while the
window is wide.

## Thresholds

| Threshold | Measured against | Effect |
|---|---|---|
| `NARROW_BREAKPOINT_PX` (720) | Panel width | Two-column body → segmented control |
| `MIN_DUAL_PANEL_PX` (560) | Panel width | Header stacks to two rows (`layoutStacked`) |
| `STACK_AUTO_MINIMISE_PX` (1136) | **Stage** width | Only one panel allowed; the incumbent auto-minimises |
| 519.98px | **Trigger strip container** | Trigger rows stack |
| 419.98px | **Widget card container** | Widget card takes its compact layout |
| 1199.98px | Viewport | Page gutters 20 → 16 |
| 1023.98px | Viewport | Side nav removed |
| 719.98px | Viewport | Mobile treatment: full-bleed panel, page scrolls, dialogs become sheets |

## Panel layout modes

| Mode | When | Shape |
|---|---|---|
| Two column | Panel ≥ 720 | Left 421 fixed, workflow fills |
| Segmented | Panel < 720 | `Workflow` \| `Player info` toggle; one at a time |
| Minimised | User action | Collapses to a bar |
| Mobile | Viewport < 720 | Full bleed, square top corners, no shadow |

> **Why never squeeze the two-panel layout:** below 720 there is not enough width
> for both to be usable. The segmented control is a choice between two whole
> panels rather than two cramped ones.

**In the segmented layout the trigger strip travels with the Player info
segment**, because that is where the left column went.

> ⚠️ Consequence worth stating: at narrow widths the triggers are one tap away
> rather than always on screen, and the Workflow segment gets the whole panel.

## The dual-panel rule

Two panels fit only while the **stage** is at least
`MIN_DUAL_PANEL_PX * 2 + MODAL_GAP_PX` = 1136. Below that, whenever two are
visible, the **oldest** steps back to its bar and pulses once so the agent can
see where it went.

This is enforced continuously, not only at the moment of opening — a stage can
*become* too tight through a resize, a rotation, or a dev scenario seeded
straight into the dual state on a phone.

## The header at narrow widths

Below `MIN_DUAL_PANEL_PX` the header becomes two rows:

```
row one   AML case #4821  [EDD] [Open] .............. −  ✕
row two   🔒 Locked to M. Torres · 16d      [ Force unlock ]
```

Row one is a **grid**, not a wrapping flex row.

> **Why:** flexbox breaks lines using each item's hypothetical size and only
> shrinks what is left afterwards. The pills were measured at their full width
> when the row decided where to break, the three items came to exactly the
> available 279px at 343, and a sub-pixel over sent minimise and close to a third
> row. They could have shrunk; they were never asked to.

Track sizing: `auto minmax(0, 1fr) auto` — title and controls keep their content,
the pills absorb what is left.

**The case number never truncates.** An `auto` track floors at min-content, and
nowrap text's min-content is the whole string. If space runs out the **pills**
wrap or shrink first.

Row two: lock status left, its action right; the button wraps to its own row,
right-aligned, only if the two cannot share one. The lock label never truncates.

Verified at 390 and 343 across all three lock states.

> ⚠️ **Known trade-off:** placing the lock on row two by grid area means the tab
> sequence reaches the lock action *before* minimise and close, which are
> visually above it. The alternative is a DOM that reads the window chrome out in
> the middle of the case's state at *every* width, to fix an order that differs
> only at this one.

## Mobile specifics (viewport < 720)

| Element | Behaviour |
|---|---|
| Panel | Full bleed, no side borders, no shadow |
| `.page` | Scrolls; the app chrome stays pinned |
| `.stage` | Bounded height, `min-height: 420px` |
| Widget row | One card per line |
| Dock inset | 32 → 16 |
| Dialogs | Bottom sheets: full width, rounded top corners, `max-height: 90vh`, internal scroll, footer buttons stacked full width with the **primary on top** |
| Attachment preview | Full screen |
| Header | Stacked (it is below `MIN_DUAL_PANEL_PX` by definition) |

> **Why `.page` scrolls on mobile and not on desktop:** stacked, the widget row
> is ~488px — taller than the whole page box — so `.stage` got nothing and the
> panel collapsed to 2px. On mobile the page itself scrolls: the chrome stays
> pinned, the widget row can scroll away, and the panel keeps a height it can be
> worked in.

## Overflow, everywhere

Every text cell in a list row carries `min-width: 0` on **itself and its flex
ancestors**, plus `overflow-wrap: anywhere`.

> **Why `anywhere` alongside `nowrap`, which reads like a contradiction:**
> `nowrap` stops the wrapping; `anywhere` is what lowers the element's
> *min-content* size to a single character, so an unbroken 100-character token
> cannot force its flex or grid track wider than the row. Without it the track
> sizes to the whole token and the text escapes the row rather than ellipsising
> inside it. `break-word` will not do — it does not affect intrinsic sizing.

Fixed elements in a row — names, dates, badges, controls — never truncate and are
never pushed out of position by the text beside them.

**Clamps must not reserve height when the text fits on fewer lines.**

Verified at 1078 and at the narrow dual width with a 200-character sentence and a
100-character unbroken string, on the trigger detail, starred text and timeline
entries: one line, ellipsised, titled, nothing escaping its container, no
sideways scroll.
