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
| `linkedAccounts` | number — **retained in the data, not shown.** The column was removed; the field stays because it is a property of the case, not of the table, and nothing else had to change to drop the column |
| `actions` | `[{ type, state: "todo"\|"done" }]` — up to 8 types |

Seed 12 to 15 cases across all three severities, all four priority bands, all
four SLA bands, and every lock state, so every row treatment is visible on first
load without clicking.

The modal reads a single case from this array by id. **One store, two views.**

## 5. Columns

Active and Compliance tabs, same columns, this order.

| Column | Behaviour |
|---|---|
| **Player** | Two lines. **Line one:** player ID as a link (opens player details, same tab), 600 weight, tabular figures, underlined, link colour. **Line two:** player status as muted 13/18 text - no pill, border or background. Statuses are the real values (`ENABLED`, `PLAYER_REGISTERED`, `GAMSTOP_RESTRICTED`, `PLAYER_DUPLICATE`) with display labels mapped in the template, not the fixture. Sticky on horizontal scroll with a right edge that appears only once scrolled. `min-width: 184px`. |
| **Severity** | AML, EDD or Compliance, as the shared severity pill. Decides which tab the case is in (rule 1). |
| **Triggers** | The **initiating** trigger only - the oldest dated at or after the case opened - then its relative age, on one line: `Large deposit · 2d ago`. Name in default ink, age muted, separated by a middle dot. The name ellipsises; the full name and an absolute stamp sit on the `title`. More than one trigger appends a muted `+N` in plain text, same line. **Not interactive:** no button, no popover, no cursor change. Text rather than chips, so it stays distinct from Work. |
| **Priority** | Score plus band label, e.g. "50 Medium". Clicking (not hovering - ten rows of hover-opening popovers fire constantly while the eye is merely scanning the column) opens a popover listing each breakdown line as label · amount · points in any order, with a "How scoring works" link that opens the Confluence page in a new tab. The same link also sits in the column header. **Sortable.** |
| **SLA** | Time elapsed since `createdAt`, formatted `Xh Ym`, with a coloured indicator. Live. Green is `--foreground-success`. **Sortable.** |
| **Work** (renamed from Actions) | Up to **four** items inline as TEXT, to-do first, separated by a middle dot. The first is the one to action: default ink at 600. The rest are muted at 400. A completed item carries a leading tick and success green **wherever it lands in the order**. More than four appends a muted `+N`. No work items renders a muted "No work items". **Not interactive**, and no popover. |
| **Actions** | Trailing edge. Two controls on one 32px axis, right-aligned, 8px apart: the **lock control**, then **Open case**. Lock is a 32px disc in three states - an open padlock when free, a monogram avatar when held (success tint for yours, neutral for another agent's). Open case is icon-only, primary fill, and appears only on a row locked to the current agent. `min-width: 120px`. |

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
9. **Priority and SLA are sortable.** Default on load is priority descending
   with SLA elapsed as the tiebreaker. Clicking the active column flips its
   direction; clicking the other switches to it and resets to descending -
   "sort by SLA" means the oldest first, and inheriting ascending would answer
   a question nobody asked. The direction flips the whole comparison,
   tiebreaker included. The active header carries `aria-sort`; the inactive
   sortable one carries `aria-sort="none"`. Sort choice persists for the
   session.

## 8. States to build

| ID | State |
|---|---|
| T-00 | Empty (each tab): "No open AML cases" / "No open Compliance AML cases" with a "View past cases" link (matches the widget empty-state copy). |
| T-01 | Active tab, seeded, mixed lock states (the master frame). |
| T-02 | Compliance tab, seeded. |
| T-03 | Row locked to me: Open case and Unlock both visible in Actions. |
| T-04 | Row locked to another agent, force-unlock confirm open. |
| T-05 | Priority breakdown popover open. |
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
13. **REVERSED.** Triggers *are* a column - the initiating one plus a count.
    The row flash is gone with it. See D-13.
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


## 13. Priority scoring

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

1. **High runs to 149, not 99 — a documented stopgap, not a decision.** The
   tiers as written leave **100–149 in no band**, while Low/Medium (29→30) and
   Medium/High (59→60) are contiguous. 100 is trivially reachable: a £2,000+
   withdrawal on a high-risk player and nothing else. `priorityBand()` closes
   the gap upward so nothing can fall through — a hole is worse than a wide
   band, and Urgent should stay rare — but the range is genuinely undefined in
   the source and needs a decision.
2. **SG vulnerabilities and Player complaint are prototype data.** The document
   marks both as fields that "would require an additional field which can be
   marked by all Operational teams" — they do not exist yet. Modelled as
   booleans so the matrix can be shown whole.

### The seed avoids the undefined range

No seeded case scores below 10 or inside 100–149. The band function covers
100–149; the *fixture* stays out of it, so nobody reading the prototype mistakes
the stopgap for a settled tier. This is a fixture constraint, not a scoring
rule — `verify:cases-store` asserts it, and the day the range is defined that
check goes and the seed is free again.

### Refresh

The document says scoring refreshes **once every 24 hours, or when the ticket
is repopulated into the queue** — not continuously. `CasesStore.rescore()` is
that refresh; the real-time feed calls it rather than mutating a score
directly. This supersedes the earlier assumption that priority recomputes live
whenever pending withdrawals change.

### Seeded spread

All four bands appear in **both** queues, every band floor is represented so the
boundaries are visible, and every withdrawal tier and AML risk level is
exercised.

| Score | Band | Queue | Note |
|---|---|---|---|
| 200 | Urgent | Active | the maximum — all four factors at 50 |
| 150 | Urgent | Active, Compliance | Urgent floor |
| 95 | High | Active | the document's own Scenario 2: £600 + Medium AML + SG |
| 75 | High | Active, Compliance | |
| 60 | High | Active | High floor |
| 50, 45 | Medium | Active | |
| 35 | Medium | Compliance | |
| 30 | Medium | Active | Medium floor |
| 20 | Low | Active | |
| 10 | Low | Active, Compliance | the minimum — no withdrawals, low risk |


## 14. Decisions and reversals

### D-05 — initials, as an exception

The table avoids initials everywhere else: rule 15 says the lock sentence never
shows initials alone, because "MT" does not tell you who holds a case.

**The avatar is the exception, and it earns it three ways.** The monogram is
never the only carrier - the full name is on the tooltip and in the accessible
name, so "MT" is decoration and is marked `aria-hidden`. The pattern is
familiar from Jira and every other queue an agent already uses, so a disc with
two letters reads as *assignment* before it is read as text. And it is compact:
one 32px disc in a 120px column, against the ~200px a sentence needed.

The rule it bends still holds where it was written - the force-unlock confirm
still names the person in full, because that is where the decision is made.

### D-07 — the lock control lives in Actions

**Rewritten.** It previously said the padlock belonged in the Lock column,
which itself reversed three text buttons in Actions.

**The Lock column is gone.** A whole column to carry one 32px control - and a
sentence restating what the control already showed - was the widest column in
the table saying the least. The two things an agent does to a row, take it and
open it, now sit together at the trailing edge.

**Three states, one disc, sized to Open case.** An open padlock when free; a
monogram avatar when held, in the success tint for yours and neutral for
someone else's. Both are 32px, so the pair reads as one control group rather
than two kinds of thing. See D-05 for why initials are allowed here.

**What each state does is unchanged:** click to lock, click your own to
release, click someone else's to open the consequence-stating confirm.

### D-12 — Work is text, and the popover is gone

**Pills became text.** Four pills a row read as four controls, and the column
is a statement, not a set of buttons. At ten rows the chips were the loudest
thing on screen and the quietest thing to act on.

**Completed items stay in the row**, per Rafal (17 Sept). They were a candidate
for removal - a queue is about what is left to do - but a case with three of
five done is a different case from one with none, and dropping them hid that.
They carry the tick and the success green wherever they land in the order.

**The popover is dropped.** Work detail belongs in the case, not the queue.
The "+N more" panel listed the full set, which is a reason to open the case
rather than something to unfold in a row; T-06 goes with it, from §8 and from
the dev switcher.

**Priority is order and weight, never colour alone.** The first item is the one
to action and is the only one at 600; green marks completion, which is a
different fact. An agent who cannot separate the greens still reads the order.

**One accessible name for the cell.** The spans are `aria-hidden` and the
wrapper carries a sentence: *"5 work items, 2 to do, first: Contact player,
SoF request, and 1 more"*. Read span by span it is a bag of fragments, and the
order - the entire point of the column - does not survive.

### D-13 — Triggers is a column; the row flash is not

**Reverses assumption 13**, which said triggers would not be a column and that
arrival would surface as an amber row flash.

**The initiating trigger is shown** because it is what the case is *about*. A
queue that says a case exists, how urgent it is and how long it has waited, but
not what opened it, makes you open the case to find out - which is the one
thing a queue exists to save you.

**The count is shown** because volume since opening is a triage signal: one
trigger and nine triggers are different cases, and the difference is legible
without reading either.

**No popover.** What each trigger actually said is a reason to open the case,
not something to unfold in a queue. The breakdown and work popovers earn their
overlays because they explain a number or complete a list already on screen; a
trigger list is new material.

**Text, not chips.** Work is chips. A second chip column would read as one kind
of thing said twice, and they are not the same kind of thing: Work is a set of
tasks with states, Triggers is one fact and a count.

**The flash is rejected.** A queue is scanned, not watched. An amber flash
assumes someone is looking at the row at the moment it changes and rewards them
for staring; the count changing is enough, and it survives not being watched.
T-07 is removed from §8 and from the dev switcher.

**Scope note.** A case's triggers are those dated at or after it opened. A
fixture's trigger array is the *player's* history - case 4821 carries twenty
going back to July 2025 against a case opened in August 2026 - so the oldest
entry is not necessarily the initiating one. The modal still shows the full
history, deliberately; only the table filters.
