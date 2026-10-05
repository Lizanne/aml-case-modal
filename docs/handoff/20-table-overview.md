# Global AML Cases table — developer handoff

## 20 · Overview

### What this covers

The Global AML Cases table and the queue pages around it: the two tabs, the
sidebar entries that lead to them, the seven columns, the three popovers, the
empty state, and the data flow that keeps the row, the popovers and the case
modal telling one story. Sections 20–24.

**Out of scope, owned by the modal handoff (00–10):** the AML Case panel itself,
its states 00a–13, its components. The table reuses two of them unchanged —
`trigger-strip` and `ui-pill` — and the reuse rules are in [22](22-table-popovers.md).

### Sources, and which one wins

| Source | Holds | Precedence |
|---|---|---|
| The Angular prototype in this repo — `aml-case-modal/src/app/components/cases-table.component.ts` and the two popover hosts | Every measurement, state and interaction | **Highest.** Several rules were found here, not designed |
| `PROTOTYPE-TABLE.md` | The brief, the business rules (§7), the scoring matrix (§13) and the decision log (§14, D-05 to D-18) | Intent and rationale. Where it disagrees with the code, §14 says why |
| `aml-case-modal/verify/table.mjs` and `verify/stress.mjs` | What is asserted, with the numbers | Proof. A value in this document that a verifier checks says so |
| Product Priority Scoring Matrix (Rafal, Aug 2026) and his Work rules (2 Oct 2026) | The scoring tiers; the required action set | Source of record for those two things |

### Where it lives

- Route `?view=cases&tab=active|compliance`. The sidebar entries **AML cases**
  and **Compliance AML cases** (under SG Snoozes) open the two tabs; their
  counts are live from the store. Below 1024px the sidebar is hidden and the
  table is reached by URL only — a known gap, see [09](09-unresolved.md).
- Deep link into the modal: `?case=<id>`. `Open case` on a row opens it in a
  new tab. The modal, opened this way, shows the case's **own** state — its
  lock, its status, and what has been recorded on it — not a demo frame.
- Dev switcher: `?tstate=T-00|T-01|T-02|T-03|T-04|T-08|T-09|T-10` (the gaps
  are retired frames, D-13 and D-17). `?fixture=stress` loads the edge-case
  collection, D-18.

### One truth, three views

```
mock-cases.json ──► CasesStore.cases (the collection)
                        │  reads                      writes back
        table rows ◄────┤                                 ▲
   trigger-popover ◄────┤  CaseStore.loadCase(id) ──► modal
      work-popover ◄────┘  CaseStore.saveDraft()  ─────────┘ recordWork()
```

The table reads the collection. The modal reads one case from it through
`loadCase()`, which also seeds its Timeline from what the collection says has
been recorded; recording an action in the modal writes back through
`recordWork()`. The two popovers read the same record the row reads (Work
directly; Triggers through a private `CaseStore` loaded by the same
`loadCase()`). So a Work item completed in the modal moves in the row, a custom
action increments `+N`, and a trigger that arrives appends to an open popover —
by construction, not by a sync.

**Required actions** are the work types flagged `required` in `workTypes`, in
array order: Contact player, Open source searches, EDD report. Fixed for now
(Rafal, 2 Oct). Everything else — notes, a second contact — is custom.

### Page frame

| Element | Spec |
|---|---|
| Title | `h1`, from `QUEUE_COPY`: **AML cases** / **Compliance AML cases**. An info icon beside it links to the documentation (new tab), tooltip *AML cases documentation*, accessible name *AML cases documentation, opens in new tab*. 16px glyph in a 24px hit area |
| Strapline | *Open cases across the estate. Pick one, lock it, and open it.* / *High-sensitivity cases requiring compliance review. Pick one, lock it, and open it.* |
| Tabs | Material tab group, **not stretched** (`mat-stretch-tabs=false`), `animationDuration 0ms`. Order: Active (N), Compliance (N), Idle, Archive. Idle and Archive are `[disabled]` — Material's own treatment, no tooltip (D-17). Counts are live |
| Refresh | Icon-only stroked button, top right of the tab bar, tooltip and name *Refresh table*. A fallback: the store is the update path. Spins while refreshing; under reduced motion it pulses instead |
| Table region | `role="region"`, `aria-label="Cases table"`, `cdkScrollable` on the scroll container — this is what lets the popovers close on scroll |
| Empty queue | One sentence, `p.cases__empty`: **No open AML cases** / **No open Compliance AML cases**. 14/20, `--foreground-secondary`, centred, 48px above and below. No link, no control (D-17) |

### Tokens this surface introduced

All declared on `:root` in `styles.scss`; see [02](02-tokens.md) for the rest.
`--foreground-primary` and `--foreground-secondary` replaced `--ink`,
`--ink-2` and `--ink-3` on 2 Oct (the two secondary tones had converged on one
value).

| Token | Value | Used for |
|---|---|---|
| `--background-tertiary` | `#F4F4F5` | Neutral pill ground; the held-by-another lock disc at rest |
| `--surface-hover` | `var(--background-tertiary)` | Row hover; the count buttons' hover |
| `--surface-subtle` | `#E4E4E7` | Currently unused (was the held disc) |
| `--foreground-subtle` | `#6F6F78` | The count buttons at rest |
| `--border-warning-subdued` / `--border-success-subdued` / `--border-negative-subdued` | `#FDE68A` / `#BBF7D0` / `#FECACA` | SLA pill borders |
| `--danger-deep` | `#7F1D1D` | SLA breached text and dot |

Two literals-in-disguise remain and should become tokens: `var(--colors-alpha-alpha-soft-hover, rgba(0, 0, 0, 0.06))` on the held disc's hover, and `var(--colors-background-background-tertiary, #f4f4f5)` in the widgets component. Neither variable is defined; the fallbacks paint.

### Verification

`npm run verify` runs thirteen suites. For the table: `verify:table` (~110
checks), `verify:cases-store` (the rules, no browser), `verify:stress` (the
edge cases, D-18), and `verify:a11y` and `verify:mobile` cover it alongside the
modal. Two checks are **left failing on purpose**, each with a note in the file
saying why relaxing it would decide a design question by default — see
[23](23-table-decisions.md), "Open".
