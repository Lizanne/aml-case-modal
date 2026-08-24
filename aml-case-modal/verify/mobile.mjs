import { chromium } from 'playwright';

/**
 * Mobile viewport suite: 375px and 390px.
 *
 * The prototype was built desktop-first and every width rule assumed room it
 * does not have on a phone. What this suite owns is the width chain: the page
 * never scrolls sideways, the modal sits inside one 16px gutter, nothing
 * declares a fixed width wider than the box it lives in, and the dialogs stop
 * being floating boxes inside a clipped modal and become viewport-anchored
 * sheets.
 *
 * The last section asserts the desktop layout is untouched, because every rule
 * here is gated on a max-width query and a leak would not otherwise show up.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const MOBILE = [375, 390];
const GUTTER = 16;
const browser = await chromium.launch();

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${ok || !detail ? '' : `  (${detail})`}`);
  if (!ok) failed++;
};

const errors = [];
const openPage = async (width, height = 812) => {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return page;
};

/**
 * Elements that legitimately "overflow" and must not be reported.
 *
 * The visually-hidden pattern and CDK's live-region containers are 1px clipped
 * boxes holding real text - their scrollWidth is meant to exceed their width.
 * Material's radio touch target is an absolutely positioned 48px hit area, and
 * a fixed-position element is sized by the viewport rather than its DOM parent,
 * so both are measured against the wrong box by definition.
 */
const IGNORE = `
  window.ignored = (el) => {
    const cs = getComputedStyle(el);
    if (cs.position === 'fixed' || cs.position === 'absolute') return true;
    if (el.closest('.cdk-visually-hidden, .cdk-describedby-message-container, .visually-hidden')) return true;
    if (el.classList.contains('visually-hidden') || el.classList.contains('cdk-visually-hidden')) return true;
    if (el.classList.contains('mat-mdc-radio-touch-target')) return true;
    // Deliberate single-line truncation: the ellipsis IS the design.
    if (cs.textOverflow === 'ellipsis' && cs.overflow !== 'visible') return true;
    // A child of a clipping ancestor does not render past the viewport even
    // when its own box does - the ancestor cuts it off. Without this the
    // "(ENABLED)" inside an ellipsised player title reads as an overflow when
    // what is on screen is an ellipsis.
    for (let a = el.parentElement; a; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.overflowX !== 'visible' && a.getBoundingClientRect().right <= window.innerWidth + 0.5) {
        return true;
      }
    }
    return false;
  };
  window.label = (el) => el.tagName.toLowerCase() +
    (typeof el.className === 'string' && el.className.trim()
      ? '.' + el.className.trim().split(/\\s+/)[0] : '');
`;

const STATES = ['01', '03', '05', '06', '00b', '07', '10'];

for (const width of MOBILE) {
  console.log(`\n=== ${width}px ===`);
  const page = await openPage(width);

  console.log('\nThe page never scrolls sideways, and nothing sits outside it');
  for (const state of STATES) {
    await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('aml-case-modal .modal', { timeout: 15000 });
    await page.waitForTimeout(500);
    const r = await page.evaluate(
      ({ vw, ignoreSrc }) => {
        eval(ignoreSrc);
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          if (window.ignored(el)) continue;
          const b = el.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.right > vw + 0.5 || b.left < -0.5) {
            out.push(`${window.label(el)} [${Math.round(b.left)}..${Math.round(b.right)}]`);
          }
        }
        const d = document.documentElement;
        return { scroll: d.scrollWidth - d.clientWidth, out: [...new Set(out)].slice(0, 6) };
      },
      { vw: width, ignoreSrc: IGNORE },
    );
    check(`${state}: no horizontal document scroll`, r.scroll === 0, `${r.scroll}px`);
    check(`${state}: nothing renders past the viewport`, r.out.length === 0, r.out.join('; '));
  }

  console.log('\nNo fixed pixel width is wider than the box it lives in');
  for (const state of STATES) {
    await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('aml-case-modal .modal', { timeout: 15000 });
    await page.waitForTimeout(450);
    const wide = await page.evaluate(
      ({ ignoreSrc }) => {
        eval(ignoreSrc);
        const out = [];
        for (const el of document.querySelectorAll('body *')) {
          if (window.ignored(el) || !el.parentElement) continue;
          const parentW = el.parentElement.getBoundingClientRect().width;
          if (parentW === 0) continue;
          const cs = getComputedStyle(el);
          for (const prop of ['width', 'minWidth']) {
            const v = cs[prop];
            if (/^\d+(\.\d+)?px$/.test(v) && parseFloat(v) > parentW + 0.5 && parseFloat(v) > 40) {
              out.push(`${window.label(el)} ${prop}=${v} > ${Math.round(parentW)}`);
            }
          }
        }
        return [...new Set(out)].slice(0, 6);
      },
      { ignoreSrc: IGNORE },
    );
    check(`${state}: no descendant declares a width past its container`, wide.length === 0,
      wide.join('; '));
  }

  console.log('\nThe modal is full width inside one 16px gutter, and reflows');
  for (const state of ['01', '07', '10']) {
    await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('aml-case-modal .modal', { timeout: 15000 });
    await page.waitForTimeout(450);
    const m = await page.evaluate((vw) => {
      const el = document.querySelector('aml-case-modal .modal');
      const b = el.getBoundingClientRect();
      return {
        left: Math.round(b.left),
        right: Math.round(vw - b.right),
        width: Math.round(b.width),
        segmented: document.querySelectorAll('mat-button-toggle-group').length === 1,
        panels: document.querySelectorAll('workflow-panel').length +
          document.querySelectorAll('player-info-panel').length,
      };
    }, width);
    check(`${state}: 16px gutter on both sides`, m.left === GUTTER && m.right === GUTTER,
      `${m.left} / ${m.right}`);
    check(`${state}: width is viewport minus both gutters`, m.width === width - GUTTER * 2,
      `${m.width} vs ${width - GUTTER * 2}`);
    check(`${state}: reflowed to the segmented layout`, m.segmented && m.panels === 1,
      `segmented=${m.segmented} panels=${m.panels}`);
  }

  console.log('\nStrip, chips, cards and footer fill the modal and wrap');
  await page.goto(`${BASE}/?state=10`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('trigger-strip .trigger', { timeout: 15000 });
  await page.waitForTimeout(500);
  const fill = await page.evaluate(() => {
    const modalW = document.querySelector('aml-case-modal .modal').getBoundingClientRect().width;
    const widthOf = (s) => {
      const el = document.querySelector(s);
      return el ? Math.round(el.getBoundingClientRect().width) : null;
    };
    const detail = document.querySelector('trigger-strip .cell--detail');
    const dcs = detail ? getComputedStyle(detail) : null;
    const chips = document.querySelector('required-chips');
    return {
      modalW: Math.round(modalW),
      strip: widthOf('trigger-strip .strip__list'),
      chips: chips ? Math.round(chips.getBoundingClientRect().width) : null,
      chipsWrap: chips ? getComputedStyle(chips.firstElementChild).flexWrap : null,
      // The detail was ellipsised into ~12px of a shared 3-column grid. It
      // must now have its own full-width line and be allowed to wrap.
      detailWraps: dcs ? dcs.whiteSpace === 'normal' : false,
      detailW: detail ? Math.round(detail.getBoundingClientRect().width) : null,
      rowIsGrid: detail ? getComputedStyle(detail.parentElement).display === 'grid' : false,
      // Count grid ROWS, not distinct element tops: the cells are baseline
      // aligned, so the name and the timestamp sit 2px apart inside the same
      // row and a top-based count reports three lines for a two-line row.
      rowLines: detail
        ? getComputedStyle(detail.parentElement).gridTemplateRows.split(' ').length
        : 0,
      metaSharesNameRow: detail
        ? (() => {
            const row = detail.parentElement;
            const name = row.querySelector('.cell--name').getBoundingClientRect();
            const meta = row.querySelector('.cell--meta').getBoundingClientRect();
            return meta.top >= name.top - 1 && meta.bottom <= name.bottom + 1;
          })()
        : false,
    };
  });
  check('trigger list fills the modal', fill.strip !== null && Math.abs(fill.strip - fill.modalW) <= 2,
    `${fill.strip} vs ${fill.modalW}`);
  check('trigger row owns its own grid', fill.rowIsGrid);
  check('trigger detail wraps instead of ellipsising', fill.detailWraps);
  check('trigger detail gets a real line, not a sliver', fill.detailW > fill.modalW * 0.7,
    `${fill.detailW} of ${fill.modalW}`);
  // Two lines, not three: the timestamp shares row 1 with the name. Auto
  // placement put it on a row of its own until the cells were placed by hand.
  check('the row is two grid rows', fill.rowLines === 2, `${fill.rowLines}`);
  check('the timestamp shares the first row with the name', fill.metaSharesNameRow);
  check('chip bar fills and wraps', fill.chipsWrap === 'wrap');

  await page.goto(`${BASE}/?state=07`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('outcome-card .card', { timeout: 15000 });
  await page.waitForTimeout(450);
  const cards = await page.evaluate(() => {
    const stream = document.querySelector('workflow-panel .stream');
    const cs = getComputedStyle(stream);
    const inner = stream.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const widths = [...document.querySelectorAll('outcome-card .card')]
      .map((c) => Math.round(c.getBoundingClientRect().width));
    return { inner: Math.round(inner), widths, scrolls: stream.scrollWidth > stream.clientWidth + 1 };
  });
  check('outcome cards fill the stream', cards.widths.length > 0 &&
    cards.widths.every((w) => Math.abs(w - cards.inner) <= 2),
    `${cards.widths.join(',')} vs ${cards.inner}`);
  check('the stream still does not scroll sideways', !cards.scrolls);

  await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('workflow-panel .footer', { timeout: 15000 });
  await page.waitForTimeout(450);
  const footer = await page.evaluate(() => {
    const f = document.querySelector('workflow-panel .footer');
    const cs = getComputedStyle(f);
    const btns = [...f.querySelectorAll('button')].map((b) => b.getBoundingClientRect());
    return {
      wraps: cs.flexWrap === 'wrap',
      fits: f.scrollWidth <= f.clientWidth + 1,
      inside: btns.every((b) => b.right <= f.getBoundingClientRect().right + 0.5),
    };
  });
  check('workflow footer wraps rather than overflowing', footer.wraps);
  check('workflow footer fits its own box', footer.fits);
  check('both footer buttons stay inside it', footer.inside);

  console.log('\nWidgets and the dev panel share the gutter');
  // With no panel open: state 01 opens one, and the row does not render while
  // a panel is up, so there would be no widget here to measure a gutter on.
  await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForSelector('back-office-widgets .w', { timeout: 15000 });
  await page.waitForTimeout(450);
  const chrome = await page.evaluate((vw) => {
    const box = (s) => {
      const el = document.querySelector(s);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { l: Math.round(b.left), r: Math.round(vw - b.right), w: Math.round(b.width) };
    };
    return {
      widgets: [...document.querySelectorAll('back-office-widgets .w')].map((el) => {
        const b = el.getBoundingClientRect();
        return { l: Math.round(b.left), r: Math.round(vw - b.right) };
      }),
      dev: box('dev-state-switcher .dev'),
      select: box('dev-state-switcher .dev__select'),
    };
  }, width);
  check('every widget card sits in the 16px gutter, full width',
    chrome.widgets.length > 0 && chrome.widgets.every((w) => w.l === GUTTER && w.r === GUTTER),
    JSON.stringify(chrome.widgets));
  check('dev panel sits in the same gutter',
    chrome.dev?.l === GUTTER && chrome.dev?.r === GUTTER, JSON.stringify(chrome.dev));
  check('dev select fits inside the dev panel',
    chrome.select !== null && chrome.select.w <= chrome.dev.w, `${chrome.select?.w} of ${chrome.dev?.w}`);

  console.log('\nThe stacked footer: full width, Submit first');
await page.goto(`${BASE}/?state=03`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('workflow-panel .footer', { state: 'attached', timeout: 15000 });
await page.waitForTimeout(700);
const foot = await page.evaluate(() => {
  const f = document.querySelector('workflow-panel .footer');
  const s = document.querySelector('workflow-panel .stream');
  const cs = getComputedStyle(f);
  const btns = [...f.querySelectorAll('button')];
  s.scrollTop = s.scrollHeight;
  const last = s.lastElementChild.getBoundingClientRect();
  return {
    direction: cs.flexDirection,
    padding: cs.padding,
    gap: cs.rowGap,
    // Submit is last in DOM and must render FIRST.
    submitFirst: btns.length === 2 &&
      /Submit/.test(btns[1].textContent) &&
      btns[1].getBoundingClientRect().top < btns[0].getBoundingClientRect().top,
    fullWidth: btns.every(
      (b) => Math.round(b.getBoundingClientRect().width) === Math.round(f.clientWidth - 32),
    ),
    streamPad: getComputedStyle(s).padding,
    scrollPad: getComputedStyle(s).scrollPaddingBottom,
    lastClipped: last.bottom > s.getBoundingClientRect().bottom + 1,
  };
});
check('footer stacks', foot.direction === 'column-reverse', foot.direction);
check('Submit renders first', foot.submitFirst);
check('both buttons full width', foot.fullWidth);
check('16px gutters, 8px gap', foot.padding === '16px' && foot.gap === '8px',
  `${foot.padding} / ${foot.gap}`);
check('stream is 20px all round', foot.streamPad === '20px', foot.streamPad);
// Derived from the footer's measured height, not a guess.
check('scroll padding clears the footer', /^[1-9]\d*px$/.test(foot.scrollPad), foot.scrollPad);
check('the last stream item is not clipped', !foot.lastClipped);

console.log('\nDialogs are viewport-anchored bottom sheets');
  for (const state of ['05', '06', '00b']) {
    await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('dialog-shell .panel', { timeout: 15000 });
    await page.waitForTimeout(500);
    const d = await page.evaluate((vw) => {
      const panel = document.querySelector('dialog-shell .panel');
      const body = document.querySelector('dialog-shell .panel__body');
      const cs = getComputedStyle(panel);
      const b = panel.getBoundingClientRect();
      const pad = (s) => getComputedStyle(document.querySelector(s));
      const btns = [...document.querySelectorAll('dialog-shell .panel__foot button')];
      const rects = btns.map((x) => x.getBoundingClientRect());
      const footW = document.querySelector('dialog-shell .panel__foot').clientWidth;
      const footCs = getComputedStyle(document.querySelector('dialog-shell .panel__foot'));
      return {
        left: Math.round(b.left),
        right: Math.round(vw - b.right),
        bottomGap: Math.round(window.innerHeight - b.bottom),
        radius: cs.borderRadius,
        maxH: Math.round(parseFloat(cs.maxHeight)),
        vh90: Math.round(window.innerHeight * 0.9),
        height: Math.round(b.height),
        bodyOverflow: getComputedStyle(body).overflowY,
        headPad: pad('dialog-shell .panel__head').padding,
        bodyPad: pad('dialog-shell .panel__body').padding,
        footPad: footCs.padding,
        stacked: footCs.flexDirection === 'column-reverse',
        // Primary is last in DOM; stacked, it must render highest.
        primaryOnTop: rects.length === 2 && rects[1].top < rects[0].top,
        fullWidth: rects.every((r) => Math.abs(Math.round(r.width) -
          (footW - parseFloat(footCs.paddingLeft) - parseFloat(footCs.paddingRight))) <= 1),
      };
    }, width);
    check(`${state}: 16px gutter each side`, d.left === GUTTER && d.right === GUTTER,
      `${d.left} / ${d.right}`);
    check(`${state}: anchored to the bottom edge`, d.bottomGap === 0, `${d.bottomGap}px`);
    check(`${state}: top corners rounded only`, /^14px 14px 0px 0px$/.test(d.radius), d.radius);
    check(`${state}: max-height is 90vh`, Math.abs(d.maxH - d.vh90) <= 1, `${d.maxH} vs ${d.vh90}`);
    check(`${state}: body scrolls internally`, d.bodyOverflow === 'auto', d.bodyOverflow);
    check(`${state}: 16px internal padding`,
      d.headPad === '16px' && d.footPad === '16px' && /16px/.test(d.bodyPad),
      `${d.headPad} / ${d.bodyPad} / ${d.footPad}`);
    check(`${state}: actions stack full width, primary on top`,
      d.stacked && d.primaryOnTop && d.fullWidth,
      `stacked=${d.stacked} primaryTop=${d.primaryOnTop} full=${d.fullWidth}`);
  }

  await page.close();
}

console.log('\nA short viewport scrolls inside the sheet, not the page');
{
  // 400px tall, not 520: at 520 the 90vh cap (468px) is still taller than the
  // dialog's natural height, so nothing scrolls and the check passes without
  // ever exercising the cap.
  const page = await openPage(375, 400);
  await page.goto(`${BASE}/?state=06`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('dialog-shell .panel', { timeout: 15000 });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const panel = document.querySelector('dialog-shell .panel');
    const body = document.querySelector('dialog-shell .panel__body');
    const b = panel.getBoundingClientRect();
    return {
      height: Math.round(b.height),
      cap: Math.round(window.innerHeight * 0.9),
      top: Math.round(b.top),
      bodyScrolls: body.scrollHeight > body.clientHeight + 1,
      pageScrollsY: document.documentElement.scrollHeight > window.innerHeight,
      footVisible: document.querySelector('dialog-shell .panel__foot')
        .getBoundingClientRect().bottom <= window.innerHeight + 0.5,
    };
  });
  check('the sheet is capped at 90vh', r.height <= r.cap, `${r.height} vs ${r.cap}`);
  check('it never starts above the viewport', r.top >= 0, `${r.top}`);
  check('the body is what scrolls', r.bodyScrolls);
  check('the actions stay on screen', r.footVisible);
  await page.close();
}

console.log('\nDesktop is untouched');
{
  const page = await openPage(1440, 1000);
  await page.goto(`${BASE}/?state=05`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('dialog-shell .panel', { timeout: 15000 });
  await page.waitForTimeout(500);
  const d = await page.evaluate(() => {
    const host = document.querySelector('dialog-shell');
    const panel = document.querySelector('dialog-shell .panel');
    const modal = document.querySelector('aml-case-modal .modal');
    const cs = getComputedStyle(panel);
    const p = panel.getBoundingClientRect();
    const m = modal.getBoundingClientRect();
    const footCs = getComputedStyle(document.querySelector('dialog-shell .panel__foot'));
    return {
      hostPosition: getComputedStyle(host).position,
      radius: cs.borderRadius,
      width: Math.round(p.width),
      // Centred in the viewport, not stuck to an edge.
      centredInViewport: Math.abs(p.left - (window.innerWidth - p.right)) <= 2,
      leftGap: Math.round(p.left),
      rightGap: Math.round(window.innerWidth - p.right),
      footDir: footCs.flexDirection,
      headPad: getComputedStyle(document.querySelector('dialog-shell .panel__head')).padding,
    };
  });
  // Fixed at EVERY width now: a dialog scoped to the modal left the widgets,
  // the player bar and the nav outside its scrim and still clickable, which is
  // not what aria-modal claims. What changes on mobile is the shape, not the
  // anchor - box on desktop, sheet on a phone.
  check('dialog is anchored to the viewport', d.hostPosition === 'fixed', d.hostPosition);
  check('still a floating box, centred in the viewport', d.centredInViewport,
    `${d.leftGap} / ${d.rightGap}`);
  check('still rounded on all four corners', d.radius === '14px', d.radius);
  check('still 520px wide', d.width === 520, `${d.width}`);
  check('actions still sit in a row', d.footDir === 'row', d.footDir);
  // 16px 20px, not the old 18px 18px 12px 20px: the dialog head now shares the
  // 16/20 rhythm the panel footers and segments were moved to, so the check is
  // that desktop still matches the SHEET's own head rather than a stale literal.
  check('head padding is the shared 16px 20px', d.headPad === '16px 20px', d.headPad);

  await page.goto(`${BASE}/?state=10`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('trigger-strip .trigger', { timeout: 15000 });
  await page.waitForTimeout(450);
  const strip = await page.evaluate(() => {
    const list = document.querySelector('trigger-strip .strip__list');
    const row = document.querySelector('trigger-strip .trigger');
    return {
      cols: getComputedStyle(list).gridTemplateColumns.split(' ').length,
      rowDisplay: getComputedStyle(row).display,
      detailWrap: getComputedStyle(document.querySelector('trigger-strip .cell--detail')).whiteSpace,
    };
  });
  check('trigger strip is still one three-column grid', strip.cols === 3, `${strip.cols}`);
  check('rows are still display: contents', strip.rowDisplay === 'contents', strip.rowDisplay);
  check('the detail still ellipsises on one line', strip.detailWrap === 'nowrap', strip.detailWrap);
  await page.close();
}

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0
  ? '\nAll mobile checks pass.'
  : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
