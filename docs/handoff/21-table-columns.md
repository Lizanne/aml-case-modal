# 21 · Columns

Seven columns, `table-layout: fixed`, widths from the `colgroup`. Every row is
**52px** (plus its 1px rule) — asserted on every row of both fixtures. Header
cells are 14px, `--foreground-primary`, title case, in a `.th-inner` flex row
so a sortable header's arrow lands in the same place whether or not the cell
holds anything else. Cell text is 14/20 unless stated. Row hover tints the
cells `--surface-hover` — background only, nothing moves.

| Column | Width | Min |
|---|---|---|
| Player | 200 | 184 |
| Severity | 110 | — |
| Triggered by | 240 | 200 |
| Priority | 152 | — |
| SLA | 132 | — |
| Work | 440 | — |
| Actions | 128 | 120 |

The table is 1402px wide and scrolls horizontally inside `.table-scroll`; only
the table scrolls, the page header and sidebar stay put.

---

## Player — sticky

**Two lines.** Line one: the player id as a link, `.linkish` — `#1D4ED8`, hover
`#1E40AF`, 600, underlined, tabular figures, ellipsises with the full id on
its `title`. Opens player details in the same tab (`?view=player`); the click
is intercepted so the prototype navigates in place. Line two: the status as
a label, 14/20, `--foreground-secondary`: `ENABLED` → *Enabled*,
`PLAYER_REGISTERED` → *Registered*, `GAMSTOP_RESTRICTED` → *GAMSTOP restricted*,
`PLAYER_DUPLICATE` → *Duplicate*. Mapped in the template, not the fixture.

**Sticky** on horizontal scroll: `position: sticky; left: 0; z-index 10` on the
cells, higher on the header cell, both painted (a transparent sticky cell lets
the other columns scroll through it). The right edge appears **only once
scrolled** — a `::after` pseudo-element whose opacity follows
`.table-scroll.is-scrolled`. It is a pseudo-element because `box-shadow` on a
cell is silently dropped under `border-collapse: collapse`.

Holds at ≥184px with a 15-digit id and the longest status (stress case 6).

## Severity

The shared `ui-pill` with `[severity]` — AML, EDD, Compliance — unchanged.
Decides the tab (rule 1): AML and EDD → Active, Compliance → Compliance. A
change of severity moves the row between tabs in the same tick (rule 2).

## Triggered by

Renamed from Triggers (D-14). **Two lines**, the modal's strip rhythm.

Line one: the **initiating** trigger's name at 600 in `--foreground-primary`
(ellipsises; the full name and an absolute stamp sit on the line's `title`),
then `· 2d ago` in `--foreground-secondary` with the absolute stamp on its own
`title`, then — when the case has more than one trigger — the **count button**
`+N`. The count is Work's button, declared once for both (below). Line two: the
initiating trigger's detail, 14/20 at 400, `--foreground-secondary`, one line,
full text on `title`.

*Initiating* means the oldest trigger dated at or after the case opened; the
collection filters and sorts triggers that way because a fixture's trigger
array is the player's history (D-13 scope note). A case with **no triggers**
renders *No triggers*, muted — not possible in production, but the table must
not throw on it (D-18).

## Priority

Score and band label, `.prio`: **"150 Urgent"**, 14px, neutral ink. Urgent adds
a `warning_amber` icon before the text and 600 weight — **never a colour**: SLA
is the row's only traffic light. Beside it, 4px away, the **breakdown button**
`.prio__info`: a 16px stroked info glyph at 1.5 in a 24px round hit area,
`--foreground-secondary` at rest, `--foreground-primary` on hover and press,
tooltip *Score breakdown*, name *Score breakdown for 150*. Click, not hover,
opens the popover ([22](22-table-popovers.md)). The header carries no icon
(D-16).

Bands from `PRIORITY_BANDS` (min score): Urgent 150, High 60, Medium 30, Low 0.
The source document leaves 100–149 undefined; **High** is the documented
stopgap, and a score of 125 renders *125 High* (stress case 7). Scoring itself
is in `PROTOTYPE-TABLE.md` §13 and `models.ts`: withdrawals tier + AML risk +
SG vulnerability + complaint, 10 to 200. The score is **derived** from the four
factors on every read; the fixture never stores a score.

**Sortable**, default, descending. See *Sorting* below.

## SLA

`ui-pill` with a dot and a border, text `Xh Ym` (tabular). Elapsed since
`createdAt`, live — the store's clock ticks every 30s. Bands from
`SLA_THRESHOLDS_H`:

| Band | Elapsed | Tone | Text/dot | Border |
|---|---|---|---|---|
| fresh | < 12h | `success` | `--foreground-success` | `--border-success-subdued` |
| warn | 12h–35h59 | `warn` | warn | `--border-warning-subdued` |
| late | 36h–47h59 | `danger` | danger | `--border-negative-subdued` |
| breached | ≥ 48h | `danger-solid` | `--danger-deep` on solid fill, **bold** | none |

Every boundary is asserted with the store's clock pinned to it (stress case 8);
`999h 00m` fits the pill. **Sortable**; its arrow is always visible.

## Work

The **required set only**, per Rafal (2 Oct): Contact player, Open source
searches, EDD report — all three, always. To-do items first, in that order, at
**600 in `--foreground-primary`**; then completed items, in that order, at **400
in `--foreground-secondary`** behind a 16px tick — an inline SVG, the Round outlined check, on `fill="currentColor"`, so the item's ink is the icon's. Separator a
middle dot with 8px either side. One line, `nowrap`, each item ellipsises.
Custom actions never enter the row.

Example, after Contact player is completed: *Open source searches · EDD report
· ✓ Contact player*.

`+N` — the custom count — renders **only when N > 0**, as the count button,
tooltip and accessible name *Show all work items*. Opens the Work popover.

The wrapper carries one accessible sentence and the spans are `aria-hidden`:
*"3 required actions, 2 to do: Open source searches, EDD report; done: Contact
player; 2 more in the timeline"*. Read span by span the order — the whole point
of the column — does not survive.

## Actions

A two-slot grid, `32px 32px`, 8px gap, right-aligned. **Lock**, then **Open
case**.

**Lock** is one 32px disc in three states:

| State | Shows | Background | Tooltip | Name | Click |
|---|---|---|---|---|---|
| Not locked | Material `lock_open`, 16px, `--foreground-primary` | none; hover `--surface-hover` | *Lock case* | *Lock case* | lock |
| Locked to you | your initials, 14px 600, `--success` | `--success-bg-subtle`; hover `--surface-hover`. `aria-pressed="true"` | *Locked to you · Click to unlock* | *Locked to you, click to unlock* | unlock |
| Locked to another | their initials, `--foreground-primary` | `--background-tertiary`; hover 6% black over it | *Locked to M. Torres · 1d* | *Locked to M. Torres 1 day ago, click to force unlock* | force-unlock confirm |

The sentence is `lockStatusLine()` — the widget's own — so the table cannot
say "Locked by" while the panel says "Locked to". Initials: first letter of up
to three name parts ("A. Kowalski" → AK, "Marie Thérèse Lacroix" → MTL),
`aria-hidden`; the name is in the tooltip and the accessible name, which is
what disambiguates two agents who share initials (stress case 10). Force
unlock goes through the same consequence-stating confirm as the widget (rule
5), hosted in `app.component`.

**Open case** appears **only on a row locked to the current agent** (rule 4):
a 32px square primary-fill icon button, `open_in_new`, tooltip *Open case*,
name *Open AML case in new tab*. Opens `?case=<id>` in a new tab. It animates
in only when motion is welcome.

## Sorting

Priority and SLA. Default priority descending, SLA elapsed descending as the
tiebreaker. Clicking the active column flips its direction; clicking the other
switches to it **and resets to descending** — "sort by SLA" means oldest first.
The direction flips the whole comparison, tiebreaker included. The header is
the control: a real `button.th-sort` inside the `th` (a `th` is not focusable),
label plus a 16px arrow at opacity .5, .75 on hover, 1 when active, pointing
down for descending. Active header `aria-sort="descending|ascending"`, the
other `aria-sort="none"`. Persists for the session.

## Count buttons — one rule, two columns

`.work__more` and `.trig__more` share one declaration: `min-height 32px`,
`padding 0 8px`, `border-radius 4px`, 14px at 500, `--foreground-subtle` at
rest; hover `--surface-hover` and `--foreground-primary`; focus ring `2px solid
var(--primary)` offset 2. On the Triggers line the 32px box sits on a 20px line
by a `-6px 0` margin, so the target stays 32 and the row stays 52. `aria-expanded`
and `aria-haspopup` are MatMenuTrigger's own — a second hand on them would
drift.
