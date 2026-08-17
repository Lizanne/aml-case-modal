import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Accessibility suite.
 *
 * Two halves, because they catch different things:
 *   1. axe-core over every state - catches contrast, roles, landmarks,
 *      names, heading order.
 *   2. real keyboard interaction - axe cannot tell you whether Escape closes
 *      a dialog, whether focus is trapped, or whether it comes back afterwards.
 */
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core'), 'utf8');

const BASE = process.env.BASE ?? 'http://localhost:4200';
const STATES = ['00a', '00b', '01', '02', '02b', '03', '04', '05', '06', '07', '08', '09', '10', '11'];

// Angular CDK appends its overlay container to <body>, outside any landmark.
// Framework artifact, best-practice tier, not a WCAG A/AA failure - the menu
// inside it carries correct menu/menuitem roles.
const KNOWN = new Set(['region']);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};
const go = async (state) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('aml-case-modal');
  await page.waitForTimeout(350);
};

console.log('\naxe-core, WCAG 2.1 A and AA, every state');
const found = new Map();
for (const state of STATES) {
  await go(state);
  await page.evaluate(AXE);
  const res = await page.evaluate(async () =>
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }),
  );
  const real = res.violations.filter((v) => !KNOWN.has(v.id));
  check(
    `${state}: no WCAG A/AA violations`,
    real.length === 0,
    real.map((v) => `${v.id} (${v.nodes.length})`).join(', '),
  );
  real.forEach((v) => found.set(v.id, v.help));
}
if (found.size) [...found].forEach(([id, help]) => console.log(`       ${id}: ${help}`));

console.log('\nEvery interactive control has an accessible name');
await go('03');
const unnamed = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll('button, [role="button"], a[href], input, select')) {
    if (el.closest('[aria-hidden="true"]')) continue;
    const name =
      el.getAttribute('aria-label') ||
      el.getAttribute('title') ||
      (el.getAttribute('aria-labelledby') &&
        document.getElementById(el.getAttribute('aria-labelledby'))?.textContent) ||
      el.textContent.trim();
    if (!name) out.push(el.tagName.toLowerCase() + '.' + (el.className || '').toString().split(' ')[0]);
  }
  return out;
});
check('no unnamed controls', unnamed.length === 0, unnamed.join(', '));

console.log('\nKeyboard: the workflow is reachable and operable');
await go('01');
// Tab from the top and confirm the skip link is the first stop.
await page.keyboard.press('Tab');
check(
  'first Tab reaches the skip link',
  await page.evaluate(() => document.activeElement?.classList.contains('skip-link')),
);
const reachable = await page.evaluate(() => {
  const sel =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null).length;
});
check('a focusable path exists through the page', reachable > 10, String(reachable));

// The trigger control is a real button, so Enter and Space must both work.
await go('01');
await page.locator('trigger-strip .strip__toggle').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('Enter expands the trigger strip', (await page.locator('trigger-strip .trigger').count()) > 2);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
check('Space collapses it again', (await page.locator('trigger-strip .trigger').count()) === 2);

console.log('\nKeyboard: the scrollable trigger list is reachable');
await go('10');
const scrollable = await page.evaluate(() => {
  const el = document.querySelector('trigger-strip .strip__list');
  return { scrolls: el.scrollHeight > el.clientHeight + 1, tabindex: el.getAttribute('tabindex') };
});
check('the list actually scrolls', scrollable.scrolls);
check('and is focusable when it does', scrollable.tabindex === '0');

console.log('\nKeyboard: dialogs trap, dismiss and return focus');
for (const [state, selector] of [
  ['05', 'severity-dialog'],
  ['06', 'decision-dialog'],
  ['00b', 'confirm-unlock-dialog'],
]) {
  await go(state);
  check(`${selector}: is labelled by its heading`, await page.evaluate((s) => {
    const d = document.querySelector(`${s} [role="dialog"]`);
    const id = d?.getAttribute('aria-labelledby');
    return !!id && !!document.getElementById(id)?.textContent.trim();
  }, selector));
  check(`${selector}: focus starts inside it`, await page.evaluate((s) => {
    const d = document.querySelector(`${s} [role="dialog"]`);
    return !!d && d.contains(document.activeElement);
  }, selector));
  // Tab right round the dialog: focus must never escape it.
  let escaped = false;
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press('Tab');
    const inside = await page.evaluate((s) => {
      const d = document.querySelector(`${s} [role="dialog"]`);
      return !!d && d.contains(document.activeElement);
    }, selector);
    if (!inside) { escaped = true; break; }
  }
  check(`${selector}: focus is trapped (aria-modal is honest)`, !escaped);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(`${selector}: Escape dismisses it`, (await page.locator(selector).count()) === 0);
}

console.log('\nKeyboard: dialog focus returns to whatever opened it');
await go('03');
await page.locator('.footer button:has-text("Adjust severity")').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(350);
check('the dialog opened from the keyboard', (await page.locator('severity-dialog').count()) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(350);
check('focus returns to the Adjust severity button', await page.evaluate(() =>
  (document.activeElement?.textContent || '').includes('Adjust severity'),
));

console.log('\nDynamic state is announced');
await go('01');
check('required chips are a status region', await page.evaluate(() => {
  const el = document.querySelector('required-chips [role="status"]');
  return !!el;
}));
await go('02');
check('attachment errors are announced without breaking list semantics', await page.evaluate(() => {
  const ul = document.querySelector('record-form .errors');
  return (
    !!ul &&
    ul.tagName === 'UL' &&
    ul.getAttribute('aria-live') === 'assertive' &&
    ul.getAttribute('role') !== 'alert' &&
    [...ul.children].every((li) => li.tagName === 'LI')
  );
}));

console.log(`\npage errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 3).forEach((e) => console.log(`  ! ${e.slice(0, 160)}`));

await browser.close();
console.log(
  failed === 0 && consoleErrors.length === 0
    ? '\nAll accessibility checks pass.'
    : `\n${failed} check(s) failed.`,
);
process.exit(failed === 0 && consoleErrors.length === 0 ? 0 : 1);
