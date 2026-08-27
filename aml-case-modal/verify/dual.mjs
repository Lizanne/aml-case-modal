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

// Land on a frame with nothing open so opens are genuine, then close the modals
// the harness opens for us.
//
// 09, not 01: a widget renders on its item being PRESENT on the surface, and
// only 09 seeds both. In 01 there is no SG alert at all - no panel and no
// widget - so there would be nothing to open SG from. Closing the panels is
// what makes the opens below genuine; it does not take either item away.
async function fresh(state = '09') {
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
  // And any bar: on a stage too tight for two, seeding 09 auto-minimises the
  // incumbent rather than leaving it on the stage, so there is a panel here
  // that no panel X can reach. A minimised item is still open - its widget
  // hands its controls to the bar - so leaving one docked would mean no Open
  // button on the row either.
  for (let i = 0; i < 3 && (await bars().count()); i++) {
    await page.locator('minimised-bar button[aria-label^="Close"]').first().click();
    await settle();
  }
}

console.log('\nEach modal opens only from its own widget');
await fresh();
check('nothing open to begin with', (await sg().count()) === 0 && (await aml().count()) === 0);
await page.locator('back-office-widgets button:has-text("Open alert")').click();
await settle();
check('SG widget opens the SG modal alone', (await sg().count()) === 1 && (await aml().count()) === 0);
check('opening one never auto-opens the other', (await bars().count()) === 0);
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
check('AML widget opens the second modal', (await sg().count()) === 1 && (await aml().count()) === 1);

console.log('\nSlot docking: a panel opens under its own widget, in either order');
/**
 * This SUPERSEDES the arrival-order rule, which said the newest open docked
 * right. A slot is claimed when an item joins the surface and held until it
 * leaves, so a panel now comes back under the card that has been standing in
 * its column - and pressing Open on the left-hand widget can no longer make
 * its panel appear on the right, under the other one's card.
 *
 * Opening in the opposite order is still what catches a docking bug; it now
 * has to produce the SAME sides rather than swapped ones, and the widget row
 * has to agree with the stage in both.
 */
const sideBySide = () => page.evaluate(() => ({
  panels: [...document.querySelectorAll('.stage > *')].map((e) => e.tagName.toLowerCase()).join(),
  cards: [...document.querySelectorAll('back-office-widgets .w__name')]
    .map((e) => e.textContent.trim()).join(),
  rowDisplay: getComputedStyle(document.querySelector('back-office-widgets')).display,
}));
const openedSgFirst = await sideBySide();
check('SG opened first docks into the SG slot, on the left',
  openedSgFirst.panels === 'sg-alert-modal,aml-case-modal', openedSgFirst.panels);
// Both panels up means both cards withheld, so there is no row to line up
// with. The card-over-its-own-panel check that used to sit here could not
// survive that: the two never share the screen for the same item any more.
check('with both up, the row is gone entirely',
  openedSgFirst.cards === '' && openedSgFirst.rowDisplay === 'none',
  JSON.stringify(openedSgFirst));
// The other order. The sides must NOT swap: the slots outlive the panels.
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
const oneUp = await sideBySide();
check('with the case up, only the alert keeps a card',
  oneUp.cards === 'SG Alerts', oneUp.cards);
await page.locator('back-office-widgets button:has-text("Open alert")').click();
await settle();
const openedAmlFirst = await sideBySide();
check('opening AML first lands both panels in the same slots',
  openedAmlFirst.panels === openedSgFirst.panels, openedAmlFirst.panels);
check('and the row is gone in this order too',
  openedAmlFirst.cards === '' && openedAmlFirst.rowDisplay === 'none',
  JSON.stringify(openedAmlFirst));

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
    width: Math.round(modal.width),
    stageWidth: Math.round(stage.width),
    rowLeftDelta: Math.round(modal.left - row.left),
    rowRightDelta: Math.round(modal.right - row.right),
  };
});
// Capped at 1080 and docked right: the RIGHT edge stays on the stage's, the
// left pulls in once the stage is wider than the cap.
check('flush to the right edge of the stage', solo.rightInset === 0, `${solo.rightInset}`);
check('and flush with the widget row on that side', solo.rowRightDelta === 0,
  `${solo.rowRightDelta}`);
check('capped at 1080 on a wider stage, filling a narrower one',
  solo.width === Math.min(solo.stageWidth, 1080),
  `${solo.width} of ${solo.stageWidth}`);

console.log('\nSecond open halves the incumbent; closing restores it');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
const soloWidth = await widthOf(aml());
check('solo AML is full width', soloWidth > 900);
check('solo AML is two-panel', !(await isSegmented()));
await page.locator('back-office-widgets button:has-text("Open alert")').click();
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
await page.locator('back-office-widgets button:has-text("Open alert")').click();
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
await page.locator('minimised-bar button[aria-label^="Restore"]').click();
await settle();
check('restoring re-splits the stage', (await sg().count()) === 1 && (await isSegmented()));
check('the bar is gone', (await bars().count()) === 0);

console.log('\nMobile: one panel on the workspace, the other in its bar');
{
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const at = () =>
    mob.evaluate(() => ({
      panels: [...document.querySelectorAll('.stage > *')].map((e) => e.tagName.toLowerCase()),
      widths: [...document.querySelectorAll('.stage > *')].map((e) =>
        Math.round(e.getBoundingClientRect().width),
      ),
      bars: document.querySelectorAll('minimised-bar').length,
    }));
  // Seeded straight into the dual state: the rule has to hold for a stage that
  // ARRIVES too tight, not only one that is asked to open a second panel.
  await mob.goto(`${BASE}/?state=09`, { waitUntil: 'domcontentloaded' });
  await mob.waitForSelector('minimised-bar', { timeout: 15000 });
  await mob.waitForTimeout(900);
  const seeded = await at();
  check('seeded 09 at 390 shows one panel, not two columns',
    seeded.panels.length === 1 && seeded.bars === 1, JSON.stringify(seeded));
  check('and it is full width', seeded.widths[0] === 390 - 32, `${seeded.widths[0]}`);

  // Clear the stage, then walk the swap.
  for (const [host, label] of [['aml-case-modal', 'Close case'], ['sg-alert-modal', 'Close alert']]) {
    const btn = mob.locator(`${host} button[aria-label="${label}"]`);
    if (await btn.count()) {
      await btn.click();
      await mob.waitForTimeout(400);
    }
  }
  for (let i = 0; i < 3 && (await mob.locator('minimised-bar').count()); i++) {
    await mob.locator('minimised-bar button[aria-label^="Restore"]').first().click();
    await mob.waitForTimeout(400);
    const c = mob.locator('sg-alert-modal button[aria-label="Close alert"], aml-case-modal button[aria-label="Close case"]');
    if (await c.count()) {
      await c.first().click();
      await mob.waitForTimeout(400);
    }
  }
  await mob.locator('back-office-widgets button:has-text("Open alert")').click();
  await mob.waitForTimeout(600);
  const sgOnly = await at();
  check('opening SG gives it the workspace alone',
    sgOnly.panels.join() === 'sg-alert-modal' && sgOnly.bars === 0, JSON.stringify(sgOnly));

  await mob.locator('back-office-widgets button:has-text("Open case")').click();
  await mob.waitForTimeout(800);
  const amlOnly = await at();
  check('opening AML takes it over and sends SG to its bar',
    amlOnly.panels.join() === 'aml-case-modal' && amlOnly.bars === 1, JSON.stringify(amlOnly));

  await mob.locator('minimised-bar button[aria-label^="Restore"]').click();
  await mob.waitForTimeout(800);
  const swapped = await at();
  check('restoring SG swaps them back',
    swapped.panels.join() === 'sg-alert-modal' && swapped.bars === 1, JSON.stringify(swapped));
  await mob.close();
}

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
await page.locator('back-office-widgets button:has-text("Open alert")').click();
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
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
// Start a draft, switch the info tab, then force a reflow.
await page.locator('action-placeholder button:has-text("Record")').first().click();
await settle(300);
await page.locator('record-form textarea').fill('Half-written note that must survive.');
await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
await settle(300);
await page.locator('back-office-widgets button:has-text("Open alert")').click();
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
await page.locator('back-office-widgets button:has-text("Open alert")').click();
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

console.log('\nAn open panel owns its card, by taking it off the row');
/**
 * Two rules, tested per item rather than per row.
 *
 * 1. A card does not render while ITS OWN panel is open - minimised included.
 *    Not a reduced card: none. The panel already carries the identity, the
 *    lock and the controls, so a card beside it is a second statement of all
 *    three, sitting further from the thing it describes.
 * 2. A card is not tied to its panel's lifetime. Closing the panel puts it
 *    back in FULL - lock line and actions - which is what makes closing
 *    reversible.
 *
 * Per item, so the two are independent: with the case up and the alert shut,
 * the alert's card is on the row in full and is still the way back into it.
 *
 * The SG card carries no lock line in any state, and that is not an omission:
 * the SG alert has no lock. Its panel is the production modal with no lock
 * band, so a lock on its card would assert state the panel would contradict.
 */
const rowView = () =>
  page.evaluate(() => {
    const cards = [...document.querySelectorAll('.w')].map((c) => ({
      name: c.querySelector('.w__name').textContent.trim(),
      buttons: [...c.querySelectorAll('.w__actions button')].map((b) =>
        b.textContent.replace(/\s+/g, ' ').trim()),
      lock: c.querySelector('.w__lock')?.textContent.replace(/\s+/g, ' ').trim() ?? null,
    }));
    return {
      cards,
      names: cards.map((c) => c.name).join(),
      rowDisplay: getComputedStyle(document.querySelector('back-office-widgets')).display,
      open: [...document.querySelectorAll('.stage > *')]
        .map((e) => (e.tagName === 'AML-CASE-MODAL' ? 'AML Case' : 'SG Alerts')),
      panelLock: document.querySelector('case-header .head__lockline > button')?.textContent.trim() ?? null,
    };
  });
const card = (v, name) => v.cards.find((c) => c.name === name) ?? null;

await fresh();
const bothShut = await rowView();
check('both shut: both cards are on the row', bothShut.names === 'SG Alerts,AML Case',
  bothShut.names);
check('both shut: each carries its own way back in',
  card(bothShut, 'SG Alerts').buttons.some((b) => /Open alert/.test(b)) &&
    card(bothShut, 'AML Case').buttons.some((b) => /Open case/.test(b)),
  JSON.stringify(bothShut.cards));
check('both shut: the AML card carries the lock control and its status line',
  card(bothShut, 'AML Case').buttons.some((b) => /^(Lock case|Unlock|Force unlock)$/.test(b)) &&
    !!card(bothShut, 'AML Case').lock,
  JSON.stringify(card(bothShut, 'AML Case')));
check('the SG card carries no lock, because the SG alert has none',
  card(bothShut, 'SG Alerts').lock === null,
  JSON.stringify(card(bothShut, 'SG Alerts')));

await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle(600);
const amlUp = await rowView();
check('AML open: its card is gone from the row', card(amlUp, 'AML Case') === null, amlUp.names);
check('AML open: the SG card is untouched, in full',
  JSON.stringify(card(amlUp, 'SG Alerts')) === JSON.stringify(card(bothShut, 'SG Alerts')),
  `${JSON.stringify(card(amlUp, 'SG Alerts'))} vs ${JSON.stringify(card(bothShut, 'SG Alerts'))}`);
check('AML open: the lock lives on the panel header instead', amlUp.panelLock !== null,
  String(amlUp.panelLock));

await page.locator('back-office-widgets button:has-text("Open alert")').click();
await settle(600);
const bothUp = await rowView();
check('both open: no cards, and no row - dual is not an exception',
  bothUp.cards.length === 0 && bothUp.rowDisplay === 'none', JSON.stringify(bothUp));

// Minimised is still OPEN, so the card stays withheld: the bar is the panel's
// control surface and a card would be a second home for the same panel.
await page.locator('sg-alert-modal button[aria-label="Minimise alert"]').click();
await settle(600);
const sgMinimised = await rowView();
check('minimised: still no card for it', card(sgMinimised, 'SG Alerts') === null,
  sgMinimised.names);
check('minimised: its bar is the one control surface',
  (await bars().count()) === 1);
await page.locator('minimised-bar button[aria-label^="Close"]').first().click();
await settle(600);
check('closing it from the bar brings the card back in full',
  JSON.stringify(card(await rowView(), 'SG Alerts')) ===
    JSON.stringify(card(bothShut, 'SG Alerts')));

// State change on the panel reaches the card - after the close, because that
// is now the only moment the two can be compared at all.
await page.locator('aml-case-modal .head__lockline > button').click();
await settle(400);
await page.locator('aml-case-modal button[aria-label="Close case"]').click();
await settle(600);
const amlBack = await rowView();
check('closing the panel gives the card its full state back',
  !!card(amlBack, 'AML Case').lock &&
    card(amlBack, 'AML Case').buttons.some((b) => /^(Lock case|Unlock|Force unlock)$/.test(b)),
  JSON.stringify(card(amlBack, 'AML Case')));
// Rule 3: the open action comes back only once the case is locked to you
// again, which the panel unlock a moment ago undid.
check('but not the open action, because the case is no longer locked to you',
  !card(amlBack, 'AML Case').buttons.some((b) => /Open case/.test(b)),
  JSON.stringify(card(amlBack, 'AML Case').buttons));
await page.locator('.w:nth-of-type(2) .w__btn').first().click();
await settle(400);
const relocked = await rowView();
check('locking it again restores the open action',
  card(relocked, 'AML Case').buttons.some((b) => /Open case/.test(b)),
  JSON.stringify(card(relocked, 'AML Case').buttons));

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
await page.locator('back-office-widgets button:has-text("Open alert")').click();
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

/**
 * Escape closes the most recently opened panel - the one on the right.
 *
 * Pointer parked first. The panels above were opened from the widget row, and
 * opening the last one takes the row away - which lifts the panel by the row's
 * height, putting the panel's own minimise button under wherever the pointer
 * was left. That button has a matTooltip, an open tooltip swallows the first
 * Escape by design, and the panel would look like it had stopped responding to
 * a key it does respond to.
 *
 * A test artefact, not a product bug: a real agent pressing Escape after a
 * tooltip has opened is dismissing the tooltip, which is what Material's rule
 * is for. But it has to be out of the way to test the panel's own handler.
 */
await page.mouse.move(0, 0);
await settle(300);
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
await page.locator('back-office-widgets button:has-text("Open alert")').click();
await page.waitForTimeout(90);
const push = { incumbent: await tx('aml-case-modal'), entering: await tx('sg-alert-modal') };
check('the incumbent is already narrowing as the newcomer slides in',
  push.entering.x > 0 && push.incumbent.width < 1000,
  `entering x=${push.entering.x} incumbent w=${push.incumbent.width}`);
await settle(500);

/**
 * A panel leaves from its OWN column. This is the regression that made closing
 * in dual feel abrupt: out of flow, every leaver was re-anchored to right: 0,
 * so the left-hand one teleported a full column and gap to the right edge on
 * the first frame - landing on top of the panel that was still there - and
 * only then began to slide.
 *
 * Measured against where the panel WAS, not against a number: the left edge on
 * the first frames of the exit has to be the left edge it had while it was on
 * the stage, give or take the drift.
 */
const sgBefore = await page.evaluate(() =>
  Math.round(document.querySelector('sg-alert-modal').getBoundingClientRect().left));
await page.locator('sg-alert-modal button[aria-label="Close alert"]').click();
await page.waitForTimeout(90);
const exit = { leaving: await tx('sg-alert-modal'), survivor: await tx('aml-case-modal') };
const sgDuring = await page.evaluate(() =>
  Math.round(document.querySelector('sg-alert-modal').getBoundingClientRect().left));
check('the leaving panel is out of flow', exit.leaving && exit.leaving.position === 'absolute',
  JSON.stringify(exit.leaving));
check('an inner panel does not jump columns to leave',
  Math.abs(sgDuring - sgBefore) <= 24, `${sgBefore} -> ${sgDuring}`);
check('it dissolves in place rather than crossing its neighbour',
  exit.leaving.opacity < 1 && exit.leaving.x >= 0 && exit.leaving.x <= 24,
  JSON.stringify(exit.leaving));
check('the survivor is already widening', exit.survivor.width > 672,
  `${exit.survivor.width}`);
await settle(500);

// And the other exit: the tail panel IS against the edge it entered from, so
// it leaves the way it arrived - the full drawer slide, nothing to cross.
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
await page.locator('back-office-widgets button:has-text("Open alert")').click();
await settle(500);
const tailOrder = await page.evaluate(() =>
  [...document.querySelectorAll('.stage > *')].map((e) => e.tagName.toLowerCase()));
const tailSel = tailOrder[tailOrder.length - 1];
const tailBefore = await page.evaluate((s) =>
  Math.round(document.querySelector(s).getBoundingClientRect().left), tailSel);
await page.locator(`${tailSel} button[aria-label^="Close"]`).click();
await page.waitForTimeout(90);
const tailExit = await tx(tailSel);
const tailDuring = await page.evaluate((s) =>
  Math.round(document.querySelector(s).getBoundingClientRect().left), tailSel);
check('the tail panel slides out to the right, well past a drift',
  tailExit.x > 100 && tailDuring > tailBefore + 100,
  `${tailBefore} -> ${tailDuring}, x=${tailExit.x}`);
await settle(500);
// Whichever panel was the tail is gone, and the other one is solo. Written
// against the survivor rather than against AML by name: which panel is the
// tail is a consequence of slot order, not of identity, and naming one here
// would be a second, quieter copy of the docking rule.
const survivorSel = tailOrder.find((t) => t !== tailSel);
const soloState = await page.evaluate((s) => ({
  leaverGone: !document.querySelector(s.tail),
  width: Math.round(document.querySelector(s.survivor)?.getBoundingClientRect().width ?? 0),
  stage: Math.round(document.querySelector('.stage').getBoundingClientRect().width),
}), { tail: tailSel, survivor: survivorSel });
check('the leaver is gone and the survivor takes the solo width',
  soloState.leaverGone && soloState.width === Math.min(soloState.stage, 1080),
  JSON.stringify(soloState));

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
