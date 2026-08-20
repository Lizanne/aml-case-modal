import { chromium } from 'playwright';

/**
 * Dual-modal interaction suite.
 *
 * The claim under test is that there is no "dual mode": modals open one at a
 * time from their own widgets, the layout follows the width each modal gets,
 * and every rule (breakpoint, docking, minimise) behaves the same whether the
 * width came from a second modal or from a small screen.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const browser = await chromium.launch();

let failed = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed++;
};

const errors = [];
const page = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

const sg = () => page.locator('sg-alert-modal');
const aml = () => page.locator('aml-case-modal');
const bars = () => page.locator('minimised-bar');
const widthOf = async (loc) => {
  const b = await loc.boundingBox();
  return b ? Math.round(b.width) : 0;
};
const isSegmented = async () => (await page.locator('mat-button-toggle-group').count()) === 1;
const settle = (ms = 500) => page.waitForTimeout(ms);

// Land on a frame with nothing open so opens are genuine, then close the modal
// the harness opens for us.
async function fresh(state = '01') {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await settle();
  // Closed from the panel's own X: the widget primary is a static "open" label
  // now and never closes anything.
  if ((await aml().count()) === 1) {
    await page.locator('aml-case-modal button[aria-label="Close case"]').click();
    await settle();
  }
  if ((await sg().count()) === 1) {
    await page.locator('sg-alert-modal button[aria-label="Close alert"]').click();
    await settle();
  }
}

console.log('\nEach modal opens only from its own widget');
await fresh();
check('nothing open to begin with', (await sg().count()) === 0 && (await aml().count()) === 0);
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await settle();
check('SG widget opens the SG modal alone', (await sg().count()) === 1 && (await aml().count()) === 0);
check('opening one never auto-opens the other', (await bars().count()) === 0);
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
check('AML widget opens the second modal', (await sg().count()) === 1 && (await aml().count()) === 1);

console.log('\nOrder-based docking: incumbent left, newest right');
// This REPLACES a fixed-sides rule. Nothing is assigned a side any more, so
// the only way to be wrong is to dock by identity rather than by arrival -
// which is exactly what opening in the opposite order catches.
const sgBox1 = await sg().boundingBox();
const amlBox1 = await aml().boundingBox();
check('SG opened first sits left of AML', sgBox1.x < amlBox1.x,
  `sg ${Math.round(sgBox1.x)} vs aml ${Math.round(amlBox1.x)}`);
// Now the other order: the sides must swap.
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await settle();
const sgBox2 = await sg().boundingBox();
const amlBox2 = await aml().boundingBox();
check('AML opened first sits left of SG', amlBox2.x < sgBox2.x,
  `aml ${Math.round(amlBox2.x)} vs sg ${Math.round(sgBox2.x)}`);
check('the DOM order is the dock order', await page.evaluate(() =>
  [...document.querySelectorAll('.stage > *')].map((e) => e.tagName.toLowerCase())
    .join() === 'aml-case-modal,sg-alert-modal'));

console.log('\nA solo panel fills the stage, flush to both edges');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
// It used to stop at a 1000px cap and dock right, leaving slack on the left.
// The panel now takes the stage's whole width, which is what makes its edges
// the SAME edges as the widget row above it.
const solo = await page.evaluate(() => {
  const stage = document.querySelector('.stage').getBoundingClientRect();
  const modal = document.querySelector('aml-case-modal').getBoundingClientRect();
  const row = document.querySelector('back-office-widgets .widgets').getBoundingClientRect();
  return {
    rightInset: Math.round(stage.right - modal.right),
    leftInset: Math.round(modal.left - stage.left),
    rowLeftDelta: Math.round(modal.left - row.left),
    rowRightDelta: Math.round(modal.right - row.right),
  };
});
check('flush to both edges of the stage', solo.rightInset === 0 && solo.leftInset === 0,
  `${solo.leftInset} / ${solo.rightInset}`);
check('and therefore flush with the widget row above it',
  solo.rowLeftDelta === 0 && solo.rowRightDelta === 0,
  `${solo.rowLeftDelta} / ${solo.rowRightDelta}`);

console.log('\nSecond open halves the incumbent; closing restores it');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
const soloWidth = await widthOf(aml());
check('solo AML is full width', soloWidth > 900);
check('solo AML is two-panel', !(await isSegmented()));
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await settle();
const halfWidth = await widthOf(aml());
check('AML reflows to roughly half', halfWidth < soloWidth * 0.8 && halfWidth > soloWidth * 0.4);
check('both modals are the same width', Math.abs(halfWidth - (await widthOf(sg()))) < 4);
check('AML is now segmented', await isSegmented());
await page.locator('sg-alert-modal button[aria-label="Close alert"]').click();
await settle();
check('closing the other returns AML to full width', (await widthOf(aml())) === soloWidth);
check('and back to two-panel', !(await isSegmented()));

console.log('\nThe breakpoint is width-driven, not a dual-modal flag');
// One modal, but a window narrow enough to cross 720 on its own.
await page.setViewportSize({ width: 700, height: 1000 });
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
check('a single modal on a small screen segments too', await isSegmented());
check('one modal only - not a dual layout', (await sg().count()) === 0);
await page.setViewportSize({ width: 1500, height: 1000 });
await settle(600);
check('widening the window alone reflows back to two-panel', !(await isSegmented()));

console.log('\nMinimise docks to a bar; restore re-splits');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await settle();
await page.locator('sg-alert-modal button[aria-label="Minimise alert"]').click();
await settle();
check('SG leaves the stage', (await sg().count()) === 0);
check('a bar appears for it', (await bars().count()) === 1);
check('AML takes the full width back', (await widthOf(aml())) > 900);
check('AML is two-panel again', !(await isSegmented()));
// A fixed bar over a pinned footer would hide the very controls the agent
// needs, so the modal has to give the dock its space back.
check('the bar never covers the survivor\'s footer', await page.evaluate(() => {
  const footer = document.querySelector('workflow-panel .footer');
  const bar = document.querySelector('minimised-bar .bar');
  if (!footer || !bar) return false;
  const f = footer.getBoundingClientRect();
  const b = bar.getBoundingClientRect();
  return f.bottom <= b.top + 1;
}));
await page.locator('minimised-bar button:has-text("Restore")').click();
await settle();
check('restoring re-splits the stage', (await sg().count()) === 1 && (await isSegmented()));
check('the bar is gone', (await bars().count()) === 0);

console.log('\nBoth bars can stack');
await page.locator('sg-alert-modal button[aria-label="Minimise alert"]').click();
await settle(350);
await page.locator('aml-case-modal button[aria-label="Minimise case"]').click();
await settle(350);
check('two bars stacked', (await bars().count()) === 2);
check('stage is empty', (await sg().count()) === 0 && (await aml().count()) === 0);
const barIds = await page.$$eval('minimised-bar .bar__title', (els) => els.map((e) => e.textContent.trim()));
check('bars keep the fixed order (SG above AML)',
  barIds[0].includes('alert') && barIds[1].includes('AML'));

console.log('\nUnder ~1200px, opening the second auto-minimises the first and pulses');
await page.setViewportSize({ width: 1100, height: 1000 });
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
check('AML alone', (await aml().count()) === 1 && (await bars().count()) === 0);
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
// 200ms was enough while removal was instant. The panel now slides out over
// 300ms and is still in the DOM for all of it, so a short wait would report
// "not minimised" for a panel that is mid-exit. The pulse below still starts
// immediately, which is what proves the minimise itself was not delayed.
await settle(450);
check('AML auto-minimised to its bar', (await aml().count()) === 0 && (await bars().count()) === 1);
check('SG has the stage to itself', (await sg().count()) === 1);
check('the bar pulses once so it is findable',
  (await page.locator('minimised-bar .bar--pulse').count()) === 1);
await settle(1000);
check('the pulse stops', (await page.locator('minimised-bar .bar--pulse').count()) === 0);

console.log('\nState survives the reflow');
await page.setViewportSize({ width: 1500, height: 1000 });
await fresh('01');
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
// Start a draft, switch the info tab, then force a reflow.
await page.locator('action-placeholder button:has-text("Record")').first().click();
await settle(300);
await page.locator('record-form textarea').fill('Half-written note that must survive.');
await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
await settle(300);
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await settle(600);
check('reflowed to segmented', await isSegmented());
check('the segmented control landed on Player info',
  (await page.locator('player-info-panel').count()) === 1);
check('the info tab survived', (await page.locator('player-info-panel .mat-mdc-tab-labels .mdc-tab--active').innerText()).includes('Timeline'));
await page.locator('mat-button-toggle:has-text("Workflow")').click();
await settle(300);
check('the draft survived the reflow', (await page.locator('record-form form').count()) === 1);
check('with its text intact',
  (await page.locator('record-form textarea').inputValue()) === 'Half-written note that must survive.');

console.log('\nTransitions never block input');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
// Mid-reflow - do not wait for it to finish.
await page.waitForTimeout(90);
const clickable = await page.evaluate(() => {
  const el = document.querySelector('aml-case-modal');
  if (!el) return false;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + 40);
  return s.pointerEvents !== 'none' && !!hit && el.contains(hit);
});
check('the reflowing modal still receives pointer events', clickable);
await settle(400);

console.log('\nAn open panel owns its own lock control');
const lockView = () =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('.widget')];
    const labels = (i) =>
      [...cards[i].querySelectorAll('.widget__foot button')].map((b) =>
        b.textContent.replace(/\s+/g, ' ').trim(),
      );
    const hasLockBtn = (list) => list.some((l) => /Unlock|Lock case/.test(l));
    const hasOpen = (list) => list.some((l) => /Open case|Resolve and archive/.test(l));
    const hasClose = (list) => list.some((l) => /^Close /.test(l));
    return {
      sgOpen: !!document.querySelector('sg-alert-modal'),
      amlOpen: !!document.querySelector('aml-case-modal'),
      sgHasLock: hasLockBtn(labels(0)),
      amlHasLock: hasLockBtn(labels(1)),
      sgPill: !!cards[0].querySelector('.widget__lock'),
      amlPill: !!cards[1].querySelector('.widget__lock'),
      sgActions: { open: hasOpen(labels(0)), close: hasClose(labels(0)) },
      amlActions: { open: hasOpen(labels(1)), close: hasClose(labels(1)) },
      panelLock: document.querySelector('case-header .head__lock button')?.textContent.trim() ?? null,
    };
  });

await fresh();
const bothClosed = await lockView();
check('both closed: each widget keeps its lock control',
  bothClosed.sgHasLock && bothClosed.amlHasLock, JSON.stringify(bothClosed));
// One slot, swapped: an Open action while the panel is up would be an action
// with nothing to do, and the two must never be on screen together.
check('both closed: each shows its open action and no Close',
  bothClosed.sgActions.open && !bothClosed.sgActions.close &&
    bothClosed.amlActions.open && !bothClosed.amlActions.close,
  JSON.stringify([bothClosed.sgActions, bothClosed.amlActions]));

await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle(500);
const amlUp = await lockView();
// Per case, independently: opening the AML panel must not touch the SG widget.
check('AML open: its widget drops the lock control, SG keeps its own',
  !amlUp.amlHasLock && amlUp.sgHasLock, JSON.stringify(amlUp));
check('the status pill stays on both', amlUp.sgPill && amlUp.amlPill);
check('AML open: its widget reads Close, SG still reads its open action',
  amlUp.amlActions.close && !amlUp.amlActions.open &&
    amlUp.sgActions.open && !amlUp.sgActions.close,
  JSON.stringify([amlUp.sgActions, amlUp.amlActions]));
check('the panel header is the lock control', amlUp.panelLock !== null, String(amlUp.panelLock));

await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await settle(500);
const bothUp = await lockView();
check('both open: neither widget carries a lock control',
  !bothUp.sgHasLock && !bothUp.amlHasLock, JSON.stringify(bothUp));
check('both open: both widgets read Close only',
  bothUp.sgActions.close && !bothUp.sgActions.open &&
    bothUp.amlActions.close && !bothUp.amlActions.open,
  JSON.stringify([bothUp.sgActions, bothUp.amlActions]));

// State change on the panel reaches the widget with no reload.
const before = await page.evaluate(() =>
  document.querySelectorAll('.widget')[1].querySelector('.widget__lock').textContent.trim());
await page.locator('aml-case-modal .head__lock button').click();
await settle(400);
const after = await page.evaluate(() =>
  document.querySelectorAll('.widget')[1].querySelector('.widget__lock').textContent.trim());
check('a lock change on the panel shows on the widget at once', before !== after,
  `${before} -> ${after}`);

await page.locator('aml-case-modal button[aria-label="Close case"]').click();
await settle(500);
const amlGone = await lockView();
check('closing the panel gives the lock control back', amlGone.amlHasLock,
  JSON.stringify(amlGone));
check('and the open action with it', amlGone.amlActions.open && !amlGone.amlActions.close,
  JSON.stringify(amlGone.amlActions));

console.log('\nThe panels live inside the chrome, never over it');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle(500);
const chrome = await page.evaluate(() => {
  const R = (s) => {
    const el = document.querySelector(s);
    return el ? el.getBoundingClientRect() : null;
  };
  const top = R('app-top-bar');
  const ph = R('player-header');
  const nav = R('side-nav');
  const panel = R('aml-case-modal');
  const navBtn = document.querySelector('side-nav .nav__item');
  const nb = navBtn.getBoundingClientRect();
  // Whatever sits at the nav's own coordinates must BE the nav, or something
  // is lying on top of it.
  const hit = document.elementFromPoint(nb.left + nb.width / 2, nb.top + nb.height / 2);
  return {
    order: top.bottom <= ph.top + 0.5,
    belowPlayerBar: panel.top >= ph.bottom - 0.5,
    rightOfNav: panel.left >= nav.right - 0.5,
    withinViewport: panel.bottom <= window.innerHeight + 0.5,
    navReachable: !!navBtn.closest('side-nav') && navBtn.contains(hit ?? navBtn) === false
      ? navBtn === hit || navBtn.contains(hit)
      : true,
    navHit: hit ? hit.tagName.toLowerCase() : null,
    navIsHit: !!(hit && hit.closest('side-nav')),
  };
});
check('the top bar sits above the player bar', chrome.order);
check('the panel starts below the player bar', chrome.belowPlayerBar);
check('and to the right of the nav', chrome.rightOfNav);
check('and never runs past the bottom of the viewport', chrome.withinViewport);
check('the nav is still the thing at its own coordinates', chrome.navIsHit, chrome.navHit);
// Clickable, not merely visible.
await page.locator('side-nav .nav__item').first().click();
check('and it takes a click', true);

console.log('\nPage scroll locks while a panel is open; panels scroll themselves');
const locked = await page.evaluate(() => ({
  htmlLocked: document.documentElement.classList.contains('panel-open'),
  pageScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
  streamScrolls: (() => {
    const el = document.querySelector('workflow-panel .stream');
    return !!el && el.scrollHeight > el.clientHeight + 1;
  })(),
  navScrolls: (() => {
    const el = document.querySelector('side-nav .nav');
    return !!el && el.scrollHeight > el.clientHeight + 1;
  })(),
}));
check('the page itself cannot scroll', locked.htmlLocked && !locked.pageScrollable,
  JSON.stringify(locked));
check('the panel hands scrolling to its stream', await page.evaluate(() =>
  getComputedStyle(document.querySelector('workflow-panel .stream')).overflowY === 'auto'));
// Whether it is scrolling RIGHT NOW depends on how much fixture content there
// is, so shorten the viewport until it must be, and check the page still is
// not the thing that moved.
await page.setViewportSize({ width: 1500, height: 620 });
await settle(400);
const short = await page.evaluate(() => ({
  streamScrolls: (() => {
    const el = document.querySelector('workflow-panel .stream');
    return !!el && el.scrollHeight > el.clientHeight + 1;
  })(),
  pageScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
  panelInViewport:
    document.querySelector('aml-case-modal').getBoundingClientRect().bottom <=
    window.innerHeight + 1,
}));
check('short viewport: the stream is what scrolls', short.streamScrolls && !short.pageScrollable,
  JSON.stringify(short));
check('short viewport: the panel still fits the chrome', short.panelInViewport);
await page.setViewportSize({ width: 1500, height: 1000 });
await settle(400);
check('the nav scrolls itself too', locked.navScrolls);
await page.locator('aml-case-modal button[aria-label="Close case"]').click();
await settle(500);
check('the lock lifts when the last panel closes', await page.evaluate(() =>
  !document.documentElement.classList.contains('panel-open')));

console.log('\nChoreography: transform only, reflow instant, focus, Escape');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle(500);
// Focus goes to the opened panel's header, not to the document.
const focused = await page.evaluate(() => {
  const a = document.activeElement;
  return {
    isHeader: !!a && a.hasAttribute('data-panel-header'),
    inPanel: !!a && !!a.closest('aml-case-modal'),
  };
});
check('focus lands on the opened panel header', focused.isHeader && focused.inPanel,
  JSON.stringify(focused));

// The incumbent must be in its compressed layout on the FIRST frames of the
// newcomer's slide, not easing into it: the slide covers the reflow.
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await page.waitForTimeout(50);
const during = await page.evaluate(() => {
  const aml = document.querySelector('aml-case-modal');
  const sg = document.querySelector('sg-alert-modal');
  const m = new DOMMatrixReadOnly(getComputedStyle(sg).transform === 'none' ? '' : getComputedStyle(sg).transform);
  return {
    widthTransition: getComputedStyle(aml).transitionDuration,
    segmented: document.querySelectorAll('mat-button-toggle-group').length === 1,
    amlWidth: Math.round(aml.getBoundingClientRect().width),
    stage: Math.round(document.querySelector('.stage').getBoundingClientRect().width),
    newcomerStillSliding: m.m41 > 0,
  };
});
check('no width animation on either panel', during.widthTransition === '0s', during.widthTransition);
check('the incumbent is already compressed while the newcomer slides',
  during.segmented && during.newcomerStillSliding &&
    during.amlWidth < during.stage * 0.6,
  JSON.stringify(during));
await settle(500);

// Escape closes the most recently opened panel - the one on the right.
const beforeEsc = await page.evaluate(() =>
  [...document.querySelectorAll('.stage > *')].map((e) => e.tagName.toLowerCase()));
await page.keyboard.press('Escape');
await settle(500);
const afterEsc = await page.evaluate(() =>
  [...document.querySelectorAll('.stage > *')].map((e) => e.tagName.toLowerCase()));
check('Escape closes the newest, not the oldest',
  beforeEsc.length === 2 && afterEsc.length === 1 && afterEsc[0] === beforeEsc[0],
  `${beforeEsc.join()} -> ${afterEsc.join()}`);
await page.keyboard.press('Escape');
await settle(500);
check('and then the last one', (await page.evaluate(() =>
  document.querySelectorAll('.stage > *').length)) === 0);

// A dialog owns Escape while it is up.
await page.goto(`${BASE}/?state=05`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('dialog-shell', { timeout: 15000 });
await settle(600);
await page.evaluate(() => document.querySelector('side-nav .nav__item')?.focus());
await page.keyboard.press('Escape');
await settle(400);
check('Escape outside a dialog does not close the panel under it',
  (await page.locator('aml-case-modal').count()) === 1);

console.log('\nDrawer motion: in from the right, out to the right');
const tx = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    const m = new DOMMatrixReadOnly(cs.transform === 'none' ? '' : cs.transform);
    return {
      x: Math.round(m.m41),
      opacity: Number(cs.opacity),
      position: cs.position,
      width: Math.round(el.getBoundingClientRect().width),
    };
  }, sel);

await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await page.waitForTimeout(60);
const entering = await tx('aml-case-modal');
check('a panel enters displaced to the right', entering && entering.x > 100, JSON.stringify(entering));
check('and faded', entering && entering.opacity < 1, String(entering?.opacity));
await settle(500);
const landed = await tx('aml-case-modal');
check('and lands with no transform left behind',
  landed.x === 0 && landed.opacity === 1, JSON.stringify(landed));

// One continuous motion: the incumbent must already be narrowing while the
// newcomer is still on its way in, not after it has arrived.
await page.locator('back-office-widgets button:has-text("Resolve and archive")').click();
await page.waitForTimeout(90);
const push = { incumbent: await tx('aml-case-modal'), entering: await tx('sg-alert-modal') };
check('the incumbent is already narrowing as the newcomer slides in',
  push.entering.x > 0 && push.incumbent.width < 1000,
  `entering x=${push.entering.x} incumbent w=${push.incumbent.width}`);
await settle(500);

// The leaver is taken out of flow so the survivor can widen into the space
// immediately rather than waiting for the exit to finish.
await page.locator('sg-alert-modal button[aria-label="Close alert"]').click();
await page.waitForTimeout(90);
const exit = { leaving: await tx('sg-alert-modal'), survivor: await tx('aml-case-modal') };
check('the leaving panel is out of flow and moving right',
  exit.leaving && exit.leaving.position === 'absolute' && exit.leaving.x > 0,
  JSON.stringify(exit.leaving));
check('the survivor is already widening', exit.survivor.width > 672,
  `${exit.survivor.width}`);
await settle(500);
// Full width means the stage's width, not a number: the cap is gone.
const stageWidth = await page.evaluate(() =>
  Math.round(document.querySelector('.stage').getBoundingClientRect().width));
check('the leaver is gone and the survivor fills the stage',
  (await sg().count()) === 0 && (await widthOf(aml())) === stageWidth,
  `${await widthOf(aml())} vs ${stageWidth}`);

console.log('\nReduced motion makes it instant');
const rm = await browser.newPage({ viewport: { width: 1500, height: 1000 } });
await rm.emulateMedia({ reducedMotion: 'reduce' });
await rm.goto(`${BASE}/?state=09`, { waitUntil: 'networkidle' });
await rm.waitForTimeout(500);
const durations = await rm.evaluate(() => {
  const modal = document.querySelector('aml-case-modal');
  const stageModal = document.querySelector('.stage__modal');
  return {
    transition: getComputedStyle(modal).transitionDuration,
    animation: getComputedStyle(stageModal).animationName,
  };
});
check('the width transition is off', durations.transition === '0s');
check('the slide-in animation is off', durations.animation === 'none');
await rm.close();

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0 ? '\nAll dual-modal checks pass.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
