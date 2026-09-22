# PROTOTYPE-TABLE.md — Global AML Cases table

Extends the current handoff in `docs/handoff/`. **`PROTOTYPE.md` is superseded —
do not read tokens or open questions from it.** Same repo, same tokens, same
store. Where this file and the handoff touch, the modal's rule wins.

## 1. Purpose

A Back Office list of every open AML case, split into an **Active** queue (AML
and EDD severity) and a **Compliance** queue (Compliance severity). Agents use
it to pick a case, lock it, and open it. The table is the front door to the AML
Case modal already built; the demo journey is table → lock → Open AML Case → new
tab lands on player details with the modal open.

**Deadline:** design review 1 Oct, stakeholder walkthrough 7 Oct.

## 2. Scope

**In:** LHM entries, the table view with four tabs (two working, two locked),
real-time behaviour on a mock feed, lock and open flow from a row, sort,
dev-only mock trigger button.

**Out:** Idle and Archive tab contents, role-based hiding of the Compliance
queue, pagination (case volume is low and cases close inside 48h), the backend
scoring algorithm itself, the player header redesign.

## 3. Routes and navigation

**No router.** Match the existing `?state=` pattern with query params:

| Query | Result |
|---|---|
| `?view=cases&tab=active` | Table, Active tab |
| `?view=cases&tab=compliance` | Table, Compliance tab |
| `?view=player&case=<id>&modal=open` | Player details with the modal open (the Open AML Case deep link) |

Real routes (`/aml-cases`, `/aml-cases/compliance`) are a **dev-handoff note**,
not prototype work.

- LHM rename: "Alerts" → "SG Alerts", "Triggered snoozes" → "SG Snoozes"
- New LHM items under SG Snoozes: "AML cases" (count of open cases excluding
  Compliance) and "Compliance AML cases" (count of open Compliance cases).
  Counts come from the same store as the table and update live.
- Tabs in order: Active, Compliance, Idle (disabled), Archive (disabled).
  Disabled tabs render but do not respond; tooltip "Coming soon".
- Refresh button at the bottom of the table as a fallback. It re-reads the
  store; it is not the primary update path.
- The prototype has no sidebar today. **Stub one** showing only the SG Snoozes
  group and its children (SG Alerts, SG Snoozes, AML cases, Compliance AML
  cases). Do not rebuild the rest of the Back Office nav; other items can be
  static placeholders.
- **The LHM is the only way into the table.** Player details and the modal do
  not link back to it; agents return via the sidebar. See open question 21.

## 4. Data model

Extend `mock-case.json` from one case to `mock-cases.json`, an array. Each case
keeps the modal's shape and adds:

| Field | Value |
|---|---|
| `createdAt` | ISO timestamp (SLA clock starts here) |
| `scoring` | `{ pendingWithdrawals: number, amlRisk: "low"\|"medium"\|"high", sgVulnerability: boolean, complaint: boolean }` — the four matrix inputs, the only authored priority data |
| `priority` | **Derived, never stored.** `priorityOf(scoring)` returns `{ score, band, breakdown }` — always exactly the matrix's four lines |
| `linkedAccounts` | number |
| `actions` | `[{ type, state: "todo"\|"done" }]` — up to 8 types |

Seed 12 to 15 cases across all three severities, all four priority bands, all
four SLA bands, and every lock state, so every row treatment is visible on first
load without clicking.

The modal reads a single case from this array by id. **One store, two views.**

## 5. Columns

Active and Compliance tabs, same columns, this order.

| Column | Behaviour |
|---|---|
| **Player** | Player ID as a link (opens player details, same tab, current behaviour). Player status shown beneath as a small status pill. Live. |
| **Lock** | State only - read, never clicked. **Copy follows the widget exactly:** `Not locked` (muted, no icon); `Locked to you` (green, lock icon); `Locked to M. Torres · 16d` (default ink, lock icon - relative age is deliberate, it is the input for deciding whether to take the lock). Never initials alone. The controls live in **Actions**. |
| **Linked accounts** | Count. Existing linked-accounts treatment. |
| **Priority** | Score plus band label, e.g. "50 Medium". Clicking (not hovering - ten rows of hover-opening popovers fire constantly while the eye is merely scanning the column) opens a popover listing each breakdown line as label · amount · points in any order, with a "How scoring works" link that opens the Confluence page in a new tab. The same link also sits in the column header. |
| **SLA** | Time elapsed since `createdAt`, formatted `Xh Ym`, with a coloured indicator. Live. Green is `--foreground-success`. |
| **Work** (renamed from Actions) | Chips per action, ticked when done, unticked when to-do. To-do chips render first. Show two, then "+N more" which opens a popover listing all. Nothing in this column is actionable. |
| **Actions** | Trailing edge, after Work. One or two buttons, right-aligned, all 28px/13px. Unlocked: **Lock** (ghost). Locked to you: **Open case** (the only solid fill in the table, external-link icon) plus **Unlock** (text only). Locked to another agent: **Force unlock**, which is the modal's own `.danger-button` - red outline, red label - and goes through the modal's confirm dialog. |

Open question **12** decides whether a Severity pill is added after Player. Until
answered, **show it**: Active holds both AML and EDD and an agent cannot
otherwise tell them apart.

## 6. Colour rules

*(Proposed, D1, Liz to sign off)*

The row has two candidates for traffic-light colour and **only one may have it**.

- **Priority** is already communicated by row order (it is the sort). Render
  score and band in neutral ink; **Urgent gets bold weight and a warning icon,
  no fill and no colour.** Severity pills stay the only categorical colour in
  the row.
- **SLA** is the only traffic light: green under 12h, amber under 36h, red under
  48h. Over 48h keeps red but switches from outline to solid fill and the time
  reads bold. No fifth colour.

**Rejected:** four-colour priority bands beside four-colour SLA (two competing
signals, purple clashes with brand and red already means High in linked
accounts). **Also rejected:** reusing a severity token for Urgent, because the
same red would mean "urgent" in one column and "EDD" in the next.

## 7. Business rules

*(continue numbering from the handoff)*

1. A case appears in exactly one tab, decided by severity: AML and EDD →
   Active, Compliance → Compliance.
2. When severity changes to Compliance, the row leaves Active and joins
   Compliance in the same tick. The reverse applies if it is lowered.
3. A resolved case leaves both tabs and both LHM counts in the same tick.
4. **Open case** is only available on a row locked to the current agent. It
   opens a new tab at `?view=player&case=<id>&modal=open`. The visible label
   is the widget's - "Open case" - so the two cannot drift; the accessible
   name is longer ("Open AML case for player <id>") because ten identical
   buttons down a column are indistinguishable to a screen reader.
5. Lock, unlock and force-unlock from the row behave exactly as from the widget,
   including the consequence-stating confirm on force unlock.
6. Default sort: priority score descending, then SLA elapsed descending as
   tiebreaker. The user may switch to SLA descending. Sort choice persists for
   the session.
7. Live updates never move the viewport. A row that changes position animates to
   its new slot; the user's scroll offset is preserved.
8. The LHM counts and the tab counts are derived from the store, never held
   separately.

## 8. States to build

| ID | State |
|---|---|
| T-00 | Empty (each tab): "No open AML cases" / "No open Compliance AML cases" with a "View past cases" link (matches the widget empty-state copy). |
| T-01 | Active tab, seeded, mixed lock states (the master frame). |
| T-02 | Compliance tab, seeded. |
| T-03 | Row locked to me: Open case and Unlock both visible in Actions. |
| T-04 | Row locked to another agent, force-unlock confirm open. |
| T-05 | Priority breakdown popover open. |
| T-06 | Work "+N more" popover open. |
| T-07 | New trigger arrives on a row: row flashes amber once (same token as the modal trigger strip new-arrival highlight), no auto-expand. |
| T-08 | Case escalates: row fades out of Active over 300ms, fades into Compliance at its sorted position, LHM counts tick. |
| T-09 | Case resolved: row fades out, counts tick. |
| T-10 | Sort switched to SLA. |
| T-11 | Idle / Archive disabled tab hover. |
| T-12 | LHM frame: renamed items plus the two new entries with live counts. |

## 9. Real-time simulation

`MockRealtimeService` applies one random mutation to the store every 8 to 15
seconds, from this set: add trigger, change player status, change pending
withdrawals (and recompute priority), escalate a random Active case to
Compliance, resolve a random case. Every mutation goes through the store so the
modal, widget, table and LHM all react from the same event. A pause toggle in
the dev bar stops the feed for demos.

**Dev-only Mock extra trigger button:** lives in the AML cases tab of player
details, gated on `environment.production === false`. It fires the add-trigger
mutation for that player's case.

## 10. Reuse map

| Need in table | Comes from |
|---|---|
| Severity pill and colours | modal header tokens |
| Lock button, chip, force-unlock dialog | widget Round 3.1 |
| Action chips | modal workflow chips |
| Trigger new-arrival highlight | modal trigger strip |
| Confirm dialog pattern | modal severity/resolve dialogs |
| Empty state copy | widget empty states |

Nothing in this list is redrawn. If the table needs a variant, add it to the
existing component and back-port to Figma per the parity rule.

## 11. Assumptions for open questions

*(continue numbering from `docs/handoff/09-unresolved.md`, which ends at 11)*

12. Severity column is shown in both tabs. Flip to hidden if Richie confirms the
    drop was deliberate.
13. Triggers are not a column. Trigger arrival still surfaces as the row flash.
    Add the trigger strip as a column only if Richie asks for it.
14. Pending withdrawals is not a column; it lives in the priority breakdown.
15. Lock copy follows the widget vocabulary exactly (`Locked to you` /
    `Locked to M. Torres · 16d`). Never initials alone.
16. No notification to the locking agent when their case escalates; the row just
    moves. Lock is retained on the case.
17. SLA clock runs from `createdAt` and does not pause while locked.
18. Over-48h SLA is solid red, no new colour.
19. **CLOSED.** Priority scoring follows "EDD overhaul ticket priority
    scoring" (see §10). The placeholder thresholds are gone.
20. Force unlock from the table is allowed, same as from the widget.
21. No "back to queue" link from player details or the modal. Add one only if
    Richie says agents lose their place.

## 12. Deferred

Idle and Archive content, role-based queue visibility, real websocket wiring,
sorting by any column other than priority and SLA, bulk actions.


## 10. Priority scoring

Implements *EDD overhaul ticket priority scoring*. Four categories, each a
fixed tier rather than a curve. Total 10 to 200.

| Withdrawals pending | Pts | AML risk | Pts | SG vulnerabilities | Pts | Player complaint | Pts |
|---|---|---|---|---|---|---|---|
| £0 | 0 | Low | 10 | Detected | 50 | Yes | 50 |
| £1 – £99.99 | 5 | Medium | 25 | None | 0 | No | 0 |
| £100 – £499.99 | 10 | High | 50 | | | | |
| £500 – £999.99 | 20 | | | | | | |
| £1,000 – £1,999.99 | 30 | | | | | | |
| £2,000+ | 50 | | | | | | |

### Tiers

| Band | Range |
|---|---|
| Low | 10 – 29 |
| Medium | 30 – 59 |
| High | **60 – 149** |
| Urgent | 150 – 200 |

### Two deliberate departures from the source document

1. **High runs to 149, not 99.** As written the tiers leave **100–149 in no
   band**, while Low/Medium (29→30) and Medium/High (59→60) are contiguous.
   100 is trivially reachable — a £2,000+ withdrawal on a high-risk player and
   nothing else. The 99 reads as a leftover from an earlier 100-point scale.
   Closed upward rather than downward: a hole is worse than a wide band, and
   Urgent should stay rare. Two seeded cases (105, 100) sit in that range so
   the decision is visible in the prototype.
2. **SG vulnerabilities and Player complaint are prototype data.** The document
   marks both as fields that "would require an additional field which can be
   marked by all Operational teams" — they do not exist yet. Modelled as
   booleans so the matrix can be shown whole.

### Refresh

The document says scoring refreshes **once every 24 hours, or when the ticket
is repopulated into the queue** — not continuously. `CasesStore.rescore()` is
that refresh; the real-time feed calls it rather than mutating a score
directly. This supersedes the earlier assumption that priority recomputes live
whenever pending withdrawals change.

### Seeded spread

All four bands appear in **both** queues, every withdrawal tier is exercised,
and all three AML risk levels are present.

| Score | Band | Queue |
|---|---|---|
| 200 | Urgent | Active (the maximum: all four factors at 50) |
| 150 | Urgent | Active, Compliance |
| 105, 100 | High | Active (the range the document leaves out) |
| 75 | High | Active, Compliance |
| 50, 45, 35 | Medium | Active |
| 35 | Medium | Compliance |
| 20, 10 | Low | Active |
| 10 | Low | Compliance (the minimum: no withdrawals, low risk) |
