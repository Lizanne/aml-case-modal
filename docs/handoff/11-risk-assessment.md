# 11 · Risk assessment

Added 2 Nov 2026. This section replaces everything the earlier sections said
about the Snapshot tab, the out-of-sync state and View snapshot. Where it and an
older sentence disagree, this one is current.

**Sources:** the PRD *AML Case Risk Assessment* (requirements), the PDF *Aml
Case Report snapshot example - Final Risk Assesment section* (fields, mock
values, definitions, risk logic) and the 2 Nov change notes (resync, trigger
and finalise behaviour). The prototype is newer than all three and is where
the draft guard, the focus rules and the open-row mark were found.

**Figma:** file *AML Case Modal*, page 🟢 Local Components, frame
`AML / Risk assessment` (node `22922:2377`), built 2 Nov 2026. Component
sets: Risk status `22926:1107`, Risk assessment row `22927:1208`, Section
band `22928:1151`, Summary line `22929:1156`, Section risk row `22930:1155`,
Section risk table `22930:1156`, Resync dialog `22931:1187`, plus the nine
Material icons as `Icon / Risk / *`. Colours are bound to the Style Guide
library's negative, success and warning tokens, which are the code's pill
tokens hex for hex. The Assess risk form is not drawn - it is the file's
record form with the radio group added.

**Spec sheets:** one per component - anatomy, variants, tokens, motion,
accessibility, do/don't - generated from the code, in two places that say the
same thing. In Figma, frame `AML / Risk assessment spec` (node `22922:3128`,
next to the components): Risk status `22936:1406`, Risk assessment row
`22937:1290`, Section band `22939:1378`, Summary line `22939:1631`, Section
risk table `22940:1435`, Resync dialog `22940:1740`. As a page,
[risk-assessment-spec.html](risk-assessment-spec.html), published at
<https://claude.ai/artifact/G3osxKSAq7WJvf8Yj14XNb>. Where a sheet and this
document disagree, this document is older; where either disagrees with the
code, the code wins.

---

## Purpose

The left panel stops being informational. It shows the player's information
grouped by section, and on every field that can carry a risk it shows the
risk the system found. The agent assesses or overrides those risks through
the workflow, resyncs the values on demand, and finalises a section-level
summary. **Only a case with a finalised risk assessment can be closed.**

A new trigger arriving no longer blocks anything. It is written into the
workflow, and the next Resync picks up what it changed.

---

## Where things live

| Thing | File |
|---|---|
| Fields, sections, definitions, risk logic, both generations of mock values | `core/risk-assessment.ts` |
| Derived state and every command (`riskFields`, `requiredActions`, `assessRisk`, `requestResync`, `confirmResync`, `completeResync`, `resyncDiff`, `saveDraft`) | `core/case-store.ts` |
| The tab | `components/risk-assessment.component.ts` |
| The status label / button | `components/risk-status.component.ts` |
| The finalise table | `components/section-risk-table.component.ts` |
| The confirm | `components/resync-dialog.component.ts` |
| The form's three variants | `components/record-form.component.ts` |

**Nothing about the assessment is stored field by field.** `riskFields` is
derived: the current generation supplies values and the system's risk, then
the stream is replayed in order - an assessment outcome sets a field's status,
a resync entry sends the fields it names back to Action required. A seeded
stream and a recorded one therefore produce the same panel, and the panel
cannot disagree with the workflow beside it.

---

## The data

Seven sections, in the PDF's order, 24 fields:

| Section | Fields | Assessed? |
|---|---|---|
| Account information | Pending withdrawals, AML risk rating history, Global affordability, Max limits, Registration date, Personal detail changes | **No** - informational, no status, not in the finalise table |
| Verification risks | Employment & occupation, Latest fraud scores, Verification result, **Document requests** (manual), Linked accounts | yes |
| Login & geography risks | VPN usage, High-risk country login | yes |
| Payment methods | Active payment methods, Name mismatch | yes |
| Deposit & transaction behaviour | Stacking deposits without betting, Multi-method deposits, Withdrawing without betting, Stakes-to-deposit ratio, Deposit spike | yes |
| Product & gameplay analysis | Roulette max stake, Roulette no financial risk stakes, Product mix shift (30d) | yes |
| Open source intelligence | **Open source searches** (manual) | yes |

Labels are the PDF's in sentence case. A field's value is a list of lines;
every mock value in the PDF is carried, one line per bullet.

**Two fields are always manual** - Document requests and Open source searches.
The system has no rule for them, so they open as Action required on every case
and are required assessments from the start.

> ⚠️ The PRD lists four assessed sections and omits Product & gameplay and Open
> source intelligence. The build follows the PDF. Open question 16.

**Two generations of values.** The case opens on generation 0. A trigger
arriving queues generation 1; the next resync swaps it in. Generation 1 is
authored to exercise every resync rule at once:

| Field | Change | Resync outcome |
|---|---|---|
| Pending withdrawals | value only (informational) | value replaced |
| VPN usage, Active payment methods | value only, risk unchanged | value replaced, status kept |
| Latest fraud scores (score 112), Deposit spike (1) | value **and** risk | value replaced, status → Action required, joins the required list |
| everything else | none | nothing |

---

## Visual specification

### The tab

First tab of `player-info-panel`, labelled **Risk assessment**. Resolved cases
show Risk assessment and Timeline only. The body keeps the panel's `16px 20px`
padding (16px sides on narrow).

### Header

| Element | Spec |
|---|---|
| Container | `min-height: 40px`, `gap: 12px`, space-between - the old snapshot header's geometry, kept so the top of the panel does not move |
| `Generated` label | 12/16, `--foreground-secondary` |
| Stamp | 14/20, 600, `--foreground-primary`, `tabular-nums`. `riskGeneratedAt`: the fixture's stamp, or the moment the last resync completed |
| Resync | `mat-stroked-button`, smallest density (32), `0 16px`, 16px `sync` glyph. **Hard right, always present on an open case.** Absent once resolved |
| Summary line | Under the header, 12/16 `--foreground-secondary`, tabular figures: `2 to assess · 10 flagged · 6 no risk`. `N to assess` is a text-link button (`--link`, 600, underline on hover) that scrolls the first Action required row to just below its section band (`scroll-margin-top: 40px`) and focuses its Assess button; with none left it reads `Nothing to assess` |
| Finalised line | Below the summary once Finalise is recorded: 16px outlined `task_alt`, `Finalised by <agent> · <stamp>`, 14/20 `--success` |

### Sections and rows

| Element | Spec |
|---|---|
| Section band | The title is a **full-bleed band**: `--background-tertiary` (#F4F4F5) fill to the panel edges (`margin: 0 -20px; padding: 8px 20px`, 16 narrow), 1px `--line` on top, 24px (`--lds-core-spacing-6`) of clear space above. 14/20 (the field label's size, 20 Nov 2026), 600, uppercase, `letter-spacing: 0.04em`, **`--foreground-primary`**. `position: sticky; top: 0` inside its section, so the current section's name holds the top of the scroll area until the next band pushes it off |
| Account information | **Collapsed by default.** Its band holds a disclosure button - `ACCOUNT INFORMATION · 6 FIELDS` then a trailing chevron, so its title starts on the same gutter as every other band - `aria-expanded`, `aria-controls`. Open, its six rows render like any other section. The state lives in the store (`accountInfoExpanded`) so a reflow keeps it; it resets closed with the case |
| Row | `padding: 10px 0`, 1px `--line` between rows, none after the last |
| Row head | flex, `gap: 4px`, `min-height: 24px`: label, info button, then the status pushed right by `margin-left: auto` with 8px left padding |
| Label | 14/20, 600, `--foreground-primary` |
| Info button | 24 × 24 circle, 16px outlined `info`, `--foreground-secondary`; hover `--colors-alpha-alpha-soft-hover` and primary ink; **hit area 40 × 40** via a `::before` inset -8px; `cursor: help` |
| Value lines | 14/20, `--foreground-secondary`, `tabular-nums`, `overflow-wrap: anywhere`, one `<span>` per line in a column |
| Assessed line | 12/16, `--foreground-secondary`: `Assessed by <agent> · <stamp>`. Only on a field an agent has assessed |

### Section links

Three fields carry more than a row can show, so the row shows what the risk
rule needs and links to the player section with the rest (18 Nov 2026):

| Field | Row shows | Link |
| --- | --- | --- |
| Document requests | Each request: id, type, state | `Documents` |
| Linked accounts | The count, then counts by link type: `1 PAR · 1 Similar details · 0 Duplicate` (the shape of the risk rule) | `Linked accounts` |
| Personal detail changes | What changed and when | `Changes` |

The link is the last line of the value column: `--link`, 600, 14/20, a bare
word with **no icon** (20 Nov 2026). It opens the player's list on the page
**behind the modal, in the same tab**, so a new-tab glyph would be wrong, and
the row's other links (`Change`, `Assess risk`) carry no glyph either. The
link text is its accessible name. Hit area 40px tall (8 up into the value gap,
12 down into the row padding). The routes in the prototype are placeholders
(`/players/<id>/documents`, `/duplicate-links`, `/details`) and the press does
nothing there.

**Figma:** the row component has `Show link` and `Link` properties; the
story frames US1-US7 and US10 show the link on Document requests and Linked
accounts.

### The status — `risk-status`

Three signals, never colour alone: a tinted fill, an icon and the word.

| Status | Word | Icon | Fill / rim / ink |
|---|---|---|---|
| `risk` | Risk flagged | `flag` | `--danger-bg` / `--border-negative-subdued` / `--danger-deep` (#7F1D1D, label and icon) |
| `no-risk` | No risk | `check_circle` | `--success-bg-subtle` / `--border-success-subdued` / `--success` |
| `action-required` | Action required | `help_outline` | `--warn-bg` / `--border-warning-subdued` / `--warn` |
| `informational` | - | - | **not rendered** |

Geometry: 24 tall, `0 8px`, radius 999, 12/16 600, `gap: 4px`, 14px icons.
Measured contrasts are in [10-button-colours.md](10-button-colours.md).

> **Why these colours and no others:** they are `ui-pill`'s danger, success
> and warn tones with the subdued rims its dotted form wears. A status is the
> same red, green or amber it is in the case header and the cases table, so
> the Risk assessment adds no colour of its own. An outlined No risk and two
> hover mixes were tried and dropped for that reason.

**Always a label.** `risk-status` is a `<span>` everywhere - the row, the
chip bar, the placeholder, the outcome card, the finalise table. It is never
pressable.

**The row's action sits after it:**

| Action | When | Build | Name |
|---|---|---|---|
| **Assess** | the field is Action required | `mat-button` (text), 32 tall, no ripple, `scale(0.96)` on press; label and state layer in `--link` (#1D4ED8) - the "2 to assess" jump's ink, the same action | `Assess <Field>` |
| **Change assessment** | the field is Risk flagged or No risk | `mat-icon-button`, 32 × 32, 18px `edit` in `--foreground-secondary`, primary on hover; tooltip `Change assessment` | `Change assessment of <Field>` |

Both sit in one right-aligned slot, 64px min, after the pill, so every pill
ends on the same vertical line whichever action follows it. Both are pulled
back 4px top and bottom so the head keeps its 24px line and rows do not grow,
and both take a 40px hit area through `::before`. They exist only while
`canAssessRisk` is true, and the open row's slot is empty - its form is
already up, and `Assessing` says so.

> **Why the action is a button beside the pill, and not the pill:** a pill is
> how this product states a fact - severity, SLA, the chip bar. Once the
> status took `ui-pill`'s colours, the only thing left saying "press me" was
> a 14px pencil at 70%, and the status read as a tag. One shape with two
> meanings is the same mistake as pills used as the form's radios. The pill
> states; the button acts, in the product's button vocabulary. A pill with a
> dropdown chevron was rejected too: a chevron promises a menu, and this
> opens a form.

### The open row

While a field's Assess risk form is open in the workflow, its row is marked:

| Element | Spec |
|---|---|
| Row | `--color-background-info` fill, bleeding into the body's gutter (`margin: 0 -20px`, `padding: 10px 20px`; 16px narrow) so the tint reaches the panel edges while the content stays on the shared gutter |
| `Assessing` | 12/16, 600, `--color-foreground-on-info`, after the label |
| Semantics | `aria-current="true"` on the row |

Cleared on save or cancel. Set whether the form was opened from the status or
from the placeholder in the workflow.

> **Why this treatment:** it is the one the viewed-snapshot card used - one
> tinted thing, held while the agent reads the other panel. The PRD asked how
> the left panel should signal which workflow action is open; this is the
> answer, built.

### The tooltip

On the info button, above, `matTooltipClass="ra-tooltip"`: `white-space:
pre-line`, left-aligned, `max-width: 280px`. Text is the field's definition, a
blank line, then `Risk if: <rule>`; an informational field has the definition
alone. Shows on hover and on **keyboard focus**.

> The PRD suggests separate documentation might do instead of tooltips. Both
> read from the same file; dropping the tooltips is a one-line change.

### The Resyncing overlay

`position: absolute; inset: 0` over the body only - the header stays readable -
`--panel` at 82%. Inside, sticky to the top of the visible area: a 24px
Material spinner (`strokeWidth` 3) and `Resyncing`, 14/20 600. The body is
`aria-busy="true"` for the duration. Spinner hidden under reduced motion.

### The confirm — `resync-dialog`

`dialog-shell`, heading `Resync risk assessment?`. Lead 14/20 600 primary
`Some actions might need to be recorded again.`; detail 14/1.55 secondary
explaining what regenerates and what goes back to Action required. Footer:
text `Cancel`, primary `Resync`. **Initial focus is Resync** - nothing is
lost by confirming, so the primary is the safe default (unlike force unlock).

---

## Interaction specification

### Who can do what

| Control | Condition |
|---|---|
| Click a status (assess / override) | `canAssessRisk` = `canRecord && !isRiskFinalized && !resyncing` |
| Resync | `canResync` = `canAct && !isRiskFinalized && !resyncing`. When false the button is **`disabledInteractive`**: Material's disabled look and `aria-disabled`, but still focusable, with the reason as `aria-describedby` and as its tooltip |
| Finalise | `canFinalize` = no field is Action required. Otherwise the placeholder stays, its button disabled, with the fields left named beneath |
| Submit decision | every required item done, Finalise included |

Resync's reasons, in precedence order: `This case is resolved.` (the button is
absent then anyway), `The risk assessment is finalised.`, `Resyncing.`,
`Another agent holds the lock.`, `Lock the case to resync.`

### A trigger arrives (rule 11, revised)

`simulateNewTrigger()` (the dev button stands in for the feed):

1. The trigger joins the strip - **not flagged**, no amber, no `New` badge.
2. `pendingRegeneration` is set, so the next resync finds generation 1.
3. An event row is appended: outlined `warning_amber` in `--warn`,
   `New trigger added - <type>`, the trigger's detail on line two,
   `System · <stamp>`.
4. A timeline entry: `Trigger added: <type>`.

Nothing else. Recording continues, Save stays enabled, no banner.

### Resync

1. **Press Resync** → `requestResync()` opens the confirm. Cancel changes
   nothing.
2. **Confirm** → `confirmResync()`: dialog closes, `resyncing` is set, the
   overlay goes up, the live region says `Resyncing risk assessment`. Focus
   stays on Resync (it is still focusable).
3. After `RESYNC_MS` (1500) → `completeResync()` applies `resyncDiff(from, to)`:

| Field | Outcome |
|---|---|
| value unchanged | nothing |
| value changed, risk unchanged | the new value replaces the old |
| value **and** risk changed | the new value replaces the old **and** the field goes to Action required, which makes it a required assessment (it stays on the list even after it is assessed again) |
| manual field, value changed | treated as risk changed - there is no system risk to compare, and a new value is itself a reason to look again |

4. `riskGeneratedAt` becomes now. An event row is appended - `Resync
   completed` with `No changes.` or `Updated values: A, B, C. Risk associated
   with A and B changed - manual action needed.` - and a timeline entry `Risk
   assessment resynced`. The live region reads the same sentence.
5. The overlay comes down. **No history is kept on the section.** The entry is
   the record.

A resync with nothing pending runs the whole sequence and writes `No changes.`

### Assess risk

Two ways in, one form:

- **From the status** (left panel): `assessRisk(fieldId)`. If the field is a
  pending required assessment the form takes that placeholder's slot;
  otherwise it is appended to the stream. The workflow is brought forward in
  the segmented layout, the form scrolls into view (`block: nearest`) and the
  note takes focus (not on touch).
- **From the placeholder** (workflow): `Assess` on `<Field> - not assessed`.

The form (see `record-form` in [03](03-components.md)): heading `Assess risk -
<Field>`, note, attachments, then **`Your assessment`**, then the lock
choice, then `Cancel` and `Save assessment`.

**Your assessment is a radio group**, two options stacked like the lock choice
beneath it, labelled with the outcomes - `Risk flagged` and `No risk`, the
words the field's row, its chip and its card will show - so nothing is
translated from a Yes or a No. Radios and not the status pills themselves: a
pill is a label everywhere else in the product, or the way into this form,
and an input that looks like a label is one shape with two meanings.

**Prefill:** a field already at Risk flagged or No risk opens with that radio
chosen, so an override starts from the current call. Action required opens
with neither chosen; the agent must choose.

**Save needs** a note, a Risk answer and the lock choice. A failed attempt
shows `Choose whether this field is a risk.` under the radios.

**On save:** an outcome with `assessment: { fieldId, fieldLabel, risk,
previous }`; the card shows the new status and `Was <previous>` when it
changed; a timeline entry `Risk assessed: <Field> - <Status>`; the field's
status, `Assessed by` line and chip update in the same tick. Open source
searches also completes the table's `Open source searches` work item - the
other assessments and Finalise are modal-only and leave the table untouched.

### The draft guard

`startRecord()` **never replaces a draft that has content** (a note or files).
Any attempt - a status, a placeholder, the Add action menu - leaves the open
form in place, scrolls it into view, focuses its note, and shows
`Save or cancel this draft before starting <title>.` as an info-tinted line at
the top of the form. Starting the *same* action again just reveals the form.

### Focus

| After | Focus goes to |
|---|---|
| Save or cancel of a form opened from a row | that row's action - Assess or Change assessment (its info button if the action is gone, because the save released the lock or finalised the assessment). In the segmented layout the Player info segment is brought back first |
| Save of a form opened from a placeholder or the menu | the new outcome card (`tabindex="-1"`, ring on `:focus-visible` only) |
| Cancel of a form opened from a placeholder | that placeholder's button |
| Cancel of a form opened from the menu | Add action |
| Confirm resync | stays on Resync, through the overlay and after |

### The required list

`requiredActions` in this order:

1. **Every required assessment** - the two manual fields, plus any field a
   resync sent back to Action required. `done` when the field is Risk or No
   risk.
2. **Player contact.**
3. **Finalise risk assessment**, `available` only when `canFinalize`.

**Chips.** An assessment's chip **is its risk status pill** - the same
`risk-status` label the field's row shows, with the field name as the word
(`Open source searches`), the status word on `title`, and `Assess risk -
Open source searches: Action required` as the accessible name. Pending is
amber Action required. Done **recedes** (13 Nov 2026): a neutral pill with
the label in `--foreground-secondary` and a result glyph - `flag` in
`--danger-deep` for Risk flagged, `check_circle` in `--success` for No risk or
any other done item - so a flagged field reads as done, with its risk still
visible. The accessible name ends `done, Risk flagged` / `done, No risk`.
Player contact and Finalise show their labels (`Contact`, `Finalise` narrow).

**Placeholders.** `<Field>` with its Action required pill beside the title +
`Assess` (aria-label `Assess <Field>`); `Contact player - not recorded` +
`Record` (`Record Contact player`); `Finalise risk assessment` + `Finalise`,
disabled with `Assess <A> and <B> first.` beneath while any field is Action
required.

> **Why the chip and the placeholder carry the status:** before this the right
> panel said "pending" and "not assessed" where the left said "Action
> required", and a field the agent had flagged red was a green "done" tick in
> the chip bar. One pill, in three places, is what makes the two panels read
> as one list.

Submit decision's tooltip composes what is left: *assess every field marked
Action required*, *record the player contact*, *finalise the risk assessment*,
joined with commas and "and", then `to submit a decision.`

### Finalise

The form: `Risk by section` - the live section table - then the note, the lock
choice, `Cancel` and `Finalise`. **No attachments.** Save needs the note and
the lock choice, and `canFinalize` still true.

The table: one row per assessed section, **Risk** if any field in the section
is Risk flagged, else **No risk**. Account information is not in it. A real
`<table>` with a visually hidden caption, column headers and a row header per
section.

On save: an outcome `Risk assessment finalised` carrying the table as it
stood; timeline `Risk assessment finalised`; the Finalised line appears under
the header; every status becomes a label; Resync becomes unavailable (`The
risk assessment is finalised.`); Submit decision is enabled once the other
required items are done.

### Reopen

Only the lock holder can reopen, and there is no approval step: one agent
works an assessment at a time, so the lock is the permission. `Reopen risk
assessment` is an **Add action** item, offered only while a finalisation
stands and the case is locked to you (hint: *Make the finalised assessment
editable again*).

The form: the note (*Why is the risk assessment being reopened?*), required,
then the line *The current finalisation stays on record, greyed. Every field
can be changed again, and Finalise risk assessment becomes required before a
decision can be submitted.*, the lock choice, `Cancel` and `Reopen`. **No
attachments.**

On save: the finalisation card stays but is **superseded** - dashed border,
`--page` background, title in `--foreground-secondary`, its table greyed, and
the line `Superseded · reopened by <actor> · <time>` (12/16 600, secondary)
under the meta. A `Risk assessment reopened` card carries the note; timeline
`Risk assessment reopened`. The Finalised line goes, Change and Resync come
back, Finalise risk assessment is Action required again and Submit decision
waits for it. Finalising again makes the new card the current finalisation;
the first stays superseded.

**Figma:** page ↳ Round 3, US10 - `Reopen the risk assessment` (`23142:3669`,
the form on a finalised case) and `Risk assessment reopened` (`23142:5425`).

### Resolved

Tabs reduce to Risk assessment and Timeline. The Risk assessment shows as
finalised: statuses are labels, no Resync, no info-tinted row.

---

## Accessibility

| Element | Treatment |
|---|---|
| Status | A label; its icon `aria-hidden`, the word read as text |
| Assess / Change assessment | Names `Assess <Field>` and `Change assessment of <Field>`; the pencil `aria-hidden`; 40px hit area |
| Info button | Name `About <Field>`; tooltip on hover and focus |
| Open row | `aria-current="true"` |
| Resync, unavailable | `disabledInteractive`: focusable, `aria-disabled="true"`, `aria-describedby` the reason (`#ra-resync-why`, visually hidden). **A press is not ignored:** it shows the reason as the tooltip for 2s |
| Account information disclosure | `<button aria-expanded aria-controls>` inside the section's `<h3>` |
| Summary jump | A `<button>`; focus lands on the first Action required field's status (its info button when the status is a label) |
| Body during resync | `aria-busy="true"` |
| Live region | `role="status" aria-live="polite"`: `Resyncing risk assessment`, then `Resync completed. <summary>` |
| Draft guard line | `role="alert"` |
| Assessment radios | `role="radiogroup"` labelled `Your assessment`; error `role="alert"` |
| Outcome card | `tabindex="-1"`, `aria-label` = its title, ring on `:focus-visible` only |
| Finalise table | `<table>` + `<caption>` (hidden), `th scope="col"`, `th scope="row"` |
| Hit areas | info 40 × 40, status 40 tall, both via `::before` so the visual stays 24 |

Contrast: every status word clears AA on its own fill at rest and hover; the
`Assessing` mark is 8.49:1 on the info tint; the draft-guard line 9.52:1.
Values in [10-button-colours.md](10-button-colours.md).

---

## Content

| Where | Copy |
|---|---|
| Tab | `Risk assessment` |
| Header | `Generated` / `<stamp>` / `Resync` |
| Summary | `<N> to assess · <N> flagged · <N> no risk` · `Nothing to assess` |
| Disclosure | `Account information · 6 fields` |
| Finalised line | `Finalised by <agent> · <stamp>` |
| Status words | `Risk flagged` · `No risk` · `Action required` |
| Open row | `Assessing` |
| Tooltip | `<definition>` ⏎⏎ `Risk if: <rule>` |
| Trigger entry | `New trigger added - <type>` / `<detail>` |
| Resync dialog | `Resync risk assessment?` / `Some actions might need to be recorded again.` / `Every value is regenerated. Where a field's risk changes, it goes back to Action required and has to be assessed again before the risk assessment can be finalised.` / `Cancel` · `Resync` |
| Overlay | `Resyncing` |
| Resync entry | `Resync completed` / `No changes.` or `Updated values: A, B. Risk associated with A changed - manual action needed.` |
| Resync reasons | `Lock the case to resync.` · `Another agent holds the lock.` · `Resyncing.` · `The risk assessment is finalised.` |
| Assess form | `Assess risk - <Field>` / note placeholder `What did you check, and what did you find?` / `Your assessment`: `Risk flagged` · `No risk` / `Save assessment` |
| Assess error | `Choose whether this field is a risk.` |
| Assess card | `<Status>` `Was <previous>` |
| Draft guard | `Save or cancel this draft before starting <title>.` |
| Placeholders | `<Field>` + status pill · `Assess` / `Contact player - not recorded` · `Record` / `Finalise risk assessment` · `Finalise` / `Assess <A> and <B> first.` |
| Finalise form | `Finalise risk assessment` / `Risk by section` / `A section is a risk if any field in it is.` / note placeholder `Summarise the overall risk and what it rests on.` / `Finalise` |
| Finalise card | `Risk assessment finalised` + table (`Section` / `Result`, `Risk` / `No risk`) |
| Timeline | `Trigger added: <type>` · `Risk assessment resynced` · `Risk assessed: <Field> - <Status>` · `Risk assessment finalised` |

---

## Decisions

| Decision | Alternative rejected | Why |
|---|---|---|
| The action is a button beside the status | The status pill as the button; the whole row clickable; a pill with a chevron | A pill that is also a button is one shape with two meanings, and in the pill's colours it read as a tag. The row holds copyable text and an info button. A chevron promises a menu |
| Assess risk is the inline form | A dialog ("modal" in the notes) | Same form as every other record; the player data stays readable while the agent writes, and "exactly the same modal" was read as "the same form" |
| A new trigger is an event row | A banner with an action | It happened to the case, in order, between the things the agent did. The stream is that record; a banner restates it out of sequence |
| Resync always visible, unavailable rather than hidden | Hidden when it cannot run | "Always visible" was the ask; a keyboard user can still reach it and hear why |
| An unavailable Resync explains itself on press | A press that does nothing | `disabledInteractive` leaves the button clickable by design; a press that is silently ignored reads as broken, so it shows the reason the hover gets |
| Account information collapsed by default, in place | Moved to the bottom, or always open | Open, six status-less rows sat between the agent and the first field needing them. Collapsed in place keeps the PDF's order recognisable and puts the work above the fold |
| A summary line with a jump | Nothing above the list | The primary action was the last row of a 2,400px list. The line names it where the eye lands and mirrors the chip bar's count |
| The pill's colours, token for token | An outlined No risk and two hover mixes of its own | One status language across the header, the table and the panel; a colour that exists for one control is a colour nobody can reuse. Hover draws the rim in the ink instead of deepening the fill |
| Section titles are sticky full-bleed bands in primary ink | An uppercase eyebrow 26px above its rows, in secondary ink | Rows sit 21px apart; a 26px gap is not a break, and a title lighter than its row labels does not head them. The band is a break the eye cannot miss, in the panel's own full-bleed vocabulary, and sticky it also says where you are in a 2,000px list |
| Spacing from the LDS core scale | Values picked by eye | `--lds-core-spacing-*` in `styles.scss`, 2 Nov 2026. New spacing comes from the scale; the band uses 24 / 8 / 20 / 1 |
| Resync hidden on a resolved case | Visible, unavailable | Nothing can change by then, and the resolved view removes every control, not just this one |
| Resync asks first, with the primary focused | Danger styling, Cancel focused | Nothing is lost - earlier assessments stay in the workflow. Only re-work is possible |
| No history on the section | A previous-values view | The notes say so; the Resync completed entry is the audit |
| Finalise locks the assessment | Resync allowed after Finalise | A resync could reopen Action required under a finalised summary; nothing says what happens then. Open question 15 |
| Draft guard refuses rather than confirms | Confirm-and-discard | The trigger is in the other panel; revealing the work is the honest answer |
| Assessment chips and placeholders are the field's status pill | A pending ring and a done tick, like the other required actions | "Done" hides whether it was a risk, and green-done beside red-flagged was the two panels disagreeing about one fact. The field name is the chip's word; the full `Assess risk - <Field>: <Status>` is its accessible name |
| Override starts from the current answer | Empty radio every time | The agent is changing a call, so the form should show the call being changed |
| The assessment is a vertical radio group labelled with the outcomes | `Risk · Yes / No` across; then, briefly, the two status pills as a toggle | A Yes had to be translated to a red pill, so the radios say `Risk flagged` / `No risk`. The pill toggle was tried and reverted: a pill is a label or an opener everywhere else, never an input, and the form's other choice is radios - one input vocabulary |
| The form is headed with the field clicked | `Assess risk - Open source searches` for every field (as the example notes read) | Read as a copy slip; the field name is the only thing that distinguishes one assessment from another |

Open questions 12–16 and the items noted but not built are in
[09-unresolved.md](09-unresolved.md).

---

## Testing checklist, this section

`npm run verify:risk` covers all of the following; the list is for a manual
pass.

- [ ] First tab is Risk assessment; no Snapshot anywhere; resolved shows two tabs
- [ ] Account information opens collapsed with its count; the first assessed field is in view without scrolling; the disclosure opens and closes from the keyboard
- [ ] Section titles are full-bleed bands with 24px above; scroll into a section and its band stays at the top until the next one arrives
- [ ] The summary reads `2 to assess · 10 flagged · 6 no risk`; `2 to assess` scrolls Document requests below its section band and focuses its Assess button
- [ ] The three status pills are the ui-pill tints with their subdued rims, and none of them is pressable
- [ ] Locked: Action required rows carry `Assess`, assessed rows a pencil; every pill ends on the same line; the open row's slot is empty
- [ ] Unlocked, finalised or resolved: no Assess, no pencil
- [ ] Unlocked, press Resync: nothing opens and the reason appears as its tooltip
- [ ] Account information shows no status; every other field shows one
- [ ] The two assessment chips are amber Action required pills, the same as their rows; after an assessment the chip reads No risk or Risk flagged, not a tick
- [ ] Every field has an info button whose tooltip shows on **Tab focus**
- [ ] Dev `New trigger`: event row with warning icon, no amber in the strip, no banner, Record still enabled, Resync enabled
- [ ] Resync → confirm → overlay → entry lists the five updated values and the two risks that changed; both fields Action required and on the required list; values replaced, old ones gone
- [ ] Resync again → `No changes.`
- [ ] Click a status: form opens headed with that field, note focused, row tinted with `Assessing`; neither assessment radio chosen and Save disabled until one is; save → status, `Assessed by`, card with `Was …`, focus back on the status, tint gone
- [ ] Override a No risk to Yes → `Was No risk`
- [ ] With a typed note, click another status → the open form is revealed with the guard line, nothing lost
- [ ] Finalise disabled and naming the fields left; enabled once none is Action required; its form has the table and no attachments; the card carries the table
- [ ] After Finalise: statuses are labels, Resync unavailable and focusable with its reason, Submit decision enabled
- [ ] Unlocked: statuses are labels, Resync unavailable with `Lock the case to resync.`
- [ ] Segmented layout: a status brings the workflow forward; save brings Player info back with focus on the status
- [ ] Reduced motion: no spinner, no smooth scroll, no status transition
