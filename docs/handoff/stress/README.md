# Stress fixture — visual review

Screenshots written by `npm run verify:stress` against `?fixture=stress`
(`aml-case-modal/src/app/core/mock-cases-stress.json`). One per edge; the
verifier's own checks are in `aml-case-modal/verify/stress.mjs`, and every
failure there names the case id and the cell.

| # | Edge | Case | Files |
|---|---|---|---|
| 1 | 20 triggers, 120-char descriptions: popover scrolls, nothing overlaps, +19 fits | 7001 | `01-twenty-triggers-row`, `01-twenty-triggers-popover` |
| 2 | 3 required + 10 custom, all done by long-named agents: popover scrolls, agent line truncates, row shows 3 | 7002 | `02-long-agents-row`, `02-long-agents-popover` |
| 3 | All required done, nothing custom: three ticked muted items, no +N | 7003 | `03-all-done-row` |
| 4 | Zero triggers: "No triggers", muted, no crash | 7004 | `04-zero-triggers-row` |
| 5 | 80-char trigger name: ellipsis, full name on title | 7005 | `05-long-trigger-name-row` |
| 6 | 15-digit id, GAMSTOP restricted: sticky column holds at 184px | 7006 | `06-longest-player-row` |
| 7 | Scores 200, 10, 125 (the gap renders "High") | 7007–7009 | `07-score-200-row`, `07-score-10-row`, `07-score-125-row` |
| 8 | SLA at 0h01, 11h59, 12h00, 35h59, 36h00, 47h59, 48h00, 999h00 | 7010–7017 | `08-sla-<minutes>m-row` |
| 9 | Initials X and MTL, centred | 7018, 7019 | `09-initials-X-row`, `09-initials-MTL-row` |
| 10 | Same initials as me, different name: tooltip disambiguates | 7020 | `10-same-initials-row` (hovered) |
| 11 | 40 Active, 15 Compliance: counts, scroll | all | `11-forty-active` |
| 12 | Trigger, status, withdrawal, escalation inside 2s: row lands in Compliance consistent | 7021 | `12-live-sequence-row` |
| 13 | Both popovers on one row: the second closes the first | 7001 | `13-second-popover-closes-first` |
| 14 | 1024px: scrolls, sticky holds, edge shows, Actions reachable | — | `14-viewport-1024` |
| 15 | 200% zoom (800 CSS px): same checks | — | `15-viewport-800` |

Cross-cutting, every row on both queues: no row over 52px, no text overflowing
its cell without an ellipsis, nothing thrown.
