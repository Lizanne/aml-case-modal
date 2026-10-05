# 23 · Decisions and trade-offs

The full log is `PROTOTYPE-TABLE.md` §14, D-05 to D-18. These are the ones an
engineer will meet in the code and wonder about.

| Decision | Chosen | Not chosen | Why | Where |
|---|---|---|---|---|
| The lock lives in Actions | One 32px disc beside Open case | A Lock column | A whole column to hold one 32px control was a column of chrome, and the two things an agent does to a row belong together | D-07 |
| Initials on the held disc | Monogram, name on tooltip and accessible name | A padlock for every held state | An avatar says *who* in the space a padlock used to say only "someone". The initials are decoration (`aria-hidden`); the name carries the person | D-05 |
| Work is text, to-do first | Three required items, weight and order carry priority | Pills; colour for completion | Four pills a row read as four controls. Green marked completion until 2 Oct; now the tick and the position do, and the row stays one colour | D-12, D-15 |
| The row shows only the required set | Fixed three; custom actions go to `+N` | Everything inline, capped at four | The row is a statement of what is left to do. Custom actions are a record, and the popover is where records go | D-15 |
| Triggered by is a column | Initiating trigger + detail + count | No column; an amber row flash on arrival | What opened the case is what the case is *about*. A flash assumes someone is watching the row at the moment it changes | D-13 |
| The count opens the modal's strip | The component itself, unchanged, on its own store | A second rendering of the trigger list | Not a second list to keep in step. "Open the case to see the triggers" was the one trip the count kept sending agents on | D-14 |
| The Work popover is actions only | Two groups: to do, completed | The modal's Timeline, reused | The Timeline is the case's history — created, triggers, severity, locks, resyncs. The question here is the work | D-15 |
| No popover heading on Work | Group labels with live counts | "Work" | The labels say what the list is and how much of it there is | D-15 |
| The breakdown opens on click | Click | Hover | Ten rows of hover-opening panels fire constantly while the eye is scanning the column | §5 |
| No info icon in the Priority header | Gone | Header link beside the sort | Two routes to one page in one column; the breakdown keeps the link | D-16 |
| Sort by SLA resets to descending | Switching columns resets direction | Inheriting the previous direction | "Sort by SLA" means oldest first; inheriting ascending answers a question nobody asked | §7 rule 9 |
| Empty queue is one sentence | Muted, centred, 48px | *View past cases* link | Past cases live in the case, under the player, not in a queue that has none | D-17 |
| Three dev frames retired | T-05, T-11, T-12 gone; T-00 added | Keep them | Each applied exactly what T-01 applies and then asked the viewer to do something. The switcher is for frames, not instructions | D-17 |
| The modal reads and writes the collection | `loadCase()` seeds from it; `saveDraft()` writes back | Two independent stores | One truth for the row, the Timeline tab and the popovers; the real-time rules fall out of it | D-15 |
| A picked case opens in its own state | Dev switcher reloads `?case=` after the default frame | Every picked case landing on frame 01 ("locked to you, nothing recorded") | The row said one thing and the modal another; `loadCase()` was written for exactly this and the harness was undoing it | D-15 |
| Stress fixture by URL | `?fixture=stress`, chosen at module load | A store flag | `SEED_NOW` and the collection are module constants; the choice has to precede them | D-18 |

## Three things that look like bugs and are not

- **The sticky column's edge is a pseudo-element, not a shadow.** `box-shadow`
  on a `td` is silently dropped under `border-collapse: collapse`. It was
  proved by flipping to `separate` on the live page.
- **Escape is on the button.** See [22](22-table-popovers.md) — MatMenu never
  sees the key when the panel holds no menu items.
- **`aria-expanded` and `aria-haspopup` are not in the template.** MatMenuTrigger
  owns both and keeps them in step with the panel. The brief asked for
  `aria-haspopup="dialog"`; it is `menu`, Material's, because a second hand on it
  would drift.

## Open — decisions still to make

These are deliberately not decided in code. Two have a verifier check left
failing on purpose so that relaxing it is a visible act.

1. **What the trigger count counts** (D-14). Row: since the case opened. Popover:
   the player's whole history, because it is the modal's list. On 4821, +9
   opens 19. *Recommendation:* scope the popover's own store to since-open —
   one line in `trigger-popover`; the strip stays untouched; the parity check
   becomes "equals the modal's since-open subset". Check left failing:
   `table.mjs` → "the row's count is the popover's length".
2. **The component style budget.** `cases-table.component.ts` is 1.26 kB over
   the 8 kB `anyComponentStyle` warning. Raise it to 10 kB in `angular.json`,
   or split the component's styles. A warning only; deploys succeed.
3. **The starred row in the modal** (`layout.mjs`, three checks) — Figma draws a
   pill, the component does not. Owned by the modal handoff, [09](09-unresolved.md).
4. **Completed order in the Work popover.** Newest first, per Rafal. The row's
   done items are in required order, so a done required item does not sit
   where the row puts it. Chronological is right for a record; raised and left.
5. **Repeated *Note* entries in the authored fixture.** SoF request, PEP check
   and Sanctions screen were retired and each became a note, so some cases show
   several identical *Note* lines. A data decision — a note could carry its
   first line — not a rendering one.
6. **The Work count's accessible name carries no number.** *Show all work items*
   exactly as specified; the button's own text and the cell's sentence carry
   the count.
