# 06 · Edge cases

These were found while prototyping. Most are not in the epic.

## Three places an agent can lose typing

All handled the same way: **name the consequence at the point of commitment, and
never discard silently.**

| Situation | Behaviour |
|---|---|
| A new trigger arrives mid-draft | The draft is **preserved**; Save is blocked with a warn note until Resync |
| A force unlock takes the lock | The other agent's draft **is lost**, and the confirmation says so |
| Submitting a decision with a draft open | The dialog warns, **naming the draft** |

`Save outcome` and `Submit decision` can be enabled at the same time. An open
draft never disables Submit.

> **Why:** extras do not re-gate the decision.

> ⚠️ Open question 3: the owner whose lock is taken also needs a live
> notification. Not built.

## Two surfaces must never offer the same action

The widget and the panel are the same case. Exactly one of them owns its
controls at any moment.

| Panel state | Widget shows |
|---|---|
| Open | **Nothing at all** — no card |
| Minimised | **Nothing at all** — the bar owns everything |
| Closed | The full card: identity, lock status, actions |

> **Why no card rather than a card without actions:** an open panel already
> carries the identity, the lock and the controls. What was left on the row
> restated the panel's own identity a few hundred pixels above it — a second
> reading that can go stale, contradict the header, or be read instead of it.

**The rule is per widget, not per row.** With the case up and the alert shut, the
SG card is still on the row in full and is still the way back into the alert.

**Closing one panel in dual mode restores that panel's widget and leaves the
other untouched.**

> **Why a widget is not tied to its panel's lifetime:** closing used to delete
> the widget, which made it a one-way door — the alert could not be reopened.
> Presence on the surface and panel-open are two different conditions.

## The submit dialog has exactly one notice slot

Default is the green requirements-met line, which also states that submitting
resolves the case. When an unsaved draft exists the amber warning **replaces it
entirely** and carries the finality itself.

> **Why:** the dialog must never show two notices with opposite moods.

## Severity recorded at resolution must not restyle

A past case's severity pill records severity **at resolution**. It must not
change appearance if `SEVERITY_RANK` changes. The same applies to severity values
inside timeline entries and commentaries.

## Empty states

Every list tab needs one.

| Surface | Empty state |
|---|---|
| Workflow stream | `No outcomes recorded yet`, above the placeholders |
| Left panel, resolved | `No snapshot selected` until an outcome's `View snapshot` is clicked |
| Widget, no open case | A `Create case` state — designed and in the component set, **out of scope for this ticket and not in the prototype** |
| Widget, resolved case | Resolved status, no lock line, no actions |

## The recurring layout bugs

All of these were live at some point in prototyping, all are fixed, and all are
worth re-checking after any layout change:

- Long or unbroken text breaking row layout in every list surface.
- Clamps reserving height when the text fits on one line.
- Hover highlights smaller than their button's hit area on nested icon buttons.
- Panels not flush to the edges they dock to.
- Scroll containers with hardcoded bottom insets clipping the last item behind a
  stacked footer.
- Timestamps rendering a shared default rather than each event's own value.

## Panel exit depends on which column it is in

A closing panel leaves from its **own** column.

| Position | Exit |
|---|---|
| Rightmost, or solo | Slides out to the right — the drawer convention it arrived by |
| Inner (has a panel to its right) | **Dissolves in place** with a gap's worth of drift |

> **Why an inner panel must not slide:** it would carry straight across its
> neighbour. Anchored to `right: 0` like the outer one, it teleported a full
> column and gap to the right edge on the first frame — landing on top of the
> panel still there — and only then began to move.

The fade is not decoration: it is what covers the survivor's instant reflow, the
same job the newcomer's slide does on the way in.

## Attachment fixtures

There is exactly **one** image fixture. Multi-attachment cards are therefore not
reachable from the app.

> **Why not duplicate it:** every PDF fixture used to point at one shared sample,
> so the preview header named the attachment that was clicked while the browser's
> viewer named the file actually loaded. Each fixture resolves to its own
> document, and there is only one document.

Consequence: the multi-attachment wrap behaviour is specified and was verified by
DOM-cloning chips, but **no committed test covers it**. If you want it covered,
a second image fixture is needed.
