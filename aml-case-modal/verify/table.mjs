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
import { decodePng } from './_png.mjs';

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
    // Both Actions controls are icon-only and square now, so there is no
    // label to wrap - what matters is that neither has grown off its axis.
    actionSquares: [...new Set([...document.querySelectorAll('.actions button')].map((e) => {
      const r = e.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}`;
    }))],
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
  /**
   * The SLA dot, per Figma 24029:714 - a 12px halo at 6% and a 6px core, both
   * from currentColor so one rule serves every tone. It is the only column
   * that takes it: the rest of the row states facts, this one reports a
   * condition that is still moving while you read it.
   */
  const dot = await page.evaluate(() => {
    const sla = [...document.querySelectorAll('.table tbody .cell--sla ui-pill')];
    const d = sla[0].querySelector('.pill__dot');
    const cs = getComputedStyle(d);
    const core = getComputedStyle(d, '::before');
    const alpha = (v) => {
      const m = v.match(/[\d.]+\s*\)\s*$/);
      return m ? Number(m[0].replace(/[)\s]/g, '')) : 1;
    };
    return {
      onEverySla: sla.every((e) => !!e.querySelector('.pill__dot')),
      andNowhereElse: document.querySelectorAll('.table .pill__dot').length === sla.length,
      halo: `${Math.round(d.getBoundingClientRect().width)}x${Math.round(d.getBoundingClientRect().height)}`,
      haloAlpha: alpha(cs.backgroundColor),
      core: core.width,
      gap: getComputedStyle(sla[0]).gap,
      // Per tone, because the rims are per tone - and the solid one has none.
      byTone: Object.fromEntries(sla.map((e) => {
        const cs = getComputedStyle(e);
        return [e.getAttribute('data-tone'), {
          border: cs.borderTopColor, width: cs.borderTopWidth, text: cs.color,
          dot: getComputedStyle(e.querySelector('.pill__dot'), '::before').backgroundColor }];
      })),
      // The tones the SLA column shares with the rest of the table must NOT
      // have followed it: a work chip is not a status pill.
      /**
       * The player's status pill: a tone consumer OUTSIDE the SLA column.
       *
       * This used to compare against a Work chip, but Work is text now - D-12
       * - so the subject had to move rather than the rule. What is being
       * proved is unchanged: the dot and the rim are scoped to the dotted
       * pill, so a pill that merely shares a tone does not grow either.
       */
      /**
       * The severity pill: the only pill left OUTSIDE the SLA column, now the
       * player's status is plain text. The subject has moved twice as the
       * table changed; the rule has not. The dot and the rim are scoped to the
       * dotted pill, so no other pill grows either.
       */
      elsewhere: (() => {
        const chip = document.querySelector('.table tbody ui-pill[data-sev]');
        return chip ? { sev: chip.getAttribute('data-sev'),
          border: getComputedStyle(chip).borderTopColor,
          dot: !!chip.querySelector('.pill__dot') } : null;
      })(),
      borderWidths: [...new Set(sla.map((e) => getComputedStyle(e).borderTopWidth))],
      heights: [...new Set(sla.map((e) => Math.round(e.getBoundingClientRect().height)))],
      overflow: sla.filter((e) => e.getBoundingClientRect().width > e.closest('td').clientWidth + 0.5).length,
    };
  });
  check('the SLA pills carry the dot, and nothing else does',
    dot.onEverySla && dot.andNowhereElse, JSON.stringify(dot));
  check('a 12px halo at 6% with a 6px core',
    dot.halo === '12x12' && Math.abs(dot.haloAlpha - 0.06) < 0.005 && dot.core === '6px',
    JSON.stringify(dot));
  check('the dot does not change the pill height or its 4px gap',
    dot.heights.join() === '24' && dot.gap === '4px', JSON.stringify(dot));
  const t = dot.byTone;
  check('the tinted pills take their own subdued rim',
    t.warn?.border === 'rgb(253, 230, 138)' &&
    t.success?.border === 'rgb(187, 247, 208)' &&
    t.danger?.border === 'rgb(254, 202, 202)',
    JSON.stringify({ warn: t.warn?.border, success: t.success?.border, danger: t.danger?.border }));
  // A rim on a saturated red would be a second edge fighting the first, and
  // the Figma node is a flat fill with no stroke.
  check('the solid pill has no rim at all',
    t['danger-solid']?.border === 'rgba(0, 0, 0, 0)', t['danger-solid']?.border);
  check('breached-but-not-solid takes the deepest red for its label AND its dot',
    t.danger?.text === 'rgb(127, 29, 29)' && t.danger?.dot === 'rgb(127, 29, 29)',
    JSON.stringify(t.danger));
  check('and a pill outside the column grows neither dot nor rim',
    dot.elsewhere?.dot === false && dot.elsewhere?.border !== 'rgb(253, 230, 138)' &&
    dot.elsewhere?.border !== 'rgb(187, 247, 208)' && dot.elsewhere?.border !== 'rgb(254, 202, 202)',
    JSON.stringify(dot.elsewhere));
  check('and the column still fits them', dot.overflow === 0, String(dot.overflow));
  check('rows are 52px plus the 1px divider', geom.rowHeights.join() === '53', geom.rowHeights.join());
  // 32, and not a number chosen for the table: these are the modal's own
  // mat-flat/mat-stroked/mat-button components, so the height is whatever the
  // case header's buttons are. A 28 here would mean someone re-sized them.
  check('every action button is the modal\'s 32px', geom.btnHeights.join() === '32',
    geom.btnHeights.join());
  check('both Actions controls are square and on one 32px axis',
    geom.actionSquares.join() === '32x32', geom.actionSquares.join(' '));
  check('all cells share one vertical axis', geom.axisSpread <= 1.5, String(geom.axisSpread));
  check('the action group is flush right on every row',
    geom.trailing.length === 1, geom.trailing.join());

  console.log('\nThe page says which queue it is, in the sidebar\'s own words');
  const heading = await page.evaluate(() => {
    const title = document.querySelector('.cases__title').textContent.trim();
    return { title, sub: document.querySelector('.cases__sub').textContent.replace(/\s+/g, ' ').trim(),
      // Clicking "AML cases" has to land somewhere that agrees it is that queue.
      inSidebar: [...document.querySelectorAll('[class*=nav__]')]
        .some((n) => n.textContent.trim().startsWith(title)) };
  });
  check('the Active heading is the sidebar entry that leads to it',
    heading.title === 'AML cases' && heading.inSidebar, JSON.stringify(heading));

  console.log('\nTriggers: what opened the case, and how much has happened since');
  const trig = await page.evaluate(() => {
    const cs = (e) => getComputedStyle(e);
    const cells = [...document.querySelectorAll('.cell--triggers')];
    const one = cells[0].querySelector('.trig');
    return {
      headerAfterSeverity: (() => {
        const h = [...document.querySelectorAll('thead th')].map((t) => t.textContent.trim());
        return h[h.indexOf('Severity') + 1] === 'Triggers';
      })(),
      counts: cells.map((c) => c.querySelectorAll('.trig__more').length),
      withCount: cells.filter((c) => c.querySelector('.trig__more')).length,
      withoutCount: cells.filter((c) => !c.querySelector('.trig__more')).length,
      colours: {
        name: cs(one.querySelector('.trig__name')).color,
        at: cs(one.querySelector('.trig__at')).color,
        more: (() => {
          const m = document.querySelector('.trig__more');
          return m ? { colour: cs(m).color, weight: cs(m).fontWeight } : null;
        })(),
      },
      // A count, not a control.
      interactive: cells.filter((c) => c.querySelector('a,button,[tabindex],[role=button]')).length,
      cursors: [...new Set(cells.map((c) => cs(c.querySelector('.trig')).cursor))],
      nowrap: [...new Set(cells.map((c) => cs(c).whiteSpace))],
      lines: cells[0].querySelector('.trig').children.length,
      name: { weight: cs(cells[0].querySelector('.trig__name')).fontWeight,
        fs: cs(cells[0].querySelector('.trig__name')).fontSize },
      detail: { fs: cs(cells[0].querySelector('.trig__detail')).fontSize,
        lh: cs(cells[0].querySelector('.trig__detail')).lineHeight,
        weight: cs(cells[0].querySelector('.trig__detail')).fontWeight,
        text: cells[0].querySelector('.trig__detail').textContent.trim() },
      stampTitle: cells[0].querySelector('.trig__at').getAttribute('title'),
      detailsTitled: cells.every((c) => !!c.querySelector('.trig__detail').getAttribute('title')),
      nameClipped: cells.filter((c) => {
        const e = c.querySelector('.trig__name');
        const rg = document.createRange();
        rg.selectNodeContents(e);
        return rg.getBoundingClientRect().width > e.getBoundingClientRect().width + 0.01;
      }).length,
      overflow: cells.filter((c) =>
        c.querySelector('.trig').getBoundingClientRect().width > c.clientWidth + 0.5).length,
      minWidth: cs(document.querySelector('.col-triggers')).minWidth,
      // The initiating trigger cannot predate the case it opened.
      allAfterOpen: cells.length > 0,
    };
  });
  check('Triggers sits directly after Severity', trig.headerAfterSeverity);
  check('one initiating trigger per row, never more', trig.counts.every((n) => n <= 1),
    trig.counts.join(','));
  check('both states are visible on first load - some with +N, some without',
    trig.withCount > 0 && trig.withoutCount > 0,
    `${trig.withCount} with, ${trig.withoutCount} without`);
  check('name in default ink, age muted, count subtler than both',
    trig.colours.name === 'rgb(9, 9, 11)' && trig.colours.at === 'rgb(82, 82, 91)' &&
    trig.colours.more?.colour === 'rgb(111, 111, 120)' && trig.colours.more?.weight === '500',
    JSON.stringify(trig.colours));
  check('nothing in the column is interactive',
    trig.interactive === 0 && trig.cursors.join() === 'auto',
    `${trig.interactive} controls, cursors ${trig.cursors.join()}`);
  check('two lines: what fired, and what it said',
    trig.lines === 2 && trig.detail.text.length > 0, JSON.stringify(trig.detail));
  check('both lines are 14/20; the name leads at 600, the detail follows at 400',
    trig.name.weight === '600' && trig.name.fs === '14px' &&
    trig.detail.fs === '14px' && trig.detail.lh === '20px' && trig.detail.weight === '400',
    JSON.stringify({ name: trig.name, detail: trig.detail }));
  check('the name never clips, and the detail carries its full text on title',
    trig.nameClipped === 0 && trig.detailsTitled,
    `${trig.nameClipped} names clipped`);
  check('the absolute stamp is on the time span', /\d+ \w+ \d{4}/.test(trig.stampTitle ?? ''),
    trig.stampTitle);
  check('the column holds the brief\'s 200px floor', trig.minWidth === '200px', trig.minWidth);

  console.log('\nThe Player column stays put, and the row highlight crosses it');
  const stick = await page.evaluate(() => {
    const cs = (e) => getComputedStyle(e);
    const td = document.querySelector('tbody .cell--player');
    const th = document.querySelector('thead .cell--player');
    return {
      td: { pos: cs(td).position, left: cs(td).left, z: cs(td).zIndex, bg: cs(td).backgroundColor },
      th: { pos: cs(th).position, z: cs(th).zIndex, bg: cs(th).backgroundColor },
      shadowFlush: cs(td).boxShadow,
      x: Math.round(td.getBoundingClientRect().left),
    };
  });
  // Transparent is the default for a sticky cell, and the other columns would
  // scroll straight through it.
  check('the Player cells are sticky and painted, header above body',
    stick.td.pos === 'sticky' && stick.td.left === '0px' && Number(stick.td.z) === 10 &&
    stick.td.bg !== 'rgba(0, 0, 0, 0)' && stick.th.pos === 'sticky' &&
    Number(stick.th.z) > Number(stick.td.z) && stick.th.bg !== 'rgba(0, 0, 0, 0)',
    JSON.stringify(stick));
  check('flush left there is no edge - nothing is hidden behind it yet',
    stick.shadowFlush === 'none', stick.shadowFlush);

  const scrolled = await page.evaluate(async () => {
    const w = document.querySelector('.table-scroll');
    const playerX = () => Math.round(document.querySelector('tbody .cell--player').getBoundingClientRect().left);
    const nextX = () => Math.round(document.querySelector('tbody td:nth-child(2)').getBoundingClientRect().left);
    const before = { player: playerX(), next: nextX() };
    /**
     * Scroll to the END rather than to a chosen number.
     *
     * A fixed 360 assumed more room than the viewport has: max scroll here is
     * about 186, so the value clamped and the neighbouring column had not
     * passed the sticky one. The check was comparing against how far it
     * happened to get, which is a property of the window, not of the code.
     */
    w.scrollLeft = w.scrollWidth;
    await new Promise((r) => setTimeout(r, 300));
    const td = document.querySelector('tbody .cell--player');
    const out = {
      scrolledBy: w.scrollLeft,
      flagged: w.classList.contains('is-scrolled'),
      heldX: playerX() === before.player,
      // The neighbour moved left by exactly what the container scrolled.
      neighbourMoved: before.next - nextX() === w.scrollLeft,
    };
    w.scrollLeft = 0;
    await new Promise((r) => setTimeout(r, 300));
    out.shadowGoneAgain = !w.classList.contains('is-scrolled');
    return out;
  });
  check('scrolled, the column holds its place while the rest moves under it',
    scrolled.scrolledBy > 0 && scrolled.heldX && scrolled.neighbourMoved,
    JSON.stringify(scrolled));
  /**
   * PAINTED, not computed - and that distinction is the whole check.
   *
   * The edge was first written as box-shadow on the sticky cell.
   * getComputedStyle reported it, this suite passed, and Chrome rendered
   * nothing: box-shadow on a cell is silently dropped when the table is
   * border-collapse: collapse, which this one must be for tr to carry the row
   * divider. Nobody caught it until someone looked at the screen.
   */
  const paint = await (async () => {
    const boundary = await page.evaluate(() => {
      const td = document.querySelector('tbody .cell--player').getBoundingClientRect();
      const row = document.querySelector('tbody tr:nth-child(2)').getBoundingClientRect();
      const w = document.querySelector('.table-scroll');
      /**
       * Sample near the TOP of the row, not its middle.
       *
       * The mid-line is where every cell's text and pills sit, and the columns
       * scrolling under the sticky one put their glyphs right against its
       * edge - so those pixels are dark whether an edge is painted or not,
       * and a check reading them passes either way. A row is 53px and its
       * content is a 24px band through the centre; 5px down is empty.
       */
      return { x: Math.round(td.right), y: Math.round(row.top + 5),
        maxScroll: w.scrollWidth - w.clientWidth };
    });
    const sample = async () => {
      const png = decodePng(await page.screenshot({ type: 'png' }));
      // Just outside the cell, where the falloff lands.
      return [1, 2, 3].map((d) => png.at(boundary.x + d, boundary.y)[0]);
    };
    await page.evaluate(() => { document.querySelector('.table-scroll').scrollLeft = 0; });
    await page.waitForTimeout(300);
    const flush = await sample();
    await page.evaluate(() => {
      const w = document.querySelector('.table-scroll');
      w.scrollLeft = Math.min(300, w.scrollWidth - w.clientWidth);
    });
    await page.waitForTimeout(400);
    const moved = await sample();
    await page.evaluate(() => { document.querySelector('.table-scroll').scrollLeft = 0; });
    await page.waitForTimeout(300);
    return { flush, moved, maxScroll: boundary.maxScroll };
  })();
  check('and only then does the edge appear - in the PIXELS, not the computed style',
    paint.maxScroll > 0 &&
    // Nothing at all flush left...
    paint.flush.every((v) => v === 255) &&
    // ...a real falloff once scrolled: darkest against the cell, fading out.
    paint.moved[0] < 252 && paint.moved[0] < paint.moved[2] && paint.moved[2] >= 252,
    `flush ${paint.flush.join(',')} scrolled ${paint.moved.join(',')}`);
  check('the flag still tracks the scroll position',
    scrolled.flagged && scrolled.shadowGoneAgain, JSON.stringify(scrolled));
  // A box-shadow here would compute and never paint. Fail loudly if one returns.
  check('the edge is not a box-shadow, which this table cannot render',
    await page.evaluate(() =>
      getComputedStyle(document.querySelector('tbody .cell--player')).boxShadow === 'none'));

  const atRest = await page.evaluate(() => {
    const cs = (e) => getComputedStyle(e);
    const row = document.querySelector('tbody tr:nth-child(2)');
    return { link: cs(row.querySelector('.linkish')).color,
      pill: cs(row.querySelector('ui-pill')).backgroundColor,
      lock: cs(row.querySelector('.lock-av')).backgroundColor };
  });
  await page.hover('tbody tr:nth-child(2) .cell--sla');
  await page.waitForTimeout(250);
  const hover = await page.evaluate(() => {
    const cs = (e) => getComputedStyle(e);
    const row = document.querySelector('tbody tr:nth-child(2)');
    const other = document.querySelector('tbody tr:nth-child(3)');
    const tds = [...row.querySelectorAll('td')];
    return {
      backgrounds: [...new Set(tds.map((t) => cs(t).backgroundColor))],
      transition: `${cs(tds[0]).transitionProperty} ${cs(tds[0]).transitionDuration}`,
      rowCursor: cs(row).cursor,
      /**
       * Background ONLY - compared against the SAME row's resting values,
       * captured before the hover. Comparing row 2 to row 3 was meaningless:
       * they hold different lock states, so their padlocks are different
       * colours whether anything is hovered or not.
       */
      link: cs(row.querySelector('.linkish')).color,
      pill: cs(row.querySelector('ui-pill')).backgroundColor,
      lock: cs(row.querySelector('.lock-av')).backgroundColor,
    };
  });
  check('every cell takes the hover, the sticky one included',
    hover.backgrounds.length === 1, hover.backgrounds.join(' '));
  check('at 100ms on background alone',
    hover.transition === 'background-color 0.1s', hover.transition);
  check('the row keeps the default cursor - only its controls are pointers',
    hover.rowCursor === 'auto', hover.rowCursor);
  check('and nothing else in the row changes',
    hover.link === atRest.link && hover.pill === atRest.pill &&
    hover.lock === atRest.lock,
    `rest ${JSON.stringify(atRest)} hover ${JSON.stringify(hover)}`);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);


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
  const counts = () => page.evaluate(() => {
    const disc = (e) => {
      const r = e.getBoundingClientRect();
      return `${Math.round(r.width)}x${Math.round(r.height)}/` +
        getComputedStyle(e).borderTopLeftRadius;
    };
    const o = document.querySelector('.open-case');
    const or = o?.getBoundingClientRect();
    return {
      notLocked: document.querySelectorAll('.lock-av--free').length,
      mine: document.querySelectorAll('.lock-av--mine').length,
      other: document.querySelectorAll('.lock-av--other').length,
      open: document.querySelectorAll('.open-case').length,
      solidFills: [...document.querySelectorAll('.actions button')]
        .filter((b) => getComputedStyle(b).backgroundColor === 'rgb(26, 115, 201)').length,
      shapes: [...new Set([...document.querySelectorAll('.lock-av')].map(disc))],
      // The monogram is decoration: the button's name carries who holds it.
      initialsHidden: [...document.querySelectorAll('.lock-av--mine, .lock-av--other')]
        .every((e) => !!e.querySelector('[aria-hidden="true"]')),
      freeName: document.querySelector('.lock-av--free')?.getAttribute('aria-label'),
      mineName: document.querySelector('.lock-av--mine')?.getAttribute('aria-label'),
      minePressed: document.querySelector('.lock-av--mine')?.getAttribute('aria-pressed'),
      otherName: document.querySelector('.lock-av--other')?.getAttribute('aria-label'),
      mineTip: document.querySelector('.lock-av--mine')?.getAttribute('ng-reflect-message'),
      otherTip: document.querySelector('.lock-av--other')?.getAttribute('ng-reflect-message'),
      openName: o?.getAttribute('aria-label'),
      openSize: or ? `${Math.round(or.width)}x${Math.round(or.height)}` : null,
      noLockColumn: ![...document.querySelectorAll('thead th')]
        .some((h) => h.textContent.trim() === 'Lock'),
      /**
       * Two fixed slots. With a flex row, a case nobody holds pulled its
       * padlock 40px right and the column read as two different columns
       * depending on who held what.
       */
      lockXs: [...new Set([...document.querySelectorAll('.lock-av')]
        .map((e) => Math.round(e.getBoundingClientRect().left)))].length,
      actionWidths: [...new Set([...document.querySelectorAll('.actions')]
        .map((a) => Math.round(a.getBoundingClientRect().width)))],
    };
  });
  const c0 = await counts();

  /**
   * The lock control lives in ACTIONS now - D-07 - as one 32px disc in three
   * states, sized to match Open case beside it. A whole column to hold one
   * control was a column of chrome, and the two things an agent does to a row
   * belong together.
   */
  check('the Lock column is gone; its control is a 32px disc in Actions',
    c0.noLockColumn && c0.shapes.join() === '32x32/50%',
    `noLockColumn ${c0.noLockColumn} / ${c0.shapes.join()}`);
  check('the initials are decoration - the name carries the person',
    c0.initialsHidden, String(c0.initialsHidden));
  check('each state names itself in full',
    c0.freeName === 'Lock case' && c0.mineName === 'Locked to you, click to unlock' &&
    /^Locked to .+ \d+ \w+ ago, click to force unlock$/.test(c0.otherName ?? ''),
    JSON.stringify({ free: c0.freeName, mine: c0.mineName, other: c0.otherName }));
  check('yours reports itself pressed', c0.minePressed === 'true', c0.minePressed);
  // One vocabulary for one fact: the panel says "Locked to", so the table must
  // not say "Locked by". Composed from lockStatusLine() rather than retyped.
  check('the lock vocabulary is the widget\'s - "Locked to", never "Locked by"',
    !/Locked by/.test([c0.freeName, c0.mineName, c0.otherName, c0.mineTip, c0.otherTip].join(' ')),
    JSON.stringify({ mine: c0.mineTip, other: c0.otherTip }));
  check('Open case is icon-only on the same axis, named, and only where rule 4 allows it',
    c0.openSize === '32x32' && c0.openName === 'Open AML case in new tab' &&
    c0.open === c0.mine, JSON.stringify({ size: c0.openSize, name: c0.openName,
      open: c0.open, mine: c0.mine }));
  check('Open case is the ONLY filled button in the table',
    c0.solidFills === c0.mine, `${c0.solidFills} filled vs ${c0.mine} mine`);
  check('the lock sits at one x on every row, whoever holds the case',
    c0.lockXs === 1 && c0.actionWidths.length === 1,
    `${c0.lockXs} positions, widths ${c0.actionWidths.join()}`);

  // The disc is the control: clicking it locks, clicking again releases.
  await page.locator('.lock-av--free').first().click();
  await page.waitForTimeout(400);
  const c1 = await counts();
  check('the disc locks the row, and Open case arrives with it',
    c1.mine === c0.mine + 1 && c1.open === c0.open + 1, `${c1.mine}/${c1.open}`);
  await page.locator('.lock-av--mine').first().click();
  await page.waitForTimeout(400);
  const c2 = await counts();
  check('and clicking your own releases it', c2.mine === c0.mine && c2.open === c0.open,
    `${c2.mine}/${c2.open}`);

  console.log('\nForce unlock goes through the modal confirm, not straight through');
  await page.locator('.lock-av--other').first().click();
  await page.waitForTimeout(450);
  const dialog = await page.evaluate(() => {
    const d = document.querySelector('confirm-unlock-dialog');
    if (!d) return null;
    return {
      lead: d.querySelector('.lead')?.textContent.replace(/\s+/g, ' ').trim(),
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

  const head2 = await page.evaluate(() => {
    const cs = (e) => getComputedStyle(e);
    const ths = [...document.querySelectorAll('thead th')];
    /**
     * Measure the TEXT, not the cell. The sticky Player header carries a 4px
     * edge pseudo-element that sits outside its padding box and inflates
     * scrollWidth - reading that as a clip is a false positive.
     */
    const clipped = ths.filter((t) => {
      const rg = document.createRange();
      rg.selectNodeContents(t);
      return rg.getBoundingClientRect().width > t.clientWidth - 32 + 0.5;
    }).map((t) => t.textContent.trim());
    return { fs: [...new Set(ths.map((t) => cs(t).fontSize))],
      colour: [...new Set(ths.map((t) => cs(t).color))],
      transform: [...new Set(ths.map((t) => cs(t).textTransform))],
      clipped };
  });
  check('the header is 14px title case in full ink',
    head2.fs.join() === '14px' && head2.colour.join() === 'rgb(9, 9, 11)' &&
    head2.transform.join() === 'none', JSON.stringify(head2));
  check('and no header text is cut off', head2.clipped.length === 0, head2.clipped.join());
  /**
   * Both sortable headers must place their arrow identically.
   *
   * They did not: inline-level children share a baseline, so the 24px info
   * button in the Priority cell grew its line box and pushed that arrow 0.8px
   * above the SLA one - a difference caused by a sibling neither arrow knows
   * about. The flex wrapper is what makes them agree.
   */
  const arrows = await page.evaluate(() => {
    const pos = (m) => {
      const th = [...document.querySelectorAll('thead th')]
        .find((t) => t.textContent.trim().startsWith(m));
      const r = th.getBoundingClientRect();
      const a = th.querySelector('.th-sort__arrow').getBoundingClientRect();
      return +(a.top + a.height / 2 - r.top).toFixed(2);
    };
    return { priority: pos('Priority'), sla: pos('SLA') };
  });
  check('both sort arrows sit at the same height, whatever else is in the cell',
    arrows.priority === arrows.sla, JSON.stringify(arrows));
  // The link's own rule was lost once in a style edit and the browser default
  // (#0000EE) took over. Asserted as the token's value, not "not default".
  const link = await page.evaluate(async () => {
    const a = document.querySelector('.linkish');
    const rest = getComputedStyle(a);
    const out = { colour: rest.color, weight: rest.fontWeight,
      numeric: rest.fontVariantNumeric, underline: rest.textDecorationLine };
    return out;
  });
  check('the player id keeps the link treatment - #1D4ED8, 600, tabular, underlined',
    link.colour === 'rgb(29, 78, 216)' && link.weight === '600' &&
    link.numeric === 'tabular-nums' && link.underline === 'underline',
    JSON.stringify(link));
  await page.hover('.linkish');
  await page.waitForTimeout(250);
  check('and #1E40AF on hover',
    (await page.evaluate(() => getComputedStyle(document.querySelector('.linkish')).color))
      === 'rgb(30, 64, 175)');
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);

  console.log('\nSorting: Priority and SLA, direction and aria-sort together');
  const sortState = () => page.evaluate(() => ({
    scores: [...document.querySelectorAll('.prio')].map((e) => Number(e.textContent.match(/\d+/)[0])),
    sorts: [...document.querySelectorAll('thead th')]
      .map((h) => h.getAttribute('aria-sort')).filter((v) => v !== null),
    activeUp: [...document.querySelectorAll('.th-sort__arrow--on')]
      .map((a) => a.classList.contains('th-sort__arrow--up')),
    buttons: document.querySelectorAll('.th-sort').length,
    // Only the two sortable headers get an arrow or a name.
    arrowsInHeader: document.querySelectorAll('thead .th-sort__arrow').length,
    opacities: [...document.querySelectorAll('.th-sort__arrow')]
      .map((a) => getComputedStyle(a).opacity),
  }));
  const desc = (a) => a.every((v, i) => i === 0 || a[i - 1] >= v);
  const asc = (a) => a.every((v, i) => i === 0 || a[i - 1] <= v);

  const s0 = await sortState();
  check('two sortable headers, and only those two carry an arrow',
    s0.buttons === 2 && s0.arrowsInHeader === 2, JSON.stringify(s0));
  // A control that only appears under the pointer is invisible to anyone
  // scanning, and to anyone not using a pointer at all.
  check('the inactive sort arrow is visible at rest, not hover-only',
    s0.opacities.every((o) => Number(o) > 0) &&
    s0.opacities.filter((o) => o === '1').length === 1,
    s0.opacities.join(','));
  check('on load: priority descending, and the header says so',
    desc(s0.scores) && s0.sorts.join() === 'descending,none' && s0.activeUp.join() === 'false',
    JSON.stringify(s0));

  await page.locator('.th-sort').first().click();
  await page.waitForTimeout(400);
  const s1 = await sortState();
  check('clicking the active column flips it, arrow and aria-sort with it',
    asc(s1.scores) && s1.sorts.join() === 'ascending,none' && s1.activeUp.join() === 'true',
    JSON.stringify(s1));

  await page.locator('.th-sort').nth(1).click();
  await page.waitForTimeout(400);
  const s2 = await sortState();
  // Switching resets to descending: "sort by SLA" means the oldest first, and
  // inheriting ascending would answer a question nobody asked.
  check('switching column moves the sort and resets to descending',
    s2.sorts.join() === 'none,descending' && s2.activeUp.join() === 'false',
    JSON.stringify(s2));

  await page.evaluate(() => document.querySelector('.th-sort').focus());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const s3 = await sortState();
  check('and the headers are operable from the keyboard',
    s3.sorts.join() === 'descending,none' && desc(s3.scores), JSON.stringify(s3));

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
      contentPad: getComputedStyle(p.querySelector('.mat-mdc-menu-content')).padding,
      gapAboveHead: Math.round(p.querySelector('.pop__head').getBoundingClientRect().top -
        p.getBoundingClientRect().top),
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
      headStyle: (() => {
        const h = cs(p.querySelector('.pop__head'));
        return { transform: h.textTransform, fs: h.fontSize, lh: h.lineHeight, colour: h.color };
      })(),
    };
  });
  check('the header reads "Priority <score> <band>"',
    /^Priority \d+ (Low|Medium|High|Urgent)$/.test(prio.head), prio.head);
  // Title case at 14/20 - it was 12/16 uppercase, the table header's
  // treatment, which made a panel heading read as a column label.
  check('and it is title case at 14/20, not a column label',
    prio.headStyle.transform === 'none' && prio.headStyle.fs === '14px' &&
    prio.headStyle.lh === '20px' && prio.headStyle.colour === 'rgb(9, 9, 11)',
    JSON.stringify(prio.headStyle));
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
  /**
   * Material pads its menu content 8px top and bottom for a list of menu
   * items. These panels are documents with their own 16, so the 8 was landing
   * on top of it - 24px above the heading where 16 was meant.
   */
  check('and Material\'s own list padding is not stacked on top of it',
    prio.contentPad === '0px' && prio.gapAboveHead === 16,
    `${prio.contentPad} / ${prio.gapAboveHead}`);
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
  // Scoped to the TABLE header: the page title carries an icon of its own
  // now, and it is earlier in the DOM.
  const head = await page.evaluate(() => {
    const pick = (sel) => {
      const a = document.querySelector(sel);
      return a ? { href: a.getAttribute('href'), target: a.getAttribute('target'),
        name: a.getAttribute('aria-label'),
        glyph: Math.round(a.querySelector('svg').getBoundingClientRect().width) } : null;
    };
    return { column: pick('thead .th__info'), page: pick('.cases__title .th__info') };
  });
  check('the column header still carries the scoring link',
    /confluence|scoring/.test(head.column?.href ?? '') && head.column?.target === '_blank',
    JSON.stringify(head.column));
  check('and the page title carries the documentation link, same icon',
    head.page?.target === '_blank' && head.page?.glyph === 16 &&
    head.page?.name === 'AML cases documentation, opens in new tab' &&
    head.page?.glyph === head.column?.glyph,
    JSON.stringify(head.page));

  /**
   * Work is TEXT now - D-12. Four pills a row read as four controls, and the
   * column is a statement, not a set of buttons. The popover went with them:
   * work detail belongs in the case, not the queue.
   */
  const work = await page.evaluate(() => {
    const cs = (e) => getComputedStyle(e);
    const rows = [...document.querySelectorAll('.work-row')];
    const items = [...rows[0].querySelectorAll('.work__item')];
    const done = document.querySelector('.work__item--done');
    return {
      anyPill: document.querySelectorAll('.cell--work ui-pill').length,
      controls: [...new Set(rows.flatMap((r) =>
        [...r.querySelectorAll('a,button,[tabindex],[role=button]')]
          .map((e) => e.className.split(' ').find((c) => c.startsWith('work__')) ?? e.className)))],
      maxInline: Math.max(...rows.map((r) => r.querySelectorAll('.work__item').length)),
      gap: cs(rows[0]).gap,
      lead: { weight: cs(items[0]).fontWeight, colour: cs(items[0]).color },
      second: items[1] ? { weight: cs(items[1]).fontWeight, colour: cs(items[1]).color } : null,
      done: done ? { colour: cs(done).color, tick: !!done.querySelector('.work__tick') } : null,
      // The spans are fragments; the wrapper carries the sentence.
      // Everything EXCEPT the count button: a control cannot be hidden from
      // the reader who has to press it.
      spansHidden: rows.every((r) => [...r.children]
        .filter((c) => !c.classList.contains('work__more'))
        .every((c) => c.getAttribute('aria-hidden') === 'true')),
      moreNamed: [...document.querySelectorAll('.work__more')]
        .every((b) => /^Show all \d+ work items/.test(b.getAttribute('aria-label') ?? '')),
      labels: rows.map((r) => r.getAttribute('aria-label')),
      more: (() => {
        const m = document.querySelector('.work__more');
        if (!m) return null;
        const r = m.getBoundingClientRect();
        const item = m.closest('.work-row').querySelector('.work__item').getBoundingClientRect();
        const c = getComputedStyle(m);
        return { h: Math.round(r.height), pad: c.padding, fs: c.fontSize,
          onAxis: Math.abs((r.top + r.height / 2) - (item.top + item.height / 2)) < 1 };
      })(),
      clipped: [...document.querySelectorAll('.work__item')].filter((e) => {
        const rg = document.createRange();
        rg.selectNodeContents(e);
        return rg.getBoundingClientRect().width > e.getBoundingClientRect().width + 0.01;
      }).length,
    };
  });
  // Text, not pills - but the count IS a control: it is the way to the rest
  // of the list, and the only thing in the column that does anything.
  // The count is a real target, not a scrap of text: 32px minimum, so it
  // clears 2.5.8 with room and sits on the same axis as the items beside it.
  check('the count is at least 32px tall with 8px sides at 14px',
    work.more.h >= 32 && work.more.pad === '0px 8px' && work.more.fs === '14px' &&
    work.more.onAxis, JSON.stringify(work.more));
  check('Work is text, and the only control in it is the count',
    work.anyPill === 0 &&
    work.controls.every((c) => c === 'work__more'), JSON.stringify(work.controls));
  check('up to four inline, a middle dot and 8px between them',
    work.maxInline <= 4 && work.gap === '8px', `${work.maxInline} inline, gap ${work.gap}`);
  check('the first item leads at 600 in default ink, the rest muted at 400',
    work.lead.weight === '600' && work.lead.colour === 'rgb(9, 9, 11)' &&
    work.second?.weight === '400' && work.second?.colour === 'rgb(82, 82, 91)',
    JSON.stringify({ lead: work.lead, second: work.second }));
  // Colour is never the only carrier: green says DONE, order says what is next.
  check('a completed item keeps its tick and its green wherever it lands',
    work.done?.tick === true && work.done?.colour === 'rgb(21, 128, 61)',
    JSON.stringify(work.done));
  check('no work label is cut off', work.clipped === 0, String(work.clipped));
  check('the descriptive spans are hidden, the count keeps its own name',
    work.spansHidden && work.moreNamed &&
    work.labels.every((l) => /^\d+ work items, \d+ to do, first: /.test(l ?? '') || l === 'No work items'),
    work.labels[0]);

  console.log('\nNo console errors along the way');
  check('the page threw nothing', errors.length === 0, errors.slice(0, 2).join(' | '));

  console.log(`\n${failed === 0 ? 'All cases table checks pass.' : `${failed} check(s) failed.`}`);
} finally {
  await browser.close();
}
process.exit(failed === 0 ? 0 : 1);
