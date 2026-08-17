import { chromium } from 'playwright';

/**
 * Layout-mode regression suite.
 *
 * The two-panel <-> segmented switch is measurement-driven, which makes it easy
 * to build a circular dependency: the mode changes the modal's width, the new
 * width is measured, and the mode latches. Every check below is a case that
 * latched at some point during the build.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed++;
};

const mode = async () => {
  const segmented = (await page.locator('mat-button-toggle-group').count()) === 1;
  const panels =
    (await page.locator('workflow-panel').count()) +
    (await page.locator('player-info-panel').count());
  return { segmented, panels, twoPanel: !segmented && panels === 2, narrow: segmented && panels === 1 };
};

// Opening and closing the second modal is exercised in full by dual.mjs. What
// this suite owns is the width rule itself: that the layout follows the
// number, whatever produced it, and never latches.

console.log('\nFrame 09 is not a one-way door');
await page.goto(`${BASE}/?state=09`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
check('seeded narrow, because two modals share the stage', (await mode()).narrow);
await page.locator('sg-alert-modal button[aria-label="Close alert"]').click();
await page.waitForTimeout(600);
check('closing the companion returns to two-panel', (await mode()).twoPanel);

console.log('\nA genuinely narrow window segments, and recovers');
await page.setViewportSize({ width: 700, height: 1000 });
await page.goto(`${BASE}/?state=03`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
check('700px window is segmented', (await mode()).narrow);
check('modal fits the viewport', (await page.locator('.modal').boundingBox()).width <= 700);
await page.setViewportSize({ width: 1180, height: 1000 });
await page.waitForTimeout(700);
check('growing the window restores two-panel', (await mode()).twoPanel);
await page.setViewportSize({ width: 700, height: 1000 });
await page.waitForTimeout(700);
check('shrinking it segments again', (await mode()).narrow);

console.log('\nNo squeezed two-panel anywhere across the range');
let squeezed = null;
for (const width of [1180, 1000, 900, 820, 780, 740, 700, 640, 560, 480]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.waitForTimeout(350);
  const m = await mode();
  if (m.twoPanel) {
    const left = await page.locator('player-info-panel').boundingBox();
    // The left panel is fixed at 420px; anything less means the split is being
    // squeezed rather than replaced.
    if (left && left.width < 419) squeezed = `${width}px -> left panel ${Math.round(left.width)}px`;
  }
  if (!m.twoPanel && !m.narrow) squeezed = `${width}px -> neither mode rendered`;
}
check('the split is replaced, never squeezed', squeezed === null);
if (squeezed) console.log(`       ${squeezed}`);

console.log('\nThe workflow stream never scrolls sideways');
// The stream is a grid whose implicit column is auto, and an auto track floors
// at the largest min-content contribution among its items. One nowrap flex
// child is enough to size the column for every sibling, which is exactly the
// regression this guards: cards stretched past the panel and the stream
// scrolled horizontally.
const streamFit = async (label) => {
  const r = await page.evaluate(() => {
    const stream = document.querySelector('workflow-panel .stream');
    if (!stream) return null;
    const cs = getComputedStyle(stream);
    const contentW = stream.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const wide = [];
    const fixed = [];
    const walk = (el) => {
      for (const c of el.children) {
        const w = c.getBoundingClientRect().width;
        const name =
          c.tagName.toLowerCase() +
          (typeof c.className === 'string' && c.className
            ? '.' + c.className.trim().split(/\s+/)[0]
            : '');
        if (w > contentW + 1) wide.push(`${name} ${Math.round(w)}>${Math.round(contentW)}`);
        // No descendant may declare a fixed width wider than the panel.
        const decl = getComputedStyle(c).width;
        if (/px$/.test(decl) && parseFloat(decl) > contentW + 1) fixed.push(`${name} ${decl}`);
        walk(c);
      }
    };
    walk(stream);
    // min-content contribution of each direct child: none may exceed the track.
    // The regression condition, directly: the grid track must not have been
    // floored by a child's min-content. A single-line ellipsising row has a
    // large min-content by design - what matters is that the track ignores it.
    const track = parseFloat(getComputedStyle(stream).gridTemplateColumns) || 0;
    return {
      scrolls: stream.scrollWidth > stream.clientWidth + 1,
      wide,
      fixed,
      track: Math.round(track),
      contentW: Math.round(contentW),
    };
  });
  if (!r) return;
  check(`${label}: stream does not scroll horizontally`, !r.scrolls);
  check(`${label}: nothing renders wider than the panel`, r.wide.length === 0, r.wide.join(', '));
  check(`${label}: no fixed width beyond the panel`, r.fixed.length === 0, r.fixed.join(', '));
  check(
    `${label}: grid track stays within the panel (${r.track} <= ${r.contentW})`,
    r.track > 0 && r.track <= r.contentW + 1,
  );
};

// Every state that has a stream, at the normal width.
for (const state of ['00a', '01', '02', '02b', '03', '04', '07', '08', '10']) {
  await page.setViewportSize({ width: 1180, height: 1000 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(350);
  await streamFit(state);
}

// And the narrowest the stream ever gets: the full stream in dual-modal mode.
await page.setViewportSize({ width: 1500, height: 1040 });
await page.goto(`${BASE}/?state=03`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('back-office-widgets button:has-text("Open alert")').click();
await page.waitForTimeout(800);
await streamFit('dual-modal, full stream');

// The tightest dual the workspace allows: just above the auto-minimise floor.
await page.setViewportSize({ width: 1260, height: 1040 });
await page.waitForTimeout(700);
await streamFit('dual-modal at the narrowest allowed');

console.log('\nNo button icon is compressed, in any state');
// Material buttons are flex containers, so an icon inside one shrinks like any
// other flex item. A squeezed button with a nowrap label crushes its icon
// rather than its text, which reads as a cut-off glyph.
let squashed = [];
for (const [state, width] of [
  ['00a', 1180], ['01', 1180], ['02', 1180], ['02b', 1180], ['03', 1180],
  ['04', 1180], ['05', 1180], ['07', 1180], ['10', 1180], ['09', 1440],
]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const bad = await page.evaluate((st) => {
    const out = [];
    for (const icon of document.querySelectorAll('button .mat-icon')) {
      const r = icon.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue; // not rendered, fine
      // A Material icon is square. Narrower than tall means it was squeezed.
      if (r.width < r.height - 1) {
        out.push(`${st}: "${icon.closest('button').textContent.trim().slice(0, 24)}" ${Math.round(r.width)}x${Math.round(r.height)}`);
      }
    }
    return out;
  }, state);
  squashed.push(...bad);
}
check('every button icon keeps its square box', squashed.length === 0);
squashed.slice(0, 6).forEach((s) => console.log(`       ${s}`));

console.log('\nThe Adjust severity control is the same everywhere');
const adjust = async () =>
  page.evaluate(() => {
    const btn = [...document.querySelectorAll('workflow-panel .footer button')].find((b) =>
      b.textContent.includes('Adjust severity'),
    );
    if (!btn) return null;
    const icon = btn.querySelector('mat-icon');
    if (!icon) return { hasIcon: false };
    const r = icon.getBoundingClientRect();
    return { hasIcon: true, w: Math.round(r.width), h: Math.round(r.height) };
  });
const adjustShapes = [];
for (const [state, width] of [['01', 1180], ['03', 1180], ['10', 1180], ['09', 1440]]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const a = await adjust();
  check(`${state}: Adjust severity has its icon, at full size`, !!a && a.hasIcon && a.w >= 16);
  if (a?.hasIcon) adjustShapes.push(`${a.w}x${a.h}`);
}
check('the icon is the same size in all of them', new Set(adjustShapes).size === 1);

console.log('\nOne trigger control, identical in every state and at both widths');
const controlShape = async () => {
  const c = page.locator('trigger-strip .strip__toggle');
  if ((await c.count()) !== 1) return null;
  return page.evaluate(() => {
    const el = document.querySelector('trigger-strip .strip__toggle');
    const strip = document.querySelector('trigger-strip .strip');
    const box = el.getBoundingClientRect();
    const stripBox = strip.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      // Same place: the control is the first thing in the strip, full width.
      atTopOfStrip: Math.round(box.top - stripBox.top) === 0,
      fullWidth: Math.abs(box.width - stripBox.width) < 1,
      height: Math.round(box.height),
      // The constant anatomy is badge + control. The scroll note is dropped
      // from the comparison on purpose: it appears in exactly one state, which
      // is the point of it, and is asserted separately below.
      parts: [...el.children]
        .map((c) => c.className.split(' ')[0])
        .filter((c) => c !== 'strip__count')
        .join('|'),
      hasChip: !!el.querySelector('.strip__chip'),
      hasVerb: !!el.querySelector('.strip__verb'),
      hasNote: !!el.querySelector('.strip__count'),
    };
  });
};

const shapes = [];
for (const [state, width] of [
  ['00a', 1180], ['01', 1180], ['03', 1180], ['07', 1180], ['10', 1180], ['09', 1440],
]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const s = await controlShape();
  check(`${state}: exactly one control, at the top, full width`, !!s && s.atTopOfStrip && s.fullWidth);
  check(`${state}: same anatomy (badge + control)`, !!s && s.hasChip && s.hasVerb && s.tag === 'button');
  if (s) shapes.push({ state, key: `${s.tag}|${s.parts}|${s.height}` });
}
check(
  'the control is structurally identical across all of them',
  new Set(shapes.map((s) => s.key)).size === 1,
);
check('no second trigger control anywhere', await page.evaluate(() =>
  !document.querySelector('trigger-strip .strip__bar, trigger-strip .summary'),
));

// The control must not move or resize when it toggles - that is what made the
// old pair feel like two different things.
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const boxBefore = await page.locator('trigger-strip .strip__toggle').boundingBox();
await page.locator('trigger-strip .strip__toggle').click();
await page.waitForTimeout(300);
const boxAfter = await page.locator('trigger-strip .strip__toggle').boundingBox();
// boundingBox() returns x/y/width/height - there is no .top, and comparing it
// silently compares NaN to NaN, which is always false.
check(
  'the control keeps its exact box across the toggle',
  Math.round(boxBefore.y) === Math.round(boxAfter.y) &&
    Math.round(boxBefore.x) === Math.round(boxAfter.x) &&
    Math.round(boxBefore.height) === Math.round(boxAfter.height) &&
    Math.round(boxBefore.width) === Math.round(boxAfter.width),
);

console.log('\nSame interaction: the row toggles, both ways, at both widths');
for (const width of [1180, 700]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const rows = () => page.locator('trigger-strip .trigger').count();
  // With more than the collapse threshold, collapsed previews two rows and the
  // verb becomes the overflow badge.
  const collapsedRows = await rows();
  check(`${width}px: starts collapsed with a 2-row preview`, collapsedRows === 2);
  check(`${width}px: collapsed control says Show all`,
    (await page.locator('trigger-strip .strip__verb').innerText()).includes('Show all'));
  await page.locator('trigger-strip .strip__toggle').click();
  await page.waitForTimeout(300);
  check(`${width}px: the badge expands the strip`, (await rows()) > collapsedRows);
  check(`${width}px: expanded says Show less`,
    (await page.locator('trigger-strip .strip__verb').innerText()).includes('Show less'));
  await page.locator('trigger-strip .strip__toggle').click();
  await page.waitForTimeout(300);
  check(`${width}px: clicking the same row collapses it again`, (await rows()) === 2);
}

console.log('\nThe strip bar states the count once, and nothing redundant');
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);

const bar = async () =>
  page.evaluate(() => {
    const t = document.querySelector('trigger-strip .strip__toggle');
    const list = document.querySelector('trigger-strip .strip__list');
    const verb = t.querySelector('.strip__verb');
    return {
      text: t.textContent.replace(/\s+/g, ' ').trim(),
      chip: t.querySelector('.strip__chip').textContent.trim(),
      note: t.querySelector('.strip__count')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      verb: verb?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      verbFlushRight: verb
        ? Math.round(t.getBoundingClientRect().right - verb.getBoundingClientRect().right) < 20
        : null,
      aboveRows: list
        ? t.getBoundingClientRect().bottom <= list.getBoundingClientRect().top + 1
        : null,
      scrolls: list ? list.scrollHeight > list.clientHeight + 1 : false,
    };
  });

const collapsedBar = await bar();
check('collapsed: badge carries the total', collapsedBar.chip === '19 triggers');
check('collapsed: control reads "Show all"', collapsedBar.verb.includes('Show all'));
check('collapsed: no showing-vs-total text', collapsedBar.note === null);
check('collapsed: no "+N more" phrasing', !/\+\d+ more/.test(collapsedBar.text));
check('collapsed: the number appears exactly once',
  (collapsedBar.text.match(/19/g) || []).length === 1, collapsedBar.text);
check('collapsed: control sits hard right', collapsedBar.verbFlushRight);
check('collapsed: bar sits above the rows', collapsedBar.aboveRows);

await page.locator('trigger-strip .strip__toggle').click();
await page.waitForTimeout(400);
const expandedBar = await bar();
check('expanded: same badge', expandedBar.chip === '19 triggers');
check('expanded: control reads "Show less"', expandedBar.verb.includes('Show less'));
check('expanded: bar still sits above the rows', expandedBar.aboveRows);
check('expanded: list really does scroll internally', expandedBar.scrolls);
check('expanded: scroll note appears, naming visible vs total',
  expandedBar.note === 'Showing 10 of 19, scroll for more', expandedBar.note);

console.log('\nTrigger rows align, highlighted row included');
await page.setViewportSize({ width: 1180, height: 1000 });
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=10`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const cols = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('trigger-strip .trigger')];
  return rows.map((r) => [...r.querySelectorAll('.cell')].map((c) => Math.round(c.getBoundingClientRect().left)));
});
check('every row rendered three cells', cols.length > 2 && cols.every((c) => c.length === 3));
check('all rows share the same column edges', new Set(cols.map((c) => c.join(','))).size === 1);
check('the NEW row is one of them', (await page.locator('trigger-strip .trigger--new').count()) === 1);
check('the NEW row aligns with the rest', await (async () => {
  const newRow = await page.evaluate(() => {
    const r = document.querySelector('trigger-strip .trigger--new');
    return [...r.querySelectorAll('.cell')].map((c) => Math.round(c.getBoundingClientRect().left));
  });
  return newRow.join(',') === cols[0].join(',');
})());
check('the highlight paints the full row width, no gaps', await page.evaluate(() => {
  const cells = [...document.querySelectorAll('trigger-strip .trigger--new .cell')];
  if (cells.length !== 3) return false;
  const tinted = cells.every((c) => getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)');
  const boxes = cells.map((c) => c.getBoundingClientRect());
  const contiguous = boxes.every((b, i) => i === 0 || Math.abs(b.left - (boxes[i - 1].left + boxes[i - 1].width)) < 1);
  return tinted && contiguous;
}));

console.log('\nTriggers sort by timestamp, not array order');
check('rendered newest first', await page.evaluate(() => {
  const times = [...document.querySelectorAll('trigger-strip .cell__at')].map((t) =>
    Date.parse(t.getAttribute('datetime')),
  );
  // The rule-11 arrival is pinned first by design; the rest must descend.
  const rest = times.slice(1);
  return rest.every((t, i) => i === 0 || rest[i - 1] >= t);
}));

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0 ? '\nAll layout checks pass.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
