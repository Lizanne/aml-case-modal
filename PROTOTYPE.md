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
  --foreground-primary: #18181B;        /* primary text */
  --foreground-secondary: #52525B;      /* secondary and muted text, placeholders */
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
- `player-info-panel` — tabs: Risk assessment, Past AML cases, Starred,
  Timeline. The Snapshot tab was rebranded and replaced (2 Nov 2026).
- `risk-assessment` — generated stamp + an always-visible Resync button, a
  summary line (`2 to assess · 10 flagged · 6 no risk`, the first part a jump
  to the first field to assess), then the fields grouped by section with
  Account information collapsed by default (see "Risk assessment" below).
  Section titles are sticky full-bleed bands (`--page` fill, hairline on top,
  24px above, primary ink), spaced from the LDS core scale
  (`--lds-core-spacing-*` in `styles.scss`). Each field: label,
  info button with a tooltip (what it is, when it is a risk), value, and a
  status (Risk flagged / No risk / Action required) except on informational
  fields. The status is a button for the lock owner; it opens Assess risk.
  While that form is open its row is tinted (info tint, to the panel edges)
  with an "Assessing" mark and aria-current, and the tint clears on save or
  cancel - this answers the PRD's question of how the left panel signals
  which workflow action is open. A Resyncing overlay covers the section
  while it regenerates.
- `risk-status` — the status label/button. Icon + word; Risk flagged and
  Action required filled, No risk an outline so the panel is not a wall of
  colour.
- `section-risk-table` — the finalize table: section, Risk / No risk.
- `resync-dialog` — "Resync risk assessment?" / "Some actions might need to be
  recorded again." Cancel / Resync.
- `workflow-panel` — chip bar, stream, footer.
- `required-chips` — one chip per required item. Contact player and Finalize
  are pending/done; an assessment's chip is the field's risk status pill
  (Action required / No risk / Risk flagged) with the field name as its word,
  so the chip bar and the Risk assessment say the same thing about a field.
- `outcome-card` — title, actor + timestamp, note, attachment chips (frozen).
  Immutable once saved. No View snapshot button any more. An assessment card
  shows the new status and "Was …" when it changed one; a finalize card
  carries the section table.
- `event-row` — two-line entries: severity change, manual case created,
  "New trigger added - <type>" (warning icon), "Resync completed".
- `action-placeholder` — dashed card "Contact player — not recorded" +
  Record; "<Field>" + its risk status pill + Assess; "Finalize risk
  assessment" + Finalize. Finalize stays visible, disabled, with the
  fields still left named under it.
- `record-form` — inline in the stream (replaces the placeholder, never a
  dialog). Three variants: Record (note, attachments, lock choice); Assess
  risk - <field> (adds "Your assessment" after the attachments: radios
  Risk flagged / No risk, stacked like the lock choice); Finalize risk
  assessment (section table + note, no attachments).
- `attachment-list` — wrapping chips with name + size + remove (drafting only);
  inline per-file errors (wrong type, oversize) that never clear valid files.
- `add-action-menu` — Contact player, Add a note. Each opens the same
  record-form. Assessing a field is done from its status instead.
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
4. Required actions, completable in ANY order:
   - an assessment of every field that is or was Action required. A new case
     starts with Assess risk - Open source searches and Assess risk -
     Document requests (the two fields that are always manual). A resync can
     add more.
   - Contact player.
   - Finalize risk assessment, last: visible but disabled while any field is
     Action required.
   Submit decision stays disabled until all of them are done. Only a case
   with a finalized risk assessment can be closed.
5. Recording an outcome requires a text note; attachments optional (PDF and
   images only, multiple allowed); the agent must explicitly choose keep
   locked / unlock afterwards (radio, no default action styling).
6. Outcomes are immutable after save.
7. Extra actions (uncapped): Contact player, Add a note.
   They render as normal outcome cards and never re-gate Submit.
8. Adjust severity: always enabled. Saving changes severity everywhere
   (header pill, widget colour), lifts the lock, logs an event row and
   timeline entry. UI must state escalation vs de-escalation.
9. Submit decision: enabled only per rule 4. Saving records a decision
   outcome, sets status RESOLVED.
10. Resolved: fully read-only. Tabs reduced to Risk assessment + Timeline. No
    chips, no placeholders, no Add action, no footer. The Risk assessment
    shows as finalized, with no clickable statuses.
11. New system trigger mid-case (revised 2 Nov 2026): no forced refresh, no
    amber, no NEW marker, no out-of-sync state, nothing blocked. A workflow
    entry is added: warning icon + "New trigger added - <type>". The next
    resync picks up what it changed. (Simulate with the dev button.)
12. Resync (always visible in the Risk assessment header; needs the lock;
    disabled once the assessment is finalized):
    - asks first: "Resync risk assessment?" / "Some actions might need to be
      recorded again."
    - the section is overlaid with "Resyncing" while the system regenerates it
    - field by field: value unchanged → nothing; value changed, risk not →
      the new value replaces the old; value AND risk changed → the new value
      replaces the old and the field goes to Action required, which makes it
      a required assessment
    - then the overlay goes and a workflow entry is added: "Resync completed"
      / "No changes." or "Updated values: A, B, C. Risk associated with A
      changed - manual action needed."
    - new values replace the old; no history is shown on the section.
13. Assessing a field: the system judges risk wherever it can; the agent can
    override any status. Clicking a status (or Assess on a placeholder)
    opens Assess risk - <field>: note, attachments, Your assessment (radios
    Risk flagged / No risk), lock choice. Saving records it in the workflow and updates the field.
    Document requests and Open source searches are always manual.
14. Finalize risk assessment: note, no attachments, and a table of sections
    with Risk or No risk - a section is Risk if any field in it is.
    Informational fields (Account information) are not in it. Once
    finalized, statuses stop being clickable and Resync is disabled.

## Risk assessment

Source: "Aml Case Report snapshot example - Final Risk Assesment section"
(PDF). Fields, mock values, definitions and risk logic live in
`src/app/core/risk-assessment.ts`. Sections: Account information
(informational), Verification risks, Login & geography risks, Payment
methods, Deposit & transaction behaviour, Product & gameplay analysis, Open
source intelligence. The tooltip on each field is its definition, a blank
line, then "Risk if: …".

The mock has two generations of values. A new trigger queues the second;
the next resync swaps it in and exercises every resync rule: Pending
withdrawals, VPN usage and Active payment methods change value only; Latest
fraud scores (a score of 112) and Deposit spike (1) change value and risk.

## States to make reachable (mirror of Figma frames)

00a unlocked · 00b locked-to-other + force-unlock confirm · 01 locked, empty ·
02 recording (with attachment errors) · 02b recording clean, reverse order ·
03 everything required done, risk assessment finalized · 04 overriding a risk
from the Risk assessment · 05 severity dialog · 06 decision dialog · 07
resolved · 08 add-action menu open · 09 dual/narrow segmented layout · 10 new
trigger arrived, triggers expanded · 11 past AML cases · 12 resync confirm ·
13 resyncing · 14 resync completed, two risks changed · 15 finalize risk
assessment.

## Open questions — build against these assumptions, flag them in code comments

1. IDLE status: undefined in spec. Assume it does not exist.
2. New trigger while a record-form is open: the draft is untouched and Save
   stays available - a trigger no longer blocks recording.
3. Severity change lifts the lock: implement as specced, but keep re-lock one
   click away (the header Lock button).
4. Force unlock vs owner's draft: assume the owner's draft is lost; the
   confirm dialog copy says so.
5. Attachment size cap: assume 10MB per file, per-file inline error. The
   constant lives in one place, named `ATTACHMENT_MAX_MB`.
6. New trigger arrival: no highlight in the case modal any more (rule 11).
7. Contact player stays a required action alongside the assessments.
   Confirmed 2 Nov 2026 as far as the handover specifies: it is an existing
   required workflow action, and the change adds the Document requests
   assessment and Finalize risk assessment rather than removing it. Still
   open: the notes do not confirm whether Contact player is required on
   EVERY AML case.
8. After Finalize the assessment is locked: statuses stop being clickable and
   Resync is disabled. The change did not say what a resync after finalizing
   should do, so it is not allowed.
9. The "Link to player doc reqs section" in the PDF is not built: there is no
   documents section in the prototype to link to.

## Copy rules

UK spelling. Sentence case everywhere. Buttons are verbs. Consequences live in
labels: "Force unlock", "Submit and resolve", "Unlock case". Error messages
name the file and the rule: "notes.docx was not added. PDF and images only."
