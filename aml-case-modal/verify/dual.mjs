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
  if ((await aml().count()) === 1) {
    await page.locator('back-office-widgets button:has-text("Close case")').click();
    await settle();
  }
  if ((await sg().count()) === 1) {
    await page.locator('back-office-widgets button:has-text("Close alert")').click();
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
await page.locator('back-office-widgets button:has-text("Open alert")').click();
await settle();
const sgBox2 = await sg().boundingBox();
const amlBox2 = await aml().boundingBox();
check('AML opened first sits left of SG', amlBox2.x < sgBox2.x,
  `aml ${Math.round(amlBox2.x)} vs sg ${Math.round(sgBox2.x)}`);
check('the DOM order is the dock order', await page.evaluate(() =>
  [...document.querySelectorAll('.stage > *')].map((e) => e.tagName.toLowerCase())
    .join() === 'aml-case-modal,sg-alert-modal'));

console.log('\nA solo panel docks right, not centre');
await fresh();
await page.locator('back-office-widgets button:has-text("Open case")').click();
await settle();
const solo = await page.evaluate(() => {
  const stage = document.querySelector('.stage').getBoundingClientRect();
  const modal = document.querySelector('aml-case-modal').getBoundingClientRect();
  return { rightInset: Math.round(stage.right - modal.right), leftGap: Math.round(modal.left - stage.left) };
});
check('flush to the right edge of the stage', solo.rightInset === 0, `${solo.rightInset}px`);
check('and the room it does not use is on the left', solo.leftGap > 0, `${solo.leftGap}px`);

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
await fresh('01');
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
check('the leaver is gone and the survivor is full width',
  (await sg().count()) === 0 && (await widthOf(aml())) === 1000);

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
