# 09 · Unresolved

Two kinds of thing live here, and they are not the same kind of thing:

1. **Open questions** — eleven places where the original spec is silent or
   contradicts itself, and five more from the Risk assessment change of
   2 Nov 2026. Each has a **build assumption**. The prototype is built to the
   assumption and flags it in a code comment. These are not settled decisions
   and must not be read as such.
2. **Disagreements between the code and the designs** — places where the two
   sources say different things. Nothing here has been silently reconciled.

---

## Part one — the open questions

Verbatim from the amber card at the far left of *Round 2 — AML Case Modal*,
with what the prototype actually does.

### 1 · `IDLE` status

**The question:** `IDLE` appears **once** in the epic as a header value. Nothing
creates it and nothing ends it.

**Built as:** it does not exist. `CaseStatus` is `OPEN | RESOLVED` only.

**Needs:** define it, or cut it from the epic.

### 2 · A new trigger arriving mid-draft — **closed 2 Nov 2026**

**Built as:** the draft is **untouched and Save stays available**. A new
trigger blocks nothing any more; it is a workflow entry, and the next Resync
picks up what it changed. See [11-risk-assessment.md](11-risk-assessment.md).

The old answer (draft kept, Save withheld until Resync) is superseded.

### 3 · Force unlock and the other agent's draft

**Built as:** the other agent's unsaved draft is **lost**, and the confirmation
dialog says so.

**Not built:** the owner whose lock is taken also needs a **live notification**.
There is no mechanism for it in this prototype.

> This is the one open question with a missing piece of product, not just a
> missing decision.

### 4 · Historical snapshot placement — **superseded 2 Nov 2026**

There is no historical snapshot any more: the Risk assessment shows current
values only, `View snapshot` is gone from every outcome card, and what a
resync changed is recorded on the `Resync completed` entry. The selected-card
treatment (`--color-background-info` fill) moved to the Risk assessment row
whose form is open.

### 5 · Attachment size cap

**Built as:** 10 MB per file, held in **one named constant** —
`ATTACHMENT_MAX_MB` in `core/models.ts`, with `ATTACHMENT_MAX_KB` derived from
it.

**Needs:** confirmation of the number. The constant is the only place to change
it; the error copy interpolates from it.

### 6 · New trigger arrival behaviour — **superseded 2 Nov 2026**

**Built as:** no highlight at all in the case modal. The arrival is an event
row in the workflow with a warning icon, and nothing forces a refresh. The amber
row and the `New` badge remain in the trigger strip component for the cases
table's popover, which still flags arrivals.

### 7 · Extras and Submit

**Built as:** once every required item is done - the required assessments,
Player contact and Finalize risk assessment - extra actions **never re-gate
Submit**. An open draft does not disable it either.

**Status:** built as assumed. Not confirmed.

### 8 · Case stage visibility outside the modal

**The question:** compliance and player protection both want to see case stage
without opening the case. That needs a **case list view this epic does not
contain**.

**Built as:** a stage line ships in the header. The list view is a **logged
recommendation**, not scope.

### 9 · Export for audit or a GC assessment

**Not in this epic.** The constraint that follows from it: nothing built here
may drop data an export would need. Timeline entries, commentaries, every
assessment and resync as workflow entries, the finalized section table and
severity-at-resolution are all retained for that reason.

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

### 12 · Document requests has no risk rule

The PDF's *Risk If* column reads `NOte after`. **Built as:** always manual -
the field opens as Action required on every case, and only an agent's
assessment moves it. **Needs:** the rule, or confirmation that it stays manual.

### 13 · Open source searches has no value

The PDF's mock value is `???`. **Built as:** the line `No searches recorded`.
**Needs:** what the field should show, and where it comes from.

### 14 · Is Contact player required on every case?

The 2 Nov notes name Contact player as an existing required action and add to
the list rather than removing it. **Built as:** required on every case,
alongside the assessments and Finalize. **Confirmed as far as the handover
specifies;** the notes do not say whether every AML case needs it.

### 15 · What a finalized assessment allows

The notes say only that the case cannot close until Finalize is done. **Built
as:** Finalize locks the assessment - statuses stop being clickable and Resync
is unavailable - because a resync after finalizing could reopen Action required
fields under a finalized summary, and nothing says what should happen then.
**Needs:** confirmation, or the rule for resync-after-finalize.

### 16 · The section list

The PRD names four assessed groups (verification, login and geography, payment
methods, deposit and transaction behaviour). The PDF, and the build, have six:
those four plus Product & gameplay analysis and Open source intelligence - and
the PRD itself requires an open source searches assessment, which needs a
section to live in. **Built as:** the PDF's six. **Needs:** the PRD list
confirmed as incomplete, or two sections cut.

Also noted, not built: the PDF's *Link to player doc reqs section* (no
documents section exists in the prototype), currencies other than GBP (the
values are mock text), and the PRD's suggestion that field tooltips could be
replaced by separate documentation (the tooltips are built; the definitions
live in one file, `core/risk-assessment.ts`, which could feed a document).

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

### D · Minimised bar icon buttons are 32px, against a 44px assertion ⚠️

`verify:layout` asserts a 44px hit target on the bar's controls. They are now
**32 × 32**, having gone 44 → 40 (when a stale `background-clip` inset was
removed) → 32.

The hover tint fills the button exactly, so paint and target agree — but the
target is **12px short of the 44px guidance**, and it is the only way to restore
or dismiss a minimised panel. This is the one open item here with an
accessibility cost rather than a documentation cost.

**Decide:** raise the buttons to 44 and keep the glyph at 16, or accept 32 and
retire the assertion deliberately rather than leaving it red.

> The companion right-edge-clearance check now **passes**: the bar's padding
> moved to `10px 16px`, which is the 16px clearance it was asking for.

### E · SG widget tile glyph is amber, not info

`verify:layout` expects the SG type tile's glyph to take
`--color-foreground-on-info` (`#1E3A8A`) on the info tint. It renders
`#78350F` on `#FEF3C7` — the amber pair, which is `--sev-aml` / `--warn`.

Either the tile should be info-blue and the CSS is wrong, or SG is meant to
carry a severity tint and the assertion is. **Not reconciled.**

> This one was invisible until now: the block asserting it sat behind two
> `getComputedStyle(null)` crashes, so the suite died before reaching it. Both
> crashes were caused by the *"no widget renders while its panel is open"* rule
> — the blocks read widget tiles from states whose panels are open, where no
> widget exists. They now close the panel first, and the suite runs to the end
> again: 492 checks against the 477 it managed while dying early.

### F · Widget count badge

`verify:layout` expects a count badge on the widget that the built widget does
not render. Not reconciled — the badge may have been dropped deliberately when
the widget row was reworked, but there is no note recording that.

### G · `PROTOTYPE.md` is superseded, and should be treated as such

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
| States 00a – **10** | 00a – **15** |

> **Recommendation:** either regenerate it from this handoff or mark it
> historical at the top. As it stands it is a live document that will mislead.
>
> **Except its Risk assessment material.** Business rules 4 and 10–14, the
> "Risk assessment" section, the states list and open questions 2 and 6–9 in
> `PROTOTYPE.md` were rewritten on 2 Nov 2026 alongside the build and agree
> with it. Section [11](11-risk-assessment.md) is still the fuller account.

### H · A stray constant comment

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

## Figma's 12 and 13 have no dev-switcher entry; the switcher's 12–15 are something else

`core/scenarios.ts` defines **eighteen** scenarios, 00a through 15. Switcher
states **12–15 are the Risk assessment flow** (resync confirm, resyncing, resync
completed, finalize), added 2 Nov 2026. Figma's frames **12 (starred
commentaries)** and **13 (case timeline)** are tabs, reachable from any
unresolved state, with no switcher entry of their own.

Consequence: `verify:a11y` sweeps the eighteen switcher states; the two tab
bodies are covered incidentally, not directly.

**Recommendation:** add two scenarios that land on those tabs, numbered so they
do not collide with 12–15.
