import { chromium } from 'playwright';

/**
 * The widget row's one rule: while a panel is open, its widget has NO action
 * buttons. Identity and lock status only, in every state, dual included.
 *
 * Written as a sweep over every scenario rather than a few chosen ones,
 * because the rule's whole value is that it has no exceptions - and the
 * previous version of it was lost precisely by carving one out for dual.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const STATES = ['00a', '00b', '01', '02', '02b', '03', '04', '05', '06', '07', '08', '09', '10', '11'];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};

const go = async (state) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  // attached, not visible: the row's host is display: none whenever every
  // card on it has had its panel opened, which is most seeded states. The
  // component is always in the DOM; what it renders is the variable.
  await page.waitForSelector('back-office-widgets', { state: 'attached' });
  await page.waitForTimeout(350);
};

/**
 * Button labels, with the icon dropped.
 *
 * innerText includes a mat-icon's ligature name - "open_in_new\nOpen case" -
 * so the visible label is the last line, not the whole string.
 */
const widgetButtons = () =>
  page
    .locator('back-office-widgets .w__actions button')
    .allInnerTexts()
    .then((all) =>
      all
        .map((s) => s.trim().split('\n').pop().trim())
        .filter(Boolean),
    );

console.log('\nno action buttons on a widget whose panel is open - every state');
for (const state of STATES) {
  await go(state);
  const openPanels = await page.locator('aml-case-modal, sg-alert-modal').count();
  const buttons = await widgetButtons();
  // With a panel open the row may still carry the OTHER card's buttons, so
  // this asserts the strong form only when every card on the row is open.
  check(
    `${state}: ${openPanels} panel(s) open -> ${buttons.length} widget button(s)`,
    openPanels === 0 || buttons.length === 0,
    buttons.join(' / '),
  );
}

console.log('\nnothing named Close survives on the row');
for (const state of STATES) {
  await go(state);
  const buttons = await widgetButtons();
  check(
    `${state}: no Close alert / Close case`,
    !buttons.some((t) => /^close/i.test(t)),
    buttons.join(' / '),
  );
}

console.log('\ndual: two panels, two Xs, and no row at all');
await go('09');
check('two panels are up', await page.locator('aml-case-modal, sg-alert-modal').count().then((n) => n === 2));
// Both cards are hidden by their own panels, so there is no row left to carry
// anything. Asserted as "no cards", not "no buttons": a row of button-less
// cards would also satisfy the button count and is exactly what this replaced.
check('neither widget card renders', await page.locator('back-office-widgets .w').count().then((n) => n === 0));
check('so the row itself is gone',
  await page.locator('back-office-widgets').evaluate((e) => getComputedStyle(e).display).then((d) => d === 'none'));
check(
  'each panel carries its own close X',
  await page.evaluate(() => {
    const aml = document.querySelector('aml-case-modal [aria-label="Close case"]');
    const sg = document.querySelector('sg-alert-modal [aria-label="Close alert"], sg-alert-modal [aria-label="Close"]');
    return !!aml && !!sg;
  }),
);
// The rule is only safe if those Xs actually work - otherwise removing the
// widget's Close would have left the dual state with no way out.
await page.locator('aml-case-modal [aria-label="Close case"]').click();
await page.waitForTimeout(600);
check('the AML X closes the AML panel', await page.locator('aml-case-modal').count().then((n) => n === 0));
check('and leaves the other one alone', await page.locator('sg-alert-modal').count().then((n) => n === 1));

/**
 * NOT identity-only - nothing at all.
 *
 * This block used to assert that a card whose panel is open kept its icon,
 * name, badge and meta line while losing its lock line and its buttons. That
 * reduced card is gone: an open panel already carries all four of those, a few
 * hundred pixels below, so what was left on the row was a second statement of
 * the panel's own identity. The card is withheld outright instead.
 *
 * So the sweep below asserts absence, per state and per item. It is keyed on
 * the card COUNT rather than on any one part of it, because the parts are what
 * the old rule kept and a check on those would pass on a card that should not
 * be there at all.
 */
console.log('\nno card at all for a panel that is open - every state');
for (const state of STATES) {
  await go(state);
  const seen = await page.evaluate(() => ({
    open: [...document.querySelectorAll('aml-case-modal, sg-alert-modal')]
      .map((e) => (e.tagName === 'AML-CASE-MODAL' ? 'AML Case' : 'SG Alerts')),
    cards: [...document.querySelectorAll('back-office-widgets .w__name')].map((e) => e.textContent.trim()),
  }));
  check(
    `${state}: open [${seen.open}] -> cards [${seen.cards}]`,
    seen.open.every((name) => !seen.cards.includes(name)),
  );
  // And nothing partial: whatever cards remain are whole ones.
  const parts = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('back-office-widgets .w')];
    return cards.map((c) => !!c.querySelector('.w__actions'));
  });
  check(`${state}: every card on the row is a full one`, parts.every(Boolean), JSON.stringify(parts));
}

console.log('\nand the lock line comes back when the panel is closed');
await go('00a');
await page.locator('case-header button[aria-label="Close case"]').click();
await page.locator('aml-case-modal').waitFor({ state: 'detached' });
await page.waitForTimeout(300);
check('lock line is back', await page.locator('back-office-widgets .w__lock').count().then((n) => n === 1));
check(
  'and it reads the current lock state',
  await page.locator('back-office-widgets .w__lock').innerText().then((t) => /not locked/i.test(t)),
);

console.log('\nthe buttons come back when the panel is closed');
await go('00a');
await page.locator('case-header button[aria-label="Close case"]').click();
await page.locator('aml-case-modal').waitFor({ state: 'detached' });
await page.waitForTimeout(300);
const unlockedButtons = await widgetButtons();
check('unlocked and closed: exactly one button', unlockedButtons.length === 1, unlockedButtons.join(' / '));
check('and it says Lock case, not Lock', unlockedButtons[0] === 'Lock case', unlockedButtons[0]);

console.log('\nLock case is the same blue as the panel band button');
// Measured against the real thing rather than against a hex literal: the point
// is that the two agree, not what they agree on.
await go('00a');
const modalStyle = await page.evaluate(() => {
  const b = [...document.querySelectorAll('case-header button')].find((e) => /lock to me/i.test(e.textContent));
  const s = getComputedStyle(b);
  return { bg: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius, h: Math.round(b.getBoundingClientRect().height) };
});
await page.locator('case-header button[aria-label="Close case"]').click();
await page.locator('aml-case-modal').waitFor({ state: 'detached' });
// Off the button before reading its colours. The row appears where the panel
// header just was - the panel starts higher now that no row sits above it - so
// the pointer left at the click point lands on the widget, and both buttons
// below would be measured in their hover state.
await page.mouse.move(0, 0);
await page.waitForTimeout(300);
const widgetStyle = await page.evaluate(() => {
  const b = document.querySelector('back-office-widgets .w__btn--primary');
  const s = getComputedStyle(b);
  return { bg: s.backgroundColor, color: s.color, radius: s.borderTopLeftRadius, h: Math.round(b.getBoundingClientRect().height) };
});
check('same background blue', modalStyle.bg === widgetStyle.bg, `${modalStyle.bg} vs ${widgetStyle.bg}`);
check('same label colour', modalStyle.color === widgetStyle.color, `${modalStyle.color} vs ${widgetStyle.color}`);
check('same corner radius', modalStyle.radius === widgetStyle.radius, `${modalStyle.radius} vs ${widgetStyle.radius}`);
check('same height', modalStyle.h === widgetStyle.h, `${modalStyle.h} vs ${widgetStyle.h}`);
check('it is actually blue, not grey', /^rgb\(2[0-9], 1[0-9]{2}, 2[0-9]{2}\)$/.test(widgetStyle.bg), widgetStyle.bg);

console.log('\nLock case still locks');
await page.locator('back-office-widgets .w__btn--primary').click();
await page.waitForTimeout(400);
check(
  'the lock chip now says locked to you',
  await page.locator('back-office-widgets .w__lock').innerText().then((t) => /locked to you/i.test(t)),
);
check(
  'and the row now offers Unlock and Open case',
  await widgetButtons().then((b) => b.join('|') === 'Unlock|Open case'),
  (await widgetButtons()).join(' / '),
);

console.log(`\npage errors: ${pageErrors.length}`);
pageErrors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 160)));

await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed || pageErrors.length ? 1 : 0);
