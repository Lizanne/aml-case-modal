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
check('green survives on the done chip and the lock band', await page.evaluate((g) => {
  const chip = getComputedStyle(document.querySelector('required-chips ui-pill')).color;
  const band = getComputedStyle(document.querySelector('case-header .head__lock-text')).color;
  return chip === g && band === g;
}, SUCCESS));

console.log('\nBanners: 16px, top-aligned, 20px outlined icons');
const BANNERS = [
  ['04', 'player-info-panel .banner'],
  ['10', 'player-info-panel .warn-note'],
  ['10', 'workflow-panel .resync'],
  ['05', 'severity-dialog .warn-note'],
  ['06', 'decision-dialog .met'],
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
check('chip icon is 16px and outlined',
  chip.iw === 16 && chip.ih === 16 && chip.outlined,
  `${chip.iw}x${chip.ih} outlined=${chip.outlined}`);

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
  check(`${state}: 14px 20px padding like every other footer`,
    f.pads.join(' ') === '14px 20px 14px 20px', f.pads.join(' '));
  check(`${state}: submit sits hard right`, f.rightInset === f.padRight,
    `${f.rightInset} vs padding ${f.padRight}`);
  check(`${state}: buttons keep their natural width`, f.used < f.spanned,
    `${f.used} of ${f.spanned}px`);
}

console.log('\nThe header keeps one structure at both widths');
for (const [state, width, expectName] of [['01', 1440, true], ['09', 1500, false]]) {
  await page.setViewportSize({ width, height: 1040 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('case-header .head__sub', { timeout: 15000 });
  await page.waitForTimeout(500);
  const h = await page.evaluate(() => {
    const sub = document.querySelector('case-header .head__sub');
    const titles = document.querySelector('case-header .head__titles');
    const lock = document.querySelector('case-header .head__lock');
    return {
      text: sub.textContent.trim(),
      inTitles: titles.contains(sub),
      // The identity used to fold into the lock band in narrow. That band now
      // carries lock state only, at both widths.
      strayInLock: lock.textContent.includes('Player'),
      lockText: document.querySelector('.head__lock-text').textContent.trim(),
    };
  });
  check(`${state}: identity sits in head__titles`, h.inTitles);
  check(`${state}: nothing player-shaped left in the lock band`, !h.strayInLock, h.lockText);
  check(`${state}: identity reads "${h.text}"`, /^Player 88213$|Player 88213$/.test(h.text));
  check(`${state}: name ${expectName ? 'present' : 'dropped'}`,
    h.text.includes('Howard Williams') === expectName, h.text);
}

console.log('\nEvery form field puts 8px between its label and its control');
await page.setViewportSize({ width: 1440, height: 1040 });
for (const [state, host] of [['02', 'record-form'], ['05', 'severity-dialog'], ['06', 'decision-dialog']]) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`${host} .field`, { timeout: 15000 });
  await page.waitForTimeout(450);
  const fields = await page.$$eval(`${host} .field`, (els) =>
    els.map((e) => {
      const label = e.querySelector('label, .field__label');
      const next = label?.nextElementSibling;
      return {
        text: label ? label.textContent.trim().slice(0, 24) : '(none)',
        cssGap: getComputedStyle(e).rowGap,
        // A <legend> is not a grid item, so the gap cannot reach it. Those
        // fields are measured as null and only the declared gap is asserted.
        measured: label && next && label.tagName !== 'LEGEND'
          ? Math.round(next.getBoundingClientRect().top - label.getBoundingClientRect().bottom)
          : null,
      };
    }),
  );
  check(`${state} ${host}: fields found`, fields.length > 0, `${fields.length}`);
  const off = fields.filter((f) => f.cssGap !== '8px' || (f.measured !== null && f.measured !== 8));
  check(`${state} ${host}: 8px label to control`, off.length === 0,
    off.map((f) => `${f.text} ${f.cssGap}/${f.measured}`).join(', '));
}

console.log('\nSlot and segment padding');
await page.setViewportSize({ width: 1440, height: 1040 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('action-placeholder .slot', { timeout: 15000 });
await page.waitForTimeout(400);
const slotPad = await page.evaluate(() => {
  const c = getComputedStyle(document.querySelector('action-placeholder .slot'));
  return `${c.paddingTop} ${c.paddingRight} ${c.paddingBottom} ${c.paddingLeft}`;
});
check('slot: 16px 12px', slotPad === '16px 12px 16px 12px', slotPad);
await page.setViewportSize({ width: 1500, height: 1040 });
await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.segments', { timeout: 15000 });
await page.waitForTimeout(500);
const seg = await page.evaluate(() => {
  const pad = (s) => {
    const c = getComputedStyle(document.querySelector(s));
    return `${c.paddingTop} ${c.paddingRight} ${c.paddingBottom} ${c.paddingLeft}`;
  };
  return { segments: pad('.segments'), narrowSlot: pad('action-placeholder .slot') };
});
check('09 segments: 12px 16px', seg.segments === '12px 16px 12px 16px', seg.segments);
check('09 slot: the same 16px 12px as wide', seg.narrowSlot === slotPad, seg.narrowSlot);

console.log('\nScroll regions share a 20px gutter; dialog titles share a size');
for (const [state, width] of [['01', 1440], ['04', 1440], ['09', 1500]]) {
  await page.setViewportSize({ width, height: 1040 });
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('workflow-panel, player-info-panel', { timeout: 15000 });
  await page.waitForTimeout(450);
  const g = await page.evaluate(() =>
    ['workflow-panel .stream', 'player-info-panel .info__body']
      .map((s) => {
        const el = document.querySelector(s);
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { s, l: cs.paddingLeft, r: cs.paddingRight };
      })
      .filter(Boolean),
  );
  // 09 shows one panel at a time, so only the selected one is asserted here.
  check(`${state}: at least one scroll region on screen`, g.length > 0);
  for (const r of g) {
    check(`${state} ${r.s.split(' ').pop()}: 20px sides`, r.l === '20px' && r.r === '20px',
      `${r.l} / ${r.r}`);
  }
}
// The Player info side of 09 only exists once the segmented control switches.
await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('mat-button-toggle', { timeout: 15000 });
await page.waitForTimeout(500);
await page.click('mat-button-toggle:has-text("Player info")');
await page.waitForTimeout(400);
const infoNarrow = await page.evaluate(() => {
  const cs = getComputedStyle(document.querySelector('player-info-panel .info__body'));
  return `${cs.paddingLeft} / ${cs.paddingRight}`;
});
check('09 info__body (segmented): 20px sides', infoNarrow === '20px / 20px', infoNarrow);

await page.setViewportSize({ width: 1440, height: 1040 });
for (const state of ['00b', '05', '06']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.panel__title', { timeout: 15000 });
  await page.waitForTimeout(400);
  const t = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector('.panel__title'));
    return `${cs.fontSize} / ${cs.lineHeight}`;
  });
  check(`${state}: dialog title is 18px/28px`, t === '18px / 28px', t);
}

console.log('\nEvery close and minimise control is one size');
// These lived in four components at three different button sizes and two icon
// sizes. Nothing enforces one size but this: the rule is 32px square with a
// 16px glyph, wherever the control appears.
const CHROME_BTNS = '.head__close, .panel__close, .sg__btn, .bar__close';
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
    return { css: getComputedStyle(g).gap, measured: Math.round(b[1].left - b[0].right) };
  });
  if (pair) {
    check(`${label}: 12px between minimise and close`,
      pair.css === '12px' && pair.measured === 12, `${pair.css} / ${pair.measured}px`);
  }
};
for (const state of ['01', '07', '10', '00b', '05', '06']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.head__close', { timeout: 15000 });
  await page.waitForTimeout(400);
  await chromeSizes(state);
}
// 09 carries the SG modal's pair, and minimising both swaps them for bar
// controls - the two places the sizes used to diverge most.
await page.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sg__btn', { timeout: 15000 });
await page.waitForTimeout(500);
await chromeSizes('09 dual');
await page.click('button[aria-label="Minimise alert"]');
await page.waitForTimeout(400);
await page.click('button[aria-label="Minimise case"]');
await page.waitForTimeout(400);
await chromeSizes('09 minimised bars');
// A fixed square cannot stretch to the bar's height, so it has to centre
// itself; a top- or bottom-hugging close button would read as misaligned.
check('bar close is vertically centred', await page.evaluate(() => {
  const bars = [...document.querySelectorAll('minimised-bar .bar')];
  return bars.length > 0 && bars.every((b) => {
    const r = b.getBoundingClientRect();
    const c = b.querySelector('.bar__close').getBoundingClientRect();
    return Math.abs((c.top - r.top) - (r.bottom - c.bottom)) <= 1;
  });
}));

console.log('\nThe lock band holds its height across every lock state');
const bandState = () =>
  page.evaluate(() => {
    const el = document.querySelector('case-header .head__lock');
    const strip = document.querySelector('trigger-strip .strip');
    const btn = el.querySelector('button');
    const text = el.querySelector('.head__lock-text');
    return {
      h: Math.round(el.getBoundingClientRect().height),
      stripTop: Math.round(strip.getBoundingClientRect().top),
      text: text.textContent.trim(),
      textColour: getComputedStyle(text).color,
      iconColour: getComputedStyle(el.querySelector('.head__lock-icon')).color,
      button: btn ? btn.textContent.trim() : null,
      btnColour: btn ? getComputedStyle(btn).color : null,
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
check('band height is identical in every state',
  new Set(bands.map(([, b]) => b.h)).size === 1,
  bands.map(([n, b]) => `${n}:${b.h}`).join(' '));
check('nothing below the band ever moves',
  new Set(bands.map(([, b]) => b.stripTop)).size === 1,
  bands.map(([n, b]) => `${n}:${b.stripTop}`).join(' '));

check('unassigned offers a primary "Lock to me"',
  byName['unassigned'].button === 'Lock to me' && byName['unassigned'].text === 'Unassigned');
// Green is the only "you can act here" signal, so it must appear here and
// NOWHERE else in this band.
check('locked to you is the only green state', await (async () => {
  const green = byName['locked to you'];
  const others = ['unassigned', 'locked to other', 'resolved'].map((k) => byName[k]);
  return (
    green.textColour === SUCCESS &&
    green.iconColour === SUCCESS &&
    others.every((o) => o.textColour !== SUCCESS && o.iconColour !== SUCCESS)
  );
})());
check('locked to you says only the fact',
  /^Locked to you since /.test(byName['locked to you'].text) &&
    !/record outcomes/i.test(byName['locked to you'].text),
  byName['locked to you'].text);
check('locked to you offers Unlock', byName['locked to you'].button === 'Unlock');
// Tokens again, not hexes: what matters is that the neutral row uses --ink-2
// and the destructive button uses --danger, whatever those hold.
const INK_2 = await tokenRgb('--ink-2');
const DANGER = await tokenRgb('--danger');
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

console.log('\nOne trigger control, identical in every state and at both widths');
const controlShape = async () => {
  const c = page.locator('trigger-strip .strip__bar');
  if ((await c.count()) !== 1) return null;
  return page.evaluate(() => {
    const el = document.querySelector('trigger-strip .strip__bar');
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
      hasChip: !!el.querySelector('ui-pill'),
      hasVerb: !!el.querySelector('.strip__verb'),
      hasNote: !!el.querySelector('.strip__count'),
      barIsNotAControl: el.tagName === 'DIV' && !el.closest('button'),
      verbIsButton: el.querySelector('.strip__verb')?.tagName === 'BUTTON',
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
  check(`${state}: same anatomy (badge + control)`, !!s && s.hasChip && s.hasVerb);
  check(`${state}: the bar is a label strip, only the verb is a button`,
    !!s && s.barIsNotAControl && s.verbIsButton);
  if (s) shapes.push({ state, key: `${s.tag}|${s.parts}|${s.height}` });
}
check(
  'the control is structurally identical across all of them',
  new Set(shapes.map((s) => s.key)).size === 1,
);
// This guarded against the old split UI: a bottom "+N more" bar and a separate
// narrow-mode summary row. Both are gone. The invariant that still matters is
// that the strip contains exactly ONE control, and that it is the verb.
check('exactly one control in the strip', await page.evaluate(() => {
  const controls = document.querySelectorAll(
    'trigger-strip button, trigger-strip a, trigger-strip [role=button], trigger-strip [role=link]',
  );
  return controls.length === 1 && controls[0].classList.contains('strip__verb');
}));
check('no legacy summary row survives', await page.evaluate(() =>
  !document.querySelector('trigger-strip .summary'),
));

// The control must not move or resize when it toggles - that is what made the
// old pair feel like two different things.
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
const boxBefore = await page.locator('trigger-strip .strip__bar').boundingBox();
await page.locator('trigger-strip .strip__verb').click();
await page.waitForTimeout(300);
const boxAfter = await page.locator('trigger-strip .strip__bar').boundingBox();
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
  await page.locator('trigger-strip .strip__verb').click();
  await page.waitForTimeout(300);
  check(`${width}px: the badge expands the strip`, (await rows()) > collapsedRows);
  check(`${width}px: expanded says Show less`,
    (await page.locator('trigger-strip .strip__verb').innerText()).includes('Show less'));
  await page.locator('trigger-strip .strip__verb').click();
  await page.waitForTimeout(300);
  check(`${width}px: clicking the same row collapses it again`, (await rows()) === 2);
}

console.log('\nThe strip bar states the count once, and nothing redundant');
await page.setViewportSize({ width: 1180, height: 1000 });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);

const bar = async () =>
  page.evaluate(() => {
    const t = document.querySelector('trigger-strip .strip__bar');
    const list = document.querySelector('trigger-strip .strip__list');
    const verb = t.querySelector('.strip__verb');
    return {
      text: t.textContent.replace(/\s+/g, ' ').trim(),
      chip: t.querySelector('.strip__bar ui-pill').textContent.trim(),
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

await page.locator('trigger-strip .strip__verb').click();
await page.waitForTimeout(400);
const expandedBar = await bar();
check('expanded: same badge', expandedBar.chip === '19 triggers');
check('expanded: control reads "Show less"', expandedBar.verb.includes('Show less'));
check('expanded: bar still sits above the rows', expandedBar.aboveRows);
check('expanded: list really does scroll internally', expandedBar.scrolls);
check('expanded: scroll note appears, naming visible vs total',
  expandedBar.note === 'Showing 10 of 19, scroll for more', expandedBar.note);

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
      barSticky: getComputedStyle(document.querySelector('trigger-strip .strip__bar')).position,
    };
  });
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
let tg = await toggleSemantics();
check('exactly one button', tg.count === 1);
check('type="button"', tg.type === 'button');
check('collapsed: aria-expanded="false"', tg.expanded === 'false', tg.expanded);
check('collapsed: label is "Show all"', tg.label.endsWith('Show all'), tg.label);
check('aria-controls resolves to the list region', tg.controlsResolves, tg.controls);
check('chevron is aria-hidden decoration', tg.chevronHidden === 'true');
await page.locator('trigger-strip .strip__verb').click();
await page.waitForTimeout(350);
tg = await toggleSemantics();
check('still exactly one button after toggling', tg.count === 1);
check('expanded: aria-expanded="true"', tg.expanded === 'true', tg.expanded);
check('expanded: label is "Show less"', tg.label.endsWith('Show less'), tg.label);

console.log('\nThe header bar stays put when the list scrolls');
await page.goto(`${BASE}/?state=10`, { waitUntil: 'networkidle' });
await page.waitForTimeout(450);
const stuck = await page.evaluate(async () => {
  const t = document.querySelector('trigger-strip .strip__bar');
  const list = document.querySelector('trigger-strip .strip__list');
  const cs = getComputedStyle(t);
  const before = t.getBoundingClientRect().top;
  list.scrollTop = list.scrollHeight;
  await new Promise((r) => setTimeout(r, 300));
  return { position: cs.position, scrolled: list.scrollTop > 0, moved: Math.round(t.getBoundingClientRect().top - before) };
});
check('the list really scrolled', stuck.scrolled);
check('the toggle did not move', stuck.moved === 0, `moved ${stuck.moved}px`);
check('and is declared sticky', stuck.position === 'sticky', stuck.position);

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
