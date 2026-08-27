import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Force unlock, from BOTH places it is offered.
 *
 * The widget's button and the panel band's button are different components in
 * different states of the workspace - the widget only shows its actions while
 * the panel is CLOSED - so proving one says nothing about the other. That
 * asymmetry is exactly what hid the original bug: the dialog was hosted inside
 * the panel, so the widget's button set the signal and rendered nothing.
 */
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core'), 'utf8');

const BASE = process.env.BASE ?? 'http://localhost:4200';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};

const widgetBtn = 'back-office-widgets .w__btn--danger';
const dialog = 'confirm-unlock-dialog';

/**
 * 00b is the locked-to-other state, and every scenario opens the panel. The
 * widget shows its actions only while the panel is CLOSED, so reaching the
 * widget's Force unlock means closing the panel first - which is precisely the
 * configuration the dialog used to be unreachable in, because it was hosted
 * inside the panel that had just been closed.
 *
 * 00b also seeds the dialog already open, so it is dismissed on the way past:
 * every check below has to be earned by a click, not inherited from the seed.
 */
const go = async (state) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  // attached, not visible: the row's host is display: none whenever every
  // card on it has had its panel opened, which is most seeded states. The
  // component is always in the DOM; what it renders is the variable.
  await page.waitForSelector('back-office-widgets', { state: 'attached' });
  await page.waitForTimeout(350);
  if (await page.locator(dialog).count()) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }
};

const closePanel = async () => {
  await page.locator('case-header button[aria-label="Close case"]').click();
  await page.locator('aml-case-modal').waitFor({ state: 'detached' });
  await page.waitForTimeout(250);
};

console.log('\nthe widget button opens the dialog (00b, panel closed)');
await go('00b');
await closePanel();
check('the widget offers Force unlock', await page.locator(widgetBtn).count().then((n) => n === 1));
check('the panel is closed, so it cannot be hosting the dialog',
  await page.locator('aml-case-modal').count().then((n) => n === 0));
check('no dialog before the click', await page.locator(dialog).count().then((n) => n === 0));
await page.locator(widgetBtn).click();
await page.waitForTimeout(350);
check('the dialog opened', await page.locator(dialog).count().then((n) => n === 1));

console.log('\nit names the owner, when the lock was taken, and the consequence');
const body = await page.locator(`${dialog} .lead, ${dialog} .danger-note`).allInnerTexts();
const text = body.join(' ').replace(/\s+/g, ' ');
check('names the lock owner', /M\. Torres/.test(text), text);
check('says how long they have held it', /has held the lock since \S/.test(text), text);
/**
 * The lead is the FACT only - who holds it, since when - and stops there.
 *
 * Read on its own, not off the joined lead-plus-note above: the consequence
 * belongs to the red note, so a test that lets the two run together cannot
 * tell which of them is carrying what. The lead used to end "and may be mid
 * investigation", making the note's case first and more weakly.
 */
const lead = (await page.locator(`${dialog} .lead`).innerText()).replace(/\s+/g, ' ').trim();
check('the lead states the fact and stops',
  /^M\. Torres has held the lock since .+\.$/.test(lead) && !/mid investigation/i.test(lead),
  lead);
check(
  'states the consequence',
  /Unlocking removes their lock and interrupts any action they.{0,3}re recording/.test(text),
  text,
);

console.log('\nCancel and a red confirm, with focus on Cancel');
check(
  'Cancel is present',
  await page.locator(`${dialog} button.cancel`).innerText().then((t) => t.trim() === 'Cancel'),
);
check(
  'the confirm says Unlock case, not Confirm',
  await page
    .locator(`${dialog} button.danger-button-filled`)
    .innerText()
    .then((t) => t.trim() === 'Unlock case'),
);
check(
  'the confirm is actually red',
  await page.evaluate(() => {
    const b = document.querySelector('confirm-unlock-dialog button.danger-button-filled');
    const bg = getComputedStyle(b).backgroundColor;
    const [r, g, bl] = bg.match(/\d+/g).map(Number);
    return r > 120 && r > g * 2 && r > bl * 2;
  }),
);
check(
  'initial focus is Cancel, not the confirm',
  await page.evaluate(() => document.activeElement?.matches('button.cancel')),
);

console.log('\nCancel changes nothing');
await page.locator(`${dialog} button.cancel`).click();
await page.waitForTimeout(300);
check('dialog closed', await page.locator(dialog).count().then((n) => n === 0));
check('still locked to the other agent', await page.locator(widgetBtn).count().then((n) => n === 1));

console.log('\nconfirming unlocks, and does NOT take the lock');
await page.locator(widgetBtn).click();
await page.waitForTimeout(300);
await page.locator(`${dialog} button.danger-button-filled`).click();
await page.waitForTimeout(400);
check('dialog closed', await page.locator(dialog).count().then((n) => n === 0));
check(
  'the widget returns to its unlocked state, offering Lock case',
  await page
    .locator('back-office-widgets .w__btn')
    .allInnerTexts()
    .then((t) => t.map((s) => s.trim()).join('|') === 'Lock case'),
);
check(
  'no Force unlock left',
  await page.locator(widgetBtn).count().then((n) => n === 0),
);
check(
  'the case is NOT locked to me - that is a separate deliberate act',
  await page.evaluate(() => {
    const chip = document.querySelector('back-office-widgets .w__lock');
    // Either no lock chip at all, or one that does not claim the lock is mine.
    return !chip || !/locked to you/i.test(chip.textContent);
  }),
);

check(
  'the lock chip reads Not locked',
  await page
    .locator('back-office-widgets .w__lock')
    .innerText()
    .then((t) => /not locked/i.test(t)),
);

// No closePanel() this time: 00b already opens the panel, which is the state
// the lock band lives in.
console.log('\nthe same button in the panel lock band');
await go('00b');
const bandBtn = page.locator('case-header button', { hasText: 'Force unlock' });
check('the band offers Force unlock', await bandBtn.count().then((n) => n === 1));
await bandBtn.click();
await page.waitForTimeout(350);
check('it opens the same dialog', await page.locator(dialog).count().then((n) => n === 1));
check(
  'focus is Cancel here too',
  await page.evaluate(() => document.activeElement?.matches('button.cancel')),
);
await page.locator(`${dialog} button.danger-button-filled`).click();
await page.waitForTimeout(400);
check('dialog closed', await page.locator(dialog).count().then((n) => n === 0));
check(
  'the band now offers Lock to me, not Force unlock',
  await page.evaluate(() => {
    const t = document.querySelector('case-header')?.textContent ?? '';
    return /lock to me/i.test(t) && !/force unlock/i.test(t);
  }),
  (await page.locator('case-header').innerText()).replace(/\s+/g, ' ').slice(0, 160),
);
// The panel survives the unlock, so the Timeline is right here to read - it
// just lives behind its own tab.
console.log('\nand it is written to the timeline');
await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
await page.waitForTimeout(350);
check(
  'a force-release event naming the previous owner',
  await page
    .locator('player-info-panel .timeline__what')
    .allInnerTexts()
    .then((rows) => rows.some((t) => t.includes('force-released') && t.includes('M. Torres'))),
);

console.log('\nthe widget button is demoted at rest, danger on intent');
await go('00b');
await closePanel();
// Rest means REST: pointer off the button. Closing the panel is what puts the
// row on screen, and the panel's header X sits where the row then appears - so
// the pointer Playwright leaves at the click point lands on the widget, and
// what got measured was the hover state. Nothing about the button changed; the
// panel simply starts higher now that no row is above it.
await page.mouse.move(0, 0);
await page.waitForTimeout(150);

// The claim is "this button rests on --ink", so --ink is what it is compared
// against - resolved from the page, not spelled out again here. Written out as
// a hex it was a second copy of the token, and it broke the moment --ink was
// darkened, reporting a palette change as a regression in this button.
const rest = await page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--ink)';
  document.body.appendChild(probe);
  const ink = getComputedStyle(probe).color;
  probe.remove();
  const btn = document.querySelector('back-office-widgets .w__btn--danger');
  const s = getComputedStyle(btn);
  return {
    ink,
    bg: s.backgroundColor,
    color: s.color,
    borderColor: s.borderTopColor,
    icon: getComputedStyle(btn.querySelector('mat-icon')).color,
  };
});
check('rest background is the tertiary grey', rest.bg === 'rgb(244, 244, 245)', rest.bg);
check('rest text is --ink, not danger', rest.color === rest.ink, `${rest.color} vs ${rest.ink}`);
check('no visible border', rest.borderColor === 'rgba(0, 0, 0, 0)', rest.borderColor);
check('the icon takes the text colour too', rest.icon === rest.ink, `${rest.icon} vs ${rest.ink}`);
check(
  'it still has the same height as the buttons beside it',
  await page.evaluate(() => {
    const all = [...document.querySelectorAll('back-office-widgets .w__btn')];
    return new Set(all.map((b) => Math.round(b.getBoundingClientRect().height))).size === 1;
  }),
);

await page.locator(widgetBtn).hover();
await page.waitForTimeout(200);
const hover = await page.evaluate(() => {
  const s = getComputedStyle(document.querySelector('back-office-widgets .w__btn--danger'));
  return { bg: s.backgroundColor, color: s.color };
});
check('hover takes the danger colour', hover.color === 'rgb(185, 28, 28)', hover.color);
check('hover takes a danger-tinted background', hover.bg === 'rgb(254, 242, 242)', hover.bg);

// Focus by keyboard, so :focus-visible actually applies.
await page.locator(widgetBtn).evaluate((el) => el.blur());
await page.keyboard.press('Tab');
await page.locator(widgetBtn).focus();
await page.keyboard.press('Shift+Tab');
await page.keyboard.press('Tab');
const focus = await page.evaluate(() => {
  const el = document.querySelector('back-office-widgets .w__btn--danger');
  const s = getComputedStyle(el);
  return {
    focused: document.activeElement === el,
    bg: s.backgroundColor,
    color: s.color,
    outlineWidth: s.outlineWidth,
    outlineStyle: s.outlineStyle,
  };
});
check('the button is the focused element', focus.focused, JSON.stringify(focus));
check('focus takes the danger colour', focus.color === 'rgb(185, 28, 28)', focus.color);
check('focus takes the danger-tinted background', focus.bg === 'rgb(254, 242, 242)', focus.bg);
check(
  'focus adds a ring',
  focus.outlineStyle === 'solid' && parseFloat(focus.outlineWidth) >= 2,
  `${focus.outlineStyle} ${focus.outlineWidth}`,
);

console.log('\nit is a visible button, not hidden behind an overflow menu');
check(
  'no menu trigger stands between the row and the action',
  await page.evaluate(() => {
    const btn = document.querySelector('back-office-widgets .w__btn--danger');
    const r = btn.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(btn).visibility === 'visible';
  }),
);

console.log('\naxe-core over the open dialog, WCAG 2.1 A and AA');
await page.locator(widgetBtn).click();
await page.waitForTimeout(350);
await page.evaluate(AXE);
const res = await page.evaluate(async () =>
  window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  }),
);
const real = res.violations.filter((v) => v.id !== 'region');
check('no violations', real.length === 0, real.map((v) => `${v.id} (${v.nodes.length})`).join(', '));

console.log(`\npage errors: ${pageErrors.length}`);
pageErrors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 160)));

await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed || pageErrors.length ? 1 : 0);
