# AML Case Modal — Angular Material prototype brief

Prototype of the AML Case modal for the Lottomart back office (Manual Core epic).
Purpose: prove the state machine and workflow interactions, not final styling.
Build the workflow stream and lock logic first, chrome last.

Reference designs: Figma file "AML Case Modal", page "Round 1 - AML Case Modal",
section "[Desktop Mobile] - AML Case Modal". Frames 00a-10 map to the states below.

## Stack

- Angular 17+ standalone components, signals for state.
- Angular Material with a custom palette (tokens below). Do not fight Material
  theming; apply severity colours via CSS custom properties on top.
- One in-memory store driving everything from `mock-case.json`. No backend.
- A dev-only state switcher (dropdown or querystring) to jump between the
  states listed below for review.

## Design tokens

```css
:root {
  --ink: #18181B;        /* primary text */
  --ink-2: #52525B;      /* secondary text */
  --ink-3: #71717A;      /* muted text, placeholders */
  --line: #E3E6EA;       /* default hairline */
  --line-strong: #C9CED6;/* input borders, emphasised dividers */
  --page: #F4F5F7;       /* page background */
  --panel: #FFFFFF;      /* surfaces */

  --primary: #1A73C9;    /* primary actions, links, active tab */
  --primary-bg: #EAF2FB;

  /* Severity language. Used ONLY for severity. */
  --sev-aml: #B3261E;      --sev-aml-bg: #FBECEA;
  --sev-edd: #B06A00;      --sev-edd-bg: #FDF1DC;
  --sev-compliance: #5B4BC4; --sev-compliance-bg: #EDEAFB;

  /* State colours */
  --success: #0F6E57;    --success-bg: #E0F5ED;  /* locked-to-you, done chips, resolved */
  --danger:  #B3261E;    --danger-bg:  #FBECEA;  /* force unlock, attachment errors */
  --warn:    #B06A00;    --warn-bg:    #FDF1DC;  /* lock-lift warning, new trigger, resync */
}
```

Rules: severity colours never mean anything except severity. SG-alert material
stays in the primary blue family. Success green is the only "you can act here"
signal. Text on tinted backgrounds uses the darkest tone of the same family.

## Layout

Desktop modal 1000x820 (resizable). Vertical: header / triggers strip / body /
(footer lives inside the right panel).

Body splits: left player-info panel fixed 420px, right workflow panel fills.
Below ~720px available width (dual-modal mode or small screens) the split is
replaced by a segmented control (Workflow | Player info) — never squeeze the
two-panel layout.

Pinned vs scrolling: the required-actions chip bar (top of workflow panel) and
the footer (Adjust severity / Submit decision) are pinned. Only the stream
between them scrolls. The left panel scrolls independently.

## Components

- `aml-case-modal` — shell, owns layout mode (two-panel vs segmented).
- `case-header` — title, severity pill, status pill, lock line, lock button.
- `trigger-strip` — collapsed (2 rows + "+N more triggers" badge) / expanded
  (max ~10 rows visible, internal scroll, "Showing X of 20" bar + Collapse).
- `player-info-panel` — tabs: Snapshot, Past AML cases, Starred, Timeline.
  Snapshot content this epic = generation date + Resync button + placeholder
  note. Historical snapshot view = banner naming source action + back link.
- `workflow-panel` — chip bar, stream, footer.
- `required-chips` — one chip per mandatory action, pending/done.
- `outcome-card` — title, actor + timestamp, note, attachment chips (frozen),
  View snapshot button. Immutable once saved.
- `event-row` — one-line entries: severity change, lock/unlock. Severity
  escalation shows an up arrow in the warn colour.
- `action-placeholder` — dashed card "X — not recorded" + Record button.
- `record-form` — inline in the stream (replaces the placeholder, never a
  dialog): textarea, attachment list, lock choice radio, Cancel/Save.
- `attachment-list` — wrapping chips with name + size + remove (drafting only);
  inline per-file errors (wrong type, oversize) that never clear valid files.
- `add-action-menu` — menu with three items: Contact player, Open source
  searches, Add a note. Each opens the same record-form.
- `severity-dialog` — pill pair old→new, Escalation/De-escalation badge,
  reason textarea, warn note "lock is lifted on severity change".
- `decision-dialog` — green requirements-met note, one textarea, button label
  "Submit and resolve".
- `confirm-unlock-dialog` — only on the force-unlock path. Body names the
  owner, lock time, and the consequence. Confirm button "Unlock case" (danger).

## Business rules (the state machine — this is the point of the prototype)

1. One open case per player.
2. Case status: OPEN | RESOLVED. (IDLE exists in the spec but is undefined —
   see open questions; do not implement.)
3. Lock: unlocked | locked-to-me | locked-to-other.
   - Only the lock owner can record outcomes or add actions.
   - Locking/unlocking writes a timeline event.
   - Self-unlock is instant. Unlocking someone else's lock requires the
     confirm dialog ("force unlock").
4. Mandatory actions: Open Source Searches and Contact, completable in ANY
   order. Submit decision stays disabled until both are recorded.
5. Recording an outcome requires a text note; attachments optional (PDF and
   images only, multiple allowed); the agent must explicitly choose keep
   locked / unlock afterwards (radio, no default action styling).
6. Outcomes are immutable after save. Each stores a snapshot reference.
7. Extra actions (uncapped): Contact player, Open source searches, Add a note.
   They render as normal outcome cards and never re-gate Submit.
8. Adjust severity: always enabled. Saving changes severity everywhere
   (header pill, widget colour), lifts the lock, logs an event row and
   timeline entry. UI must state escalation vs de-escalation.
9. Submit decision: enabled only per rule 4. Saving records a decision
   outcome, sets status RESOLVED.
10. Resolved: fully read-only. Tabs reduced to Snapshot + Timeline. No chips,
    no placeholders, no Add action, no footer. Left panel shows "No snapshot
    selected" until an outcome's View snapshot is clicked.
11. New system trigger mid-case: inserts at top of trigger strip with amber
    highlight + NEW marker; snapshot marked out of sync; recording outcomes is
    blocked until Resync is clicked. (Simulate with a dev button.)

## States to make reachable (mirror of Figma frames)

00a unlocked · 00b locked-to-other + force-unlock confirm · 01 locked, empty ·
02 recording (with attachment errors) · 02b recording clean, reverse order ·
03 all required recorded · 04 viewing historical snapshot · 05 severity dialog ·
06 decision dialog · 07 resolved · 08 add-action menu open · 09 dual/narrow
segmented layout · 10 triggers expanded, 20 triggers, new arrival highlighted.

## Open questions — build against these assumptions, flag them in code comments

1. IDLE status: undefined in spec. Assume it does not exist.
2. New trigger while a record-form is open: assume the draft is preserved;
   the form disables Save with a warn note "Resync required" until resync.
3. Severity change lifts the lock: implement as specced, but keep re-lock one
   click away (the header Lock button).
4. Force unlock vs owner's draft: assume the owner's draft is lost; the
   confirm dialog copy says so.
5. Attachment size cap: assume 10MB per file, per-file inline error. The
   constant lives in one place, named `ATTACHMENT_MAX_MB`.
6. New trigger arrival: highlight persists until resync; auto-expand the strip
   only if it was already expanded.

## Copy rules

UK spelling. Sentence case everywhere. Buttons are verbs. Consequences live in
labels: "Force unlock", "Submit and resolve", "Unlock case". Error messages
name the file and the rule: "notes.docx was not added. PDF and images only."
