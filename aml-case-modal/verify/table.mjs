/**
 * The Global AML Cases table - PROTOTYPE-TABLE.md, rendered.
 *
 * verify:cases-store proves the RULES against the store with no browser. This
 * proves the things only a rendered table can be wrong about: which control a
 * lock state offers, whether the popovers open and dismiss, and the geometry
 * that has drifted repeatedly - pill heights, row heights, and text that is
 * truncating when it should not be.
 *
 * Sub-pixel on purpose. "Locked to you" once drew as "Locked to y..." while
 * scrollWidth and clientWidth both rounded to 83 and an integer overflow check
 * called it clean. Ranges measure the real width; integers do not.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:4200';
let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

try {
  await page.goto(`${BASE}/?view=cases&tab=active`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.table ui-pill', { timeout: 15000 });
  await page.waitForTimeout(600);

  console.log('\nGeometry that has drifted before');
  const geom = await page.evaluate(() => ({
    pillHeights: [...new Set([...document.querySelectorAll('.table tbody ui-pill')]
      .map((e) => Math.round(e.getBoundingClientRect().height)))],
    rowHeights: [...new Set([...document.querySelectorAll('.table tbody tr')]
      .map((r) => Math.round(r.getBoundingClientRect().height)))],
    btnHeights: [...new Set([...document.querySelectorAll('.actions button')]
      .map((e) => Math.round(e.getBoundingClientRect().height)))],
    btnLines: [...document.querySelectorAll('.actions button')].map((e) => {
      const label = e.querySelector('.mdc-button__label') ?? e;
      return Math.round(label.getBoundingClientRect().height / 20);
    }),
    axisSpread: Math.max(...[...document.querySelectorAll('.table tbody tr')].map((r) => {
      const mids = [...r.querySelectorAll('td')].map((td) => {
        const k = td.firstElementChild;
        if (!k) return null;
        const b = k.getBoundingClientRect();
        return b.top + b.height / 2;
      }).filter((v) => v !== null);
      return Math.max(...mids) - Math.min(...mids);
    })),
    trailing: [...new Set([...document.querySelectorAll('.actions')].map((a) =>
      Math.round(a.closest('td').getBoundingClientRect().right - a.getBoundingClientRect().right)))],
  }));
  check('every pill in the table is 24px', geom.pillHeights.join() === '24', geom.pillHeights.join());
  check('rows are 52px plus the 1px divider', geom.rowHeights.join() === '53', geom.rowHeights.join());
  // 32, and not a number chosen for the table: these are the modal's own
  // mat-flat/mat-stroked/mat-button components, so the height is whatever the
  // case header's buttons are. A 28 here would mean someone re-sized them.
  check('every action button is the modal\'s 32px', geom.btnHeights.join() === '32',
    geom.btnHeights.join());
  check('no action label wraps - a wrapped button is a taller row, silently',
    geom.btnLines.every((n) => n === 1), geom.btnLines.join(','));
  check('all cells share one vertical axis', geom.axisSpread <= 1.5, String(geom.axisSpread));
  check('the action group is flush right on every row',
    geom.trailing.length === 1, geom.trailing.join());

  console.log('\nNothing truncates that has room (sub-pixel, not rounded)');
  const clipped = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(
      '.lock__text, .player-line .linkish, .chip__label, .actions button')) {
      const r = document.createRange();
      r.selectNodeContents(el);
      const want = r.getBoundingClientRect().width;
      const have = el.getBoundingClientRect().width;
      if (want > have + 0.01) out.push(`${el.textContent.trim().slice(0, 24)} ${want.toFixed(2)}>${have.toFixed(2)}`);
    }
    return out;
  });
  check('no label is cut off', clipped.length === 0, clipped.join('; '));

  console.log('\nRules 4 and 5: the lock state decides the control');
  const counts = () => page.evaluate(() => ({
    notLocked: document.querySelectorAll('.lock--none').length,
    mine: document.querySelectorAll('.lock[data-lock="locked-to-me"]').length,
    other: document.querySelectorAll('.lock[data-lock="locked-to-other"]').length,
    lock: document.querySelectorAll('[aria-label^="Lock case"]').length,
    unlock: document.querySelectorAll('[aria-label^="Unlock case"]').length,
    open: document.querySelectorAll('[aria-label^="Open AML case"]').length,
    force: document.querySelectorAll('[aria-label^="Force unlock"]').length,
    lockCellButtons: document.querySelectorAll('.cell--lock button').length,
    solidFills: [...document.querySelectorAll('.actions button')]
      .filter((b) => getComputedStyle(b).backgroundColor === 'rgb(26, 115, 201)').length,
    iconOnNotLocked: document.querySelectorAll('.lock--none mat-icon').length,
    iconOnLocked: document.querySelectorAll('.lock[data-lock] .lock__icon').length,
  }));
  const c0 = await counts();
  check('a free row offers Lock and nothing else', c0.lock === c0.notLocked, `${c0.lock}/${c0.notLocked}`);
  check('Open case appears once per row locked to me, and nowhere else',
    c0.open === c0.mine && c0.unlock === c0.mine, `${c0.open}/${c0.unlock}/${c0.mine}`);
  check('Force unlock appears only on a row held by someone else',
    c0.force === c0.other, `${c0.force}/${c0.other}`);
  check('the Lock column carries no controls at all', c0.lockCellButtons === 0, String(c0.lockCellButtons));
  check('Open case is the ONLY filled button in the table',
    c0.solidFills === c0.mine, `${c0.solidFills} filled vs ${c0.mine} mine`);
  check('no lock glyph on "Not locked", one on each locked row',
    c0.iconOnNotLocked === 0 && c0.iconOnLocked === c0.mine + c0.other,
    `${c0.iconOnNotLocked} / ${c0.iconOnLocked}`);

  await page.locator('[aria-label^="Lock case"]').first().click();
  await page.waitForTimeout(400);
  const c1 = await counts();
  check('locking a row grows Open case onto it',
    c1.mine === c0.mine + 1 && c1.open === c0.open + 1, `${c1.mine}/${c1.open}`);
  await page.locator('[aria-label^="Unlock case"]').first().click();
  await page.waitForTimeout(400);
  const c2 = await counts();
  check('unlocking puts it back', c2.mine === c0.mine && c2.open === c0.open, `${c2.mine}/${c2.open}`);

  console.log('\nForce unlock goes through the modal confirm, not straight through');
  await page.locator('[aria-label^="Force unlock"]').first().click();
  await page.waitForTimeout(450);
  const dialog = await page.evaluate(() => {
    const d = document.querySelector('confirm-unlock-dialog');
    if (!d) return null;
    return {
      lead: d.querySelector('.lead')?.textContent.replace(/\s+/g, ' ').trim(),
      buttons: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()),
      focused: document.activeElement?.textContent?.trim(),
    };
  });
  check('the confirm opens', dialog !== null);
  check('it names the owner and when they took it',
    /has held the lock since/.test(dialog?.lead ?? ''), dialog?.lead);
  check('focus lands on Cancel, not the destructive confirm',
    dialog?.focused === 'Cancel', dialog?.focused);
  const otherBefore = (await counts()).other;
  await page.locator('confirm-unlock-dialog button', { hasText: 'Unlock case' }).click();
  await page.waitForTimeout(450);
  const c3 = await counts();
  check('confirming releases the lock', c3.other === otherBefore - 1, `${c3.other}`);
  check('and does NOT hand it to me - taking it is a separate act',
    c3.mine === c2.mine, `${c3.mine} vs ${c2.mine}`);

  console.log('\nT-05 and T-06: the two popovers');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const openPanel = () => page.evaluate(() => !!document.querySelector('.mat-mdc-menu-panel'));

  // The score is a VALUE; the icon beside it is the affordance.
  const scoreEl = await page.evaluate(() => {
    const el = document.querySelector('.prio');
    const cs = getComputedStyle(el);
    return { tag: el.tagName, cursor: cs.cursor, underline: cs.textDecorationLine,
      focusable: el.matches('a,button,[tabindex]') };
  });
  check('the priority score itself is inert',
    scoreEl.tag === 'SPAN' && scoreEl.cursor === 'auto' && scoreEl.underline === 'none' &&
    !scoreEl.focusable, JSON.stringify(scoreEl));
  await page.locator('.prio').first().click();
  await page.waitForTimeout(400);
  check('clicking the score opens nothing', !(await openPanel()));

  /**
   * The row icon IS the column header's icon: same colour token, same hover,
   * same geometry. Compared to the header rather than to a hex, so the two
   * cannot drift apart without this failing.
   */
  const icons = await page.evaluate(() => {
    const read = (sel) => {
      const e = document.querySelector(sel);
      const cs = getComputedStyle(e);
      return { color: cs.color, opacity: cs.opacity, radius: cs.borderTopLeftRadius,
        transition: cs.transitionProperty, duration: cs.transitionDuration,
        w: Math.round(e.getBoundingClientRect().width),
        h: Math.round(e.getBoundingClientRect().height),
        glyph: Math.round(e.querySelector('svg').getBoundingClientRect().width),
        stroke: e.querySelector('svg').getAttribute('stroke-width') };
    };
    return { head: read('.th__info'), row: read('.prio__info'),
      label: document.querySelector('.prio__info').getAttribute('aria-label'),
      expanded: document.querySelector('.prio__info').getAttribute('aria-expanded') };
  });
  check('the row icon matches the header icon exactly',
    JSON.stringify(icons.head) === JSON.stringify(icons.row),
    `head ${JSON.stringify(icons.head)} row ${JSON.stringify(icons.row)}`);
  check('16px glyph at 1.5 stroke in a 24px hit area',
    icons.row.glyph === 16 && icons.row.stroke === '1.5' && icons.row.w >= 24,
    JSON.stringify(icons.row));
  check('it names the score it belongs to', /^Score breakdown for \d+$/.test(icons.label ?? ''),
    icons.label);
  check('and reports collapsed when shut', icons.expanded === 'false', icons.expanded);
  check('both brighten to the same colour on hover', await (async () => {
    await page.hover('.th__info');
    await page.waitForTimeout(280);
    const a = await page.evaluate(() => getComputedStyle(document.querySelector('.th__info')).color);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    await page.hover('.prio__info');
    await page.waitForTimeout(280);
    const b = await page.evaluate(() => getComputedStyle(document.querySelector('.prio__info')).color);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(200);
    return a === b;
  })());

  await page.locator('.prio__info').first().click();
  await page.waitForTimeout(450);
  check('the info icon opens the breakdown', await openPanel());
  check('aria-expanded follows the panel', await page.evaluate(() =>
    document.querySelector('.prio__info').getAttribute('aria-expanded') === 'true'));

  const prio = await page.evaluate(() => {
    const p = document.querySelector('.mat-mdc-menu-panel');
    const cs = (e) => getComputedStyle(e);
    return {
      head: p.querySelector('.pop__head').textContent.replace(/\s+/g, ' ').trim(),
      headScore: Number(p.querySelector('.pop__head').textContent.match(/\d+/)[0]),
      lines: (() => {
        const cells = [...p.querySelectorAll('.pop__lines > span')].map((e) => e.textContent.trim());
        const out = [];
        for (let i = 0; i < cells.length; i += 3) out.push(cells.slice(i, i + 3));
        return out;
      })(),
      grid: (() => {
        const g = getComputedStyle(p.querySelector('.pop__lines'));
        return { display: g.display, cols: g.gridTemplateColumns.split(' ').length,
          colGap: g.columnGap, rowGap: g.rowGap, align: g.alignItems };
      })(),
      panel: (() => {
        const c = getComputedStyle(p);
        return { w: Math.round(p.getBoundingClientRect().width), min: c.minWidth,
          max: c.maxWidth, overflow: c.overflow, clipped: p.scrollWidth > p.clientWidth };
      })(),
      bodyPad: getComputedStyle(p.querySelector('.pop__body')).padding,
      // One grid for every line is what makes the columns line up; a grid per
      // row would align nothing to anything.
      amountEdges: [...new Set([...p.querySelectorAll('.pop__amount')]
        .map((e) => Math.round(e.getBoundingClientRect().left)))].length,
      pointsEdges: [...new Set([...p.querySelectorAll('.pop__points')]
        .map((e) => Math.round(e.getBoundingClientRect().right)))].length,
      pointsStyle: (() => {
        const c = getComputedStyle(p.querySelector('.pop__points'));
        return { align: c.textAlign, weight: c.fontWeight, numeric: c.fontVariantNumeric };
      })(),
      truncated: [...p.querySelectorAll('.pop__label,.pop__amount,.pop__points')].filter((e) => {
        const r = document.createRange();
        r.selectNodeContents(e);
        return r.getBoundingClientRect().width > e.getBoundingClientRect().width + 0.01;
      }).length,
      linkGap: (() => {
        const pts = [...p.querySelectorAll('.pop__points')];
        return Math.round(p.querySelector('.pop__link').getBoundingClientRect().top -
          pts[pts.length - 1].getBoundingClientRect().bottom);
      })(),
      link: p.querySelector('.pop__link')?.getAttribute('href'),
      target: p.querySelector('.pop__link')?.getAttribute('target'),
      rel: p.querySelector('.pop__link')?.getAttribute('rel'),
      labelCase: cs(p.querySelector('.pop__label')).textTransform,
    };
  });
  check('the header reads "Priority <score> <band>"',
    /^Priority \d+ (Low|Medium|High|Urgent)$/.test(prio.head), prio.head);
  check('every line is label, amount and points',
    prio.lines.length > 0 && prio.lines.every((l) => l.length === 3), JSON.stringify(prio.lines[0]));
  check("exactly the matrix's four categories, in its order",
    prio.lines.map((l) => l[0]).join('|') ===
      'Withdrawals pending|AML risk level|SG vulnerabilities|Player complaint',
    prio.lines.map((l) => l[0]).join('|'));
  check('the points column is signed', prio.lines.every((l) => l[2].startsWith('+')));
  // A factor worth nothing is still information: it says the thing was
  // checked and cleared, which "absent" does not.
  check('factors worth zero are shown, not dropped', prio.lines.length === 4, String(prio.lines.length));
  check('the lines add up to the score in the header',
    prio.lines.reduce((n, l) => n + Number(l[2].replace('+', '')), 0) === prio.headScore,
    `${prio.lines.map((l) => l[2]).join('')} vs ${prio.headScore}`);
  check('"How scoring works" opens the doc in a new tab',
    !!prio.link && prio.target === '_blank' && /noopener/.test(prio.rel ?? ''),
    `${prio.link} ${prio.target} ${prio.rel}`);
  // Scoped styles have to REACH the overlay - the panel is moved out of the
  // component's DOM - and must not inherit the main table's header treatment.
  check('the popover does NOT inherit the table header treatment',
    prio.labelCase === 'none', prio.labelCase);
  /**
   * Material's own panel is min 112 / max 280. The breakdown was rendering at
   * 277 - hard against the cap, one character from wrapping and a longer label
   * from clipping outright. The box is styled globally because Material builds
   * the panel outside the component and it carries no scoping attribute.
   */
  check('the panel sizes to content between 320 and 400',
    prio.panel.min === '320px' && prio.panel.max === '400px' &&
    prio.panel.w >= 320 && prio.panel.w <= 400, JSON.stringify(prio.panel));
  check('nothing is hidden and nothing scrolls',
    prio.panel.overflow === 'visible' && !prio.panel.clipped, JSON.stringify(prio.panel));
  check('the lines are one three-column grid, 16 across and 8 down',
    prio.grid.display === 'grid' && prio.grid.cols === 3 &&
    prio.grid.colGap === '16px' && prio.grid.rowGap === '8px' &&
    prio.grid.align === 'baseline', JSON.stringify(prio.grid));
  check('so the amounts and the points line up down the panel',
    prio.amountEdges === 1 && prio.pointsEdges === 1,
    `${prio.amountEdges} amount edges, ${prio.pointsEdges} points edges`);
  check('points are right-aligned, 600 and tabular',
    prio.pointsStyle.align === 'right' && prio.pointsStyle.weight === '600' &&
    prio.pointsStyle.numeric === 'tabular-nums', JSON.stringify(prio.pointsStyle));
  check('16px of padding all round, 16 above the link',
    prio.bodyPad === '16px' && prio.linkGap === 16, `${prio.bodyPad} / ${prio.linkGap}`);
  check('nothing inside truncates', prio.truncated === 0, String(prio.truncated));

  // Escape is the one that broke first: MatMenu binds its handler to the PANEL
  // and only moves focus there when the panel holds menu items. These hold none.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the breakdown', !(await openPanel()));
  check('and focus returns to the trigger', await page.evaluate(() =>
    document.activeElement?.classList.contains('prio__info')));

  /**
   * Closes on scroll, and cdkScrollable on .table-scroll is what makes that
   * work: the app shell sets overflow:hidden on body and html, so the window
   * never scrolls. The table container is the only thing that does, and CDK's
   * ScrollDispatcher only watches containers that announce themselves.
   */
  await page.locator('.prio__info').first().click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('.table-scroll').scrollLeft += 220; });
  await page.waitForTimeout(500);
  check('scrolling the table closes it rather than dragging it along', !(await openPanel()));
  await page.evaluate(() => { document.querySelector('.cdk-overlay-backdrop')?.click(); });
  await page.waitForTimeout(350);

  await page.locator('.prio__info').first().click();
  await page.waitForTimeout(400);
  await page.evaluate(() => { document.querySelector('.cdk-overlay-backdrop')?.click(); });
  await page.waitForTimeout(400);
  check('a click outside closes it', !(await openPanel()));

  /**
   * Never two at once. Reaching for a second trigger while one is open lands
   * on the backdrop, which dismisses the first - so the count goes to 0, not
   * to 2, and the next click opens the row actually aimed at. Asserted as
   * "never more than one" rather than "exactly one", because exactly-one is
   * not what the interaction does and a check that says so would fail on
   * correct behaviour.
   */
  await page.locator('.prio__info').first().click();
  await page.waitForTimeout(350);
  const panelCounts = [await page.evaluate(() => document.querySelectorAll('.mat-mdc-menu-panel').length)];
  await page.locator('.prio__info').nth(2).click({ force: true });
  await page.waitForTimeout(400);
  panelCounts.push(await page.evaluate(() => document.querySelectorAll('.mat-mdc-menu-panel').length));
  await page.locator('.prio__info').nth(2).click();
  await page.waitForTimeout(450);
  panelCounts.push(await page.evaluate(() => document.querySelectorAll('.mat-mdc-menu-panel').length));
  check('never more than one breakdown is open at a time',
    panelCounts.every((n) => n <= 1), panelCounts.join(','));
  check('and the one that ends up open is the row that was aimed at',
    await page.evaluate(() => {
      const t = [...document.querySelectorAll('.prio__info')];
      return t[2].getAttribute('aria-expanded') === 'true' &&
        t.filter((x) => x.getAttribute('aria-expanded') === 'true').length === 1;
    }));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);

  // The header link survives too, and is the other route to the same doc.
  const head = await page.evaluate(() => {
    const a = document.querySelector('.th__info');
    return a ? { href: a.getAttribute('href'), target: a.getAttribute('target') } : null;
  });
  check('the column header still carries the scoring link',
    !!head && /confluence|scoring/.test(head.href ?? '') && head.target === '_blank',
    JSON.stringify(head));

  await page.locator('.chip-more-btn').first().click();
  await page.waitForTimeout(450);
  check('the work popover opens', await openPanel());
  const work = await page.evaluate(() => {
    const p = document.querySelector('.mat-mdc-menu-panel');
    const row = document.querySelector('.table tbody .work-row');
    return {
      inPopover: p.querySelectorAll('.pop__work li').length,
      inFixture: Number(document.querySelector('.chip-more-btn')
        .getAttribute('aria-label').match(/all (\d+)/)[1]),
      visibleChips: row.querySelectorAll('ui-pill').length,
      pillHeights: [...new Set([...p.querySelectorAll('ui-pill')]
        .map((e) => Math.round(e.getBoundingClientRect().height)))],
      todoFirst: (() => {
        const tones = [...p.querySelectorAll('.pop__work ui-pill')]
          .map((e) => e.getAttribute('data-tone'));
        return tones.indexOf('success') === -1 ||
          tones.lastIndexOf('outline') < tones.indexOf('success');
      })(),
    };
  });
  check('it lists ALL the work, not just the hidden remainder',
    work.inPopover === work.inFixture, `${work.inPopover} of ${work.inFixture}`);
  check('to-do still sorts ahead of done', work.todoFirst);
  check('its pills are the same 24px pill as the row', work.pillHeights.join() === '24',
    work.pillHeights.join());
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the work popover', !(await openPanel()));

  await page.evaluate(() => document.querySelector('.chip-more-btn').focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(450);
  check('the popover is reachable from the keyboard alone', await openPanel());

  console.log('\nNo console errors along the way');
  check('the page threw nothing', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n${failed === 0 ? 'All cases table checks pass.' : `${failed} check(s) failed.`}`);
} finally {
  await browser.close();
}
process.exit(failed === 0 ? 0 : 1);
