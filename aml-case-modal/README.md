# AML case modal - prototype

Angular 17 + Angular Material prototype of the AML case modal (Lottomart back
office, Manual Core epic). Built to prove the state machine and the workflow
interactions described in `../PROTOTYPE.md`, not to be pixel-final.

```bash
npm install
npm start          # http://localhost:4200
```

Jump to any Figma frame with the dev switcher above the modal, or by URL:
`http://localhost:4200/?state=03`.

## Where the rules live

Every business rule is enforced in one place - `src/app/core/case-store.ts`.
Components read signals off the store and call commands on it; none of them
decide for themselves whether an action is allowed. Rule numbers in code
comments refer to the "Business rules" section of `PROTOTYPE.md`.

| Rule | Enforced by |
| --- | --- |
| 1. One open case per player | The store holds a single case; structural |
| 2. Status OPEN \| RESOLVED | `status` signal. IDLE not implemented (open question 1) |
| 3. Lock states, force unlock | `lock()`, `requestUnlock()`, `forceUnlock()`, `canAct` |
| 4. Two required actions, any order | `requiredActions`, `allRequiredRecorded` - set membership, not order |
| 5. Note required, files validated, explicit lock choice | `draftValid`, `addFiles()`, `Draft.lockAfter` |
| 6. Outcomes immutable | `OutcomeItem` is only ever appended; no edit path exists |
| 7. Extra actions uncapped | `add-action-menu`; extras are ordinary outcomes and never touch `requiredActions` |
| 8. Adjust severity always enabled, lifts the lock | `canAdjustSeverity`, `changeSeverity()`, `SEVERITY_RANK` |
| 9. Submit gated by rule 4 | `canSubmitDecision`, `submitDecision()` |
| 10. Resolved is read-only | `isResolved`, `showFooter`, `visibleInfoTabs` |
| 11. New trigger blocks recording until resync | `snapshotOutOfSync`, `recordBlock`, `resync()` |

`ATTACHMENT_MAX_MB` lives in `src/app/core/models.ts` and is the only place the
size cap is defined.

## Severity ranking (rule 8)

`SEVERITY_RANK` is derived at build time from
`mock-case.json > severityRanking.order`, so the code and the fixture cannot
drift. Confirmed by compliance, lowest to highest: **AML, EDD, COMPLIANCE**.
That is not the intuitive order, which makes `AML -> EDD` and `EDD ->
COMPLIANCE` *escalations* and `COMPLIANCE -> AML` a *de-escalation*. This case
opens at AML and escalates to EDD.

Any direction of change is allowed - the ranking decides only what a change is
called, never whether it is permitted, and the dialog always offers the two
severities that are not current.

Nothing anywhere states a direction directly - `severityDirection()` is the
only source, and it reads the rank. That includes the fixture's own
`direction` field, which `fixtureStream()` recomputes rather than trusts, so a
ranking change can never leave a stale label sitting between two pills that
say otherwise.

Note that `case.severity` in the fixture is the severity of the *fully
played-out* case (EDD), not the severity it opened at. The opening severity is
derived from the first severity-change event's `from`, which is what the
timeline's "Case created (AML)" agrees with.

## Assumptions

The six open questions in `PROTOTYPE.md` are implemented as specced there and
flagged in code comments at the point they bite:

1. IDLE status - assumed not to exist.
2. New trigger mid-draft - the draft is preserved; Save is withheld with a
   "Resync required" note (`record-form.component.ts`).
3. Severity change lifts the lock - re-locking is one click in the header.
4. Force unlock - the owner's draft is lost, and the confirm dialog says so.
5. Attachments - 10 MB per file, per-file inline error.
6. New trigger highlight - persists until resync; the strip is not auto-expanded.

## Verification

Five Playwright suites (`npm run verify` runs them all). Start the dev server
first (`npm start`), then:

```bash
npm run verify:states   # all 13 Figma frames render with the right affordances
npm run verify:rules    # drives the rules live: lock → record → submit → resolved
npm run verify:layout   # two-panel <-> segmented switching across the width range
npm run verify:dual     # dual-modal interaction: open, dock, reflow, minimise
npm run verify:severity # rule 8 ranking end-to-end, and draft attachment removal
npm run verify:a11y     # axe-core WCAG 2.1 AA on every state, plus keyboard paths
```

## Accessibility

`verify:a11y` runs axe-core (WCAG 2.1 A and AA) over all 13 states, and then
drives the keyboard directly - axe cannot tell you whether Escape closes a
dialog or whether focus comes back afterwards.

Colour tokens are chosen to clear 4.5:1 on **every surface they are used on**,
not just on white. Four originally did not:

| token | was | now |
| --- | --- | --- |
| `--sev-edd` / `--warn` on their tint | 3.83:1 | 5.66:1 |
| `--primary` on `--primary-bg` | 4.28:1 | `--primary-ink`, 5.74:1 |
| white on a solid `--warn` (NEW badge) | 4.28:1 | 6.32:1 |
| `--ink-3` on `--page` and the warn tint | 4.43 / 4.32:1 | 5.28 / 4.73:1 |

`--primary` is still the fill and border colour; `--primary-ink` is the darker
tone for text on the tint, per the spec's "text on tinted backgrounds uses the
darkest tone of the same family".

Note that `opacity` is never used to mute text - it multiplies against whatever
is behind and silently drops contrast (it had `.chip__state` at 4.09:1).

One axe rule is knowingly excluded: `region`, which fires on Angular CDK's
overlay container. That element is appended to `<body>` outside any landmark by
the framework; it is best-practice tier, not WCAG A/AA, and the menu inside it
carries correct `menu` / `menuitem` roles.

## Dual-modal interaction

There is no dual-modal mode, and no flag for one. Two modals on screen is what
you get when the agent opens the second while the first is up.

- **Each modal opens only from its own widget.** The AML widget additionally
  requires the case to be locked to you. Nothing ever opens both.
- **The layout is width-driven.** The AML modal switches from two-panel to
  segmented when *its own width* drops below 720px (`NARROW_BREAKPOINT_PX`).
  One rule serves dual mode and small screens, so they cannot drift apart -
  a single modal on a 700px screen segments exactly the same way.
- **Docking is fixed.** SG left, AML right, whichever was opened first.
- **Reflow is 300ms ease-out** on width only, so the modal stays interactive
  throughout - no opacity or `pointer-events` games. Under
  `prefers-reduced-motion` it is instant.
- **Everything survives the reflow**: the record-form draft, both scroll
  positions, the active info tab. If the agent was working in the player-info
  panel, the segmented control lands on Player info rather than resetting to
  Workflow.
- **Minimise** (header "-") docks that modal to a slim bar at the bottom edge
  and gives the other the full width back. Both bars can stack; restoring
  re-splits. The dock publishes its height as `--dock-h` so a bar never covers
  a pinned footer.
- **Below 1200px of stage width** there is no room to share, so opening the
  second modal auto-minimises the first and its bar pulses once.

State 09 is simply "both modals open". The narrow layout it shows is a
consequence of the width, not something the scenario sets - compact header,
single-row trigger summary, abbreviated chips, single-row placeholders and a
split footer.

`verify:layout` exists because the layout mode is measurement-driven and that is
easy to make circular: the mode changes the modal's width, the new width is
measured, and the mode latches so it can never switch back. Every case in that
suite is one that latched during the build.

`verify/states.mjs` also writes a screenshot per state to `verify/shots/`.

## Deliberate deviations from the spec

**One trigger control, everywhere.** `PROTOTYPE.md` describes the collapsed
strip as "2 rows + a +N more triggers badge", and the expanded strip as rows
plus a "Showing X of 20" bar with Collapse - two different controls, in two
different places. Figma frame 09 uses a third form, a single summary row. On
request these are unified into one control used in every state and at every
width:

```
collapsed  (19 triggers)  HVP withdrawal, Manual - EDD...   v Show all
expanded   (19 triggers)  Showing 19 of 19                  ^ Collapse
```

The whole row is the button. It sits at the top of the strip, keeps the same
box across the toggle, and never changes shape - only the secondary text and
the verb change. There are no preview rows when collapsed.

Two consequences worth knowing:

- A rule-11 arrival is not visible as a row while the strip is collapsed, so
  the count chip itself turns amber. That is the only arrival signal until the
  agent expands, and `verify:rules` asserts both halves.
- It also resolves the squeeze previously flagged here: a collapsed strip now
  costs one line instead of three, so the workflow stream keeps its room. The
  expanded strip still caps at ten rows and scrolls internally, so state 10 is
  no longer competing with the pinned chip bar and footer for the same 820px.
