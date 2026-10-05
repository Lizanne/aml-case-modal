/**
 * The stress fixture, exercised - PROTOTYPE-TABLE.md, the edge list.
 *
 * ?fixture=stress loads mock-cases-stress.json: one case per thing that could
 * break a cell, plus filler to 40 Active and 15 Compliance. Every case is
 * tagged with a `stress` annotation the checks and the screenshots key on.
 *
 * Reports with the case id and the cell. Screenshots go to
 * docs/handoff/stress/ for a visual review, one per edge.
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'http://localhost:4200';
const FX = 'fixture=stress';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../docs/handoff/stress');
mkdirSync(OUT, { recursive: true });

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

const goto = async (tab = 'active', extra = '') => {
  await page.goto(`${BASE}/?view=cases&tab=${tab}&${FX}${extra}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
};
/** Rows as the component sees them, with their tr index - the row shows the player's id, not the case's. */
const rowsInfo = () => page.evaluate(() => {
  const cmp = window.ng?.getComponent?.(document.querySelector('cases-table'));
  if (!cmp) return null;
  return cmp.rows().map((c, i) => ({ i, id: c.id, stress: c.stress ?? null, triggers: c.triggers.length, severity: c.severity }));
});
const rowOf = async (id) => (await rowsInfo())?.find((r) => r.id === id)?.i ?? -1;
const shot = async (name, locator, pad = 8) => {
  const b = await locator.boundingBox();
  if (!b) return;
  await page.screenshot({ path: path.join(OUT, `${name}.png`), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } });
};
const rowShot = async (name, i) => { const tr = page.locator('tbody tr').nth(i); await tr.scrollIntoViewIfNeeded(); await shot(name, tr, 4); };

try {
  await goto('active');
  const rows = await rowsInfo();
  check('the stress fixture loaded, annotated', !!rows && rows.some((r) => r.stress), String(rows?.length));
  if (!rows?.some((r) => r.stress)) throw new Error(`stress fixture not loaded: ${rows?.length ?? 0} rows, none annotated - is the served bundle current?`);

  // ---------------------------------------------------------------- generic: every row, both tabs
  console.log('\nEvery row, both queues: height, overflow, nothing thrown');
  const generic = { heights: [], overflow: [] };
  for (const tab of ['active', 'compliance']) {
    await goto(tab);
    const r = await page.evaluate(() => {
      const cmp = window.ng.getComponent(document.querySelector('cases-table'));
      const ids = cmp.rows().map((c) => c.id);
      const trs = [...document.querySelectorAll('tbody tr')];
      const heights = trs.map((tr, i) => ({ id: ids[i], h: Math.round(tr.getBoundingClientRect().height) })).filter((x) => x.h !== 53);
      const overflow = [];
      trs.forEach((tr, i) => {
        tr.querySelectorAll('td').forEach((td) => {
          const cell = [...td.classList].find((k) => k.startsWith('cell--')) ?? 'td';
          td.querySelectorAll('*').forEach((el) => {
            const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
            if (!own) return;
            const cs = getComputedStyle(el);
            const rg = document.createRange(); rg.selectNodeContents(el);
            const natural = rg.getBoundingClientRect().width; const box = el.getBoundingClientRect().width;
            if (natural > box + 0.5 && !(cs.overflow === 'hidden' && cs.textOverflow === 'ellipsis')) {
              overflow.push({ id: ids[i], cell, el: el.className || el.tagName, natural: Math.round(natural), box: Math.round(box) });
            }
          });
        });
      });
      return { heights, overflow, count: trs.length };
    });
    generic.heights.push(...r.heights); generic.overflow.push(...r.overflow);
    console.log(`  ${tab}: ${r.count} rows`);
  }
  check('no row exceeds 52px (plus its 1px rule)', generic.heights.length === 0, generic.heights.map((x) => `${x.id}: ${x.h}px`).join('; '));
  check('no text overflows its cell without an ellipsis', generic.overflow.length === 0, generic.overflow.map((x) => `${x.id} ${x.cell} .${x.el} ${x.natural}>${x.box}`).join('; '));

  // ---------------------------------------------------------------- 11. volume
  console.log('\n11. Forty and fifteen: counts and scroll');
  await goto('active');
  const vol = await page.evaluate(() => {
    const cmp = window.ng.getComponent(document.querySelector('cases-table'));
    const counts = [...document.querySelectorAll('.nav__count')].map((e) => ({ text: e.textContent.trim(), clipped: e.scrollWidth > e.clientWidth + 0.5 }));
    const tabs = [...document.querySelectorAll('.mat-mdc-tab')].map((t) => t.textContent.trim());
    const sc = document.querySelector('.table-scroll');
    const t0 = performance.now(); for (let k = 0; k < 10; k++) { sc.scrollTop = (k % 2) * 2000; void sc.offsetHeight; } const ms = performance.now() - t0;
    return { active: cmp.cases.activeCount(), compliance: cmp.cases.complianceCount(), counts, tabs, rows: document.querySelectorAll('tbody tr').length, scrollMs: Math.round(ms) };
  });
  check('40 Active, 15 Compliance, all rendered without pagination', vol.active === 40 && vol.compliance === 15 && vol.rows === 40, JSON.stringify({ active: vol.active, compliance: vol.compliance, rows: vol.rows }));
  check('the LHM counts show two digits without clipping', vol.counts.some((c) => /\b40\b/.test(c.text)) && vol.counts.some((c) => /\b15\b/.test(c.text)) && vol.counts.every((c) => !c.clipped), JSON.stringify(vol.counts));
  check('ten scroll round-trips over forty rows stay well under a frame budget each', vol.scrollMs < 500, `${vol.scrollMs}ms`);
  await shot('11-forty-active', page.locator('.cases'), 0);

  // ---------------------------------------------------------------- 1. twenty triggers
  console.log('\n1. Twenty triggers with 120-character details');
  let i = await rowOf('7001');
  await rowShot('01-twenty-triggers-row', i);
  const t1 = await page.evaluate((i) => {
    const tr = document.querySelectorAll('tbody tr')[i];
    const more = tr.querySelector('.trig__more'); const line = tr.querySelector('.trig__line'); const cell = tr.querySelector('.cell--triggers');
    return { more: more?.textContent.trim(), fits: line.getBoundingClientRect().right <= cell.getBoundingClientRect().right + 0.5 && more.getBoundingClientRect().right <= cell.getBoundingClientRect().right + 0.5 };
  }, i);
  check('7001 triggers: +19 and the line fits the cell', t1.more === '+19' && t1.fits, JSON.stringify(t1));
  await page.locator('tbody tr').nth(i).locator('.trig__more').click(); await page.waitForTimeout(650);
  const p1 = await page.evaluate(() => {
    const p = document.querySelector('.mat-mdc-menu-panel'); const list = p.querySelector('.strip__list');
    const items = [...p.querySelectorAll('.trigger')].map((r) => r.getBoundingClientRect());
    const overlaps = items.slice(1).filter((b, k) => b.top < items[k].bottom - 0.5).length;
    return { rows: items.length, scrolls: list.scrollHeight > list.clientHeight + 1, h: Math.round(list.getBoundingClientRect().height), overlaps };
  });
  check('7001 popover: 20 rows, scrolls inside 360px, no two rows share a line', p1.rows === 20 && p1.scrolls && p1.h <= 360 && p1.overlaps === 0, JSON.stringify(p1));
  await shot('01-twenty-triggers-popover', page.locator('.mat-mdc-menu-panel'), 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // ---------------------------------------------------------------- 2. thirteen actions, long agents
  console.log('\n2. Thirteen completed actions by long-named agents');
  i = await rowOf('7002');
  await rowShot('02-long-agents-row', i);
  const r2 = await page.evaluate((i) => { const tr = document.querySelectorAll('tbody tr')[i]; return { items: tr.querySelectorAll('.work__item').length, more: tr.querySelector('.work__more')?.textContent.trim() }; }, i);
  check('7002 row: three required only, +10', r2.items === 3 && r2.more === '+10', JSON.stringify(r2));
  await page.locator('tbody tr').nth(i).locator('.work__more').click(); await page.waitForTimeout(650);
  const p2 = await page.evaluate(() => {
    const p = document.querySelector('.mat-mdc-menu-panel'); const sc = p.querySelector('.groups');
    const entries = [...p.querySelectorAll('.entry')].map((e) => e.getBoundingClientRect());
    const metas = [...p.querySelectorAll('.entry__meta')].map((m) => ({ clipped: m.scrollWidth > m.clientWidth + 0.5, ellipsis: getComputedStyle(m).textOverflow === 'ellipsis', title: !!m.getAttribute('title') }));
    return { entries: entries.length, scrolls: sc.scrollHeight > sc.clientHeight + 1, overlaps: entries.slice(1).filter((b, k) => b.top < entries[k].bottom - 0.5).length, truncated: metas.filter((m) => m.clipped).length, allEllipsis: metas.every((m) => m.ellipsis && m.title) };
  });
  check('7002 popover: 13 entries, scrolls, long agent names truncate with a title, nothing overlaps', p2.entries === 13 && p2.scrolls && p2.overlaps === 0 && p2.truncated > 0 && p2.allEllipsis, JSON.stringify(p2));
  await shot('02-long-agents-popover', page.locator('.mat-mdc-menu-panel'), 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // ---------------------------------------------------------------- 3. all done, nothing custom
  console.log('\n3. All required done, nothing custom');
  i = await rowOf('7003');
  const r3 = await page.evaluate((i) => { const tr = document.querySelectorAll('tbody tr')[i]; const items = [...tr.querySelectorAll('.work__item')]; return { n: items.length, done: items.filter((e) => e.classList.contains('work__item--done') && e.querySelector('.work__tick')).length, colour: getComputedStyle(items[0]).color, more: !!tr.querySelector('.work__more') }; }, i);
  check('7003 row: three ticked, muted, no +N', r3.n === 3 && r3.done === 3 && r3.colour === 'rgb(82, 82, 91)' && !r3.more, JSON.stringify(r3));
  await rowShot('03-all-done-row', i);

  // ---------------------------------------------------------------- 4. zero triggers
  console.log('\n4. Zero triggers');
  i = await rowOf('7004');
  const r4 = await page.evaluate((i) => { const tr = document.querySelectorAll('tbody tr')[i]; const e = tr.querySelector('.trig__empty'); return { text: e?.textContent.trim(), colour: e ? getComputedStyle(e).color : null, hasTrig: !!tr.querySelector('.trig__name') }; }, i);
  check('7004 triggers: "No triggers", muted, nothing thrown', r4.text === 'No triggers' && r4.colour === 'rgb(82, 82, 91)' && !r4.hasTrig && errors.length === 0, JSON.stringify({ ...r4, errors }));
  await rowShot('04-zero-triggers-row', i);

  // ---------------------------------------------------------------- 5. 80-character trigger name
  console.log('\n5. An 80-character trigger name');
  i = await rowOf('7005');
  const r5 = await page.evaluate((i) => { const tr = document.querySelectorAll('tbody tr')[i]; const n = tr.querySelector('.trig__name'); const rg = document.createRange(); rg.selectNodeContents(n); return { clipped: rg.getBoundingClientRect().width > n.getBoundingClientRect().width + 0.5, ellipsis: getComputedStyle(n).textOverflow === 'ellipsis', titleLen: (n.closest('.trig__line').getAttribute('title') ?? '').length }; }, i);
  check('7005 triggers: truncates with an ellipsis, the full 80 on the title', r5.clipped && r5.ellipsis && r5.titleLen === 80, JSON.stringify(r5));
  await rowShot('05-long-trigger-name-row', i);

  // ---------------------------------------------------------------- 6. longest id and status
  console.log('\n6. Fifteen-digit id, GAMSTOP restricted');
  i = await rowOf('7006');
  const r6 = await page.evaluate((i) => { const tr = document.querySelectorAll('tbody tr')[i]; const td = tr.querySelector('.cell--player'); const cs = getComputedStyle(td); return { w: Math.round(td.getBoundingClientRect().width), sticky: cs.position === 'sticky', id: tr.querySelector('.linkish')?.textContent.trim(), status: tr.querySelector('.player-status')?.textContent.trim(), fits: [...td.querySelectorAll('*')].every((e) => e.scrollWidth <= e.clientWidth + 0.5 || getComputedStyle(e).textOverflow === 'ellipsis') }; }, i);
  check('7006 player: sticky column holds at >= 184px, id and status fit or ellipsise', r6.sticky && r6.w >= 184 && r6.id === '999999999999999' && r6.status === 'GAMSTOP restricted' && r6.fits, JSON.stringify(r6));
  await rowShot('06-longest-player-row', i);

  // ---------------------------------------------------------------- 7. scoring extremes and the gap
  console.log('\n7. Scores 200, 10 and 125');
  for (const [id, score, band] of [['7007', 200, 'Urgent'], ['7008', 10, 'Low'], ['7009', 125, 'High']]) {
    i = await rowOf(id);
    const r = await page.evaluate((i) => document.querySelectorAll('tbody tr')[i].querySelector('.prio').textContent.replace(/warning_amber/, '').replace(/\s+/g, ' ').trim(), i);
    check(`${id} priority: "${score} ${band}"`, r === `${score} ${band}`, r);
    await rowShot(`07-score-${score}-row`, i);
  }

  // ---------------------------------------------------------------- 8. SLA boundaries
  console.log('\n8. Every SLA boundary, with the clock pinned to the boundary');
  const slaRows = rows.filter((r) => r.stress?.n === 8);
  for (const r of slaRows) {
    const got = await page.evaluate(([id, minutes]) => {
      const cmp = window.ng.getComponent(document.querySelector('cases-table'));
      const c = cmp.cases.byId(id);
      // Pin the clock to exactly the seeded boundary, so a tick of the live clock cannot move the result.
      cmp.cases.setNow(Date.parse(c.createdAt) + minutes * 60_000);
      window.ng.applyChanges(cmp);
      const i = cmp.rows().findIndex((x) => x.id === id);
      const pill = document.querySelectorAll('tbody tr')[i].querySelector('.cell--sla ui-pill');
      const r = pill.getBoundingClientRect();
      return { band: cmp.cases.slaBandOf(c), text: cmp.cases.slaText(c), tone: pill.getAttribute('data-tone'), i, fits: pill.scrollWidth <= pill.clientWidth + 0.5 && r.right <= pill.closest('td').getBoundingClientRect().right + 0.5 };
    }, [r.id, r.stress.slaMinutes]);
    const h = r.stress.slaMinutes / 60;
    const expected = h < 12 ? 'fresh' : h < 36 ? 'warn' : h < 48 ? 'late' : 'breached';
    check(`${r.id} SLA ${r.stress.name.replace('SLA ', '')}: ${expected}`, got.band === expected && got.text === r.stress.name.replace('SLA ', '') && got.fits, JSON.stringify(got));
    await rowShot(`08-sla-${r.stress.slaMinutes}m-row`, got.i);
  }
  await page.evaluate(() => { const cmp = window.ng.getComponent(document.querySelector('cases-table')); cmp.cases.setNow(Date.now()); window.ng.applyChanges(cmp); });

  // ---------------------------------------------------------------- 9. one- and three-letter initials
  console.log('\n9. Initials X and MTL');
  for (const [id, want] of [['7018', 'X'], ['7019', 'MTL']]) {
    i = await rowOf(id);
    const r = await page.evaluate((i) => { const av = document.querySelectorAll('tbody tr')[i].querySelector('.lock-av'); const s = av.querySelector('span[aria-hidden]'); const a = av.getBoundingClientRect(); const b = s.getBoundingClientRect(); return { text: s.textContent.trim(), dx: +((b.left + b.width / 2) - (a.left + a.width / 2)).toFixed(1), dy: +((b.top + b.height / 2) - (a.top + a.height / 2)).toFixed(1), fits: b.width <= a.width }; }, i);
    check(`${id} avatar: "${want}" centred in the disc`, r.text === want && Math.abs(r.dx) <= 1 && Math.abs(r.dy) <= 1.5 && r.fits, JSON.stringify(r));
    await rowShot(`09-initials-${want}-row`, i);
  }

  // ---------------------------------------------------------------- 10. same initials, different agent
  console.log('\n10. Same initials as me, a different name');
  i = await rowOf('7020');
  const r10 = await page.evaluate((i) => { const av = document.querySelectorAll('tbody tr')[i].querySelector('.lock-av'); return { initials: av.querySelector('span[aria-hidden]').textContent.trim(), tip: av.getAttribute('ng-reflect-message'), name: av.getAttribute('aria-label'), mine: av.classList.contains('lock-av--mine') }; }, i);
  check('7020 lock: AK like me, but the tooltip and name say Anna Kowalczyk, not "you"', r10.initials === 'AK' && !r10.mine && /Anna Kowalczyk/.test(r10.tip ?? '') && /Anna Kowalczyk/.test(r10.name ?? '') && !/you/.test(r10.tip ?? ''), JSON.stringify(r10));
  await page.locator('tbody tr').nth(i).locator('.lock-av').hover(); await page.waitForTimeout(500);
  await rowShot('10-same-initials-row', i);
  await page.mouse.move(0, 0);

  // ---------------------------------------------------------------- 13. both popovers on one row
  console.log('\n13. Both popovers on one row, in sequence');
  i = await rowOf('7001');
  await page.locator('tbody tr').nth(i).locator('.trig__more').click(); await page.waitForTimeout(400);
  await page.locator('tbody tr').nth(i).locator('.work__more').click({ force: true }); await page.waitForTimeout(400);
  await page.locator('tbody tr').nth(i).locator('.work__more').click(); await page.waitForTimeout(500);
  const r13 = await page.evaluate(() => ({ panels: document.querySelectorAll('.mat-mdc-menu-panel').length, work: !!document.querySelector('.mat-mdc-menu-panel.pop--work'), trig: !!document.querySelector('.mat-mdc-menu-panel.pop--trig') }));
  check('7001: the second popover closes the first - one panel, the Work one', r13.panels === 1 && r13.work && !r13.trig, JSON.stringify(r13));
  await shot('13-second-popover-closes-first', page.locator('.mat-mdc-menu-panel'), 0);
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);

  // ---------------------------------------------------------------- 12. the live sequence
  console.log('\n12. Four live events inside two seconds');
  await goto('active');
  const r12 = await page.evaluate(async () => {
    const ng = window.ng; const cmp = ng.getComponent(document.querySelector('cases-table')); const s = cmp.cases;
    const id = '7021';
    const before = { triggers: s.byId(id).triggers.length, status: s.byId(id).player.status, score: s.byId(id).priority.score, severity: s.byId(id).severity };
    const t0 = performance.now();
    s.cases.update((l) => l.map((c) => c.id === id ? { ...c, triggers: [...c.triggers, { id: '7021-live', name: 'Live - Velocity', detail: 'Arrived during the stress run.', at: new Date().toISOString() }] } : c));
    await new Promise((r) => setTimeout(r, 400));
    s.cases.update((l) => l.map((c) => c.id === id ? { ...c, player: { ...c.player, status: 'GAMSTOP_RESTRICTED' } } : c));
    await new Promise((r) => setTimeout(r, 400));
    s.rescore(id, { pendingWithdrawals: 2500 });
    await new Promise((r) => setTimeout(r, 400));
    s.setSeverity(id, 'COMPLIANCE');
    const elapsed = performance.now() - t0;
    ng.applyChanges(cmp); await new Promise((r) => setTimeout(r, 400));
    const c = s.byId(id);
    return { before, elapsed: Math.round(elapsed), after: { triggers: c.triggers.length, status: c.player.status, score: c.priority.score, severity: c.severity }, inActive: s.activeCases().some((x) => x.id === id), inCompliance: s.complianceCases().some((x) => x.id === id), errors: 0 };
  });
  check('7021 store: trigger +1, status changed, score re-derived, severity COMPLIANCE, all inside 2s', r12.elapsed < 2000 && r12.after.triggers === r12.before.triggers + 1 && r12.after.status === 'GAMSTOP_RESTRICTED' && r12.after.score > r12.before.score && r12.after.severity === 'COMPLIANCE' && !r12.inActive && r12.inCompliance, JSON.stringify(r12));
  await page.locator('.mat-mdc-tab', { hasText: 'Compliance' }).click(); await page.waitForTimeout(600);
  i = await rowOf('7021');
  const row12 = await page.evaluate((i) => { const tr = document.querySelectorAll('tbody tr')[i]; return tr ? { status: tr.querySelector('.player-status')?.textContent.trim(), more: tr.querySelector('.trig__more')?.textContent.trim() ?? '', prio: tr.querySelector('.prio')?.textContent.replace(/warning_amber/, '').replace(/\s+/g, ' ').trim(), sev: tr.querySelector('ui-pill[data-sev]')?.getAttribute('data-sev') } : null; }, i);
  check('7021 row, now in Compliance: status, trigger count and priority all consistent', i >= 0 && row12?.status === 'GAMSTOP restricted' && row12.more === '+1' && Number(row12.prio.split(' ')[0]) === r12.after.score && row12.sev === 'COMPLIANCE', JSON.stringify({ i, row12 }));
  if (i >= 0) await rowShot('12-live-sequence-row', i);

  // ---------------------------------------------------------------- 14 + 15. narrow and zoomed
  for (const [n, width, label] of [[14, 1024, '1024px wide'], [15, 800, '200% zoom (800 CSS px)']]) {
    console.log(`\n${n}. Viewport ${label}`);
    await page.setViewportSize({ width, height: 900 });
    await goto('active');
    const v = await page.evaluate(async () => {
      const sc = document.querySelector('.table-scroll'); const td = document.querySelector('tbody .cell--player'); const cs = getComputedStyle(td);
      const before = Math.round(td.getBoundingClientRect().left);
      sc.scrollLeft = 200; await new Promise((r) => setTimeout(r, 350));
      const after = Math.round(td.getBoundingClientRect().left);
      const shadow = getComputedStyle(td, '::after').opacity;
      sc.scrollLeft = sc.scrollWidth; await new Promise((r) => setTimeout(r, 350));
      const act = document.querySelector('tbody .cell--actions').getBoundingClientRect(); const box = sc.getBoundingClientRect();
      return { scrolls: sc.scrollWidth > sc.clientWidth + 1, sticky: cs.position === 'sticky', held: before === after, shadow, actionsReachable: act.right <= box.right + 0.5 && act.left >= box.left - 0.5, playerW: Math.round(td.getBoundingClientRect().width) };
    });
    check(`${label}: table scrolls, Player column holds and shows its edge, Actions reachable`, v.scrolls && v.sticky && v.held && v.shadow === '1' && v.actionsReachable && v.playerW >= 184, JSON.stringify(v));
    await page.screenshot({ path: path.join(OUT, `${n}-viewport-${width}.png`) });
    await page.evaluate(() => { document.querySelector('.table-scroll').scrollLeft = 0; });
  }
  await page.setViewportSize({ width: 1600, height: 1000 });

  console.log('\nNo console errors along the way');
  check('the page threw nothing', errors.length === 0, errors.slice(0, 3).join(' | '));
  console.log(`\nScreenshots in ${OUT}`);
  console.log(`\n${failed === 0 ? 'All stress checks pass.' : `${failed} check(s) failed.`}`);
} finally {
  await browser.close();
}
process.exit(failed === 0 ? 0 : 1);
