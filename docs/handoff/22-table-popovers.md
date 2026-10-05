# 22 · Popovers

Three, all `mat-menu` panels with the `pop` class, so the overlay rules are
Material's and shared: CDK overlay; `width: max-content` between **320 and
400px**; opaque; `overflow: visible` (past max-width content wraps and the
panel grows taller — nothing truncates by the panel); Material's own list
padding zeroed. Open on **click, not hover** — ten rows of hover-opening
panels fire constantly while the eye is only scanning. Close on outside click,
Escape and **scroll** (`MAT_MENU_SCROLL_STRATEGY` close, which works because
`.table-scroll` is `cdkScrollable`; the window never scrolls). One open at a
time, across kinds. Focus returns to the button on close.

> **Escape is handled on the trigger, not the panel.** MatMenu binds its own
> handler to the panel and moves focus there only when the panel holds menu
> items. These panels hold none — they are documents to read — so focus stays
> on the trigger, Material's handler never sees the key, and `(keydown.escape)`
> on the button is what closes it.

Panel heading, where there is one: `p.pop__head`, 14/20 at 600,
`--foreground-primary`, title case.

---

## Priority breakdown

Opened by the row's info button. Heading **"150 · Urgent"**. Four lines, always
four, in the matrix's order — *Withdrawals pending*, *AML risk level*, *SG
vulnerabilities*, *Complaint* — as label · amount · points in a three-column
grid (`1fr auto auto`, 16px columns, 8px rows, baseline-aligned). Zeroes are
shown: *SG vulnerabilities — None — 0* is information. Below, a link
*How scoring works* opens the Confluence page in a new tab (`SCORING_URL`, a
placeholder). Clicks inside are stopped from propagating: a mat-menu closes on
any click inside it.

## Triggered by

Opened by the Triggers count. Heading **Triggered by**, then the modal's
`trigger-strip` — **the component itself, unchanged** — on a `CaseStore` of its
own.

How: `trigger-popover` (`providers: [CaseStore]`) loads the row's case with the
modal's own `loadCase()`, sets the strip expanded, and renders `<trigger-strip>`.
The strip injects the nearest `CaseStore`, which is now this one. The list is
therefore the modal's list by construction. A trigger that arrives while the
panel is open is mirrored in by id (an effect on the collection) and appends,
badged *New*. A trigger the fixture marks `isNew` - an arrival the modal has
not resynced, which `reset()` leaves out - is appended the same way at open, so
the popover shows what the row counts. The badge sits inside the name's flex
group, 8px after the name, `aria-label="New trigger"`; the stamp stays on the
right edge.

What the popover changes about the strip, from its own styles, three selectors
deep so it wins on specificity rather than load order:

- the collapse divider (*Show N more / Hide N*) is hidden — the collapse is the
  modal's; the popover shows every trigger, flat, oldest first;
- the list is a single-column grid, **12px** between items, **16px** padding,
  `max-height 360px`, `overflow-y auto`;
- rows lose their padding, rules and arrival tint; the *New* badge still says
  what the tint said;
- the strip's ground is the panel's **white** with no bottom rule (this
  popover only);
- scrollbar `thin`, `scrollbar-color` transparent at rest and `--line-strong`
  on hover/focus. On macOS overlay scrollbars this shows on scroll rather than
  hover — the OS owns that timing.

The strip's list keeps its `role="list"`, its `tabindex="0"` when it scrolls and
its *Triggers, scrollable list* label.

> **Open:** the row's `+N` counts triggers **since the case opened**; the strip
> is the player's **whole history**. On case 4821 the button says +9 and the
> popover holds 19. Built to spec; one check left failing until this is decided.
> Recommendation: scope the popover's store to since-open (one line). See
> [23](23-table-decisions.md).

## Work

Opened by the Work count. **No heading.** Two labelled groups in one scroll
window (`max-height 360px`, 16px padding, thin scrollbar as above):

- **TO DO (N)** — the required actions still outstanding, in the required
  order, each behind a 16px `radio_button_unchecked` ring in
  `--foreground-primary` - the name's own ink - name at 600. No second line: it has not happened.
- **COMPLETED (N)** — every recorded action, required and custom, **newest
  first** (the order the modal gives its timeline), each behind the same 16px
  inline SVG tick as the row, in `--foreground-secondary`, name at 400, and a second line
  **stamp · agent** in `--foreground-secondary`, tabular figures, one line,
  ellipsising with the full text on `title`.

Labels: 12/16 at 600, `--foreground-secondary`, `letter-spacing 0.04em`,
`text-transform: uppercase` (the text stays "To do (2)" for a reader). 8px
from a label to its first entry, 12px between entries, 20px above the second
label. Each list is `aria-labelledby` its label, so the group name and count
are announced with it. An empty group is omitted with its label; with both
empty: *No work items*, muted (unreachable while the required set is
synthesised, but written).

Not the modal's Timeline: that list also holds the case being created,
triggers, severity changes, locks and resyncs. This is the work on the case
and only that. It reads the collection record directly, so it is live by
construction.
