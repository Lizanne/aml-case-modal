# AML Case modal — developer handoff

## 00 · Overview

### What this covers

The AML Case panel for the Manual Core epic: every state, the rules that govern
them, the components they are built from, and the edge cases found while
prototyping.

**Out of scope, owned elsewhere:** the create case modal, the AML cases table on
the player profile, the widget ticket itself, and snapshot report content (a
future epic). This panel proves the snapshot generation stamp, the resync
control and the historical view only.

### Sources, and which one wins

| Source | Holds | Precedence |
|---|---|---|
| The Angular prototype in this repo | States, interactions, measurements | **Highest.** Newer than the designs; several rules were found here |
| Figma — page `Round 2 - AML Case Modal`, section `[Web Desktop]`, frames 00a–13 | Visual reference, and the Notes card under each frame carrying the decision, the outcome and what was rejected | Rationale and intent |
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
> The eleven open questions in [09-unresolved.md](09-unresolved.md) come from
> Figma, which carries the current set.

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

### The sixteen states

Frames run left to right in Figma, each with a Notes card directly beneath.

| # | State | Built |
|---|---|---|
| 00a | Unlocked, no owner | yes |
| 00b | Locked to another agent, with the force-unlock confirmation | yes |
| 01 | Locked to you, nothing recorded | yes |
| 02 | Recording an outcome, with attachment errors | yes |
| 02b | Recording clean, actions in reverse order | yes |
| 03 | Both required actions recorded | yes |
| 04 | Viewing a historical snapshot | yes |
| 05 | Adjust severity dialog | yes |
| 06 | Submit decision dialog | yes |
| 07 | Resolved, read-only | yes |
| 08 | Add action menu open | yes |
| 09 | Dual modals — SG alert beside AML case | yes |
| 10 | Triggers expanded with a new arrival | yes |
| 11 | Past AML cases tab | yes |
| 12 | Starred commentaries tab | tab built; no dedicated dev-switcher state |
| 13 | Case timeline tab | tab built; no dedicated dev-switcher state |

**Note on 12 and 13.** The prototype's dev state switcher stops at `11`. The
Starred and Timeline tabs are fully built and reachable inside the player-info
panel in any unresolved state, but there is no `?state=12` or `?state=13`
shortcut. If you want them as first-class review states, they need adding to
`aml-case-modal/src/app/core/scenarios.ts`. Their specifications are complete in
[03-components.md](03-components.md) and
[04-states-and-interactions.md](04-states-and-interactions.md).

### Document map

| File | Contents |
|---|---|
| [01-layout.md](01-layout.md) | Panel geometry, the two columns, pinned vs scrolling regions |
| [02-tokens.md](02-tokens.md) | Every token by name, what it means, and the rules on use |
| [03-components.md](03-components.md) | Per-component specification, with measurements |
| [04-states-and-interactions.md](04-states-and-interactions.md) | All sixteen states; state tables including inert cases |
| [05-responsive.md](05-responsive.md) | The width-driven layout rules and their thresholds |
| [06-edge-cases.md](06-edge-cases.md) | Draft loss, duplicate controls, empty states, overflow |
| [07-motion.md](07-motion.md) | Panel choreography, reduced motion, notices and snackbars |
| [08-accessibility.md](08-accessibility.md) | Semantics, keyboard, screen reader, contrast, and the testing checklist |
| [09-unresolved.md](09-unresolved.md) | The eleven open questions with their build assumptions, and every place the code and the designs disagree |

### Verification status

The prototype ships ten Playwright verification suites
(`npm run verify:*` in `aml-case-modal/`). Nine pass. `verify:layout` runs 477
checks with nine failures, every one of which is either a design decision still
open or a stale assertion — all are itemised in
[09-unresolved.md](09-unresolved.md) rather than left for you to rediscover.
