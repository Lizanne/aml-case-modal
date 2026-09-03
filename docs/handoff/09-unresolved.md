# 09 · Unresolved

Two kinds of thing live here, and they are not the same kind of thing:

1. **Open questions** — eleven places where the spec is silent or contradicts
   itself. Each has a **build assumption**. The prototype is built to the
   assumption and flags it in a code comment. These are not settled decisions
   and must not be read as such.
2. **Disagreements between the code and the designs** — places where the two
   sources say different things. Nothing here has been silently reconciled.

---

## Part one — the eleven open questions

Verbatim from the amber card at the far left of *Round 2 — AML Case Modal*,
with what the prototype actually does.

### 1 · `IDLE` status

**The question:** `IDLE` appears **once** in the epic as a header value. Nothing
creates it and nothing ends it.

**Built as:** it does not exist. `CaseStatus` is `OPEN | RESOLVED` only.

**Needs:** define it, or cut it from the epic.

### 2 · A new trigger arriving mid-draft

**Built as:** the draft is **preserved**, and Save is blocked with a warn note
until Resync.

**Alternative rejected:** discarding the draft. See
[06-edge-cases.md](06-edge-cases.md) — losing typing silently is the thing this
panel is most careful about.

### 3 · Force unlock and the other agent's draft

**Built as:** the other agent's unsaved draft is **lost**, and the confirmation
dialog says so.

**Not built:** the owner whose lock is taken also needs a **live notification**.
There is no mechanism for it in this prototype.

> This is the one open question with a missing piece of product, not just a
> missing decision.

### 4 · Historical snapshot placement

**Built as:** the left panel swaps to a plain view header, `Back` in the slot
`Resync` occupies, and the source outcome card takes a persistent selected
treatment.

**Status:** this is a **design proposal over spec silence**. It needs sign-off,
not just implementation.

### 5 · Attachment size cap

**Built as:** 10 MB per file, held in **one named constant** —
`ATTACHMENT_MAX_MB` in `core/models.ts`, with `ATTACHMENT_MAX_KB` derived from
it.

**Needs:** confirmation of the number. The constant is the only place to change
it; the error copy interpolates from it.

### 6 · New trigger arrival behaviour

**Built as:** the highlight persists **until resync**, not until it is seen.
Several arrivals before a resync all stay highlighted. Auto-expand happens
**only if the strip was already expanded** — an arrival never forces the strip
open.

### 7 · Extras and Submit

**Built as:** once both required actions are recorded, extra actions **never
re-gate Submit**. An open draft does not disable it either.

**Status:** built as assumed. Not confirmed.

### 8 · Case stage visibility outside the modal

**The question:** compliance and player protection both want to see case stage
without opening the case. That needs a **case list view this epic does not
contain**.

**Built as:** a stage line ships in the header. The list view is a **logged
recommendation**, not scope.

### 9 · Export for audit or a GC assessment

**Not in this epic.** The constraint that follows from it: nothing built here
may drop data an export would need. Timeline entries, commentaries, snapshots
and severity-at-resolution are all retained for that reason.

**Requested:** acknowledgement as a future ticket.

### 10 · Images only — contradicts the epic ⚠️

**The epic's acceptance criteria say PDFs and images. The prototype accepts
images only.**

This is the sharpest of the eleven, because it is a **direct contradiction of a
written acceptance criterion**, not a silence.

**Built as:** images only, throughout — the `accept` attribute, the upload
validation, and the fixtures. The user-facing copy was narrowed further to
**`JPG or PNG only`** in both the hint and the rejection message, so the wording
is now stricter than the validation, which still admits any `image/*` type.

**Needs:** confirmation that the narrowing is deliberate. If it is not, the
revert touches four places plus the fixtures.

> Downstream consequence: there is now exactly **one** attachment fixture, so
> multi-attachment layouts are not reachable from the running app. See
> [06-edge-cases.md](06-edge-cases.md).

### 11 · Severity criteria, for compliance

**The question:** when does a case earn `AML`, `EDD` or `COMPLIANCE`?

**Wanted:** the criteria as **helper text beside the radio options** in the
severity dialog.

**Built as:** no helper text. The radios are unlabelled beyond the severity
name.

### Resolved already

The severity **ranking** and its direction — `AML < EDD < COMPLIANCE`, confirmed
by compliance — and the epic wording correction that came with it. `SEVERITY_RANK`
is the single source; the Escalation / De-escalation badge derives from it and
never from colour.

---

## Part two — where the code and the designs disagree

Each of these is a real difference between two sources. **None has been picked
silently.**

### A · Severity colours are swapped ⚠️ — the significant one

| Source | AML | EDD | COMPLIANCE |
|---|---|---|---|
| Figma handoff card, *Foundations* | **red** | **amber** | violet |
| `styles.scss` | **amber** (`--sev-aml-bg: #FEF3C7`) | **red** (`--sev-edd-bg: #FEF2F2`) | violet (`#EBE8FF`) |

AML and EDD are the other way round in the code from what the Foundations card
states.

This is not cosmetic. The same card also says:

> *"Amber is severity EDD and the warn state, so it is not used for neutral
> counts."*

In the code amber is severity **AML** and the warn state. So the "amber means
these two things" rule holds — but it is attached to a different severity than
the design says.

**Mitigating:** the card is emphatic that *"severity colours identify category
only and never rank"*, and direction is carried by the badge and arrow derived
from `SEVERITY_RANK`. So no ranking information is wrong either way — only the
category-to-hue mapping.

**Not reconciled.** Someone has to say which is right.

### B · The starred commentary row has no severity pill

Figma node `22224:18922` shows a pill on the starred row. The built row is
`who` + right-aligned `at` on line one, clamped `text` on line two — **no pill**.

The Past AML case row *does* carry one (`<ui-pill size="sm">`), which is probably
where the expectation came from.

`verify:layout` still asserts the pill and therefore still fails on it. That
assertion is **correct against Figma and wrong against the build**; it has been
left failing rather than deleted, so the disagreement stays visible.

### C · Pill geometry assertions are test debt, not a defect

Three `verify:layout` checks assert a single pill geometry. `ui-pill` has a
**closed set of two sizes**, deliberately:

| Size | Height | Padding | Type |
|---|---|---|---|
| `md` (panel header) | 24 | `0 8px` | 14 / 20 |
| `sm` (widget and list rows) | 20 | `0 6px` | 12 / 16 |

The Figma card agrees: *"Severity pill has two sizes, small for widget and list
rows, medium for the panel header."*

**The code and Figma agree; the verifier is out of date.** Do not "fix" the
component to satisfy it.

### D · Minimised bar close button, 44px vs 40px

`verify:layout` asserts a 44px hit target on the bar's close control. The bar was
edited from 44 → 40 in commit `cdd0b16`.

The current implementation gives each control **44px of hit area** with the hover
square painted at 40px via `background-clip: content-box`, so the *target* is
compliant and the *paint* is 40. Whether the assertion is measuring the right box
is unresolved. Same for the companion right-edge-clearance check.

### E · Widget count badge

`verify:layout` expects a count badge on the widget that the built widget does
not render. Not reconciled — the badge may have been dropped deliberately when
the widget row was reworked, but there is no note recording that.

### F · `PROTOTYPE.md` is superseded, and should be treated as such

The brief at the repo root is the **older, thinner** source. It disagrees with
both the build and the Figma handoff on:

| `PROTOTYPE.md` says | Actually |
|---|---|
| The old token palette | Superseded — see [02-tokens.md](02-tokens.md) |
| Panel `1000 × 820` | `SOLO_MAX_PX = 1080` |
| Trigger strip: 2 rows + `+N more` | Oldest row, inline divider, newest row |
| Attachments: PDFs and images | Images only (open question 10) |
| Adjust severity always enabled | Gated on `canAct()` |
| Figma page *Round 1* | *Round 2* |
| **Six** open questions | **Eleven** |
| States 00a – **10** | 00a – **13** |

> **Recommendation:** either regenerate it from this handoff or mark it
> historical at the top. As it stands it is a live document that will mislead.

### G · A stray constant comment

`core/models.ts:175` carries an orphaned doc comment —
`/** Widest a single modal gets, per the layout brief (1000x820, resizable). */`
— followed by a blank line, so it documents **nothing**. It sits above
`MODAL_GAP_PX`, and the value it describes (1000) is not the value that shipped
(`SOLO_MAX_PX = 1080`).

---

## Part three — one actual defect found while writing this

`attachment-list.component.ts:201` reads:

```css
width: 20x;   /* invalid — should be 20px */
```

The unit is missing, so the browser drops the declaration and the icon takes its
intrinsic width instead. The three sibling rules at lines 150, 178 and 224 all
read `width: 20px`. **One-character fix, not yet applied** — flagging rather than
folding it into a handoff commit.

---

## States 12 and 13 have no dev-switcher entry

`core/scenarios.ts` defines **fourteen** scenarios, 00a through 11. States **12
(starred commentaries)** and **13 (case timeline)** exist in Figma and in the
build, but are reachable only by clicking their tab from another state.

Consequence: `verify:a11y` sweeps 14 states, not 16. The two tab bodies are
covered incidentally, not directly.

**Recommendation:** add two scenarios that land on those tabs, so the sweep and
the Figma inventory line up.
