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

There are **no banners and no snackbars** in the built panel. Two things that
used to be notices are workflow entries now:

| Event | Where it shows |
|---|---|
| New trigger arrived | An event row in the stream: warning icon, `New trigger added - <type>`, the trigger's detail on line two. No amber anywhere, nothing blocked |
| Resync completed | An event row: `Resync completed`, with `No changes.` or the updated values and the risks that moved. While it runs, the Risk assessment is covered by the Resyncing overlay |

> **Why entries and not notices:** both are things that happened to the case,
> in order, between the things the agent did. The stream is the record of that.
> A notice at the top would restate it out of sequence and then disappear.

A failed save is an **inline error inside the record form with the draft kept**,
not a panel notice. A refused start (a draft with content is open) is an
**inline line on that draft**, and the form scrolls into view.

> The Figma handoff card describes a lock-lost notice with a `Lock to me`
> action. It is not built; open question 3 covers the missing notification.

## Scroll-to-reveal

Two things scroll into view, both with `block: 'nearest'`, both `smooth`
unless reduced motion is on:

| What | When |
|---|---|
| The record form | Opened from a risk status in the other panel, or revealed because a start was refused. The note takes focus (not on touch - the keyboard would cover the form) |
| Nothing in the trigger strip, in the case modal | The strip's scroll-to-an-arrival is keyed on flagged arrivals, and the case modal no longer flags them (rule 11, revised). It still runs in the table's trigger popover, which does |

> **Why the form and not the arrival:** the arrival is in the stream, in order,
> where the agent is already reading. The form is the thing that moved.

## The Resyncing overlay

A translucent cover (`--panel` at 82%) over the Risk assessment's body - not
its header, so the Generated stamp and Resync stay readable - with a 24px
Material spinner and the word `Resyncing`, stuck to the top of the visible area
so it is on screen however far down the list the agent was. `RESYNC_MS` (1500)
is the simulated duration. Under reduced motion the spinner is hidden; the word
carries the state.

## Risk status buttons

`background-color` and `border-color` over 120ms `ease-out` on hover, and a
`scale(0.97)` press. Both are `none` under reduced motion.

## Reduced motion

`prefers-reduced-motion: reduce` is honoured throughout:

| Surface | Reduced-motion behaviour |
|---|---|
| Panel enter / exit | Angular animation trigger **disabled outright** via `[@.disabled]` |
| Panel open from widget | Instant |
| Widget controls returning | `animation: none` |
| Segment / tab transitions | `transition: none` |
| Skip link | `transition: none` |
| Record form scroll-into-view | `behavior: 'auto'` |
| Resyncing overlay | Spinner hidden; the word stays |
| Risk status hover and press | `transition: none`, `transform: none` |

> **Why the panel animation is disabled rather than shortened:** a slide is a
> slide. Angular animations do not consult `prefers-reduced-motion`, so the
> trigger is turned off at the host.

The media query is also watched at runtime (`matchMedia` + a `change` listener),
so toggling the OS setting takes effect without a reload.

## Nothing flashes

No animation in this panel repeats. Nothing approaches three flashes per second.
The bar's auto-minimise pulse runs **once**, for 900ms, and is purely decorative
— it is dropped entirely under reduced motion.
