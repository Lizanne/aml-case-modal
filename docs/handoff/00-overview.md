# AML Case modal — developer handoff

## 00 · Overview

### What this covers

The AML Case panel for the Manual Core epic: every state, the rules that govern
them, the components they are built from, and the edge cases found while
prototyping.

**Out of scope, owned elsewhere:** the create case modal, the AML cases table
(sections [20](20-table-overview.md)–[24](24-table-accessibility.md) of this
set), and the widget ticket itself.

> **Changed 2 Nov 2026 — Risk assessment.** The left panel's Snapshot tab
> became the **Risk assessment**: grouped player information with a risk on
> every field that can carry one, assessed by the agent through the workflow,
> resynced on demand, and finalized before the case can close. A new trigger
> no longer blocks anything. Section [11-risk-assessment.md](11-risk-assessment.md)
> is the full specification; sections 03, 04, 06, 07, 08, 09 and 10 were
> updated where the change touched them. Where an older sentence in this set
> still says "snapshot", read it as "risk assessment" and tell us.

### Sources, and which one wins

| Source | Holds | Precedence |
|---|---|---|
| The Angular prototype in this repo | States, interactions, measurements | **Highest.** Newer than the designs; several rules were found here |
| Figma — page `Round 2 - AML Case Modal`, section `[Web Desktop]`, frames 00a–13 | Visual reference, and the Notes card under each frame carrying the decision, the outcome and what was rejected. **Predates the Risk assessment**: frames 04 and 10 show the historical snapshot and the amber arrival, both gone | Rationale and intent, except where section 11 supersedes |
| The PRD *AML Case Risk Assessment* and the PDF *Aml Case Report snapshot example - Final Risk Assesment section* | The Risk assessment requirements; the PDF holds the fields, mock values, definitions and risk logic | Requirements for section 11 |
| Figma — handoff section (node `22441:7520`) | The written handoff: Foundations, Flow logic, Interactions and motion, Edge cases, State inventory and open questions | Rationale and intent |
| `PROTOTYPE.md` | The original build brief | **Superseded.** See the warning below |
| Figma frame `22452:30540` (`00a Desktop - Unlocked, no owner`) | Measurements | Cross-checked against code |

Figma's own READ FIRST card states the rule this document follows: *"Where this
document and the prototype disagree, the prototype is newer, it is where several
of these rules were found."*

> **`PROTOTYPE.md` is out of date and should not be used for values.** It
> predates most of the build. Its token block, its layout figures (`1000x820`),
> its trigger-strip description (`2 rows + "+N more" badge`, `max ~10 rows`), its
> attachment rule (`PDF and images only`), its rule 8 (`Adjust severity: always
> enabled`) and its list of six open questions have all been superseded. It also
> points at page `Round 1`. It is useful as history; it is not a specification.
> The eleven original open questions in [09-unresolved.md](09-unresolved.md)
> come from Figma, which carries that set; the five Risk assessment questions
> come from the 2 Nov 2026 change.

### How to use this document

- Tokens are referenced **by name**, never by raw value. The values live in
  `aml-case-modal/src/styles.scss`; see [02-tokens.md](02-tokens.md).
- Control sizes are expressed as **Angular Material density tiers**, not
  hand-set heights. Footer and dialog actions sit at default (40px); in-card and
  in-strip controls at the smallest tier (32px).
- Every state table names the **inert** cases explicitly. Several components in
  this panel are deliberately non-interactive, and the default assumption when
  reading a spec is that a row or a badge takes hover. Here, several must not —
  see [04-states-and-interactions.md](04-states-and-interactions.md).
- Where a rule exists because of a decision, the **why** is given in one line.
- Anything marked an open question has a build assumption stated. Build to the
  assumption and flag it in a code comment rather than inventing a different
  answer.

### The states

The dev switcher (`?state=`) reaches every one of these. The numbering is the
switcher's; Figma's frames 00a–11 match it, and Figma's 12 and 13 (Starred,
Timeline) are tabs reachable from any unresolved state rather than switcher
states. Switcher states 12–15 are the Risk assessment flow, added 2 Nov 2026.

| # | State | Built |
|---|---|---|
| 00a | Unlocked, no owner | yes |
| 00b | Locked to another agent, with the force-unlock confirmation | yes |
| 01 | Locked to you, nothing recorded — four required items | yes |
| 02 | Assess risk - Open source searches, with attachment errors | yes |
| 02b | Recording Player contact first, reverse order | yes |
| 03 | Everything required done, risk assessment finalized | yes |
| 04 | Overriding a risk from the Risk assessment | yes |
| 05 | Adjust severity dialog | yes |
| 06 | Submit decision dialog | yes |
| 07 | Resolved, read-only | yes |
| 08 | Add action menu open | yes |
| 09 | Dual modals — SG alert beside AML case | yes |
| 10 | New trigger arrived, triggers expanded | yes |
| 11 | Past AML cases tab | yes |
| 12 | Resync confirm | yes |
| 13 | Resyncing overlay | yes |
| 14 | Resync completed, two risks changed | yes |
| 15 | Finalize risk assessment | yes |
| — | Starred commentaries tab (Figma 12) | tab built; reach it from any unresolved state |
| — | Case timeline tab (Figma 13) | tab built; reach it from any unresolved state |

### Document map

| File | Contents |
|---|---|
| [01-layout.md](01-layout.md) | Panel geometry, the two columns, pinned vs scrolling regions |
| [02-tokens.md](02-tokens.md) | Every token by name, what it means, and the rules on use |
| [03-components.md](03-components.md) | Per-component specification, with measurements |
| [04-states-and-interactions.md](04-states-and-interactions.md) | Every state; state tables including inert cases |
| [05-responsive.md](05-responsive.md) | The width-driven layout rules and their thresholds |
| [06-edge-cases.md](06-edge-cases.md) | Draft loss, duplicate controls, empty states, overflow |
| [07-motion.md](07-motion.md) | Panel choreography, reduced motion, notices and snackbars |
| [08-accessibility.md](08-accessibility.md) | Semantics, keyboard, screen reader, contrast, and the testing checklist |
| [09-unresolved.md](09-unresolved.md) | The open questions with their build assumptions (eleven original, five from the Risk assessment), and every place the code and the designs disagree |
| [10-button-colours.md](10-button-colours.md) | Every button family, every state, measured with the state layer composited, with contrast |
| [11-risk-assessment.md](11-risk-assessment.md) | The Risk assessment: fields, statuses, Resync, Assess risk, Finalize, the required list, and the rules behind them |

### Verification status

The prototype ships fourteen Playwright verification suites
(`npm run verify` chains them, in `aml-case-modal/`). `verify:risk` is the
Risk assessment suite: it walks the whole flow through the real controls - a
trigger arriving, Resync with its confirm and overlay, the three resync rules,
assessing from a status, overriding, Finalize, close - plus the draft guard,
focus return and the open-row mark. Twelve suites pass. The two that do not
fail only on items that are open decisions, itemised in
[09-unresolved.md](09-unresolved.md): three starred-row checks in
`verify:layout` (disagreement B) and one trigger-count check in
`verify:table` (the table set).
