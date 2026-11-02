# 04 · States and interactions

## Read this first: the inert components

The default assumption when reading a spec is that a row takes hover and a badge
is clickable. In this panel several deliberately do not. **A developer who adds
hover to any of these has introduced a bug**, not polish.

| Component | Interactive? | Why |
|---|---|---|
| Trigger row | **Inert** | Read-only content. No hover, no pointer, text stays selectable so an agent can copy a name or timestamp |
| Timeline row | **Inert** | An entry is a record, not an action |
| Starred row | **Inert** | Same |
| Past AML case row | **Interactive** | It opens the case — hover tint across both lines, focus ring, pressed |
| `required-chips` chip | **Inert** | Static span, never `mat-chip` |
| `ui-pill` (every pill and badge) | **Inert** | Static span. No states at all |
| Severity dialog `Choose` placeholder | **Inert** | A slot, not a control |
| `minimised-bar` surface | **Inert** | Only its two icon buttons are live |
| Trigger strip divider | **Interactive** | The one control in the strip |
| Risk assessment row | **Inert** | Text and an info button; it is **tinted** (not hovered) while its form is open |
| `risk-status` | **Interactive for the lock owner**, a label otherwise | It opens Assess risk. A real `<button>` with an edit glyph - the only thing on the row that changes |
| Risk assessment info button | **Interactive** | Tooltip on hover and focus, nothing else |
| `section-risk-table` row | **Inert** | A summary |

> **Why Past AML cases has hover and the others do not:** two components that
> look alike but differ in clickability must *look* different. The hover is the
> only thing that says one is a door.

---

## Lock states — the gate on everything

`lockState` is `unlocked | locked-to-me | locked-to-other`. `canAct()` is
`locked-to-me && !resolved`, and it gates every act on the case.

| Control | unlocked | locked-to-me | locked-to-other | resolved |
|---|---|---|---|---|
| Lock action (header) | `Lock case`, primary | `Unlock`, outlined | `Force unlock`, demoted | **absent** |
| Record (placeholder) | disabled | enabled | disabled | **absent** |
| Add action | disabled | enabled | disabled | **absent** |
| Adjust severity | disabled | enabled | disabled | **absent (no footer)** |
| Assess (placeholder) | disabled | enabled | disabled | **absent** |
| Finalize (placeholder) | disabled | enabled once nothing is Action required | disabled | **absent** |
| Risk status | label | **button**, until finalized | label | label |
| Resync | unavailable (focusable) | enabled, until finalized | unavailable (focusable) | **absent** |
| Submit decision | disabled | per rule 4 | disabled | **absent** |
| Widget `Open case` | absent | present | absent | absent |

> **Why Adjust severity is gated on the lock:** it was "always enabled", which
> let anyone looking at a case someone else held change its severity — the one
> thing on the panel that could be done without the lock. Adjusting severity *is*
> acting on the case.

> `canRecord` used to carry an extra rule-11 block (recording stopped while the
> snapshot was out of sync). That block is gone - a new trigger no longer stops
> anything - so `canRecord` and `canAct` are the same gate now. Both names
> remain: `canAct` for acting on the case, `canRecord` where a form is involved.
> Resync's own gate, `canResync`, adds "not finalized, not already resyncing".

**Force unlock is demoted at rest** — no border or fill, muted ink — and turns
danger-coloured on hover and focus.

> **Why:** a case locked to another agent is a normal state, not an error. Red
> text sitting permanently in the row said otherwise every time it was looked at,
> and a warning that is always on is a warning nobody reads.

Its state layer is `--danger`, not Material's black, and its **pressed** opacity
is `0.08` rather than the default `0.12`.

> **Why the opacity moved:** pressing implies hovering, so the layer stacks on
> the hover fill. At 0.12 the label landed at 4.39:1, under AA. 0.08 gives
> 4.68:1. Rest 6.47, hover 5.30, focus 5.28.

---

## The states

### 00a — Unlocked, no owner

Case exists, nobody holds the lock. The entry point for an agent picking up work.

Lock line reads `Not locked` in muted ink. `Lock case` is the only primary on the
surface. Record buttons disabled with helper text under each placeholder. Adjust
severity, Resync and Submit all disabled.

Locking is **instant, no confirmation**, writes a timeline event, and the header
flips to `Locked to you` with `Unlock`.

### 00b — Locked to another agent + force-unlock confirmation

Read-only for this agent until the lock is taken. Lock line carries the relative
age, which is the input for deciding whether to take it.

The confirmation names the owner and the lock time, states the consequence, and
its confirm is danger-labelled `Unlock case`. **Initial focus is Cancel.**

On confirm the case **unlocks but does not lock to you** — that is a separate
act. A timeline event is written.

### 01 — Locked to you, nothing recorded

Four required items: `Document requests` and `Open source searches` as
**amber Action required pills** - the same pill their rows show in the Risk
assessment - then `Contact player` and `Finalize risk assessment` outlined
and hollow. Four dashed placeholders: two `Assess` with the field name and
its Action required pill, one `Record`, and Finalize with its button
**disabled** and `Assess Document requests and Open source searches first.`
beneath. Add action available. Submit disabled, with its reason in the pinned
required bar and a tooltip on the button — **not** in footer helper text.

The Risk assessment shows generation 0: Account information collapsed to its
one-line disclosure, the summary `2 to assess · 10 flagged · 6 no risk`, the
two manual fields Action required, the rest as the system read them. Resync
enabled.

There is no empty-stream line. The placeholders name the outstanding items
directly, and a manual case opens with its creation event, so the stream is
neither blank nor unexplained.

### 02 — Assess risk - Open source searches, with attachment errors

The form is inline in the stream, replacing the placeholder, headed with the
field. Note required; attachments optional, JPG or PNG only; then **Your
assessment** - radios `Risk flagged` / `No risk`, neither chosen yet (the
field is Action required); keep-locked / unlock radio **preselected to `Keep the case locked to me`**, with neither option
styled as recommended.

Save is gated on the note and the Risk answer. There is no rule above the
footer: 32px of space carries the separation instead of a line. The Open
source searches row in the Risk assessment is tinted and reads `Assessing`.

Per-file inline errors name the file and the rule. They **never clear valid
files**.

### 02b — Recording Player contact first

The Record variant of the form, opened before either assessment. Proves rule
4: order does not matter, Submit checks set membership. The other three
placeholders stay.

### 03 — Everything required done, risk assessment finalized

All four chips done: the two assessments as green **No risk** pills, Contact
player and Finalize as success ticks. The stream holds both assessment
cards (each with `No risk` and `Was Action required`), the player contact,
the severity escalation and the `Risk assessment finalized` card with its
section table. The Risk assessment shows the Finalized line, every status a
label, Resync unavailable. Submit enabled. Extras still available and they
never re-gate Submit.

### 04 — Overriding a risk from the Risk assessment

`No risk` on Employment & occupation was clicked. The form opened in the
workflow, **appended** (the field is not a required assessment), headed
`Assess risk - Employment & occupation`, with **No risk already chosen**, so
an override starts from the current call. The row is tinted and reads
`Assessing`.

> **Why the status opens the form rather than toggling:** the override has to
> be recorded with a note, like every other act on the case. The status is the
> way in, not the answer.

### 05 — Adjust severity dialog

Pill pair old → new, an Escalation / De-escalation badge derived from
`SEVERITY_RANK`, and a required reason. Saving changes severity everywhere,
**lifts the lock**, and writes an event row, a timeline entry and an AML-tagged
commentary.

Re-locking is one click away in the header.

### 06 — Submit decision dialog

Exactly **one notice slot**. Green requirements-met by default, which also states
that submitting resolves the case. When an unsaved draft exists the amber warning
**replaces it entirely** and carries the finality itself.

> **Why replaces and not adds:** the dialog must never show two notices with
> opposite moods.

### 07 — Resolved, read-only

Tabs reduce to Risk assessment and Timeline. No required bar, no placeholders,
no Add action, no footer, **no lock row at all**. The Risk assessment shows as
finalized: the Finalized line, every status a plain label, no Resync. The
finalize card in the stream carries the section table as it stood.

> **Why the live view and the audit view are the same view with the controls
> removed:** so they cannot drift apart.

### 08 — Add action menu open

Two items — Contact player, Add a note — each opening the same record form.
Assessing a field is done from its status or its placeholder, never from this
menu. Menu opens on Enter, closes on Esc **returning focus to the trigger**.
With a draft that has content open, an item does not open a second form: the
open one is revealed with the draft-guard line.

### 09 — Dual modals

SG alert beside AML case. Both panels at `calc(50% - 8px)`; the AML panel is
below `NARROW_BREAKPOINT_PX` and so takes its segmented layout.

Docking is **slot-based**: an item claims a column when it joins the surface and
keeps it until it leaves.

> **Why not arrival order:** closing a panel leaves its widget behind holding
> that column, so releasing the slot would send a reopened panel up under the
> *other* item's card.

**Neither widget renders while both panels are open** — see
[06-edge-cases.md](06-edge-cases.md).

### 10 — New trigger arrived, triggers expanded

Twenty triggers; the newest is the arrival, the last row in either mode, **with
no amber and no badge**. The stream carries `New trigger added - System -
Threshold` with a warning icon. Nothing is blocked: Record and Assess are
enabled, Resync is enabled, and the next resync will find new values.

> **Why nothing is flagged in the strip:** the 2 Nov change removed every
> forced-refresh signal. The arrival is recorded where the agent is working,
> in order, and Resync is a choice.

### 12 — Resync confirm

`Resync risk assessment?` over state 10. Focus on the primary `Resync`.
Cancel changes nothing.

### 13 — Resyncing

The Risk assessment body under the overlay, `aria-busy`; Resync unavailable
but still focused. The header and the tabs stay readable.

### 14 — Resync completed, two risks changed

The `Resync completed` entry lists five updated values and names Latest fraud
scores and Deposit spike as risks that changed. Both fields are Action required
- amber in the Risk assessment **and** amber in the chip bar - and on the
required list; VPN usage kept its risk with a new value; the
Generated stamp is the resync time. Finalize is disabled again and names the
two fields.

### 15 — Finalize risk assessment

Every field assessed, so Finalize's form is open: the live section table,
the note, the lock choice, `Finalize`. No attachments.

### 11 — Past AML cases tab

Two-line rows, clickable. Column order leads with the case ID.

> **Why the column order differs from Timeline:** it follows what the reader
> looks up. That difference is deliberate, not an inconsistency.

A past case's severity pill records severity **at resolution** and must not
restyle if `SEVERITY_RANK` changes.

### 12 — Starred commentaries tab

Two-line rows, **inert**. Author and a right-aligned timestamp on line one, the
commentary on line two clamped to one line with the full text on hover.

> ⚠️ No dedicated dev-switcher state; reachable via the tab. See
> [00-overview.md](00-overview.md).

### 13 — Case timeline tab

Single-line rows, **inert**. Columns: `when` 84 fixed, `what` fills, `who` 90
fixed. Newest first.

Timestamps render **each event's own value** — a shared default was a bug found
in prototyping.

> ⚠️ No dedicated dev-switcher state; reachable via the tab.

---

## Interaction states, per interactive element

| Element | Default | Hover | Focus | Pressed | Disabled |
|---|---|---|---|---|---|
| Primary button | `--primary` fill | `--primary-ink` | 2px `--primary` ring | Material layer | Material disabled |
| Outlined button | transparent | `--page` tint | 2px ring | Material layer | Material disabled |
| Force unlock | muted, no border | `--danger-bg-strong` | ring + danger layer | danger layer @0.08 | n/a |
| Trigger divider | `--strip-bg` | `--primary-bg` **across the full row including its hairlines** | 2px ring inset | — | absent when nothing hidden |
| Past AML row | transparent | tint across **both** lines | ring | pressed tint | n/a |
| Attachment chip | transparent | tint, filename in link colour | ring | pressed | n/a |
| Attachment remove | transparent | compact danger | ring | — | absent when saved |
| Bar icon buttons | transparent | tint filling the **whole** 40×40 | ring | — | n/a |
| Tab | 14/20 regular | tint | ring | — | n/a |
| Risk status button | status fill + rim + edit glyph @0.7 | deeper fill in its own hue, glyph @1 | ring, offset 2 | `scale(0.97)` | becomes a label |
| Risk info button | transparent, secondary ink | `--colors-alpha-alpha-soft-hover`, primary ink | ring | — | n/a |
| Resync | outlined | Material layer | ring | Material layer | `disabledInteractive`: disabled look, still focusable, reason on describedby and tooltip |

**Focus is `:focus-visible` throughout**, with a global 2px `--primary` ring.
There is no bare `outline: none` anywhere.
