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
| Resync | disabled | enabled | disabled | disabled |
| Submit decision | disabled | per rule 4 | disabled | **absent** |
| Widget `Open case` | absent | present | absent | absent |

> **Why Adjust severity is gated on the lock:** it was "always enabled", which
> let anyone looking at a case someone else held change its severity — the one
> thing on the panel that could be done without the lock. Adjusting severity *is*
> acting on the case.

> **Why `canAct` and not `canRecord` for severity:** recording carries the extra
> rule-11 block, because an outcome is a statement about what the triggers said.
> A severity is a judgement about the case and does not go stale with the
> snapshot.

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

## The sixteen states

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

Both required indicators outlined and hollow. Two dashed placeholders with
`Record` primary. Add action available. Submit disabled, with its reason in the
pinned required bar and a tooltip on the button — **not** in footer helper text.

Empty stream shows `No outcomes recorded yet` above the placeholders.

### 02 — Recording, with attachment errors

The form is inline in the stream, replacing the placeholder. Note required;
attachments optional, JPG or PNG only; keep-locked / unlock radio **preselected
to `Keep the case locked to me`**, with neither option styled as recommended.

Save is gated on the note alone. There is no rule above the footer: 32px of
space carries the separation instead of a line.

Per-file inline errors name the file and the rule. They **never clear valid
files**.

### 02b — Recording clean, reverse order

The same form, with the required actions completed in the opposite order.
Proves rule 4: order does not matter, Submit checks set membership.

### 03 — Both required actions recorded

Both chips filled success with a tick. Submit enabled. Extras still available and
they never re-gate Submit.

### 04 — Viewing a historical snapshot

The left panel swaps to a plain view header — label over timestamp, with `Back`
in the same slot `Resync` occupies.

> **Why the same slot:** so the header does not reflow between modes.

The source outcome card takes a persistent **selected** treatment (3px `--primary`
left edge plus a subtle tint) and its button reads `Viewing`. Only one card is
selected at a time.

> **Why each action stores its own snapshot:** the player keeps playing while the
> case is open. A reviewer needs to see not just what the agent decided but what
> they were looking at.

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

Tabs reduce to Snapshot and Timeline. No required bar, no placeholders, no Add
action, no footer, **no lock row at all**. The left panel shows no snapshot
selected until an outcome's `View snapshot` is clicked.

> **Why the live view and the audit view are the same view with the controls
> removed:** so they cannot drift apart.

### 08 — Add action menu open

Three items — Contact player, Open source searches, Add a note — each opening the
same record form. Menu opens on Enter, closes on Esc **returning focus to the
trigger**.

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

### 10 — Triggers expanded, new arrival

Twenty triggers, one unresynced arrival. The arrival is the **newest**, therefore
the last row in either mode, with an amber row background and a `New` badge after
the trigger name.

The snapshot is marked out of sync and recording is blocked until Resync.
Arriving while expanded, the strip scrolls back to it.

**The highlight persists until resync, not until it is seen.** Several arrivals
before a resync all stay highlighted.

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

**Focus is `:focus-visible` throughout**, with a global 2px `--primary` ring.
There is no bare `outline: none` anywhere.
