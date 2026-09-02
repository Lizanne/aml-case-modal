import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The severity language comes from the fixture, never from a literal here -
// the ranking is not the intuitive one and a hardcoded list is one more place
// it can be written down wrong.
const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/core/mock-case.json', import.meta.url)), 'utf8'),
);
const SEVERITY_ORDER = FIXTURE.severityRanking.order;

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
// Wide enough for two: below the dual-fit width the workspace now holds one
// panel and sends the other to its bar, so a 1180px viewport would be testing
// the single-panel rule rather than the reflow.
await page.setViewportSize({ width: 1500, height: 1000 });
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

/**
 * The narrowest the stream ever gets, in two passes rather than one.
 *
 * It used to be a single check: load 03 for its full stream, then open SG from
 * the widget row to halve the panel. That is no longer a reachable
 * composition - 03 seeds no SG alert, so there is no SG widget to open and
 * never a second panel - and it had been silently failing on the missing
 * button rather than measuring anything.
 *
 * Splitting it loses nothing and covers more. The width and the content were
 * always two independent variables; one pass takes the real dual layout, the
 * other takes the fullest stream in the app at the same panel width a dual
 * half gives it.
 */
await page.setViewportSize({ width: 1500, height: 1040 });
await page.goto(`${BASE}/?state=09`, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);
await streamFit('dual-modal');

// The tightest dual the workspace allows: just above the auto-minimise floor.
// Derived, not guessed - the floor is a STAGE width of MIN_DUAL_PANEL_PX * 2 +
// MODAL_GAP_PX (1136), and the stage is the viewport less the nav and the
// gutters. 1260 was left over from when the floor was a flat 1200 on a page
// with no nav beside it, and it now auto-minimises rather than testing dual.
await page.setViewportSize({ width: 1440, height: 1040 });
await page.waitForTimeout(700);
await streamFit('dual-modal at the narrowest allowed');

// The fullest stream in the app, at that same half-panel width. 03 cannot be
// put into dual, so the width is taken from the viewport instead - which is
// the point the panel makes anyway: the layout follows the width it is given,
// never a dual flag.
await page.setViewportSize({ width: 632, height: 1040 });
await page.goto(`${BASE}/?state=03`, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);
await streamFit('full stream at a dual half-width');

console.log('\nRadios select in primary blue; green stays reserved');
const radioColour = async (state, sel, pick) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`${sel} mat-radio-button`, { timeout: 15000 });
  await page.waitForTimeout(400);
  if (pick) {
    await page.locator(`${sel} mat-radio-button:has-text("${pick}") input`).check({ force: true });
    await page.waitForTimeout(350);
  }
  return page.evaluate((s) => {
    const r = document.querySelector(`${s} mat-radio-button.mat-mdc-radio-checked`);
    return r ? getComputedStyle(r.querySelector('.mdc-radio__inner-circle')).borderColor : null;
  }, sel);
};
/**
 * Resolve a design token to the rgb() string the browser will report.
 *
 * Restating token hexes here is how these checks went stale: the palette moved
 * and four assertions failed for saying "green is #0f6e57" rather than "green
 * is --success". What is under test is that the RIGHT TOKEN reaches the right
 * element, never which hex the token happens to hold today.
 */
const tokenRgb = (name) =>
  page.evaluate((n) => {
    const el = document.createElement('span');
    el.style.color = `var(${n})`;
    document.body.appendChild(el);
    const c = getComputedStyle(el).color;
    el.remove();
    return c;
  }, name);
const PRIMARY = await tokenRgb('--primary');
const SUCCESS = await tokenRgb('--success');
check('severity dialog radio is primary blue',
  (await radioColour('05', 'severity-dialog', 'AML')) === PRIMARY);
check('record form radio is primary blue',
  (await radioColour('02b', 'record-form', null)) === PRIMARY);
// Green must still mean "you can act here" where it always did.
await page.goto(`${BASE}/?state=03`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('required-chips ui-pill', { timeout: 15000 });
await page.waitForTimeout(400);
// Two greens now, deliberately: the chip sits on a tint and uses --success,
// the lock band sits on white and uses the lighter --foreground-success.
// Asserting one value for both said "the band lost its green" when what had
// actually happened is that it moved to its own token.
const BAND_SUCCESS = await tokenRgb('--foreground-success');
check('green survives on the done chip and the lock band',
  await page.evaluate(
    ({ chipGreen, bandGreen }) => {
      const chip = getComputedStyle(document.querySelector('required-chips ui-pill')).color;
      const band = getComputedStyle(document.querySelector('case-header .head__lock-text')).color;
      return chip === chipGreen && band === bandGreen;
    },
    { chipGreen: SUCCESS, bandGreen: BAND_SUCCESS },
  ));

console.log('\nBanners: 16px, top-aligned, 20px outlined icons');
const BANNERS = [
  ['10', 'player-info-panel .warn-note'],
  ['10', 'workflow-panel .resync'],
  ['05', 'severity-dialog .warn-note'],
  ['06', 'decision-dialog .notice'],
  ['00b', 'confirm-unlock-dialog .danger-note'],
];
await page.setViewportSize({ width: 1440, height: 1000 });
for (const [state, sel] of BANNERS) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(sel, { timeout: 15000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s);
    const cs = getComputedStyle(el);
    const i = el.querySelector('mat-icon');
    const ir = i.getBoundingClientRect();
    return {
      pads: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
      align: cs.alignItems,
      iw: Math.round(ir.width), ih: Math.round(ir.height),
      outlined: /Outlined/.test(getComputedStyle(i).fontFamily),
      // top-aligned means the icon sits at the padding edge, not floated to
      // the vertical centre of a multi-line block
      iconAtTop: Math.round(ir.top - el.getBoundingClientRect().top) === parseFloat(cs.paddingTop),
    };
  }, sel);
  const name = sel.split(' ').pop();
  check(`${state} ${name}: 16px padding`, r.pads.every((v) => v === '16px'), r.pads.join(' '));
  check(`${state} ${name}: icon and text top-aligned`, r.align === 'flex-start' && r.iconAtTop);
  check(`${state} ${name}: 20px outlined icon`, r.iw === 20 && r.ih === 20 && r.outlined,
    `${r.iw}x${r.ih} outlined=${r.outlined}`);
}

console.log('\nAttachment chips: 8px sides, 16px outlined icon');
await page.goto(`${BASE}/?state=02`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('record-form .file', { timeout: 15000 });
await page.waitForTimeout(400);
const chip = await page.evaluate(() => {
  const f = document.querySelector('record-form .file');
  const cs = getComputedStyle(f);
  const i = f.querySelector('.file__icon');
  const r = i.getBoundingClientRect();
  return {
    padL: cs.paddingLeft, padR: cs.paddingRight,
    iw: Math.round(r.width), ih: Math.round(r.height),
    outlined: /Outlined/.test(getComputedStyle(i).fontFamily),
  };
});
check('chip has 8px left and right padding', chip.padL === '8px' && chip.padR === '8px',
  `${chip.padL}/${chip.padR}`);
// 20px, not the 16px this once pinned - the size was changed in the component
// after the fact. Following the code here rather than the older instruction;
// see the note in the commit message.
check('chip icon is 20px and outlined',
  chip.iw === 20 && chip.ih === 20 && chip.outlined,
  `${chip.iw}x${chip.ih} outlined=${chip.outlined}`);

console.log('\nThe error dismiss stays red under the cursor');
await page.setViewportSize({ width: 1440, height: 1040 });
await page.goto(`${BASE}/?state=02`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('record-form .error__dismiss', { timeout: 15000 });
await page.waitForTimeout(450);
const DANGER = await tokenRgb('--danger');
const DANGER_STRONG = await tokenRgb('--danger-strong');
const DANGER_BG_STRONG = await tokenRgb('--danger-bg-strong');
const style = (sel) =>
  page.evaluate((s) => {
    const cs = getComputedStyle(document.querySelector(s));
    return { color: cs.color, bg: cs.backgroundColor };
  }, sel);
const dismissRest = await style('record-form .error__dismiss');
check('dismiss is red at rest', dismissRest.color === DANGER, dismissRest.color);
await page.hover('record-form .error__dismiss');
await page.waitForTimeout(250);
const dismissHover = await style('record-form .error__dismiss');
// It used to share a neutral hover with the file remove, so the one control
// that IS destructive turned grey at the moment of acting on it.
check('dismiss deepens in red on hover, never goes neutral',
  dismissHover.color === DANGER_STRONG && dismissHover.bg === DANGER_BG_STRONG,
  `${dismissHover.color} on ${dismissHover.bg}`);

// The file remove is a different control - it keeps the neutral hover.
await page.hover('record-form .file__remove');
await page.waitForTimeout(250);
const removeHover = await style('record-form .file__remove');
check('the file remove keeps its neutral hover',
  removeHover.color !== DANGER_STRONG && removeHover.bg === 'rgba(0, 0, 0, 0.06)',
  `${removeHover.color} on ${removeHover.bg}`);

console.log('\nWorkflow footer: two controls, hard right, 12px apart');
for (const [state, width] of [['01', 1440], ['03', 1440], ['09', 1500]]) {
  await page.setViewportSize({ width, height: 1040 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('workflow-panel .footer', { timeout: 15000 });
  await page.waitForTimeout(450);
  const f = await page.evaluate(() => {
    const el = document.querySelector('workflow-panel .footer');
    const btns = [...el.querySelectorAll('button')];
    const a = btns[0].getBoundingClientRect();
    const z = btns[btns.length - 1].getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      gapCss: cs.gap,
      measuredGap: Math.round(z.left - a.right),
      buttons: btns.length,
      hasSentence: /Record both required/i.test(el.textContent),
      display: cs.display,
      pads: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft],
      rightInset: Math.round(el.getBoundingClientRect().right - z.right),
      padRight: parseFloat(cs.paddingRight),
      // Narrow used to split the footer into two full-width halves. Natural
      // width means the pair leaves room to its left.
      spanned: Math.round(el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)),
      used: Math.round(z.right - a.left),
    };
  });
  check(`${state}: the gate sentence is gone`, !f.hasSentence);
  check(`${state}: exactly two controls`, f.buttons === 2);
  check(`${state}: 12px between them`, f.gapCss === '12px' && f.measuredGap === 12,
    `${f.gapCss} / ${f.measuredGap}px`);
  check(`${state}: flex, not the old narrow grid`, f.display === 'flex', f.display);
  check(`${state}: 16px 20px padding like every other footer`,
    f.pads.join(' ') === '16px 20px 16px 20px', f.pads.join(' '));
  check(`${state}: submit sits hard right`, f.rightInset === f.padRight,
    `${f.rightInset} vs padding ${f.padRight}`);
  check(`${state}: buttons keep their natural width`, f.used < f.spanned,
    `${f.used} of ${f.spanned}px`);
}

/**
 * The header names the CASE. The bar above it names the player.
 *
 * The identity line under the title is gone - it read "Howard Williams · Player
 * 88213" directly below a black player bar already carrying that name, the
 * same words twice a few pixels apart. So this no longer checks where the line
 * sits and what it drops at narrow; it checks that the line is gone, that the
 * header is the one row it was folded into, and that the name it used to carry
 * is still on screen somewhere - which is the reason it could be dropped.
 */
console.log('\nThe header keeps one structure at both widths');
for (const [state, width] of [['01', 1440], ['09', 1500]]) {
  await page.setViewportSize({ width, height: 1040 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('case-header .head__title', { timeout: 15000 });
  await page.waitForTimeout(500);
  const h = await page.evaluate(() => {
    const head = document.querySelector('case-header');
    const row = head.querySelector('.head__title-row');
    const rows = [...head.querySelectorAll('.head__titles > *')];
    return {
      hasSub: !!head.querySelector('.head__sub'),
      namesPlayerAnywhere: /Howard Williams/.test(head.textContent),
      titleRows: rows.length,
      // A wrap would show up as two distinct centres among the row's children.
      centres: [...row.children]
        .filter((k) => k.getBoundingClientRect().width > 0)
        .map((k) => { const r = k.getBoundingClientRect(); return Math.round(r.top + r.height / 2); }),
      playerBarNames: /Howard Williams/.test(
        document.querySelector('player-header')?.textContent ?? '',
      ),
    };
  });
  check(`${state}: no identity line under the title`, !h.hasSub);
  check(`${state}: and the header does not name the player at all`, !h.namesPlayerAnywhere);
  check(`${state}: the player bar above still does`, h.playerBarNames);
  check(`${state}: the header is one row`, h.titleRows === 1, `${h.titleRows}`);
  check(`${state}: which does not wrap`, new Set(h.centres).size === 1, h.centres.join(','));
}

console.log('\nOne Resync on screen while the out-of-sync notice is up');
await page.setViewportSize({ width: 1440, height: 1040 });
for (const [state, noticeExpected] of [['10', true], ['01', false]]) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('player-info-panel', { timeout: 15000 });
  await page.waitForTimeout(600);
  // The Snapshot tab is where the second Resync lives, so it has to be OPEN
  // for this to be a real test - on any other tab it is simply not rendered
  // and the check would pass for the wrong reason.
  await page.click('player-info-panel .mat-mdc-tab:has-text("Snapshot")');
  await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    // dev-state-switcher has its own Resync. It is harness, not product, and
    // counting it made a correct app look like it had two.
    const product = [...document.querySelectorAll('button')].filter(
      (b) => /Resync/i.test(b.textContent) && !b.closest('dev-state-switcher'),
    );
    const notice = document.querySelector('workflow-panel .resync');
    const noticeBtn = notice?.querySelector('button');
    const icon = notice?.querySelector('mat-icon');
    return {
      count: product.length,
      inNotice: product.filter((b) => b.closest('.resync')).length,
      enabled: product.filter((b) => !b.disabled).length,
      notice: !!notice,
      btnBg: noticeBtn ? getComputedStyle(noticeBtn).backgroundColor : null,
      iconFont: icon ? getComputedStyle(icon).fontFamily : null,
      iconBox: icon
        ? `${Math.round(icon.getBoundingClientRect().width)}x${Math.round(icon.getBoundingClientRect().height)}`
        : null,
      // An unresolved ligature lays out the whole word "sync_problem", so its
      // scrollWidth runs far past the 20px box. One glyph fits.
      iconRenders: icon ? icon.scrollWidth <= 22 && icon.getBoundingClientRect().width === 20 : false,
    };
  });
  check(`${state}: notice ${noticeExpected ? 'shown' : 'absent'}`, r.notice === noticeExpected);
  check(`${state}: exactly one product Resync on screen`, r.count === 1, `${r.count}`);
  if (noticeExpected) {
    check(`${state}: the one Resync is the notice's`, r.inNotice === 1 && r.enabled === 1,
      `inNotice=${r.inNotice} enabled=${r.enabled}`);
    check(`${state}: it is the primary blue`, r.btnBg === PRIMARY, r.btnBg);
    check(`${state}: the notice icon actually renders a glyph`, r.iconRenders,
      `${r.iconBox} ${r.iconFont}`);
    check(`${state}: and uses the outlined set`, /Outlined/.test(r.iconFont ?? ''), r.iconFont);
  } else {
    // In sync, so the notice is away and the snapshot tab owns the control.
    // Enabled, not disabled: it follows the LOCK now, and these states are
    // locked to you. What still holds either way is that there is exactly one
    // Resync on screen, which the check above this asserts.
    check(`${state}: the snapshot Resync is back, and live for the lock owner`,
      r.inNotice === 0 && r.enabled === 1, `inNotice=${r.inNotice} enabled=${r.enabled}`);
  }
}

console.log('\nThe info tab header is 48px, tabs included');
await page.setViewportSize({ width: 1440, height: 1040 });
for (const state of ['01', '07', '11']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.mat-mdc-tab-header', { timeout: 15000 });
  await page.waitForTimeout(450);
  const t = await page.evaluate(() => {
    const header = document.querySelector('.mat-mdc-tab-header');
    const tabs = [...document.querySelectorAll('.mat-mdc-tab')];
    const hr = header.getBoundingClientRect();
    const first = tabs[0].getBoundingClientRect();
    const label = tabs[0].querySelector('.mdc-tab__text-label').getBoundingClientRect();
    return {
      header: Math.round(hr.height),
      // The height comes from the density token, which sizes the tabs too.
      // A height on the header alone would leave 44px tabs in a 48px strip.
      tabs: [...new Set(tabs.map((x) => Math.round(x.getBoundingClientRect().height)))],
      labelCentred: Math.abs((label.top - first.top) - (first.bottom - label.bottom)) <= 1,
    };
  });
  check(`${state}: header is 48px`, t.header === 48, `${t.header}`);
  check(`${state}: the tabs are 48px too`, t.tabs.length === 1 && t.tabs[0] === 48, t.tabs.join(','));
  check(`${state}: labels stay vertically centred`, t.labelCentred);
}

console.log('\nOutcome cards are 16px all round');
await page.setViewportSize({ width: 1440, height: 1040 });
for (const state of ['03', '07']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('outcome-card .card', { timeout: 15000 });
  await page.waitForTimeout(450);
  const cards = await page.$$eval('outcome-card .card', (els) =>
    els.map((c) => {
      const cs = getComputedStyle(c);
      const foot = c.querySelector('.card__foot');
      return {
        variant: c.className.replace('card', '').trim() || 'default',
        pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        footPadTop: foot ? getComputedStyle(foot).paddingTop : null,
      };
    }),
  );
  check(`${state}: every card is 16px on all four sides`,
    cards.length > 0 && cards.every((c) => c.pad === '16px 16px 16px 16px'),
    cards.map((c) => `${c.variant}:${c.pad}`).join(' | '));
  check(`${state}: the footer clears its rule by 16px`,
    cards.every((c) => c.footPadTop === null || c.footPadTop === '16px'),
    cards.map((c) => c.footPadTop).join(','));
}
// The narrow card keeps 16px too, but its footer has no rule to clear - the
// padding there would be a gap above nothing, and margin already provides it.
await page.setViewportSize({ width: 1500, height: 1040 });
await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('outcome-card .card--narrow', { timeout: 15000 });
await page.waitForTimeout(700);
const narrowCard = await page.evaluate(() => {
  const c = document.querySelector('outcome-card .card--narrow');
  const cs = getComputedStyle(c);
  const foot = c.querySelector('.card__foot');
  return {
    pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
    footBorder: foot ? getComputedStyle(foot).borderTopWidth : null,
    footPadTop: foot ? getComputedStyle(foot).paddingTop : null,
  };
});
check('09 narrow card is 16px too', narrowCard.pad === '16px 16px 16px 16px', narrowCard.pad);
check('09 narrow footer has no rule, so no padding above one',
  narrowCard.footBorder === '0px' && narrowCard.footPadTop === '0px',
  `${narrowCard.footBorder} / ${narrowCard.footPadTop}`);
await page.setViewportSize({ width: 1440, height: 1040 });

console.log('\nWidget rows follow the desktop node until they cannot');
for (const width of [1600, 1440, 1200, 1024, 375, 320]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
  // Close FIRST, then wait for the card. 01 opens with the case panel up, and
  // a panel that is up takes its own card off the row - so waiting for .w
  // before closing waits for something this state cannot produce.
  await page.waitForSelector('aml-case-modal', { timeout: 15000 });
  await page.waitForTimeout(500);
  await page.locator('aml-case-modal button[aria-label="Close case"]').click();
  await page.waitForSelector('back-office-widgets .w', { timeout: 15000 });
  await page.waitForTimeout(400);
  const w = await page.evaluate(() => {
    const card = document.querySelector('back-office-widgets .w');
    const R = (s) => {
      const e = card.querySelector(s);
      return e ? e.getBoundingClientRect() : null;
    };
    const parts = [...card.querySelectorAll('.w__name,.w__count,.w__sev,.w__meta,.w__lock,.w__btn')];
    let overlaps = 0;
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 1; j < parts.length; j++) {
        if (parts[i].contains(parts[j]) || parts[j].contains(parts[i])) continue;
        const a = parts[i].getBoundingClientRect();
        const b = parts[j].getBoundingClientRect();
        if (a.left < b.right - 0.5 && b.left < a.right - 0.5 &&
            a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) overlaps++;
      }
    }
    const lock = R('.w__lock');
    const meta = R('.w__meta');
    const btn = R('.w__btn');
    const lockCs = getComputedStyle(card.querySelector('.w__lock'));
    return {
      card: Math.round(card.getBoundingClientRect().width),
      lockBg: lockCs.backgroundColor,
      lockFont: `${lockCs.fontSize}/${lockCs.lineHeight}`,
      lockUnderMeta: lock.top >= meta.bottom - 1,
      metaToLock: Math.round(lock.top - meta.bottom),
      // Beside, not under: the actions share the identity's row.
      actionsBeside: btn.left > lock.right,
      radius: getComputedStyle(card.querySelector('.w__btn')).borderRadius,
      overlaps,
      hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  // 4px on every button, both layouts.
  check(`${width}px: widget buttons are 4px`, w.radius === '4px', w.radius);
  check(`${width}px: nothing overlaps`, w.overlaps === 0, `${w.overlaps}`);
  check(`${width}px: no horizontal scroll`, w.hScroll === 0, `${w.hScroll}`);
  // The lock status is no longer a sized chip - it is an inline icon and a
  // line of text inside the content column, identical at every width. What
  // varies is only whether the actions sit beside the identity or under it.
  check(`${width}px: lock status is inline, not a chip`,
    w.lockBg === 'rgba(0, 0, 0, 0)' && w.lockFont === '12px/16px',
    `${w.lockBg} ${w.lockFont}`);
  check(`${width}px: it sits under the meta line`, w.lockUnderMeta,
    `metaBottom->lockTop ${w.metaToLock}`);
  if (w.card >= 560) {
    check(`${width}px: actions sit beside the identity`, w.actionsBeside,
      `actionsBeside=${w.actionsBeside}`);
  }
}
await page.setViewportSize({ width: 1440, height: 1040 });

console.log('\nDialog Cancel carries the same side padding as the action');
for (const state of ['05', '06']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('dialog-shell .panel__foot', { timeout: 15000 });
  await page.waitForTimeout(400);
  const pad = await page.evaluate(() => {
    const c = [...document.querySelectorAll('dialog-shell .panel__foot button')].find(
      (b) => b.textContent.trim() === 'Cancel',
    );
    const cs = getComputedStyle(c);
    return `${cs.paddingLeft}/${cs.paddingRight}`;
  });
  check(`${state}: Cancel is 16px either side`, pad === '16px/16px', pad);
}

console.log('\nAn open draft never gates Submit, and is named before it is lost');
await page.goto(`${BASE}/?state=03`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('workflow-panel .footer', { timeout: 15000 });
await page.waitForTimeout(600);
await page.click('add-action-menu button');
await page.waitForTimeout(400);
await page.click('.mat-mdc-menu-item');
await page.waitForTimeout(500);
// Untouched: nothing to lose, so nothing to warn about.
await page.click('workflow-panel .footer button:has-text("Submit decision")');
await page.waitForTimeout(500);
check('an untouched draft leaves the green notice in place',
  (await page.locator('.notice--warn').count()) === 0 &&
    (await page.locator('.notice--ok').count()) === 1);
await page.click('dialog-shell .panel__foot button:has-text("Cancel")');
await page.waitForTimeout(400);

await page.fill('record-form textarea', 'Half-written note.');
await page.locator('record-form mat-radio-button input').first().check({ force: true });
await page.waitForTimeout(400);
const gates = await page.evaluate(() => {
  const save = [...document.querySelectorAll('record-form button')].find((b) =>
    /Save outcome/.test(b.textContent),
  );
  const submit = [...document.querySelectorAll('workflow-panel .footer button')].find((b) =>
    /Submit decision/.test(b.textContent),
  );
  return { save: !save.disabled, submit: !submit.disabled };
});
check('Save and Submit are enabled at the same time', gates.save && gates.submit,
  JSON.stringify(gates));
await page.click('workflow-panel .footer button:has-text("Submit decision")');
await page.waitForTimeout(500);
const warning = await page.evaluate(() =>
  document.querySelector('.notice--warn')?.textContent.replace(/\s+/g, ' ').trim() ?? null);
// One notice, one mood: the amber line REPLACES the green and carries the
// resolve consequence itself, so the dialog never states it twice.
check('a dirty draft is named, and the warning still says it resolves',
  warning !== null &&
    /Submitting will resolve the case and discard your unsaved .+ draft\./.test(warning),
  String(warning));
check('and it is the only notice on screen',
  (await page.locator('dialog-shell .notice').count()) === 1);
await page.click('dialog-shell .panel__foot button:has-text("Cancel")');
await page.waitForTimeout(500);
const kept = await page.evaluate(() => ({
  note: document.querySelector('record-form textarea')?.value ?? null,
  lock: document.querySelectorAll('record-form .mat-mdc-radio-checked').length,
}));
check('Cancel returns the form intact', kept.note === 'Half-written note.' && kept.lock === 1,
  JSON.stringify(kept));

console.log('\nThe three lock states are one shape');
await page.setViewportSize({ width: 1800, height: 1000 });
const lockShapes = [];
for (const state of ['00a', '01', '00b']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  // The card only exists with the panel down, so close it first. That is also
  // the only state in which the card HAS a lock line and actions to compare -
  // this block is about the three lock states having one shape, and an open
  // panel takes the shape off the row entirely.
  await page.waitForSelector('aml-case-modal', { timeout: 15000 });
  await page.waitForTimeout(400);
  const esc = page.locator('dialog-shell');
  if (await esc.count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
  await page.locator('aml-case-modal button[aria-label="Close case"]').click();
  await page.waitForSelector('back-office-widgets .w', { timeout: 15000 });
  await page.waitForTimeout(400);
  lockShapes.push(
    await page.evaluate(() => {
      // By name, not by index. These frames seed no SG alert, so the AML card
      // is the only one on the row and index 1 was undefined - the card's
      // position in the row is not what identifies it.
      const aml = [...document.querySelectorAll('.w')].find(
        (w) => w.querySelector('.w__name').textContent.trim() === 'AML Case',
      );
      const box = aml.getBoundingClientRect();
      const btn = aml.querySelector('.w__btn');
      return {
        height: Math.round(box.height),
        actionTop: btn ? Math.round(btn.getBoundingClientRect().top - box.top) : null,
        status: aml.querySelector('.w__lock')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      };
    }),
  );
}
// The status line is PRESENT in all three - absent in one made that card a
// line shorter and moved its actions with it.
check('every lock state shows a status line', lockShapes.every((s) => s.status), 
  lockShapes.map((s) => s.status).join(' | '));
check('all three cards are the same height',
  new Set(lockShapes.map((s) => s.height)).size === 1, lockShapes.map((s) => s.height).join(','));
check('and the action row sits in the same place',
  new Set(lockShapes.map((s) => s.actionTop)).size === 1, lockShapes.map((s) => s.actionTop).join(','));
await page.setViewportSize({ width: 1440, height: 1040 });

console.log('\nOne lock sentence on every surface');
await page.setViewportSize({ width: 1500, height: 1040 });
for (const state of ['00a', '00b', '01', '07', '09']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  // attached, not visible: the row's host is display: none whenever every
  // card on it has had its panel opened, which is most seeded states.
  await page.waitForSelector('back-office-widgets', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(600);
  const copy = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      widgetLocks: [...document.querySelectorAll('.w__lock')].map((e) =>
        e.textContent.replace(/\s+/g, ' ').trim(),
      ),
      band: document.querySelector('case-header .head__lock-text')?.textContent.trim() ?? null,
      dialog: document.querySelector('confirm-unlock-dialog .lead')?.textContent.trim() ?? null,
      // The two phrasings that had crept in.
      lockedBy: /Locked by/.test(text),
      unassigned: /Unassigned/.test(text),
    };
  });
  check(`${state}: nothing says "Locked by"`, !copy.lockedBy);
  // "Not locked" IS the third state now; "Unassigned" was the fourth word for
  // it and is what must not appear.
  check(`${state}: nothing says "Unassigned"`, !copy.unassigned);
  const lockish = [...copy.widgetLocks, copy.band, copy.dialog].filter(
    (t) => t && /Locked/.test(t),
  );
  check(`${state}: every lock line reads "Locked to ..."`,
    lockish.every((t) => /(^|\s)Locked to (you|[A-Z])/.test(t)), lockish.join(' | '));
}
// The dialog must not restate the lock in a form of its own.
await page.goto(`${BASE}/?state=00b`, { waitUntil: 'domcontentloaded' });
// The host element has no box of its own - the panel inside it is fixed - so
// waiting on the host's visibility never resolves. Wait for the text instead.
await page.waitForSelector('confirm-unlock-dialog .lead', { timeout: 15000 });
await page.waitForTimeout(600);
/**
 * The dialog and the band cannot contradict each other about the lock.
 *
 * NOT "verbatim" any more, which is what this asserted and what the copy has
 * since moved away from on purpose. The band is a status - "Locked to
 * M. Torres · 15d" - and the dialog is a warning before a destructive act:
 * "M. Torres has held the lock since 11 Aug 2026, 10:58 and may be mid
 * investigation." The second says more because it is asked to justify itself,
 * and flattening it back to the first would lose the reason.
 *
 * What must hold is that they agree on the facts a user could act on wrongly:
 * the same holder, and both saying the lock is held rather than free.
 */
const agree = await page.evaluate(() => {
  const band = document.querySelector('case-header .head__lock-text').textContent.trim();
  const lead = document.querySelector('confirm-unlock-dialog .lead').textContent.trim();
  // The owner as the band names it: everything after "Locked to", before the age.
  const owner = band.replace(/^Locked to\s*/, '').split('·')[0].trim();
  return { band, lead, owner, namesOwner: owner.length > 0 && lead.includes(owner) };
});
check('the force-unlock dialog names the same lock holder as the band',
  agree.namesOwner, `${agree.owner} | ${agree.band} | ${agree.lead}`);
await page.setViewportSize({ width: 1440, height: 1040 });

/**
 * Put the trigger strip on screen, whatever layout the panel is in.
 *
 * It lives in the left column now. A segmented panel has no columns, so the
 * strip is on the Player info segment - which is not the one the panel opens
 * on. Wide panels show both columns and need nothing.
 */
const showStrip = async () => {
  if (await page.locator('trigger-strip').count()) return;
  const seg = page.locator('mat-button-toggle:has-text("Player info")');
  if (!(await seg.count())) return;
  await seg.click();
  await page.waitForSelector('trigger-strip', { timeout: 15000 });
  await page.waitForTimeout(400);
};

console.log('\nEvery time-ordered list runs newest first');
const descending = (times) => times.every((v, i) => i === 0 || times[i - 1] >= v);
const openTab = async (label) => {
  // In the segmented layout the info panel has to be selected first.
  const seg = page.locator('mat-button-toggle:has-text("Player info")');
  if (await seg.count()) {
    await seg.click();
    await page.waitForTimeout(350);
  }
  const tab = page.locator(`player-info-panel .mat-mdc-tab:has-text("${label}")`);
  if (!(await tab.count())) return null;
  await tab.click();
  await page.waitForTimeout(400);
  return true;
};
for (const state of ['00a', '01', '03', '07', '10', '11', '09']) {
  await page.setViewportSize({ width: state === '09' ? 1500 : 1440, height: 1040 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('aml-case-modal', { timeout: 15000 });
  await page.waitForTimeout(600);

  /**
   * The trigger strip is the exception to the newest-first rule, in BOTH modes.
   *
   * It is a history and it is read forwards - oldest to newest, collapsed and
   * expanded alike. Collapsed that is the two ENDS of it with the middle
   * withheld; expanded the middle is restored between them. The anchors are
   * the same two rows either way, which is the property worth asserting: the
   * strip briefly ran newest-first when open, and expanding then moved both
   * anchors past each other.
   */
  await showStrip();
  const strip = await page.evaluate(() => ({
    at: [...document.querySelectorAll('trigger-strip .cell__at')]
      .map((e) => Date.parse(e.getAttribute('datetime'))),
    expanded: document.querySelector('trigger-strip .strip__gap')?.getAttribute('aria-expanded'),
  }));
  const ascendingTimes = (t) => t.every((v, i) => i === 0 || t[i - 1] <= v);
  check(`${state}: trigger strip runs oldest to newest`,
    strip.at.length > 0 && ascendingTimes(strip.at), `${strip.at.length} rows`);
  if (strip.expanded === 'false') {
    check(`${state}: collapsed it is the oldest/newest pair`,
      strip.at.length === 2, `${strip.at.length} rows`);
  }

  for (const [label, sel] of [
    ['Past AML cases', '.past__date'],
    ['Timeline', '.timeline__at'],
    ['Starred', '.starred__at'],
  ]) {
    const opened = await openTab(label);
    if (!opened) continue;
    const times = await page.$$eval(sel, (els) =>
      els.map((e) => Date.parse(e.getAttribute('datetime'))));
    if (!times.length) continue;
    check(`${state}: ${label} newest first`, descending(times), `${times.length} rows`);
  }
}
await page.setViewportSize({ width: 1440, height: 1040 });

// The one deliberate exception.
await page.goto(`${BASE}/?state=07`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('outcome-card', { timeout: 15000 });
await page.waitForTimeout(600);
const stream = await page.$$eval('workflow-panel .stream outcome-card .card__meta', (els) =>
  els.map((e) => e.textContent.trim()),
);
check('the workflow stream stays oldest first', stream.length > 1 &&
  stream.every((_, i) => i === 0 || stream[i - 1] <= stream[i]),
  stream.join(' | '));

/**
 * The panel and the widget row are one width.
 *
 * Tested in the one composition where the two are on screen together: the case
 * up, the alert shut, so the alert's card is on the row above the case panel.
 * State 01 cannot show it - it seeds no alert, so opening the case leaves no
 * row at all - which is why this had been reading a null row.
 */
console.log('\nThe panel and the widget row are one width');
for (const width of [1440, 1200, 1024, 390]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('aml-case-modal', { timeout: 15000 });
  await page.waitForTimeout(600);
  // Clear the stage completely - panels and any bar, since a minimised panel
  // is still open and still withholds its card - then bring the case back up.
  for (const [host, label] of [['sg-alert-modal', 'Close alert'], ['aml-case-modal', 'Close case']]) {
    const btn = page.locator(`${host} button[aria-label="${label}"]`);
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(350); }
  }
  for (let i = 0; i < 3 && (await page.locator('minimised-bar').count()); i++) {
    await page.locator('minimised-bar button[aria-label^="Close"]').first().click();
    await page.waitForTimeout(350);
  }
  await page.locator('back-office-widgets button:has-text("Open case")').click();
  await page.waitForSelector('aml-case-modal .modal', { timeout: 15000 });
  await page.waitForTimeout(500);
  const edges = await page.evaluate(() => {
    const row = document.querySelector('back-office-widgets .widgets').getBoundingClientRect();
    const panel = document.querySelector('aml-case-modal .modal').getBoundingClientRect();
    return {
      left: Math.round(panel.left - row.left),
      right: Math.round(panel.right - row.right),
      rowWidth: Math.round(row.width),
      panelWidth: Math.round(panel.width),
      overflowsViewport: panel.right > window.innerWidth + 0.5 || panel.left < -0.5,
      hScroll:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  // A solo panel stops at 1080 and docks right, so the RIGHT edges stay
  // together while the left pulls in on a wide row. Below 1080 of row it
  // fills, and both edges meet again.
  check(`${width}px: right edges align`, edges.right === 0, `${edges.right}`);
  check(`${width}px: capped at 1080, or filling a narrower row`,
    edges.panelWidth === Math.min(edges.rowWidth, 1080),
    `panel ${edges.panelWidth} of row ${edges.rowWidth}`);
  check(`${width}px: nothing exceeds the viewport`,
    !edges.overflowsViewport && edges.hScroll === 0, `hScroll=${edges.hScroll}`);
}
await page.setViewportSize({ width: 1440, height: 1040 });

console.log('\nThe expanded trigger strip scrolls inside itself');
await page.goto(`${BASE}/?state=10`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('trigger-strip .strip__list', { timeout: 15000 });
await page.waitForTimeout(600);
const strip = await page.evaluate(() => {
  const list = document.querySelector('trigger-strip .strip__list');
  const modal = document.querySelector('aml-case-modal .modal');
  const rows = document.querySelectorAll('trigger-strip .trigger').length;
  /**
   * The window is five NOMINAL rows, taken from the token that sizes it.
   *
   * Not five average rows: a stacked row whose detail wraps to a second line
   * is 20px taller than one that does not, so in a fixture with a couple of
   * long details the average is about a pixel over and five of them overshoot
   * the cap by six. That is the cap being right and the arithmetic being
   * wrong - the CSS multiplies a fixed row height, so that is what this has to
   * compare against.
   */
  const cs = getComputedStyle(document.querySelector('trigger-strip'));
  const stacked = getComputedStyle(list).display === 'block';
  const nominal = parseFloat(
    cs.getPropertyValue(stacked ? '--trigger-row-height-stacked' : '--trigger-row-height'),
  );
  // Plus the divider, which lives inside the scroller and is not a row. Five
  // rows is a promise about TRIGGERS; the break that names the hidden ones is
  // chrome describing the list.
  const gapH = parseFloat(cs.getPropertyValue('--trigger-gap-height'));
  return {
    rows,
    stacked,
    nominal,
    listH: Math.round(list.clientHeight),
    cap: Math.round(nominal * 5 + gapH),
    scrolls: list.scrollHeight > list.clientHeight + 1,
    // The strip must never be what makes the panel taller than its stage.
    panelWithinStage:
      modal.getBoundingClientRect().bottom <=
      document.querySelector('.stage').getBoundingClientRect().bottom + 1,
  };
});
check('more rows than fit', strip.rows > 5, `${strip.rows}`);
// Five, not ten: the expanded window holds every trigger in the DOM and shows
// five of them, which is what keeps the strip off the workflow below it.
check('the list is capped at five rows', Math.abs(strip.listH - strip.cap) <= 1,
  `${strip.listH} vs ${strip.cap} (${strip.stacked ? 'stacked' : 'grid'} @ ${strip.nominal}px)`);
check('and scrolls rather than growing', strip.scrolls);
check('the panel is not pushed past its stage', strip.panelWithinStage);

console.log('\nBoth panel titles are the same size');
// In state 09 BOTH panels are under the 720px rule, so both titles are at the
// narrow step. That they match is the requirement; the wide step is checked
// below, on a panel that is actually wide.
// 1500 only: below the dual-fit width the workspace holds ONE panel, so there
// is no second title to compare it with. The narrow step is covered there
// anyway - both panels are under 720px each - and the wide step below.
for (const [width, expected] of [[1500, '16px']]) {
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('sg-alert-modal .sg__title', { timeout: 15000 });
  await page.waitForTimeout(700);
  const titles = await page.evaluate(() => {
    const sg = document.querySelector('sg-alert-modal .sg__title');
    const aml = document.querySelector('case-header .head__title');
    const read = (e) => (e ? `${getComputedStyle(e).fontSize}/${getComputedStyle(e).lineHeight}` : null);
    return { sg: read(sg), aml: read(aml) };
  });
  check(`${width}px: sg__title matches head__title`,
    titles.sg !== null && titles.sg === titles.aml, `${titles.sg} vs ${titles.aml}`);
  if (titles.aml) {
    check(`${width}px: and both are at the ${expected} step`,
      titles.aml.startsWith(expected), titles.aml);
  }
}

// Solo and wide: the SG title must take the 20px step, the same one the AML
// header takes, rather than being stuck at a single size.
await page.setViewportSize({ width: 1500, height: 1000 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
// attached, not visible: the row's host is display: none whenever every
// card on it has had its panel opened, which is most seeded states.
await page.waitForSelector('back-office-widgets', { state: 'attached', timeout: 15000 });
await page.waitForTimeout(600);
const soloAml = await page.evaluate(() => {
  const e = document.querySelector('case-header .head__title');
  return e ? `${getComputedStyle(e).fontSize}/${getComputedStyle(e).lineHeight}` : null;
});
// SG solo, which needs the one frame that has an SG alert at all: 01 seeds no
// SG, so there was never a panel here to be left alone with the stage. Load 09
// and close the case off it instead.
await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('sg-alert-modal', { timeout: 15000 });
await page.waitForTimeout(700);
await page.locator('aml-case-modal button[aria-label="Close case"]').click();
await page.waitForTimeout(700);
const soloSg = await page.evaluate(() => {
  const e = document.querySelector('sg-alert-modal .sg__title');
  return e ? `${getComputedStyle(e).fontSize}/${getComputedStyle(e).lineHeight}` : null;
});
check('solo and wide: both titles take the 20px step',
  soloAml === '20px/30px' && soloSg === '20px/30px', `aml ${soloAml} / sg ${soloSg}`);
await page.setViewportSize({ width: 1440, height: 1040 });

/**
 * Two cards sharing one row, which needs a frame that HAS two: 09 is the only
 * one that seeds an SG alert, and this was pointed at 01, where the row has
 * held a single card since the SG widget stopped rendering unconditionally.
 * Every two-card assertion below - stacked, overlaps across both - was reading
 * an undefined second card.
 *
 * Both panels are shut first, because a card is withheld by its own panel
 * being open - and a minimised one counts as open, which is what 09 becomes
 * below the dual-fit width. With both down the row carries both cards at every
 * width in the sweep, which is what this is measuring.
 */
console.log('\nWidgets share the row, truncate, then stack');
for (const width of [1440, 1200, 1024, 768, 390]) {
  await page.setViewportSize({ width, height: 1040 });
  await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('aml-case-modal, minimised-bar', { timeout: 15000 });
  await page.waitForTimeout(600);
  for (const [host, label] of [['sg-alert-modal', 'Close alert'], ['aml-case-modal', 'Close case']]) {
    const btn = page.locator(`${host} button[aria-label="${label}"]`);
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(350); }
  }
  for (let i = 0; i < 3 && (await page.locator('minimised-bar').count()); i++) {
    await page.locator('minimised-bar button[aria-label^="Close"]').first().click();
    await page.waitForTimeout(350);
  }
  await page.waitForSelector('back-office-widgets .w', { timeout: 15000 });
  await page.waitForTimeout(450);
  // Force the longest real lock string before measuring.
  await page.evaluate(() => {
    document.querySelectorAll('.w__lock').forEach((el) => {
      el.lastChild.textContent = ' Locked by Anna Smith · 1mo';
    });
  });
  await page.waitForTimeout(150);
  const w = await page.evaluate(() => {
    const row = document.querySelector('back-office-widgets .widgets');
    const cards = [...document.querySelectorAll('back-office-widgets .w')];
    const rr = row.getBoundingClientRect();
    const buttons = cards.flatMap((c) => [...c.querySelectorAll('button')]);
    return {
      fillsRow:
        Math.round(Math.min(...cards.map((c) => c.getBoundingClientRect().left)) - rr.left) === 0 &&
        Math.round(rr.right - Math.max(...cards.map((c) => c.getBoundingClientRect().right))) === 0,
      stacked:
        Math.round(cards[0].getBoundingClientRect().top) !==
        Math.round(cards[1].getBoundingClientRect().top),
      // The secondary line is held to one line whatever happens.
      bodyLines: cards.map((c) =>
        Math.round(c.querySelector('.w__meta').getBoundingClientRect().height / 20),
      ),
      rowScrolls: row.scrollWidth > row.clientWidth + 1,
      // Every pair of leaf parts, tested against each other. The longest real
      // content is forced in below so this runs against the worst case.
      overlaps: (() => {
        const out = [];
        for (const card of cards) {
          const parts = [
            ...card.querySelectorAll(
              '.w__name, ui-pill, .w__meta, .w__lock, .w__actions button',
            ),
          ];
          for (let i = 0; i < parts.length; i++) {
            for (let j = i + 1; j < parts.length; j++) {
              if (parts[i].contains(parts[j]) || parts[j].contains(parts[i])) continue;
              const a = parts[i].getBoundingClientRect();
              const b = parts[j].getBoundingClientRect();
              if (a.left < b.right - 0.5 && b.left < a.right - 0.5 &&
                  a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5) {
                out.push(`${parts[i].className || parts[i].tagName}|${parts[j].className || parts[j].tagName}`);
              }
            }
          }
        }
        return [...new Set(out)];
      })(),
      // Buttons neither clip their own label nor escape their card.
      clipped: buttons.filter(
        (btn) =>
          btn.scrollWidth > btn.clientWidth + 1 ||
          btn.getBoundingClientRect().right >
            btn.closest('.w').getBoundingClientRect().right + 0.5,
      ).length,
    };
  });
  check(`${width}px: widgets fill the content width`, w.fillsRow);
  check(`${width}px: secondary text stays one line`, w.bodyLines.every((n) => n === 1),
    w.bodyLines.join(','));
  check(`${width}px: no button clips or overflows its card`, w.clipped === 0, `${w.clipped}`);
  // Text on top of a button is a hard fail, not a styling nit.
  check(`${width}px: nothing inside a widget overlaps anything else`,
    w.overlaps.length === 0, w.overlaps.join('; '));
  check(`${width}px: the widget row wraps, it never scrolls sideways`, !w.rowScrolls);
  // Side by side while they fit, stacked once they do not.
  check(`${width}px: ${width > 719 ? 'side by side' : 'stacked'}`,
    w.stacked === (width <= 719), `stacked=${w.stacked}`);
}
await page.setViewportSize({ width: 1440, height: 1040 });

console.log('\nOne 20px left edge across the stream and all four tabs');
await page.setViewportSize({ width: 1440, height: 1040 });
const GUTTER_PX = 20;
const edgesIn = () =>
  page.evaluate(() => {
    const out = {};
    const wf = document.querySelector('workflow-panel');
    const info = document.querySelector('player-info-panel');
    const at = (label, sel, base) => {
      const el = document.querySelector(sel);
      if (el) out[label] = Math.round(el.getBoundingClientRect().left - base);
    };
    if (wf) {
      const l = wf.getBoundingClientRect().left;
      // The bar's FIRST CHILD, not its first pill - the pills sit after the
      // "Required" label, so measuring a pill reports the label's width.
      at('chip bar', 'required-chips .chip-bar > *', l);
      at('outcome card', 'outcome-card .card', l);
      at('placeholder slot', 'action-placeholder .slot', l);
      at('add action', 'workflow-panel .stream__add button', l);
      at('event row', 'event-row .row', l);
    }
    if (info) {
      const l = info.getBoundingClientRect().left;
      at('snapshot label', '.snapshot-head__label', l);
      at('snapshot stub', '.info__body > .placeholder', l);
      at('past row', '.past__id', l);
      at('timeline row', '.timeline__at', l);
      // First child again, not the author - the pill precedes it, so measuring
      // the name reports the pill's width on a correctly aligned row.
      at('starred row', '.starred__head > *', l);
    }
    return out;
  });
const assertEdges = (label, edges) => {
  const off = Object.entries(edges).filter(([, v]) => v !== GUTTER_PX);
  check(`${label}: everything starts at ${GUTTER_PX}px`, off.length === 0 && Object.keys(edges).length > 0,
    off.map(([k, v]) => `${k}=${v}`).join(', ') || 'nothing measured');
};
for (const state of ['01', '03', '07']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('player-info-panel', { timeout: 15000 });
  await page.waitForTimeout(500);
  assertEdges(`state ${state}`, await edgesIn());
}
await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('player-info-panel', { timeout: 15000 });
await page.waitForTimeout(500);
for (const tab of ['Past AML cases', 'Starred', 'Timeline']) {
  await page.click(`player-info-panel .mat-mdc-tab:has-text("${tab}")`);
  await page.waitForTimeout(450);
  assertEdges(`${tab} tab`, await edgesIn());
}
// The stub only exists after a row click, and it is the one thing in a flush
// tab that has to be pulled back onto the gutter.
await page.click('player-info-panel .mat-mdc-tab:has-text("Past AML cases")');
await page.waitForTimeout(400);
await page.click('.past__row');
await page.waitForTimeout(450);
assertEdges('Past AML cases with the stub open', await edgesIn());

// Starred row, per Figma node 22224:18922: pill, author and a right-aligned
// timestamp on the first line, the commentary on the second.
//
// Reloaded rather than tabbed away from the open past-case stub above: the
// stub holds the info body, so switching tabs under it left no .starred__row
// to measure and this read a null.
await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('player-info-panel', { timeout: 15000 });
await page.waitForTimeout(500);
await page.click('player-info-panel .mat-mdc-tab:has-text("Starred")');
await page.waitForSelector('.starred__row', { timeout: 15000 });
await page.waitForTimeout(450);
const ST_INK = await tokenRgb('--ink');
const ST_INK_3 = await tokenRgb('--ink-3');
const ST_LINE = await tokenRgb('--line');
const st = await page.evaluate(() => {
  const row = document.querySelector('.starred__row');
  const body = document.querySelector('.info__body');
  const R = (e) => e.getBoundingClientRect();
  const pill = row.querySelector('ui-pill');
  const who = row.querySelector('.starred__who');
  const at = row.querySelector('.starred__at');
  const text = row.querySelector('.starred__text');
  const cs = getComputedStyle(row);
  const type = (e) => {
    const c = getComputedStyle(e);
    return { size: c.fontSize, line: c.lineHeight, weight: c.fontWeight, colour: c.color };
  };
  // Three real rows now, so the separator is observable without a stand-in.
  const all = [...document.querySelectorAll('.starred__row')];
  const sep = {
    count: all.length,
    width: getComputedStyle(row).borderBottomWidth,
    colour: getComputedStyle(row).borderBottomColor,
    allButLastRuled: all.slice(0, -1).every((r) => getComputedStyle(r).borderBottomWidth === '1px'),
    lastHasNone: getComputedStyle(all[all.length - 1]).borderBottomWidth === '0px',
  };
  return {
    pad: cs.padding,
    bodyPad: getComputedStyle(body).paddingLeft + '/' + getComputedStyle(body).paddingRight,
    spansPanel:
      Math.round(R(row).left - R(body).left) === 0 &&
      Math.round(R(body).right - R(row).right) === 0,
    // The pill is measured only if it exists. It does not - see the check
    // below - and reading a null here crashed the file, taking every
    // assertion after it with it.
    hasPill: !!pill,
    pillLeft: pill ? Math.round(R(pill).left - R(row).left) : null,
    pillToWho: pill ? Math.round(R(who).left - R(pill).right) : null,
    whoLeft: Math.round(R(who).left - R(row).left),
    atRight: Math.round(R(row).right - R(at).right),
    textLeft: Math.round(R(text).left - R(row).left),
    textRight: Math.round(R(row).right - R(text).right),
    // Centres, not tops: the stamp's line box is 16px against the author's
    // 20px, so matching tops would only ever be true by accident.
    headOneLine:
      Math.abs((R(who).top + R(who).height / 2) - (R(at).top + R(at).height / 2)) <= 1,
    textBelowHead: R(text).top >= R(who).bottom - 1,
    who: type(who), at: type(at), text: type(text),
    sep,
    // No card chrome: rows, not tiles.
    radius: cs.borderRadius,
    outerBorders: [cs.borderTopWidth, cs.borderLeftWidth, cs.borderRightWidth].join(','),
  };
});
check('starred: 12px 20px rows, no card chrome',
  st.pad === '12px 20px' && st.radius === '0px' && st.outerBorders === '0px,0px,0px',
  `${st.pad} radius ${st.radius} borders ${st.outerBorders}`);
check('starred: body is flush, rows span the panel',
  st.bodyPad === '0px/0px' && st.spansPanel, `${st.bodyPad} spans=${st.spansPanel}`);
/**
 * The starred row has no pill, and this is the assertion that says so.
 *
 * Figma 22224:18922 draws the head as pill, author, right-aligned timestamp.
 * The component renders .starred__who and .starred__at and nothing else, and
 * has for as long as this file has been unable to run this far. Left FAILING
 * rather than relaxed to match the code: which of the two is wrong is a design
 * question, and quietly rewriting the check to agree with the component would
 * decide it by default and lose the record that they ever disagreed.
 */
check('starred: the row carries a pill, per 22224:18922',
  st.hasPill, 'no ui-pill in .starred__row - see the note above this check');
check('starred: pill on the 20px gutter, author 8px after it',
  st.hasPill && st.pillLeft === 20 && st.pillToWho === 8,
  st.hasPill ? `${st.pillLeft} / ${st.pillToWho}` : `no pill; author sits at ${st.whoLeft}`);
check('starred: timestamp ends 20px from the right edge', st.atRight === 20, String(st.atRight));
check('starred: the commentary spans the full gutter',
  st.textLeft === 20 && st.textRight === 20, `${st.textLeft} / ${st.textRight}`);
check('starred: author is 14px/20px semibold full ink',
  st.who.size === '14px' && st.who.line === '20px' && st.who.weight === '600' &&
    st.who.colour === ST_INK,
  `${st.who.size}/${st.who.line} w${st.who.weight} ${st.who.colour}`);
check('starred: timestamp is 12px/16px muted',
  st.at.size === '12px' && st.at.line === '16px' && st.at.colour === ST_INK_3,
  `${st.at.size}/${st.at.line} ${st.at.colour}`);
check('starred: commentary is 14px/20px muted',
  st.text.size === '14px' && st.text.line === '20px' && st.text.colour === ST_INK_3,
  `${st.text.size}/${st.text.line} ${st.text.colour}`);
// Sorted on the parsed timestamp, so an entry with an offset cannot slip in
// out of order the way a string compare would allow.
const starOrder = await page.$$eval('.starred__at', (els) =>
  els.map((e) => Date.parse(e.getAttribute('datetime'))));
check('starred: newest first',
  starOrder.length === 3 && starOrder.every((v, i) => i === 0 || starOrder[i - 1] >= v),
  starOrder.join(' > '));
check('starred: pill, author and stamp share one line', st.headOneLine);
check('starred: the commentary sits below them', st.textBelowHead);
check('starred: three commentaries, as designed', st.sep.count === 3, String(st.sep.count));
check('starred: a 1px rule separates rows, and the last has none',
  st.sep.width === '1px' && st.sep.colour === ST_LINE &&
    st.sep.allButLastRuled && st.sep.lastHasNone,
  `${st.sep.width} ${st.sep.colour} ruled=${st.sep.allButLastRuled} lastNone=${st.sep.lastHasNone}`);
// The tags are severity pills, so a new entry cannot quietly land on a tone
// that is not part of the severity language.
const tags = await page.$$eval('.starred__row ui-pill', (els) =>
  els.map((e) => e.getAttribute('data-sev')));
check('starred: every tag is a real severity',
  tags.length === 3 && tags.every((t) => SEVERITY_ORDER.includes(t)), tags.join(','));

// Timeline row, per Figma node 22224:18961: two stacked lines on the left,
// the actor right-aligned on the second of them.
await page.click('player-info-panel .mat-mdc-tab:has-text("Timeline")');
await page.waitForTimeout(450);
const INK = await tokenRgb('--ink');
const INK_3 = await tokenRgb('--ink-3');
const LINE = await tokenRgb('--line');
const tl = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.timeline__item')];
  const row = rows[0];
  const body = document.querySelector('.info__body');
  const R = (e) => e.getBoundingClientRect();
  const at = row.querySelector('.timeline__at');
  const what = row.querySelector('.timeline__what');
  const who = row.querySelector('.timeline__who');
  const cs = getComputedStyle(row);
  const type = (e) => {
    const c = getComputedStyle(e);
    return { size: c.fontSize, line: c.lineHeight, colour: c.color };
  };
  return {
    pad: cs.padding,
    // 8 + 16 + 20 + 8 = 52, plus the 1px rule. The last row has no rule.
    heights: [...new Set(rows.map((r) => Math.round(R(r).height)))].sort(),
    borderW: cs.borderBottomWidth,
    borderColour: cs.borderBottomColor,
    spansPanel:
      Math.round(R(row).left - R(body).left) === 0 &&
      Math.round(R(body).right - R(row).right) === 0,
    atLeft: Math.round(R(at).left - R(row).left),
    whatLeft: Math.round(R(what).left - R(row).left),
    whoRight: Math.round(R(row).right - R(who).right),
    atAboveWhat: R(at).bottom <= R(what).top + 1,
    whoOnWhatLine: Math.abs(Math.round(R(who).top) - Math.round(R(what).top)) <= 1,
    at: type(at), what: type(what), who: type(who),
    cursor: cs.cursor,
    controls: document.querySelectorAll('.timeline button, .timeline [tabindex]').length,
  };
});
check('timeline: 8px 20px in a 52px row', tl.pad === '8px 20px' &&
  tl.heights.every((h) => h === 52 || h === 53), `${tl.pad} heights ${tl.heights.join(',')}`);
check('timeline: 1px rule in the line colour',
  tl.borderW === '1px' && tl.borderColour === LINE, `${tl.borderW} ${tl.borderColour}`);
check('timeline: rows span the panel edge to edge', tl.spansPanel);
check('timeline: both left lines sit on the 20px gutter',
  tl.atLeft === 20 && tl.whatLeft === 20, `${tl.atLeft} / ${tl.whatLeft}`);
check('timeline: the actor ends 20px from the right edge', tl.whoRight === 20, String(tl.whoRight));
check('timeline: timestamp is 12px/16px muted',
  tl.at.size === '12px' && tl.at.line === '16px' && tl.at.colour === INK_3,
  `${tl.at.size}/${tl.at.line} ${tl.at.colour}`);
check('timeline: what happened is 14px/20px full ink',
  tl.what.size === '14px' && tl.what.line === '20px' && tl.what.colour === INK,
  `${tl.what.size}/${tl.what.line} ${tl.what.colour}`);
check('timeline: the actor is 14px/20px muted',
  tl.who.size === '14px' && tl.who.line === '20px' && tl.who.colour === INK_3,
  `${tl.who.size}/${tl.who.line} ${tl.who.colour}`);
check('timeline: timestamp sits above what happened', tl.atAboveWhat);
// Auto-placement would push the actor onto a third row of its own; the cells
// are placed by hand so it lands beside the second line.
check('timeline: the actor is level with what happened', tl.whoOnWhatLine);
check('timeline: rows are records, not controls',
  tl.cursor !== 'pointer' && tl.controls === 0, `${tl.cursor} controls=${tl.controls}`);

console.log('\nBlue pills are the info tone, not primary');
await page.setViewportSize({ width: 1440, height: 1040 });
const INFO_BG = await tokenRgb('--color-background-info-subdued');
const INFO_FG = await tokenRgb('--color-foreground-on-info');
for (const state of ['01', '09', '10']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('ui-pill', { timeout: 15000 });
  await page.waitForTimeout(500);
  const pills = await page.$$eval('ui-pill', (els) =>
    els.map((el) => {
      const cs = getComputedStyle(el);
      return {
        text: el.textContent.trim(),
        tone: el.getAttribute('data-tone'),
        bg: cs.backgroundColor,
        fg: cs.color,
      };
    }),
  );
  // The tone is gone from the component, so nothing can still be asking for
  // it - a stale tone attribute would silently fall through to the base.
  check(`${state}: no pill is still on the primary tone`,
    pills.every((p) => p.tone !== 'primary'),
    pills.filter((p) => p.tone === 'primary').map((p) => p.text).join(', '));
  const info = pills.filter((p) => p.tone === 'info');
  // The widget count badge is no longer a ui-pill - the Figma widget spec
  // gives it its own border and neutral fill - so a state may legitimately
  // have no info pill on screen at all.
  check(`${state}: any info pill uses the info tokens`,
    info.every((p) => p.bg === INFO_BG && p.fg === INFO_FG),
    info.map((p) => `${p.text} ${p.bg}/${p.fg}`).join('; '));
  check(`${state}: info pills use the info tokens`,
    info.every((p) => p.bg === INFO_BG && p.fg === INFO_FG),
    info.map((p) => `${p.text} ${p.bg}/${p.fg}`).join('; '));
}
// The two the request named, by name.
await page.goto(`${BASE}/?state=10`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('trigger-strip ui-pill', { timeout: 15000 });
await page.waitForTimeout(500);
// Scoped, not text-matched across the page: the SG widget now carries a
// "41 triggers hit" pill of its own, which a loose /triggers/ search finds
// before the strip's count and reports the wrong tone for.
const named = await page.evaluate(() => {
  const read = (sel) => {
    const el = document.querySelector(sel);
    return el ? el.getAttribute('data-tone') : null;
  };
  return {
    sgWidget: read('back-office-widgets .w:first-of-type ui-pill'),
  };
});
// The widget's count badge is now the Figma badge, not a ui-pill: neutral
// fill, 1px border, --ink text. Asserted against the design, not the tone.
const widgetCount = await page.evaluate(() => {
  const el = document.querySelector('back-office-widgets .w__count');
  if (!el) return null;
  const cs = getComputedStyle(el);
  return { bg: cs.backgroundColor, fg: cs.color, border: cs.borderTopWidth, radius: cs.borderRadius };
});
check('the widget count badge is the design badge, not a tone pill',
  widgetCount !== null && widgetCount.border === '1px' && widgetCount.radius === '100px',
  JSON.stringify(widgetCount));
// The strip's amber count chip went with its header. The arrival's signal is
// the row - its tint and its New badge - and rules.mjs is where that is
// asserted, against an open case and a resolved one.

console.log('\nThe snapshot header is one layout in both modes');
await page.setViewportSize({ width: 1440, height: 1040 });
const snapHead = async (state) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.snapshot-head', { timeout: 15000 });
  await page.waitForTimeout(450);
  return page.evaluate(() => {
    const h = document.querySelector('.snapshot-head');
    const R = (e) => e.getBoundingClientRect();
    const label = h.querySelector('.snapshot-head__label');
    const value = h.querySelector('.snapshot-head__value');
    const ctrl = h.querySelector('button');
    const after = document.querySelector('.placeholder');
    return {
      height: Math.round(R(h).height),
      label: label.textContent.trim(),
      value: value.textContent.trim(),
      labelSize: getComputedStyle(label).fontSize,
      valueSize: getComputedStyle(value).fontSize,
      valueWeight: getComputedStyle(value).fontWeight,
      // Both lines single-line in both modes, or the fixed height is a lie.
      lines: [Math.round(R(label).height), Math.round(R(value).height)],
      control: ctrl ? ctrl.textContent.replace(/\s+/g, ' ').trim() : null,
      controlName: ctrl ? (ctrl.getAttribute('aria-label') ?? ctrl.textContent.trim()) : null,
      controlIsMaterial: ctrl ? ctrl.classList.contains('mat-mdc-button-base') : null,
      controlDisabled: ctrl ? ctrl.disabled : null,
      controlRightInset: ctrl ? Math.round(R(h).right - R(ctrl).right) : null,
      controlCentred: ctrl
        ? Math.abs((R(ctrl).top - R(h).top) - (R(h).bottom - R(ctrl).bottom)) <= 1
        : null,
      // What sits below the header must start at the same place in both modes.
      contentOffset: after ? Math.round(R(after).top - R(h).top) : null,
      hasOldBanner: !!document.querySelector('player-info-panel .banner'),
    };
  });
};

const current = await snapHead('01');
const historical = await snapHead('04');

check('current: label over a bold timestamp',
  current.label === 'Snapshot generated' && current.labelSize === '12px' &&
    current.valueSize === '14px' && current.valueWeight === '600',
  `${current.label} / ${current.value} ${current.valueSize} w${current.valueWeight}`);
check('current: the control is Resync', /Resync/.test(current.control ?? ''), current.control);
// Resync belongs to the lock owner, not to the snapshot being stale. It was
// hardcoded disabled here, which made it a label shaped like a button - taking
// a fresh snapshot is something you may simply want to do. State 01 is locked
// to you, so it is live.
check('current: Resync is enabled for the lock owner', current.controlDisabled === false,
  String(current.controlDisabled));

check('historical: label names the source action',
  historical.label === 'Snapshot from Open source searches', historical.label);
check('historical: timestamp reads "Captured ..."',
  historical.value === 'Captured 11 Aug 2026, 11:42', historical.value);
check('historical: the control is a text Back with a chevron',
  /^chevron_left Back$/.test(historical.control ?? '') &&
    historical.controlIsMaterial === false,
  `${historical.control} material=${historical.controlIsMaterial}`);
// "Back" alone does not say where to, so the full sentence lives on the label.
check('historical: the short label keeps a full accessible name',
  historical.controlName === 'Back to current snapshot', historical.controlName);

const LINK = await tokenRgb('--link');
const LINK_HOVER = await tokenRgb('--link-hover');
const backStyle = () =>
  page.evaluate(() => {
    const btn = document.querySelector('.snapshot-head__back');
    const icon = btn.querySelector('mat-icon');
    return {
      colour: getComputedStyle(btn).color,
      iconColour: getComputedStyle(icon).color,
      underline: getComputedStyle(btn).textDecorationLine,
    };
  });
const backRest = await backStyle();
check('historical: label and chevron share the link colour',
  backRest.colour === LINK && backRest.iconColour === LINK,
  `${backRest.colour} / ${backRest.iconColour}`);
await page.hover('.snapshot-head__back');
await page.waitForTimeout(250);
const backHover = await backStyle();
// mat-icon sets its own colour, so a hover rule on the button alone leaves the
// chevron behind at the rest colour.
check('historical: both deepen together on hover',
  backHover.colour === LINK_HOVER && backHover.iconColour === LINK_HOVER,
  `${backHover.colour} / ${backHover.iconColour}`);
check('historical: no underline, at rest or on hover',
  backRest.underline === 'none' && backHover.underline === 'none',
  `${backRest.underline} / ${backHover.underline}`);
check('the tinted banner is gone', !historical.hasOldBanner);

// The whole point of the shared layout.
check('both modes are exactly the same height',
  current.height === historical.height, `${current.height} vs ${historical.height}`);
check('both put the control hard right',
  current.controlRightInset === 0 && historical.controlRightInset === 0,
  `${current.controlRightInset} / ${historical.controlRightInset}`);
check('both centre the control against the text column',
  current.controlCentred && historical.controlCentred);
check('both keep the label and timestamp to one line each',
  current.lines.concat(historical.lines).every((h) => h <= 21),
  `${current.lines.join(',')} / ${historical.lines.join(',')}`);
check('what follows the header does not move between modes',
  current.contentOffset === historical.contentOffset,
  `${current.contentOffset} vs ${historical.contentOffset}`);

console.log('\nEvery close and minimise control is one size');
// These lived in four components at three different button sizes and two icon
// sizes. Nothing enforces one size but this: the rule is 32px square with a
// 16px glyph, wherever the control appears.
// .bar__close is deliberately outside this set: the minimised bar's close
// carries a 44px touch target by design, asserted separately below.
const CHROME_BTNS = '.head__close, .panel__close, .sg__btn';
const chromeSizes = async (label) => {
  const rows = await page.$$eval(CHROME_BTNS, (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      const i = e.querySelector('mat-icon');
      const ir = i.getBoundingClientRect();
      return {
        name: e.getAttribute('aria-label') ?? i.textContent.trim(),
        w: Math.round(r.width), h: Math.round(r.height),
        iw: Math.round(ir.width), ih: Math.round(ir.height),
      };
    }),
  );
  check(`${label}: controls found`, rows.length > 0, `${rows.length}`);
  const off = rows.filter((r) => r.w !== 32 || r.h !== 32 || r.iw !== 16 || r.ih !== 16);
  check(`${label}: all 32x32 with 16x16 icons`, off.length === 0,
    off.map((r) => `${r.name} ${r.w}x${r.h}/${r.iw}x${r.ih}`).join(', '));
  // The pair is grouped so its 12px is independent of the 16px that separates
  // it from the title - a single .head__main gap could not express both.
  const pair = await page.evaluate(() => {
    const g = document.querySelector('case-header .head__actions');
    if (!g) return null;
    const b = [...g.querySelectorAll('button')].map((e) => e.getBoundingClientRect());
    const title = document.querySelector('case-header .head__title').getBoundingClientRect();
    // Centres, not tops. The controls are IN the title row now and it is
    // centre-aligned, so a 32px button and a 30px title line never share a top
    // edge - the old check would only have passed by their happening to be the
    // same height. What the rule actually means is that they sit on one line,
    // which is what comparing centres says.
    const centre = (r) => Math.round(r.top + r.height / 2);
    return {
      css: getComputedStyle(g).gap,
      measured: Math.round(b[1].left - b[0].right),
      centreOffset: Math.abs(centre(b[0]) - centre(title)),
      inTitleRow: !!g.closest('.head__title-row'),
    };
  });
  if (pair) {
    check(`${label}: 12px between minimise and close`,
      pair.css === '12px' && pair.measured === 12, `${pair.css} / ${pair.measured}px`);
    // On the title's line, at BOTH widths. Narrow used to centre the whole
    // header block, which measured the buttons against title PLUS the identity
    // line and dropped them below the title they belong to. They are inside
    // the title row itself now, so the claim is that they share its centre.
    check(`${label}: the controls sit in the title row`, pair.inTitleRow);
    check(`${label}: centred on the title's line`, pair.centreOffset <= 1,
      `${pair.centreOffset}px off the title's centre`);
  }
};
for (const state of ['01', '07', '10', '00b', '05', '06']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.head__close', { timeout: 15000 });
  await page.waitForTimeout(400);
  await chromeSizes(state);
}
// 09 carries the SG modal's pair, and minimising both swaps them for bar
// controls - the two places the sizes used to diverge most. Needs a stage wide
// enough for two: at 1440 the stage is 1144, under the dual-fit width, so one
// panel would already be in its bar and there would be no SG chrome to size.
await page.setViewportSize({ width: 1500, height: 1040 });
await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sg__btn', { timeout: 15000 });
await page.waitForTimeout(500);
await chromeSizes('09 dual');
await page.click('button[aria-label="Minimise alert"]');
await page.waitForTimeout(400);
await page.click('button[aria-label="Minimise case"]');
await page.waitForTimeout(400);
// No panel chrome left once both are in their bars - the only controls on
// screen are the bar's own, which have their own rule below.
// A fixed square cannot stretch to the bar's height, so it has to centre
// itself; a top- or bottom-hugging close button would read as misaligned.
// Its own rule: a 44px hit area, a 16px glyph, and the 16px gutter it was
// being clipped at.
const barClose = await page.evaluate(() => {
  const bar = document.querySelector('minimised-bar .bar');
  // .bar__icon-btn - the class this was written against no longer exists, and
  // reading null off it crashed the file before it reached the checks below.
  const c = bar.querySelector('.bar__icon-btn[aria-label^="Close"]');
  const r = c.getBoundingClientRect();
  const icon = c.querySelector('mat-icon').getBoundingClientRect();
  return {
    size: `${Math.round(r.width)}x${Math.round(r.height)}`,
    icon: `${Math.round(icon.width)}x${Math.round(icon.height)}`,
    gutter: Math.round(bar.getBoundingClientRect().right - r.right),
  };
});
check('bar close has a 44px target and a 16px glyph',
  barClose.size === '44x44' && barClose.icon === '16x16', JSON.stringify(barClose));
check('and clears the right edge by 16px', Math.abs(barClose.gutter - 16) <= 1,
  `${barClose.gutter}`);
check('bar close is vertically centred', await page.evaluate(() => {
  const bars = [...document.querySelectorAll('minimised-bar .bar')];
  return bars.length > 0 && bars.every((b) => {
    const r = b.getBoundingClientRect();
    const c = b.querySelector('.bar__icon-btn[aria-label^="Close"]').getBoundingClientRect();
    return Math.abs((c.top - r.top) - (r.bottom - c.bottom)) <= 1;
  });
}));

/**
 * The lock is IN THE TITLE ROW now, per 22377:2084 - there is no band.
 *
 * The height claim survives the move and matters more, not less: the row it
 * joined also holds the title and the window controls, so a lock state that
 * changed its height would move those too. What is measured is the same thing
 * by a different element - the row rather than the strip under it.
 *
 * The button is no longer inside .head__lock, which is a status span now. It
 * sits in .head__lockline beside the lock it belongs to, held 24px from
 * the window controls.
 */
console.log('\nThe lock holds its height across every lock state');
const bandState = () =>
  page.evaluate(() => {
    // NULL-SAFE, because a resolved case renders no lock at all - not the
    // glyph, not the line, not the wrapper. Everything lock-shaped below
    // reports null there, and the checks say so rather than crashing on it.
    const el = document.querySelector('case-header .head__lock');
    const row = document.querySelector('case-header .head__title-row');
    const strip = document.querySelector('trigger-strip .strip');
    const btn = document.querySelector('case-header .head__lockline > button');
    const text = el?.querySelector('.head__lock-text') ?? null;
    return {
      hasLock: !!el,
      h: Math.round(row.getBoundingClientRect().height),
      // Relative to the modal, NOT the viewport. Measured absolutely this
      // tracked the height of the dev harness sitting above the modal - whose
      // hint text wraps differently per state - so it failed for a reason that
      // has nothing to do with the lock band it is meant to be watching.
      stripTop: Math.round(
        strip.getBoundingClientRect().top -
          document.querySelector('aml-case-modal .modal').getBoundingClientRect().top,
      ),
      text: text ? text.textContent.trim() : null,
      textColour: text ? getComputedStyle(text).color : null,
      iconColour: el ? getComputedStyle(el.querySelector('.head__lock-icon')).color : null,
      button: btn ? btn.textContent.trim() : null,
      btnColour: btn ? getComputedStyle(btn).color : null,
      title: el ? el.getAttribute('title') : null,
      // The gap holding a destructive action away from the close button.
      gapToControls: btn
        ? Math.round(
            document.querySelector('case-header .head__actions').getBoundingClientRect().left -
              btn.getBoundingClientRect().right,
          )
        : null,
    };
  });

await page.setViewportSize({ width: 1440, height: 1000 });
const bands = [];
await page.goto(`${BASE}/?state=00a`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
bands.push(['unassigned', await bandState()]);
await page.locator('case-header button:has-text("Lock to me")').click();
await page.waitForTimeout(400);
bands.push(['locked to you', await bandState()]);
await page.goto(`${BASE}/?state=00b`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
bands.push(['locked to other', await bandState()]);
await page.goto(`${BASE}/?state=07`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
bands.push(['resolved', await bandState()]);

const byName = Object.fromEntries(bands);
/**
 * A resolved case has NOTHING lock-shaped in its header.
 *
 * Not a padlock, not a line, not the wrapper. The Resolved pill carries the
 * status and the absent controls carry read-only - a sentence saying so beside
 * a pill already saying it was one fact three times, in the one state where
 * none of it can be acted on.
 *
 * Checked here rather than in its own block because the height assertion below
 * is the other half of it: taking the lock out must not move the row.
 */
check('resolved renders no lock at all',
  byName['resolved'].hasLock === false && byName['resolved'].text === null &&
    byName['resolved'].button === null,
  JSON.stringify(byName['resolved']));
check('every other state still has one',
  ['unassigned', 'locked to you', 'locked to other'].every((k) => byName[k].hasLock),
  bands.map(([n, b]) => `${n}:${b.hasLock}`).join(' '));
check('the title row height is identical in every lock state',
  new Set(bands.map(([, b]) => b.h)).size === 1,
  bands.map(([n, b]) => `${n}:${b.h}`).join(' '));
check('nothing below the header ever moves',
  new Set(bands.map(([, b]) => b.stripTop)).size === 1,
  bands.map(([n, b]) => `${n}:${b.stripTop}`).join(' '));

// "Not locked", full stop. The band used to add "Lock the case to record
// outcomes" - in a row beside the button that does exactly that, the hint was
// the button saying itself twice, and the longest string in the state.
check('unassigned offers a primary "Lock to me"',
  byName['unassigned'].button === 'Lock to me' && byName['unassigned'].text === 'Not locked',
  byName['unassigned'].text);
// Green is the only "you can act here" signal, so it must appear here and
// NOWHERE else in this band.
check('locked to you is the only green state', await (async () => {
  const green = byName['locked to you'];
  const others = ['unassigned', 'locked to other', 'resolved'].map((k) => byName[k]);
  return (
    green.textColour === BAND_SUCCESS &&
    green.iconColour === BAND_SUCCESS &&
    // Resolved has no lock text to be green, which satisfies this by having
    // nothing rather than by having something a different colour.
    others.every((o) => o.textColour !== BAND_SUCCESS && o.iconColour !== BAND_SUCCESS)
  );
})());
// The stamp moved to a hover title: you took the lock, so when is a detail you
// can ask for rather than one this row spends its width on.
check('locked to you says only the fact, stamp on hover',
  byName['locked to you'].text === 'Locked to you' &&
    /^Locked to you since /.test(byName['locked to you'].title ?? ''),
  `${byName['locked to you'].text} | title=${byName['locked to you'].title}`);
check('locked to you offers Unlock', byName['locked to you'].button === 'Unlock');
// Tokens again, not hexes: what matters is that the neutral row uses --ink-2
// and the destructive button uses --danger, whatever those hold.
const INK_2 = await tokenRgb('--ink-2');
check('locked to other is neutral text with a red Force unlock',
  byName['locked to other'].textColour === INK_2 &&
    byName['locked to other'].button === 'Force unlock' &&
    byName['locked to other'].btnColour === DANGER,
  `${byName['locked to other'].textColour} / ${byName['locked to other'].btnColour} (want ${INK_2} / ${DANGER})`);

console.log('\nOne pill component: uniform box, colours preserved');
const pills = new Map();
for (const state of ['01', '03', '05', '07', '10', '11']) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll('ui-pill')].map((e) => {
      const cs = getComputedStyle(e);
      return {
        key: `${e.getAttribute('data-sev') || e.getAttribute('data-tone')}`,
        h: Math.round(e.getBoundingClientRect().height),
        padL: cs.paddingLeft, padR: cs.paddingRight, gap: cs.gap,
        fs: cs.fontSize, lh: cs.lineHeight, radius: cs.borderTopLeftRadius,
        bg: cs.backgroundColor, fg: cs.color,
        role: e.getAttribute('role'), tabindex: e.getAttribute('tabindex'),
      };
    }),
  );
  rows.forEach((r) => pills.set(r.key + r.bg, r));
}
const P = [...pills.values()];
check('pills are rendered at all', P.length >= 8, String(P.length));
check('every pill is 24px tall', P.every((r) => r.h === 24),
  [...new Set(P.map((r) => r.h))].join(','));
check('every pill uses a 4px icon-to-text gap',
  P.every((r) => r.gap === '4px'),
  [...new Set(P.map((r) => r.gap))].join(','));
check('every pill has 8px horizontal padding',
  P.every((r) => r.padL === '8px' && r.padR === '8px'),
  [...new Set(P.map((r) => r.padL + '/' + r.padR))].join(' '));
check('every pill is 14px/20px',
  P.every((r) => r.fs === '14px' && r.lh === '20px'),
  [...new Set(P.map((r) => r.fs + '/' + r.lh))].join(' '));
check('every pill shares one radius',
  [...new Set(P.map((r) => r.radius))].join(',') === '999px',
  [...new Set(P.map((r) => r.radius))].join(','));
check('colours were preserved, not flattened',
  new Set(P.map((r) => r.bg + r.fg)).size >= 7,
  String(new Set(P.map((r) => r.bg + r.fg)).size) + ' distinct');
check('no pill is interactive', P.every((r) => !r.role && !r.tabindex));
// Nothing should still be styling a pill outside the component.
// ui-pill deliberately does not size projected icons, so every caller that
// puts one in a pill has to do it - and any that forgets falls back to
// Material's 24px inside a 24px pill. Checked across the states that have them.
const pillIcons = [];
for (const st of ['01', '03', '05', '10']) {
  await page.goto(`${BASE}/?state=${st}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('ui-pill', { timeout: 15000 });
  await page.waitForTimeout(400);
  if (st === '05') {
    await page
      .locator('severity-dialog mat-radio-button:has-text("Compliance") input')
      .check({ force: true });
    await page.waitForTimeout(350);
  }
  pillIcons.push(
    ...(await page.evaluate(() =>
      [...document.querySelectorAll('ui-pill mat-icon')].map((e) => {
        const r = e.getBoundingClientRect();
        return { glyph: e.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
      }),
    )),
  );
}
check('pills carry icons to check', pillIcons.length >= 3, String(pillIcons.length));
check('every icon inside a pill is 16x16',
  pillIcons.every((i) => i.w === 16 && i.h === 16),
  [...new Set(pillIcons.map((i) => `${i.glyph}:${i.w}x${i.h}`))].join(' '));
// ::ng-deep de-scopes to a bare element selector, so a rule meant for one
// component silently resizes every icon in the app. Nothing may declare one.
check('no global bare mat-icon rule exists', await page.evaluate(() => {
  for (const sheet of document.styleSheets) {
    let rules;
    try { rules = sheet.cssRules; } catch { continue; }
    for (const r of rules) if (r.selectorText === 'mat-icon') return false;
  }
  return true;
}));
check('no stray pill CSS survives elsewhere', await page.evaluate(() => {
  const legacy = document.querySelectorAll(
    '.pill, .chip, .strip__chip, .cell__new, .widget__tag, .bar__tag, .sg__tag, .badge',
  );
  return legacy.length === 0;
}));

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

/**
 * NO HEADER AT ALL. The strip is rows and the divider between them.
 *
 * It had a bar carrying a Show all verb, then just a "19 triggers" badge after
 * the verb moved into the list. Both are gone, so what this checks is the
 * absence of the bar and the constant shape of the one thing left: a
 * full-width button in the list's second slot, after the oldest row, in every
 * state and at both widths.
 */
console.log('\nOne trigger control, identical in every state and at both widths');
const controlShape = async () => {
  const c = page.locator('trigger-strip .strip__list');
  if ((await c.count()) !== 1) return null;
  return page.evaluate(() => {
    const strip = document.querySelector('trigger-strip .strip');
    const list = document.querySelector('trigger-strip .strip__list');
    const gap = document.querySelector('trigger-strip .strip__gap');
    const gapBox = gap?.getBoundingClientRect();
    return {
      // Nothing above the rows.
      hasBar: !!document.querySelector('trigger-strip .strip__bar'),
      listAtTopOfStrip:
        Math.round(list.getBoundingClientRect().top - strip.getBoundingClientRect().top) === 0,
      // The divider: a button, spanning the list, in the second slot - after
      // the oldest row, which is where the hidden triggers belong.
      hasGap: !!gap,
      gapIsButton: gap?.tagName === 'BUTTON',
      gapFullWidth: gapBox ? Math.abs(gapBox.width - list.getBoundingClientRect().width) < 2 : false,
      gapSlot: gap ? [...list.children].indexOf(gap.parentElement) : -1,
      gapHeight: gapBox ? Math.round(gapBox.height) : null,
      gapSlotRole: gap?.parentElement.getAttribute('role') ?? null,
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
  await showStrip();
  const s = await controlShape();
  check(`${state}: no header - the rows start the strip`,
    !!s && !s.hasBar && s.listAtTopOfStrip, JSON.stringify(s));
  check(`${state}: the control is a full-width button in the list's second slot`,
    !!s && s.hasGap && s.gapIsButton && s.gapFullWidth && s.gapSlot === 1,
    JSON.stringify(s));
  check(`${state}: and it is a listitem, as role="list" requires`,
    !!s && s.gapSlotRole === 'listitem', String(s?.gapSlotRole));
  if (s) shapes.push({ state, key: `${s.gapHeight}` });
}
check(
  'the control is structurally identical across all of them',
  new Set(shapes.map((s) => s.key)).size === 1,
);
// This guarded against the old split UI: a bottom "+N more" bar and a separate
// narrow-mode summary row. Both are gone, and so is the header verb. The
// invariant that still matters is that the strip contains exactly ONE control,
// and that it is the divider.
check('exactly one control in the strip', await page.evaluate(() => {
  const controls = document.querySelectorAll(
    'trigger-strip button, trigger-strip a, trigger-strip [role=button], trigger-strip [role=link]',
  );
  return controls.length === 1 && controls[0].classList.contains('strip__gap');
}));
check('no legacy summary row survives', await page.evaluate(() =>
  !document.querySelector('trigger-strip .summary'),
));

// The control must not move or resize when it toggles - that is what made the
// old pair feel like two different things.
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const boxBefore = await page.locator('trigger-strip .strip__gap').boundingBox();
await page.locator('trigger-strip .strip__gap').click();
await page.waitForTimeout(300);
const boxAfter = await page.locator('trigger-strip .strip__gap').boundingBox();
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
  // 700 is below the panel's narrow threshold, so the strip is on the Player
  // info segment rather than in a column of its own.
  await showStrip();
  const rows = () => page.locator('trigger-strip .trigger').count();
  const label = () =>
    page.locator('trigger-strip .strip__gap').innerText().then((t) => t.replace(/\s+/g, ' ').trim());
  // Collapsed is the two anchors, and the divider between them NAMES what it
  // is withholding. "Show all" said nothing about how much: the count moved
  // out of the header and into the label, where the number is about this case
  // rather than being a second total.
  const collapsedRows = await rows();
  const hidden = Number(
    (await page.locator('trigger-strip .strip__gap-count').innerText()).trim(),
  );
  check(`${width}px: starts collapsed with the two anchors`, collapsedRows === 2);
  check(`${width}px: the divider counts what it hides`,
    (await label()).includes(`Show ${hidden} remaining`), await label());
  await page.locator('trigger-strip .strip__gap').click();
  await page.waitForTimeout(300);
  check(`${width}px: it expands the strip`, (await rows()) > collapsedRows);
  check(`${width}px: expanded it offers to hide the same number`,
    (await label()).includes(`Hide ${hidden}`), await label());
  await page.locator('trigger-strip .strip__gap').click();
  await page.waitForTimeout(300);
  check(`${width}px: clicking the same row collapses it again`, (await rows()) === 2);
}

/**
 * The strip states the count ONCE, in the divider, and nothing redundant.
 *
 * It used to be a badge in a header: "19 triggers" over two rows, beside a
 * Show all verb. The header is gone, and with it the last place the total was
 * written. The divider names what it is WITHHOLDING instead - a different
 * number, and the only one that is about the gap it sits in.
 *
 * The old failure this guards against is unchanged in shape: "Showing 2 of 19"
 * and "+17 more triggers" once sat beside the badge, three restatements of one
 * figure, two of them separately computed and free to drift apart.
 */
console.log('\nThe strip states its count once, in the divider');
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);

const stripState = async () =>
  page.evaluate(() => {
    const el = document.querySelector('trigger-strip .strip');
    const list = document.querySelector('trigger-strip .strip__list');
    const gap = list.querySelector('.strip__gap');
    const count = gap?.querySelector('.strip__gap-count');
    return {
      text: el.textContent.replace(/\s+/g, ' ').trim(),
      hasBar: !!el.querySelector('.strip__bar'),
      hasBadge: !!el.querySelector('.strip__bar ui-pill'),
      hasNote: !!el.querySelector('.strip__count'),
      label: gap?.textContent.replace(/\s+/g, ' ').trim() ?? null,
      count: count?.textContent.trim() ?? null,
      rows: document.querySelectorAll('trigger-strip .trigger').length,
      // The divider is a row of the list, so it starts where the rows do.
      alignsWithRows: gap
        ? Math.round(gap.getBoundingClientRect().left - list.getBoundingClientRect().left) === 0
        : null,
      scrolls: list.scrollHeight > list.clientHeight + 1,
    };
  });

const collapsed = await stripState();
check('collapsed: no header, no badge, no scroll note',
  !collapsed.hasBar && !collapsed.hasBadge && !collapsed.hasNote, JSON.stringify(collapsed));
check('collapsed: the divider names what it hides',
  collapsed.label.includes('Show') && collapsed.label.includes('remaining') &&
    Number(collapsed.count) === 17,
  collapsed.label);
check('collapsed: no "+N more" phrasing', !/\+\d+ more/.test(collapsed.text));
// 17 hidden + the 2 anchors = 19. The figure appears once, in the divider.
check('collapsed: the number appears exactly once',
  (collapsed.text.match(/17/g) || []).length === 1, collapsed.text);
check('collapsed: the divider starts where the rows do', collapsed.alignsWithRows);

await page.locator('trigger-strip .strip__gap').click();
await page.waitForTimeout(400);
const expanded = await stripState();
check('expanded: still no header', !expanded.hasBar && !expanded.hasBadge);
check('expanded: the divider offers to hide the same number',
  expanded.label.includes('Hide') && expanded.count === collapsed.count, expanded.label);
check('expanded: the middle really unfolded', expanded.rows > collapsed.rows,
  `${collapsed.rows} -> ${expanded.rows}`);
check('expanded: list really does scroll internally', expanded.scrolls);

console.log('\nTrigger rows are read-only content, not controls');
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=10`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
const rowSemantics = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('trigger-strip .trigger')];
  const cells = [...document.querySelectorAll('trigger-strip .cell')];
  return {
    tags: [...new Set(rows.map((r) => r.tagName))],
    roles: [...new Set(rows.map((r) => r.getAttribute('role')))],
    hasControls: rows.some((r) => r.querySelector('button, a, [role=button], [role=link]')),
    hasTabbable: rows.some((r) => r.querySelector('[tabindex]:not([tabindex="-1"])')),
    cursors: [...new Set(cells.map((c) => getComputedStyle(c).cursor))],
    selects: [...new Set(cells.map((c) => getComputedStyle(c).userSelect))],
  };
});
check('rows carry no button or link semantics',
  !rowSemantics.hasControls && rowSemantics.roles.every((r) => r === 'listitem'),
  JSON.stringify(rowSemantics.roles));
check('rows are not in the tab order', !rowSemantics.hasTabbable);
check('no pointer cursor on rows', rowSemantics.cursors.every((c) => c === 'default'),
  rowSemantics.cursors.join(','));
check('row text stays selectable', rowSemantics.selects.every((v) => v === 'text'),
  rowSemantics.selects.join(','));
// Hovering a row must not tint it.
const rowCell = page.locator('trigger-strip .cell--name').nth(1);
const bgBefore = await rowCell.evaluate((e) => getComputedStyle(e).backgroundColor);
await rowCell.hover();
await page.waitForTimeout(250);
const bgAfter = await rowCell.evaluate((e) => getComputedStyle(e).backgroundColor);
check('no hover tint on rows', bgBefore === bgAfter, `${bgBefore} -> ${bgAfter}`);
check('the toggle is the only control in the strip',
  (await page.locator('trigger-strip button, trigger-strip a, trigger-strip [role=button]').count()) === 1);

console.log('\nThe toggle is one button with honest expanded state');
const toggleSemantics = async () =>
  page.evaluate(() => {
    const btns = [...document.querySelectorAll('trigger-strip button')];
    const t = btns[0];
    const controls = t.getAttribute('aria-controls');
    return {
      count: btns.length,
      type: t.getAttribute('type'),
      expanded: t.getAttribute('aria-expanded'),
      controls,
      controlsResolves: !!(controls && document.getElementById(controls)),
      label: (t.textContent || '').replace(/\s+/g, ' ').trim(),
      chevronHidden: t.querySelector('mat-icon')?.getAttribute('aria-hidden'),
      // The divider is a list member, so it has to be inside a listitem.
      slotRole: t.parentElement.getAttribute('role'),
    };
  });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
let tg = await toggleSemantics();
check('exactly one button', tg.count === 1);
check('type="button"', tg.type === 'button');
check('collapsed: aria-expanded="false"', tg.expanded === 'false', tg.expanded);
check('collapsed: the label offers to show what is hidden',
  /^\s*add\s*Show \d+ remaining$/.test(tg.label), tg.label);
check('aria-controls resolves to the list region', tg.controlsResolves, tg.controls);
check('the sign is aria-hidden decoration', tg.chevronHidden === 'true');
check('the control is a listitem, as role="list" requires', tg.slotRole === 'listitem',
  String(tg.slotRole));
await page.locator('trigger-strip .strip__gap').click();
await page.waitForTimeout(350);
tg = await toggleSemantics();
check('still exactly one button after toggling', tg.count === 1);
check('expanded: aria-expanded="true"', tg.expanded === 'true', tg.expanded);
check('expanded: the label offers to hide the same number',
  /^\s*remove\s*Hide \d+$/.test(tg.label), tg.label);

/**
 * THE DIVIDER SCROLLS WITH THE ROWS, because it is one of them.
 *
 * This used to assert the opposite about a different element: the header bar
 * was sticky, so the toggle it held could never scroll away from the list it
 * controlled. There is no header now, and the control is a member of the list
 * - pinning it would detach it from the gap it names, which is the whole point
 * of where it sits.
 */
console.log('\nThe divider scrolls with the list, being part of it');
await page.goto(`${BASE}/?state=10`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
const scrolled = await page.evaluate(async () => {
  const list = document.querySelector('trigger-strip .strip__list');
  const gap = list.querySelector('.strip__gap');
  const before = gap.getBoundingClientRect().top;
  list.scrollTop = list.scrollHeight;
  await new Promise((r) => setTimeout(r, 300));
  return {
    scrolled: list.scrollTop > 0,
    moved: Math.round(gap.getBoundingClientRect().top - before),
    position: getComputedStyle(gap).position,
    noBar: !document.querySelector('trigger-strip .strip__bar'),
  };
});
check('the list really scrolled', scrolled.scrolled);
check('there is no header above it', scrolled.noBar);
check('the divider moved with the rows', scrolled.moved < 0, `moved ${scrolled.moved}px`);
check('and is not pinned', scrolled.position === 'static', scrolled.position);

console.log('\nTrigger rows align, highlighted row included');
await page.setViewportSize({ width: 1180, height: 1000 });
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=10`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
/**
 * What "aligned" means depends on which layout the strip is in, and the answer
 * is different for a good reason.
 *
 * GRID - one grid for the whole list, rows are display: contents - so every
 * row's three cells share one set of column edges. That is the claim, and the
 * regression it guards is a row that sizes its own columns.
 *
 * STACKED - each row is its own two-line grid, so a timestamp column sized to
 * its own row's text is CORRECT, not a bug. What must still hold is the left
 * gutter: every row's name and every row's detail start on the same edge, and
 * the detail runs the width of the row. Asserting shared right-hand edges
 * there would be asserting the grid layout in a layout that is not it.
 */
const cols = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('trigger-strip .trigger')];
  const stacked = getComputedStyle(document.querySelector('trigger-strip .strip__list')).display === 'block';
  const L = (e) => Math.round(e.getBoundingClientRect().left);
  return {
    stacked,
    cellCounts: rows.map((r) => r.querySelectorAll('.cell').length),
    edges: rows.map((r) => [...r.querySelectorAll('.cell')].map(L).join(',')),
    nameLefts: rows.map((r) => L(r.querySelector('.cell--name'))),
    detailLefts: rows.map((r) => L(r.querySelector('.cell--detail'))),
    detailSpans: rows.map((r) => {
      const d = r.querySelector('.cell--detail').getBoundingClientRect();
      return Math.round(d.width / r.getBoundingClientRect().width * 100);
    }),
  };
});
check('every row rendered three cells',
  cols.cellCounts.length > 2 && cols.cellCounts.every((n) => n === 3));
if (cols.stacked) {
  check('stacked: every row starts on the same left gutter',
    new Set(cols.nameLefts).size === 1 && new Set(cols.detailLefts).size === 1,
    `${[...new Set(cols.nameLefts)]} / ${[...new Set(cols.detailLefts)]}`);
  check('stacked: the detail runs the width of the row',
    cols.detailSpans.every((pct) => pct > 80), cols.detailSpans.join(','));
} else {
  check('all rows share the same column edges', new Set(cols.edges).size === 1);
}
check('the NEW row is one of them', (await page.locator('trigger-strip .trigger--new').count()) === 1);
check('the NEW row aligns with the rest', await page.evaluate((expect) => {
  const r = document.querySelector('trigger-strip .trigger--new');
  const L = (e) => Math.round(e.getBoundingClientRect().left);
  return expect.stacked
    ? L(r.querySelector('.cell--name')) === expect.nameLeft &&
        L(r.querySelector('.cell--detail')) === expect.detailLeft
    : [...r.querySelectorAll('.cell')].map(L).join(',') === expect.edges;
}, { stacked: cols.stacked, nameLeft: cols.nameLefts[0], detailLeft: cols.detailLefts[0], edges: cols.edges[0] }));
/**
 * The highlight covers the row with no seams in it, however the row is built.
 *
 * Grid rows have no box of their own - display: contents - so the tint has to
 * be painted on each of the three cells, and the check is that all three carry
 * it and butt up against each other. A stacked row IS a box, so the tint goes
 * on the row and the cells stay transparent; there are no seams to look for,
 * and requiring tinted cells there would fail on the layout that cannot have
 * the bug.
 */
check('the highlight paints the full row width, no gaps', await page.evaluate(() => {
  const row = document.querySelector('trigger-strip .trigger--new');
  const opaque = (e) => getComputedStyle(e).backgroundColor !== 'rgba(0, 0, 0, 0)';
  if (getComputedStyle(document.querySelector('trigger-strip .strip__list')).display === 'block') {
    return opaque(row) && Math.round(row.getBoundingClientRect().width) ===
      Math.round(row.parentElement.getBoundingClientRect().width);
  }
  const cells = [...row.querySelectorAll('.cell')];
  if (cells.length !== 3) return false;
  const boxes = cells.map((c) => c.getBoundingClientRect());
  return cells.every(opaque) &&
    boxes.every((b, i) => i === 0 || Math.abs(b.left - (boxes[i - 1].left + boxes[i - 1].width)) < 1);
}));

console.log('\nThe NEW badge sits with the name, not the timestamp');
const badge = await page.evaluate(() => {
  const row = document.querySelector('trigger-strip .trigger--new');
  if (!row) return null;
  const name = row.querySelector('.cell--name');
  const label = row.querySelector('.cell__label');
  const b = row.querySelector('ui-pill[data-tone="warn-solid"]');
  const meta = row.querySelector('.cell--meta');
  const time = row.querySelector('.cell__at');
  const br = b.getBoundingClientRect();
  const lr = label.getBoundingClientRect();
  return {
    inColumn1: name.contains(b),
    inMeta: meta.contains(b),
    gap: Math.round(br.left - lr.right),
    afterName: br.left >= lr.right - 1,
    tag: b.tagName,
    rowFs: parseFloat(getComputedStyle(row.querySelector('.cell')).fontSize),
    badgeFs: parseFloat(getComputedStyle(b).fontSize),
    radius: getComputedStyle(b).borderTopLeftRadius,
    metaOnlyHasTime: [...meta.children].every((c) => c.tagName === 'TIME'),
    timeFlushRight:
      Math.round(meta.getBoundingClientRect().right - time.getBoundingClientRect().right) <= 20,
    centred: Math.abs(br.top + br.height / 2 - (lr.top + lr.height / 2)) < 1.5,
  };
});
check('the highlighted row exists to test', !!badge);
check('badge is in column 1 with the name', badge.inColumn1 && !badge.inMeta);
check('badge follows the name', badge.afterName);
check('6px gap between name and badge', badge.gap === 6, `${badge.gap}px`);
check('badge is the shared pill component', badge.tag === 'UI-PILL');
check('badge is fully rounded like every other pill', badge.radius === '999px', badge.radius);
// Pills are one component now, so the badge shares the 14px pill type rather
// than being a size step below the row text as it was when it was bespoke.
check('badge uses the shared pill type', badge.badgeFs === 14, String(badge.badgeFs));
check('badge is vertically centred on the name', badge.centred);
check('timestamp column holds nothing but the time', badge.metaOnlyHasTime);
check('timestamp stays right-aligned', badge.timeFlushRight);

/**
 * Sorted by TIMESTAMP, not by array order - which is the bug this pins. The
 * fixture is deliberately out of order, so a strip rendering it as given would
 * come out unsorted rather than reversed.
 *
 * Ascending, and no pinned arrival: the strip reads oldest to newest in both
 * modes, and rule 11's arrival earns the last row by being the most recent
 * rather than by being pinned anywhere.
 */
console.log('\nTriggers sort by timestamp, not array order');
check('rendered oldest first, by timestamp', await page.evaluate(() => {
  const times = [...document.querySelectorAll('trigger-strip .cell__at')].map((t) =>
    Date.parse(t.getAttribute('datetime')),
  );
  return times.length > 1 && times.every((t, i) => i === 0 || times[i - 1] <= t);
}));

/**
 * Widget actions hug the top right corner - in both layouts, in every state.
 *
 * The offset is measured against the TITLE, not against the card: an absolute
 * "13px from the top" would still pass with the identity block a line taller
 * and the buttons floating beside it, which is the bug this pins. The right
 * gutter is compared between widths rather than to a literal, so the corner is
 * the same corner everywhere.
 */
console.log('\nWidget actions hold the top right corner');
const shots = [];
for (const [mode, vw] of [['side', 1800], ['side', 1440], ['side', 1200], ['side', 1024], ['stack', 390]]) {
  await page.setViewportSize({ width: vw, height: mode === 'stack' ? 900 : 1000 });
  for (const st of ['01', '00a', '00b', '07']) {
    await page.goto(`${BASE}/?state=${st}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(250);
    // The card only exists with its panel DOWN, and every one of these frames
    // opens the case. Without this the sweep collected nothing and the gutter
    // check compared an empty set - passing or failing on how many distinct
    // values are in [] rather than on where any button sits.
    if (await page.locator('dialog-shell').count()) {
      await page.keyboard.press('Escape');
      await page.waitForTimeout(250);
    }
    const closer = page.locator('aml-case-modal button[aria-label="Close case"]');
    if (await closer.count()) {
      await closer.click();
      await page.waitForSelector('back-office-widgets .w', { timeout: 15000 });
      await page.waitForTimeout(250);
    }
    const cards = await page.evaluate(() => [...document.querySelectorAll('.w')].map((w) => {
      const box = w.getBoundingClientRect();
      const nm = w.querySelector('.w__name');
      const acts = w.querySelector('.w__actions');
      // A card whose panel is up has no actions at all. Skipped rather than
      // read as zeros, which would have quietly widened every claim below.
      if (!acts) return null;
      const a = acts.getBoundingClientRect();
      const c = w.querySelector('.w__content').getBoundingClientRect();
      return {
        // Against the title's own line box, so a taller identity block cannot
        // drag the buttons down without failing here.
        delta: Math.round(a.top - nm.getBoundingClientRect().top),
        rightGap: Math.round(box.right - a.right),
        overlap: Math.max(0, Math.round(c.right - a.left)),
        clipped: Math.max(0, Math.round(a.right - box.right)),
        nameCut: nm.scrollWidth - nm.clientWidth > 1,
      };
    }).filter(Boolean));
    shots.push({ mode, vw, st, cards });
  }
}
const flat = shots.flatMap((s) => s.cards);
const side = shots.filter((s) => s.mode === 'side').flatMap((s) => s.cards);
const stack = shots.filter((s) => s.mode === 'stack').flatMap((s) => s.cards);
const off = (p) => shots.filter((s) => s.cards.some(p)).map((s) => `${s.mode} ${s.vw} ${s.st}`);
check('the sweep actually found cards to measure', flat.length > 0, `${flat.length}`);
check('and both layouts are represented', side.length > 0 && stack.length > 0,
  `${side.length} side / ${stack.length} stack`);

/**
 * THE CORNER CLAIM IS THE SIDE-BY-SIDE LAYOUT'S, not both.
 *
 * These read the whole sweep and asserted one model over it - buttons level
 * with the title, never overlapping the text. That is right where the card is
 * a row, and false by design where it is a column: below 720px .w__inner
 * stacks and the actions become their own full-width row UNDER the content.
 * Measured against the row model that reads as delta=72 and an overlap of
 * 282px, which is not a bug - it is the other layout.
 *
 * It went unnoticed because the sweep was collecting nothing at all: every
 * frame here opens the case panel, which takes its own card off the row, so
 * `flat` was empty and every() was vacuously true.
 */
check('side by side: button top sits on the title row',
  side.every((c) => Math.abs(c.delta) <= 2), off((c) => Math.abs(c.delta) > 2).join(', '));
check('side by side: text never runs into the actions',
  side.every((c) => c.overlap === 0), off((c) => c.overlap > 0).join(', '));
// Stacked, the actions are BELOW the content, so there is nothing to run into
// and the claim becomes "they really did drop to their own row".
check('stacked: the actions sit below the content, not beside it',
  stack.every((c) => c.delta > 20), stack.map((c) => c.delta).join('/'));

check('actions never clip the card edge', flat.every((c) => c.clipped === 0),
  off((c) => c.clipped > 0).join(', '));
check('the name is not shortened to make room', flat.every((c) => !c.nameCut),
  off((c) => c.nameCut).join(', '));
// One gutter WITHIN a layout. The card's own padding is 12px side by side and
// 16px stacked, so comparing across the two would be asserting that a padding
// change never happened.
const sideGaps = [...new Set(side.map((c) => c.rightGap))];
const stackGaps = [...new Set(stack.map((c) => c.rightGap))];
check('side by side: the same right gutter at every width and state',
  sideGaps.length === 1, sideGaps.join('/'));
check('stacked: the same right gutter in every state', stackGaps.length === 1,
  stackGaps.join('/'));
await page.setViewportSize({ width: 1440, height: 1000 });

/**
 * One pill component, two sizes. The md side of this is a "do not change"
 * check: the panel header pill must still measure exactly what it did before
 * the size prop existed.
 */
console.log('\nSeverity pill: one component, sizes sm and md');
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const sevPills = await page.evaluate(() => {
  const read = (e) => {
    const c = getComputedStyle(e);
    return {
      tag: e.tagName, h: Math.round(e.getBoundingClientRect().height),
      padL: c.paddingLeft, fs: c.fontSize, lh: c.lineHeight,
      radius: c.borderRadius, bg: c.backgroundColor, fg: c.color,
    };
  };
  const sm = document.querySelector('.w__titles ui-pill');
  const md = document.querySelector('case-header ui-pill[data-sev]');
  return {
    sm: read(sm), md: read(md),
    dots: document.querySelectorAll('.w__dot, .w__sev').length,
    // Same component, so a severity swap must move both identically.
    sameSeverity: sm.getAttribute('data-sev') === md.getAttribute('data-sev'),
  };
});
check('the widget badge IS the shared pill', sevPills.sm.tag === 'UI-PILL', sevPills.sm.tag);
check('no dot, and no local copy of the badge left', sevPills.dots === 0, String(sevPills.dots));
check('sm is 20px tall', sevPills.sm.h === 20, `${sevPills.sm.h}px`);
check('sm is 6px padding, 12px/16px type',
  sevPills.sm.padL === '6px' && sevPills.sm.fs === '12px' && sevPills.sm.lh === '16px',
  `${sevPills.sm.padL} ${sevPills.sm.fs}/${sevPills.sm.lh}`);
check('md in the panel header is untouched: 24px, 8px, 14px/20px',
  sevPills.md.h === 24 && sevPills.md.padL === '8px' && sevPills.md.fs === '14px' && sevPills.md.lh === '20px',
  `${sevPills.md.h}px ${sevPills.md.padL} ${sevPills.md.fs}/${sevPills.md.lh}`);
// Colour and shape come from the component, so they cannot vary by size.
check('size carries no colour', sevPills.sm.bg === sevPills.md.bg && sevPills.sm.fg === sevPills.md.fg,
  `${sevPills.sm.bg} vs ${sevPills.md.bg}`);
check('size carries no shape', sevPills.sm.radius === sevPills.md.radius);
check('both render the same severity', sevPills.sameSeverity);

/**
 * Widget type tile: the glyph takes the foreground token that belongs to its
 * background, so the tile reads as one pair rather than a dark glyph on a tint.
 * Compared to the TOKENS, not to hex literals - a literal here would be a third
 * copy of the severity palette.
 */
console.log('\nWidget type icon takes its severity foreground');
const tiles = await page.evaluate(() => {
  const t = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const norm = (c) => {
    const m = c.match(/\d+/g);
    return '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('').toUpperCase();
  };
  const out = {};
  const sg = document.querySelector('.w__type--sg');
  out.SG = {
    got: norm(getComputedStyle(sg.querySelector('mat-icon')).color),
    want: t('--color-foreground-on-info').toUpperCase(),
  };
  const tile = document.querySelector('.w__type[data-sev]');
  for (const [sev, token] of [['AML', '--sev-aml'], ['EDD', '--sev-edd'], ['COMPLIANCE', '--sev-compliance']]) {
    tile.setAttribute('data-sev', sev);
    out[sev] = {
      got: norm(getComputedStyle(tile.querySelector('mat-icon')).color),
      want: t(token).toUpperCase(),
    };
  }
  tile.setAttribute('data-sev', 'AML');
  return out;
});
for (const [sev, { got, want }] of Object.entries(tiles)) {
  check(`${sev} glyph is its foreground token`, got === want, `${got} vs ${want}`);
}

/**
 * Force unlock hover. Measured RENDERED, after a real hover, because Material
 * paints hover as a translucent state layer over the background - so the
 * declared background and the colour the eye gets are not the same claim.
 */
console.log('\nForce unlock hovers to the flat danger tint');
await page.goto(`${BASE}/?state=00b`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
if (await page.locator('confirm-unlock-dialog').count()) {
  await page.locator('confirm-unlock-dialog button:has-text("Cancel")').click();
  await page.waitForTimeout(350);
}
const forceBtn = page.locator('case-header .head__lockline .danger-button');
check('the button is Force unlock', (await forceBtn.innerText()).trim() === 'Force unlock');
await forceBtn.hover();
await page.waitForTimeout(300);
const unlockHover = await page.evaluate(() => {
  const e = document.querySelector('case-header .head__lockline .danger-button');
  const cs = getComputedStyle(e);
  const layer = e.querySelector('.mat-mdc-button-persistent-ripple');
  const lcs = layer ? getComputedStyle(layer, '::before') : null;
  const lum = (c) => {
    const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map((n) => {
      const v = +n / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const bg = cs.backgroundColor;
  const fg = cs.color;
  const L = [lum(bg), lum(fg)].sort((a, b) => b - a);
  return {
    bg, fg,
    token: getComputedStyle(document.documentElement).getPropertyValue('--danger-bg-strong').trim(),
    layerOpacity: lcs ? lcs.opacity : 'n/a',
    contrast: +(((L[0] + 0.05) / (L[1] + 0.05)).toFixed(2)),
  };
});
// Compared to the token, so the check moves with it rather than pinning a hex.
const wantHover = (() => {
  const h = unlockHover.token.replace('#', '');
  return `rgb(${parseInt(h.slice(0, 2), 16)}, ${parseInt(h.slice(2, 4), 16)}, ${parseInt(h.slice(4, 6), 16)})`;
})();
check('hover background is --danger-bg-strong', unlockHover.bg === wantHover,
  `${unlockHover.bg} vs ${wantHover}`);
check('the state layer adds nothing on top of it', unlockHover.layerOpacity === '0',
  unlockHover.layerOpacity);
check('label still clears AA on the tint', unlockHover.contrast >= 4.5, `${unlockHover.contrast}:1`);

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0 ? '\nAll layout checks pass.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
