# 03 · Components

Every component is an Angular 17 standalone component using signals. State lives
in `CaseStore` (the case) and `WorkspaceStore` (the furniture — which panels are
open, minimised, and how wide each gets).

> **Why two stores:** `CaseStore` owns the case and its rules; `WorkspaceStore`
> owns the windows. The panel's layout mode is then a pure consequence of the
> width it is given — there is no "dual mode" flag anywhere, because dual mode is
> not a mode. It is what you get when two panels are open at once.

---

## `aml-case-modal` — the shell

Owns the layout mode and hosts the severity, decision and resync dialogs.

**Layout:** see [01-layout.md](01-layout.md). Radius `0` solo, `12px` dual.
`max-width: 100vw` as a backstop.

**Publishes to `CaseStore`:** `layoutNarrow` (panel < `NARROW_BREAKPOINT_PX`)
and `layoutStacked` (panel < `MIN_DUAL_PANEL_PX`), so components that are not
children of this template can adapt their own density.

**Hosts:** `severity-dialog`, `decision-dialog`, `resync-dialog`. **Not** `confirm-unlock-dialog`
— that lives in `app.component`.

> **Why the unlock dialog is hosted outside the panel:** Force unlock also
> appears on the widget, which shows its actions only while the panel is
> *closed*. Hosted here, that click set `openDialog` and rendered nothing.

---

## `case-header`

One row: title, severity pill, status pill, lock status, lock action, then
minimise and close.

| Property | Value |
|---|---|
| Height | 65 (`padding: 16px 20px`) |
| Title row | 1038 × 32, `gap: 8px`, `flex-wrap: nowrap` |
| Case number | 20px / 30px, 600, `--foreground-primary` |
| Badges | `ui-pill` `md` — 24 tall, `0 8px`, 14/20, 600 |
| Lock text | 14px / 20px, `gap: 4px` to its 20px icon |
| Lock action | Material smallest density (32) |
| Window controls | 32 × 32, radius 4 (the controls tier, shared with the minimised bar's icon buttons), `gap: 12px` |
| Gap, lock action → controls | 24px (16px narrow) |

> **Why 24px there against the pair's own 12px:** Force unlock is destructive and
> sits on the same line as a close button. The gap is what stops one being taken
> for the other.

**No player name line.** The black player bar above already names the player;
the header names the *case*.

> ⚠️ This also removed **Player 88213** from the header. The bar carries the
> *account* number, a different value. The player ID now appears only in the
> player-info panel.

**Lock line copy** — one source, `lockStatusLine()` in `core/models.ts`, so the
header and the widget cannot disagree:

| Lock state | Line | Detail |
|---|---|---|
| Unlocked | `Not locked` | |
| Locked to you | `Locked to you` | Timestamp on **hover title only** |
| Locked to another | `Locked to M. Torres · 3d` | Relative age is required information |
| Resolved | *nothing at all* | No glyph, no line, no wrapper |

> **Why the timestamp is a hover title when it is yours:** you took the lock, so
> *when* is a detail you can ask for rather than one the header spends a row's
> width on. Someone else's lock keeps its relative age in the line, because that
> is the number that decides whether you take it.

> **Why a resolved case shows no lock at all:** a padlock and "Resolved —
> read-only" beside a pill already reading `Resolved` is one fact three times, in
> the one state where none of it can be acted on. Read-only is carried by the
> absent controls, which cannot disagree with the buttons the way a sentence can.

---

## `trigger-strip`

Lives in the **left column, above the tab bar**. No header.

| Property | Value |
|---|---|
| Ground | `--strip-bg` — everything inside is transparent |
| Grid row | `--trigger-row-height` (40) |
| Stacked row | `--trigger-row-height-stacked` (63) — `padding: 10px 16px` |
| Divider | `--trigger-gap-height` (32), full row width |
| Divider hairlines | solid `--line`, stopping 16px short of the label each side |
| Divider label | 14px / 20px, `--primary`, weight 400; **the count is the only bold element** |
| Divider icon | `add` / `remove`, 16 × 16, 8px gap to the words |
| Columns (grid) | `minmax(140px, 220px) minmax(0, 1fr) auto` |

**Order: oldest to newest, always, in both modes.**

> **Why:** it is a history and it is read forwards. It briefly ran newest-first
> when expanded, which made the newest trigger the bottom row collapsed and the
> top row expanded — so expanding moved both anchors past each other. Expanding
> adds rows; it does not rearrange the ones already on screen.

**Collapsed is the two ends:** the oldest trigger, the divider, the newest.

> **Why:** the oldest is why the case exists, the newest is what just happened.
> Those are the two questions a folded strip is asked.

**Expanded** unfolds the middle *below the divider*, which stays where it was.
Window is five rows **plus** the divider's height.

> **Why plus:** five is a promise about triggers, and the divider is not one.

**The divider is a `<button>` inside a `role="listitem"`.**

> **Why:** `role="list"` requires listitem children — axe catches a bare button
> as `aria-required-children`. It is also the honest semantics: the divider
> stands for the rows it hides, so it is a member of the list, just the pressable
> one.

Detail text clamps to one line with the full text in a `title`.

> **Why:** a row whose height depends on how much its author wrote makes the list
> unscannable, and made the five-row window hold a different number of rows per
> case.

Below a **container** width of 520px the row stacks: name and timestamp on one
line, detail full-width beneath.

> **Why a container query and not a media query:** the strip is 420px wide in the
> left column on a 1374px screen. The viewport is wide while the strip is not,
> and no viewport query can see that.

---

## `player-info-panel`

421 wide, full body height. Tabs: **Risk assessment**, Past AML cases, Starred,
Timeline. Resolved cases show **Risk assessment and Timeline only**.

| Property | Value |
|---|---|
| Tab label | 14px / 20px, `padding: 0 10px`, 600 + 2px `--primary` underline when active |
| `.info__body` | `padding: 16px 20px`, scrolls independently |
| `.info__body--flush` | side padding `0` — Past AML cases, Starred and Timeline |
| Placeholder | radius 12, `padding: 16px`, `margin: 16px 0 0`, dashed `--line-strong` |

> **Why the row-list tabs give up their side padding:** their rows carry a rule
> or a tint that must reach the panel edge. Their own 20px keeps the *content*
> on the same gutter as every other tab, so only the tint moves.

The Snapshot tab is gone. Its header geometry (`min-height: 40px`, label over
a bold stamp, one control hard right) lives on as the Risk assessment's header.

---

## `risk-assessment`, `risk-status`, `section-risk-table`, `resync-dialog`

The Risk assessment tab and its parts. Specified in full in
[11-risk-assessment.md](11-risk-assessment.md); the short form:

| Component | What it is |
|---|---|
| `risk-assessment` | Header (Generated stamp, always-visible Resync), a summary line with a jump to the first field to assess, optional Finalized line, seven sections of rows with Account information collapsed by default, the Resyncing overlay, a live region |
| `risk-status` | The status: a label, or a button for the lock owner that opens Assess risk. 24 tall, 14px icon + word; Risk flagged and Action required filled with a subdued rim, No risk an outline; the button adds an edit glyph and a 40px hit area |
| `section-risk-table` | The finalize table: section, Risk / No risk. A real `<table>`, used in the Finalize form and on its card |
| `resync-dialog` | `Resync risk assessment?` / `Some actions might need to be recorded again.` Cancel, primary Resync (focused) |

---

## `workflow-panel`

Chip bar (pinned), stream (scrolls), footer (pinned). See
[01-layout.md](01-layout.md).

**Stream order is chronological, oldest first** — deliberately opposite to every
other list in the panel.

> **Why:** it is a narrative ending in the decision.

Contains outcome cards, the decision, and four kinds of event: severity
change, case creation, **a trigger arriving** and **a resync completing**.
**Lock events never appear here** — they go to the timeline.

There is no banner above the stream any more. The out-of-sync notice went with
rule 11's revision; a new trigger is an event row.

`.stream` sits on `--stream-bg`, `padding: 20px`, `gap: 12px` — with **24px
below the case creation event**, which gets a clear break before the first slot
rather than sitting in the work's rhythm.

---

## `required-chips`

| Property | Value |
|---|---|
| Bar | `min-height: --panel-bar-h` (48), `padding: 12px 20px`, `gap: 8px` |
| Chip | Static styled `<span>` — **never `mat-chip`** |

Four kinds of item, in this order: one chip per **required assessment** (the
two manual fields, plus any a resync sent back), **Contact player**, then
**Finalize risk assessment**.

**Two kinds of chip.** Contact player and Finalize keep the two-state pill:
**pending** (outlined, hollow circle, muted) and **done** (filled success,
tick). **An assessment chip is the field's risk status pill** - the same
`risk-status` component as the field's row in the Risk assessment, same fill,
same icon - with the field name as its word (`Open source searches`), the
status word on its `title`, and `Assess risk - Open source searches: Action
required` as its accessible name. A done assessment therefore reads **No risk**
(green, check) or **Risk flagged** (red, flag), never a generic tick.

> **Why the chip is the status and not a tick:** the chip bar and the Risk
> assessment are one list. With a green "done" tick beside a field the agent
> had just flagged red, the two panels disagreed on screen about one fact. The
> same pill in both places is what makes them read as one system.

> **Why static spans:** chips carry hover, focus, ripple and listbox semantics
> these do not earn. This bar is also where the reason for a disabled Submit
> lives, which is why it stays pinned.

---

## `outcome-card`

| Property | Value |
|---|---|
| Radius | 12, `padding: 16px` |
| Title | 16px / 24px, 600 |
| Actor + time | 12px, right-aligned |
| Note | 14px / 1.55, `overflow-wrap: anywhere` |
| Footer | Attachments only, rendered only when there are any; `margin-top: 16px` |
| Assessment line | Under the title: the `risk-status` label, then `Was <previous>` 12/16 secondary when the agent changed it |
| Finalize table | `section-risk-table`, `margin-top: 12px` |

**There is no View snapshot.** The snapshot became the Risk assessment, which
shows current values only; what an assessment decided is on its own card and
what a resync changed is on the Resync completed entry.

Three variants: standard, **assessment** (status + `Was …`), **finalize**
(the section table), and the decision card (green fill). The selected /
viewing variant is gone with View snapshot; its `--color-background-info`
fill moved to the Risk assessment row whose form is open.

The card is `tabindex="-1"` with `aria-label` = its title: focus lands on it
after a save from a placeholder. Ring on `:focus-visible` only.

**Immutable once saved** — no edit or delete affordance anywhere on the card.

---

## `attachment-list`

| Property | Value |
|---|---|
| Item | Material smallest density (32), radius 8, `padding: 6px 8px`, `gap: 8px` |
| Filename / size | both 14px / 20px, size in `--foreground-secondary` |
| Remove button | 20 × 20, radius 6, compact danger hover |

`<ul>` / `<li>` with the button inside each `<li>`; the `<li>` is never the click
target. The button contains only the icon, filename and size — no view icon.

> **Why no view icon:** the button *is* the file.

**JPG or PNG only** in the user-facing copy, both in the hint and in the
rejection message. Size cap `ATTACHMENT_MAX_MB` (10), interpolated rather than
written out. Per-file inline errors for wrong type and oversize that never clear
valid files.

> ⚠️ The copy is narrower than the validation: `accept` is `image/*` and the
> validator tests `type.startsWith('image/')`, so a GIF or WebP is still
> accepted while the copy says JPG or PNG. Tighten the validator or widen the
> copy — they should agree.

> ⚠️ Images-only contradicts the epic's acceptance criteria — open question 10.

> 🐛 **Defect found while writing this:** `attachment-list.component.ts` has
> `width: 20x;` (missing `p`) in the remove-button icon rule. Invalid, silently
> dropped. Worth fixing.

---

## `event-row`

Four kinds of event share this row: a **severity change**, a **manual case
creation** at the head of the stream, **a trigger arriving** and **a resync
completing**.

| Kind | Line one | Line two |
|---|---|---|
| Trigger added | 16px outlined `warning_amber` in `--warn`, `New trigger added - <type>`, `System · <stamp>` | the trigger's detail |
| Resync completed | `Resync completed`, `<agent> · <stamp>` | `No changes.` or `Updated values: … Risk associated with … changed - manual action needed.` |

> **Why the warning icon and nothing else:** the row stays an unboxed
> annotation; the words carry the meaning, the icon says "look". No amber fill
> - that vocabulary is gone from the case modal with rule 11's revision.

| Property | Value |
|---|---|
| Padding | `0 16px`, radius 12, `gap: 4px` |
| Head | 14px / 20px, `gap: 8px` |
| Line two | 14px / 20px, clamped to two lines, full text on hover |

> **Why no vertical padding.** These are unboxed annotations, and the stream's
> own 12px gap is what separates them from the cards either side. The row's own
> padding was additive on top of it and read as drift rather than rhythm.

Line one holds only fixed-width elements and never truncates: label, from/to
pills (severity change only), actor and time right-aligned. Direction derives
from `SEVERITY_RANK`.

**Case creation** reads `Manual case created - [Referral | OGMS | CCMM]` with no
pills — a creation reason is provenance, not severity, and pill chrome would put
it in a vocabulary it has nothing to do with. Line two is the free-text
motivation. It heads the stream because the stream is oldest-first and nothing
precedes the case existing, and it is repeated in the Timeline tab.

> **System-created cases have no creation event at all.** A system case carries
> no motivation text, and an event with an empty second line would be a heading
> pretending to be a record. If a system equivalent is ever specified it gets
> its own label rather than reusing this one blank.

There is no empty-stream line in any state. The dashed placeholders name each
outstanding action, which is more useful than a generic line above them, and
with the creation event at the head the stream is not visually empty anyway.

> **Why clamps must not reserve height:** a two-line clamp that reserves both
> lines leaves a gap under every one-line reason.

---

## `action-placeholder`

Radius 12, `padding: 12px 16px`, `gap: 16px`, dashed border.

Three kinds, one component:

| Kind | Title | Button | Accessible name |
|---|---|---|---|
| Assessment | `<Field>` + the field's **risk status pill** (`Action required`) | `Assess` (`edit_note`) | `Assess <Field>` |
| Contact | `Contact player - not recorded` | `Record` | `Record Contact player` |
| Finalize | `Finalize risk assessment` | `Finalize` (`task_alt`) | its label |

Two states: **enabled** (locked to you) and **disabled** (with a one-line reason
beneath the title). Finalize has a third reason: not available yet - `Assess
<A> and <B> first.` - and **stays in view, disabled**, until every field is
assessed. Replaced *in place* by the inline record form. `data-key` carries
the required item's key so focus can return to it.

> **Why dashed:** it means a slot waiting to be filled — the same vocabulary as
> the `Choose` placeholder in the severity dialog, so agents read it without
> explanation.

---

## `record-form`

Inline in the stream, replacing the placeholder. **Never a dialog.**

> **Why:** the player data stays readable while the agent writes.

Three variants of one form:

| Variant | Heading | Fields | Save |
|---|---|---|---|
| Record | `Record <action>` | note, attachments, lock choice | `Save outcome` |
| Assess risk | `Assess risk - <Field>` | note, attachments, **Your assessment** - radios `Risk flagged` / `No risk`, stacked like the lock choice (after the attachments), lock choice | `Save assessment` |
| Finalize | `Finalize risk assessment` | **the section table**, note, lock choice - no attachments | `Finalize` |

Note textarea (required), attachment list, keep-locked / unlock radio with **no
default styling on either**, then Cancel and Save. Footer `gap: 8px`; Cancel is
padded to 16px sides to match Save. `Cmd` / `Ctrl` + `Enter` in the note
saves.

A **draft-guard line** (info tint, `role="alert"`) appears at the top when
another start was refused because this draft has content. The form scrolls
into view and focuses its note whenever the store asks: on open from a risk
status, and on a refused start. On save or cancel it hands focus back - see
[11-risk-assessment.md](11-risk-assessment.md), *Focus*.

There is no out-of-sync warning on the form any more.

> **Why Cancel needed padding:** Material gives a text button less side padding
> than a filled one, so it sat visibly tighter than the primary beside it.

Save requires the note, plus the Risk answer on an assessment. Removing a file
that errored, or the last file, must leave Save enabled.

---

## `minimised-bar`

Hugs content to a max of ~400, radius 10, inset `--dock-inset` (32 desktop,
16 mobile) from the viewport's right and bottom.

Two icon buttons only — chevron to restore, close to dismiss — each 40 × 40 with
`padding: 0` and no `background-clip`, so the hover square fills the full hit
area. **The bar surface itself is inert.**

> **Why `padding: 0` is stated:** the browser's own stylesheet gives every
> `<button>` `1px 6px`, and `background-clip: content-box` then painted the tint
> inside it — a 28 × 38 square in a 40 × 40 target.

**The bar represents the panel, not the widget**, so restoring returns the panel
with its scroll position, active tab and any half-written draft.

---

## Dialogs — `dialog-shell` and its four users

Surface tier radius 16, full-viewport scrim, footer actions at **default**
Material density (40).

| Dialog | Shape |
|---|---|
| `severity-dialog` | Inert dashed `Choose` placeholder until a radio is picked, then the solid pill and direction badge. Save disabled until the reason is filled |
| `decision-dialog` | **Exactly one notice slot** — green by default, amber replacing it entirely when a draft exists |
| `confirm-unlock-dialog` | Danger confirm labelled `Unlock case`; initial focus on Cancel |
| `resync-dialog` | `Resync risk assessment?` / `Some actions might need to be recorded again.`; primary `Resync`, **initial focus on Resync** - nothing is lost by confirming |

The unlock dialog's lead states the fact and stops:
`M. Torres has held the lock since 11 Aug 2026, 10:58.` The red note carries the
consequence.

> **Why the lead stops there:** it used to end "and may be mid investigation",
> making the note's case first and more weakly, which softened the warning by
> pre-empting it.

---

## `attachment-preview`

Windowed to the image, up to a viewport cap. Header carries filename, size,
**Download**, **Open in new tab**, and Close.

Both actions are `<a>`, not buttons — the new-tab link carries
`rel="noopener noreferrer"`.

> **Why anchors:** both are things the browser does natively, and an `<a>` gets
> middle-click, the context menu and the keyboard for free.

Mobile is full screen. Focus enters on open and returns to the attachment button
on close.
