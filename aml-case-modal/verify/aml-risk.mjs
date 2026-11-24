/**
 * The score-card's arithmetic, tested where it lives: core/aml-risk.ts is
 * plain TypeScript with no Angular in it, so Node runs it directly.
 *
 *   node verify/aml-risk.mjs
 */
import {
  SCORE_PARAMETERS,
  RISK_BANDS,
  bandFor,
  effectivePoints,
  overrideActive,
  overrideEnds,
  scoreTotal,
} from '../src/app/core/aml-risk.ts';

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail !== undefined ? ` -> ${JSON.stringify(detail)}` : ''}`);
  if (!ok) failed++;
};

const NOW = new Date('2026-11-24T09:00:00Z');
const param = (id) => SCORE_PARAMETERS.find((p) => p.id === id);

console.log('\nThe score-card as the ticket transcribes it');
check('23 parameters', SCORE_PARAMETERS.length === 23, SCORE_PARAMETERS.length);
check('worth 1,340 points in all', SCORE_PARAMETERS.reduce((n, p) => n + p.points, 0) === 1340);
check('ids are unique', new Set(SCORE_PARAMETERS.map((p) => p.id)).size === 23);

console.log('\nBands');
const names = (n) => bandFor(n).id;
check('0 and 74 are low', names(0) === 'low' && names(74) === 'low');
check('75 and 124 are medium', names(75) === 'medium' && names(124) === 'medium');
check('125 and 449 are high', names(125) === 'high' && names(449) === 'high');
check('450 and anything above is critical', names(450) === 'critical' && names(1340) === 'critical');
check('critical has no upper limit', RISK_BANDS.at(-1).end === null);

console.log('\nPoints for one parameter');
const pep = param('domestic-pep');
check('met scores its points', effectivePoints(pep, { met: true }, NOW) === 75);
check('not met scores zero', effectivePoints(pep, { met: false }, NOW) === 0);

const override = (points, days, at = '2026-11-20T10:00:00Z') => ({
  points,
  days,
  at,
  by: 'Liz Fernandez',
  reason: 'Spoke to the customer',
});
check(
  'an override to zero beats a met result',
  effectivePoints(pep, { met: true, override: override(0, 30) }, NOW) === 0,
);
check(
  'an override to full points beats a not-met result',
  effectivePoints(pep, { met: false, override: override(75, null) }, NOW) === 75,
);
check('"until revoked" never lapses', overrideActive(override(0, null, '2020-01-01T00:00:00Z'), NOW));
check('nor does it have an end date', overrideEnds(override(0, null)) === null);
check('a 30 day override is active on day 4', overrideActive(override(0, 30), NOW));
check('and ends 30 days after it was made', overrideEnds(override(0, 30)).toISOString() === '2026-12-20T10:00:00.000Z');
check('a 3 day override has lapsed by day 4', !overrideActive(override(0, 3), NOW));
check(
  'a lapsed override hands the result back to the system',
  effectivePoints(pep, { met: true, override: override(0, 3) }, NOW) === 75,
);

console.log('\nTotal');
check('nothing met is zero', scoreTotal({}, NOW) === 0);
check(
  'met parameters add up, overrides included',
  scoreTotal(
    {
      'par-link': { met: true },
      'linked-similar': { met: true },
      roulette: { met: true, override: override(0, null) },
      'domestic-pep': { met: false, override: override(75, 30) },
    },
    NOW,
  ) === 175,
);

console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed ? 1 : 0);
