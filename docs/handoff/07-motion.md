# 07 · Motion

`REFLOW_MS` (300) is declared in `core/models.ts` so the CSS and any timing logic
agree.

## The governing rule

**Animate transform and opacity. Never height, never width.**

Panel widths are deliberately **not** transitioned.

> **Why:** on open, the newcomer's slide covers the incumbent's snap to half
> width; on close, the leaver's fade covers the survivor's reflow. Animating
> width as well would put a second motion under one already covering it, and cost
> a layout pass per frame on a panel this size.

## Opening from the widget

The panel expands downward from the widget it was opened from, ~200ms ease-out,
content fading in. Closing collapses back.

## Panel choreography (dual)

Dual is entered only from the widget row. Panels enter by **sliding from the
right**, matching the app's drawer convention.

| Event | Motion |
|---|---|
| Second panel opens | Slides in from the right over 300ms ease-out; the incumbent is **already** in its compressed layout on the first frames |
| Rightmost or solo panel closes | Slides out to the right, fading, 300ms |
| Inner panel closes | **Dissolves in place** with `MODAL_GAP_PX` of drift |
| Survivor | Reflows **instantly** beneath the slide, which acts as a curtain |

Only the entering or exiting panel animates.

> **Why the incumbent is already compressed rather than easing into it:** the
> slide is the curtain. Two things easing at once reads as the layout arguing
> with itself.

The leaving panel is taken **out of flow** first, so the survivor can start
widening immediately rather than waiting for the exit to finish.

No `inner ⇄ tail` transition is declared, so a survivor promoted from inner to
rightmost does not animate — its width is already reflowing.

## Widget controls returning

When a panel closes, its widget card comes back with its lock line and actions.
Those fade in over the same 300ms.

> **Why:** at full opacity from the first frame they arrived before the thing
> they replace had gone, and the eye read it as a pop rather than a handover.

## Minimise and restore

The panel collapses to a bar inset `--dock-inset` from the viewport's right and
bottom. Minimise and restore read as the panel shrinking into and growing out of
the same corner, because the dock lives inside `.page` — the same box the panels
are laid out in — so its right edge *is* their right edge at every width.

An auto-minimised bar **pulses once** so the agent can see where it went.

## Notices — no success toasts

**No success toasts for anything the agent did.** The UI state changing where
they are looking is the confirmation.

Two persistent, single-line, non-fading notices at the top of the workflow,
dismissed by the action:

| Notice | Action |
|---|---|
| Lock lost to another agent | `Lock to me` |
| New trigger arrived | `View trigger` |

**Only one renders at a time, and lock lost wins.**

A failed save is an **inline error inside the record form with the draft kept**,
not a panel notice.

**One snackbar only:** snapshot resynced, positioned **above the footer** so it
never covers the buttons.

## Scroll-to-reveal

A trigger arriving while the strip is expanded lands in a list the agent may have
scrolled away from, so the strip scrolls back to it. Keyed on the arrival
**count**, so several landing before a resync each bring the list back rather
than only the first.

> **Why not keyed on the trigger list:** that also changes when a resync clears
> the flags, which is the agent finishing with the strip rather than something
> new to show them.

Collapsed needs none of this — the pair renders the newest as its second row, and
two rows do not scroll.

## Reduced motion

`prefers-reduced-motion: reduce` is honoured throughout:

| Surface | Reduced-motion behaviour |
|---|---|
| Panel enter / exit | Angular animation trigger **disabled outright** via `[@.disabled]` |
| Panel open from widget | Instant |
| Widget controls returning | `animation: none` |
| Segment / tab transitions | `transition: none` |
| Skip link | `transition: none` |

> **Why the panel animation is disabled rather than shortened:** a slide is a
> slide. Angular animations do not consult `prefers-reduced-motion`, so the
> trigger is turned off at the host.

The media query is also watched at runtime (`matchMedia` + a `change` listener),
so toggling the OS setting takes effect without a reload.

## Nothing flashes

No animation in this panel repeats. Nothing approaches three flashes per second.
The bar's auto-minimise pulse runs **once**, for 900ms, and is purely decorative
— it is dropped entirely under reduced motion.
