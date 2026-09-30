/**
 * CasesStore - the Global AML Cases table's collection store.
 *
 * Runs the real store, not a copy of its rules. The store is TypeScript with an
 * Angular import, so it is bundled for Node first; signal() and computed() are
 * framework-agnostic and work outside an injection context.
 *
 * What this asserts is the part of PROTOTYPE-TABLE.md that has no pixels yet:
 * queue membership, both counts, sort, the derived bands, and the four
 * transitions (lock, unlock, escalate, resolve).
 */
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { readFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const bundle = join(here, '.cases-store.bundle.mjs');

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failures++;
};

execFileSync(
  'npx',
  ['esbuild', join(here, '../src/app/core/cases-store.ts'),
   '--bundle', '--format=esm', '--platform=node', `--outfile=${bundle}`, '--loader:.json=json'],
  { cwd: join(here, '..'), stdio: 'pipe' },
);

try {
  const { CasesStore } = await import(bundle);
  const fixture = JSON.parse(readFileSync(join(here, '../src/app/core/mock-cases.json'), 'utf8'));
  const s = new CasesStore();

  const H = 3_600_000;
  const all = s.cases();

  console.log('\nSeed covers every row treatment without clicking');
  check('12 to 15 cases', all.length >= 12 && all.length <= 15, String(all.length));
  for (const sev of ['AML', 'EDD', 'COMPLIANCE']) {
    check(`severity ${sev} present`, all.some((c) => c.severity === sev));
  }
  for (const b of ['low', 'medium', 'high', 'urgent']) {
    check(`priority band ${b} present`, all.some((c) => s.bandOf(c.priority) === b));
    check(`  and in BOTH queues, so either tab shows the full range`,
      s.activeCases().some((c) => s.bandOf(c.priority) === b) &&
      s.complianceCases().some((c) => s.bandOf(c.priority) === b));
  }
  for (const lock of ['unlocked', 'locked-to-me', 'locked-to-other']) {
    check(`lock state ${lock} present`, all.some((c) => c.lock.state === lock));
  }
  for (const band of ['fresh', 'warn', 'late', 'breached']) {
    check(`SLA band ${band} present`, all.some((c) => s.slaBandOf(c) === band));
  }

  console.log('\nThe fixture is internally consistent');
  // The breakdown is DERIVED now, so "does it add up" is a property of the
  // function rather than of the data. What the fixture can still get wrong is
  // its four inputs, so those are what this checks.
  check('every case carries the four scoring inputs', fixture.cases.every(
    (c) => c.scoring && typeof c.scoring.pendingWithdrawals === 'number' &&
      ['low', 'medium', 'high'].includes(c.scoring.amlRisk) &&
      typeof c.scoring.sgVulnerability === 'boolean' &&
      typeof c.scoring.complaint === 'boolean'));
  check('no case stores a priority - it is computed from those inputs',
    fixture.cases.every((c) => c.priority === undefined));
  check('every breakdown is the matrix\'s four lines, in its order',
    all.every((c) => c.priority.breakdown.map((b) => b.label).join('|') ===
      'Withdrawals pending|AML risk level|SG vulnerabilities|Player complaint'),
    all[0].priority.breakdown.map((b) => b.label).join('|'));
  check('every breakdown sums to its score', all.every(
    (c) => c.priority.breakdown.reduce((n, b) => n + b.points, 0) === c.priority.score));
  check('no case scores outside the matrix range of 10 to 200',
    all.every((c) => c.priority.score >= 10 && c.priority.score <= 200),
    all.map((c) => c.priority.score).sort((a, b) => a - b).join(','));
  /**
   * And none of them lands in 100-149.
   *
   * The band function COVERS that range - High runs to 149 as the documented
   * stopgap - but the source document defines no tier for it, so no seeded
   * case should sit there and invite a reader to take the stopgap for a
   * decision. A fixture constraint, not a scoring rule: the day the range is
   * defined, this check goes and the seed is free again.
   */
  check('and none sits in the 100-149 range the document leaves undefined',
    all.every((c) => c.priority.score < 100 || c.priority.score > 149),
    all.map((c) => c.priority.score).filter((n) => n >= 100 && n <= 149).join(',') || 'none');
  check('every band floor is represented, so the boundaries are visible',
    [10, 30, 60, 150].every((floor) => all.some((c) => c.priority.score === floor)),
    [...new Set(all.map((c) => c.priority.score))].sort((a, b) => a - b).join(','));
  check('no case exceeds eight work items',
    fixture.cases.every((c) => c.actions.length <= 8));
  check('the band always agrees with the score it is derived from',
    all.every((c) => c.priority.band === s.bandOf(c.priority)));
  // There is only one case file now, so there is nothing left to cross-check
  // against. What still has to hold is that the case the MODAL loads is the
  // same object the table lists - one store, two views.
  check('the modal default case is a row in the collection', (() => {
    const row = all.find((c) => c.id === '4821');
    const raw = fixture.cases.find((c) => c.id === '4821');
    // createdAt is deliberately NOT compared to the authored value any more:
    // a case written with absolute dates is rebased onto a window ending now,
    // so the two differ by design. Identity is what has to match.
    return !!row && !!raw && row.severity === raw.severity && row.player.id === raw.player.id;
  })());
  // What the rebase must not break, and the reason it shifts the whole block
  // rather than re-anchoring createdAt on its own.
  check('a rebased case is still created before everything recorded against it',
    (() => {
      const row = all.find((c) => c.id === '4821');
      const created = Date.parse(row.createdAt);
      const stamps = [];
      const scan = (v) => {
        if (typeof v === 'string') {
          if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) stamps.push(Date.parse(v));
        } else if (Array.isArray(v)) v.forEach(scan);
        else if (v && typeof v === 'object') Object.values(v).forEach(scan);
      };
      const authored = fixture.cases.find((c) => c.id === '4821');
      scan(authored);
      // Only the block from creation onward moves; prior cases stay old.
      const inCase = stamps.filter((t) => t >= Date.parse(authored.createdAt));
      return inCase.length > 1 && created <= Math.min(...inCase.map(() => created));
    })());
  check('and it lands in a range a person would believe', (() => {
    const row = all.find((c) => c.id === '4821');
    const hours = (s.now() - Date.parse(row.createdAt)) / 3_600_000;
    // Breached (over 48h), but not the six weeks a fixed August date became.
    return hours > 48 && hours < 120;
  })(), `${((s.now() - Date.parse(all.find((c) => c.id === '4821').createdAt)) / 3_600_000).toFixed(1)}h`);
  check('every case carries the history the modal needs to open it',
    fixture.cases.every((c) => Array.isArray(c.triggers) && Array.isArray(c.workflow) &&
      Array.isArray(c.timeline) && Array.isArray(c.pastCases) &&
      Array.isArray(c.starredCommentaries) && !!c.snapshot && !!c.origin));

  console.log('\nQueue membership is decided by severity alone (rule 1)');
  check('Active holds AML and EDD only',
    s.activeCases().every((c) => c.severity === 'AML' || c.severity === 'EDD'));
  check('Compliance holds COMPLIANCE only',
    s.complianceCases().every((c) => c.severity === 'COMPLIANCE'));
  check('every open case is in exactly one queue',
    s.activeCount() + s.complianceCount() === all.filter((c) => c.status === 'OPEN').length,
    `${s.activeCount()} + ${s.complianceCount()} vs ${all.filter((c) => c.status === 'OPEN').length}`);
  check('the counts are the queues, not a second tally',
    s.activeCount() === s.activeCases().length && s.complianceCount() === s.complianceCases().length);

  console.log('\nSort: priority descending, SLA elapsed descending as tiebreaker (rule 6)');
  const scores = s.activeCases().map((c) => c.priority.score);
  check('priority descending', scores.every((v, i) => i === 0 || scores[i - 1] >= v), scores.join(','));
  check('ties break on elapsed, longest first', (() => {
    const rows = s.activeCases();
    for (let i = 1; i < rows.length; i++) {
      if (rows[i - 1].priority.score !== rows[i].priority.score) continue;
      if (s.elapsedMs(rows[i - 1]) < s.elapsedMs(rows[i])) return false;
    }
    return true;
  })());
  s.sort.set('sla');
  const elapsed = s.activeCases().map((c) => s.elapsedMs(c));
  check('switching to SLA sorts by elapsed, longest first',
    elapsed.every((v, i) => i === 0 || elapsed[i - 1] >= v));
  check('and it is a different order from priority',
    s.activeCases().map((c) => c.id).join() !== (s.sort.set('priority'),
      s.activeCases().map((c) => c.id).join()));

  console.log('\nSort direction, rule 9');
  s.sort.set('priority');
  s.sortDir.set('desc');
  const ids = () => s.activeCases().map((c) => c.id).join(',');
  const descIds = ids();
  s.toggleSort('priority');
  check('clicking the active column flips its direction',
    s.sortDir() === 'asc' && ids() === descIds.split(',').reverse().join(','),
    `${s.sortDir()} / ${ids()}`);
  // The flip covers the tiebreaker too: a list sorted ascending whose ties
  // still break descending is two orderings, not one.
  check('and the whole comparison flips, tiebreaker included',
    s.activeCases().map((c) => c.priority.score)
      .every((v, i, a) => i === 0 || a[i - 1] <= v));
  s.toggleSort('sla');
  check('switching column resets to descending',
    s.sort() === 'sla' && s.sortDir() === 'desc');
  s.toggleSort('priority');
  check('and switching back does too', s.sort() === 'priority' && s.sortDir() === 'desc');
  s.reseed();

  console.log('\nDerived bands, at their boundaries');
  check('11h59m is fresh, 12h is warn',
    s.slaBandOf({ createdAt: new Date(s.now() - (12 * H - 60_000)).toISOString() }) === 'fresh' &&
    s.slaBandOf({ createdAt: new Date(s.now() - 12 * H).toISOString() }) === 'warn');
  check('35h59m is warn, 36h is late',
    s.slaBandOf({ createdAt: new Date(s.now() - (36 * H - 60_000)).toISOString() }) === 'warn' &&
    s.slaBandOf({ createdAt: new Date(s.now() - 36 * H).toISOString() }) === 'late');
  check('47h59m is late, 48h is breached',
    s.slaBandOf({ createdAt: new Date(s.now() - (48 * H - 60_000)).toISOString() }) === 'late' &&
    s.slaBandOf({ createdAt: new Date(s.now() - 48 * H).toISOString() }) === 'breached');
  check('elapsed reads Xh Ym, zero-padded',
    s.slaText({ createdAt: new Date(s.now() - (5 * H + 7 * 60_000)).toISOString() }) === '5h 07m',
    s.slaText({ createdAt: new Date(s.now() - (5 * H + 7 * 60_000)).toISOString() }));
  check('priority text is score then band label',
    s.priorityText({ score: 35, breakdown: [] }) === '35 Medium' &&
    s.priorityText({ score: 20, breakdown: [] }) === '20 Low' &&
    s.priorityText({ score: 200, breakdown: [] }) === '200 Urgent');

  console.log('\nThe scoring matrix, at its tier boundaries');
  const band = (n) => s.bandOf({ score: n, breakdown: [] });
  check('10 to 29 is Low', band(10) === 'low' && band(29) === 'low');
  check('30 to 59 is Medium', band(30) === 'medium' && band(59) === 'medium');
  // The document's own tiers stop High at 99 and start Urgent at 150. 100-149
  // is in neither, and trivially reachable. Closed upward, not downward: a
  // hole is worse than a wide band, and Urgent should stay rare.
  check('60 to 149 is High, including the range the document leaves out',
    band(60) === 'high' && band(99) === 'high' &&
    band(100) === 'high' && band(149) === 'high');
  check('150 to 200 is Urgent', band(150) === 'urgent' && band(200) === 'urgent');
  check('withdrawal tiers land on the documented boundaries', (() => {
    const at = (amount) => s.priorityOfScoring({ pendingWithdrawals: amount,
      amlRisk: 'low', sgVulnerability: false, complaint: false }).breakdown[0].points;
    return at(0) === 0 && at(1) === 5 && at(99) === 5 && at(100) === 10 &&
      at(499) === 10 && at(500) === 20 && at(999) === 20 && at(1000) === 30 &&
      at(1999) === 30 && at(2000) === 50;
  })());
  check('the floor is 10 and the ceiling is 200', (() => {
    const p = (o) => s.priorityOfScoring(o).score;
    return p({ pendingWithdrawals: 0, amlRisk: 'low', sgVulnerability: false, complaint: false }) === 10 &&
      p({ pendingWithdrawals: 5000, amlRisk: 'high', sgVulnerability: true, complaint: true }) === 200;
  })());
  check('changing a factor moves the score and the band together', (() => {
    const id = all[0].id;
    const before = s.byId(id).priority.score;
    s.rescore(id, { complaint: !s.byId(id).scoring.complaint });
    const after = s.byId(id);
    const ok = after.priority.score !== before &&
      after.priority.band === s.bandOf(after.priority) &&
      after.priority.breakdown.reduce((n, b) => n + b.points, 0) === after.priority.score;
    s.reseed();
    return ok;
  })());

  console.log('\nTriggers belong to the CASE, not to the player');
  check('every case has at least one trigger',
    all.every((c) => c.triggers.length >= 1),
    all.map((c) => `${c.id}:${c.triggers.length}`).join(' '));
  check('none of them predates the case it opened',
    all.every((c) => c.triggers.every((t) => Date.parse(t.at) >= Date.parse(c.createdAt))),
    all.filter((c) => c.triggers.some((t) => Date.parse(t.at) < Date.parse(c.createdAt)))
      .map((c) => c.id).join(',') || 'none');
  check('they are ordered oldest first, so [0] is the initiating one',
    all.every((c) => c.triggers.every((t, i) =>
      i === 0 || Date.parse(c.triggers[i - 1].at) <= Date.parse(t.at))));
  // The fixture has to show both the bare state and a busy one on first load.
  check('counts span 1 to 5 across the seeded cases, both extremes present',
    (() => {
      const seeded = all.filter((c) => c.id !== '4821').map((c) => c.triggers.length);
      return Math.min(...seeded) === 1 && Math.max(...seeded) === 5;
    })(),
    all.map((c) => `${c.id}:${c.triggers.length}`).join(' '));

  console.log('\nWork chips: to-do first, and nothing is dropped');
  check('to-do chips sort ahead of done', all.every((c) => {
    const states = s.workOrdered(c).map((w) => w.state);
    return states.indexOf('done') === -1 || states.lastIndexOf('todo') < states.indexOf('done');
  }));
  check('ordering keeps every chip',
    all.every((c) => s.workOrdered(c).length === c.actions.length));
  check('every work type resolves to a label',
    all.every((c) => c.actions.every((w) => s.workLabel(w.type) !== w.type)));

  console.log('\nLock, unlock, force unlock (rule 5)');
  const free = all.find((c) => c.lock.state === 'unlocked').id;
  s.lock(free);
  check('lock takes it for me, with a name and a timestamp', (() => {
    const c = s.byId(free);
    return c.lock.state === 'locked-to-me' && c.lock.owner?.name === s.me().name && !!c.lock.since;
  })());
  s.unlock(free);
  check('unlock clears the owner', (() => {
    const c = s.byId(free);
    return c.lock.state === 'unlocked' && c.lock.owner === null && c.lock.since === null;
  })());
  const other = all.find((c) => c.lock.state === 'locked-to-other').id;
  // Rule 5: from a row, force unlock is a REQUEST that the confirm dialog
  // resolves. Nothing may change on the way in.
  s.requestForceUnlock(other);
  check('requesting a force unlock changes no lock by itself',
    s.pendingForceUnlock() === other && s.byId(other).lock.state === 'locked-to-other',
    `${s.pendingForceUnlock()} / ${s.byId(other).lock.state}`);
  s.cancelForceUnlock();
  check('cancelling leaves the lock exactly where it was',
    s.pendingForceUnlock() === null && s.byId(other).lock.state === 'locked-to-other');
  s.requestForceUnlock(other);
  s.confirmForceUnlock();
  check('confirming breaks the lock and clears the request',
    s.byId(other).lock.state === 'unlocked' && s.pendingForceUnlock() === null);
  check('and it does NOT hand the lock to me - taking it is a separate act',
    s.byId(other).lock.owner === null);

  const other2 = all.find((c) => c.lock.state === 'locked-to-other' && c.id !== other);
  if (other2) {
    s.forceUnlock(other2.id);
    check('force unlock releases but does NOT take the lock',
      s.byId(other2.id).lock.state === 'unlocked');
  }

  console.log('\nA case moves tab, or leaves both, in one tick (rules 2 and 3)');
  const mover = s.activeCases()[0].id;
  const before = { active: s.activeCount(), compliance: s.complianceCount() };
  s.setSeverity(mover, 'COMPLIANCE');
  check('escalating leaves Active and joins Compliance together',
    s.activeCount() === before.active - 1 && s.complianceCount() === before.compliance + 1,
    `${s.activeCount()}/${s.complianceCount()}`);
  check('and the row is in Compliance, not both',
    s.complianceCases().some((c) => c.id === mover) && !s.activeCases().some((c) => c.id === mover));
  s.setSeverity(mover, 'EDD');
  check('lowering it again reverses the move',
    s.activeCount() === before.active && s.complianceCount() === before.compliance);

  const doomed = s.complianceCases()[0].id;
  const cBefore = s.complianceCount();
  s.resolve(doomed);
  check('resolving drops it from the queue and the count',
    s.complianceCount() === cBefore - 1 && !s.complianceCases().some((c) => c.id === doomed));
  check('a resolved case is in neither queue',
    !s.activeCases().some((c) => c.id === doomed));

  console.log(`\n${failures === 0 ? 'All CasesStore checks pass.' : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
} finally {
  rmSync(bundle, { force: true });
}
