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

/**
 * The trigger control is a real button, so Enter and Space must both work.
 *
 * It is the divider INSIDE the list now, not a verb in the header - the header
 * carries a count and nothing pressable. Same element type, same keys; only
 * where it lives changed.
 *
 * Measured by aria-expanded AND the height of the window. The row count alone
 * would do it now - collapsed renders exactly two - but the window is the
 * property that matters: expanded holds every trigger in the DOM and shows
 * five, and it is the showing-five that keeps the workflow on screen.
 */
await go('01');
const stripState = () =>
  page.evaluate(() => {
    const el = document.querySelector('trigger-strip .strip__list');
    // The row height, in BOTH layouts. .trigger is display: contents in the
    // three-column grid so it has no box to measure, and .cell is one LINE
    // rather than one row once the layout stacks - so neither works on its
    // own. scrollHeight over the row count is the average row: the same
    // number in the grid, and the honest one when a stacked row wraps.
    const rows = document.querySelectorAll('trigger-strip .trigger').length;
    const row = el.scrollHeight / rows;
    return {
      expanded: document.querySelector('trigger-strip .strip__gap').getAttribute('aria-expanded'),
      rowsVisible: Math.round(el.clientHeight / row),
    };
  });
await page.locator('trigger-strip .strip__gap').focus();
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
const afterEnter = await stripState();
check(
  'Enter expands the trigger strip',
  afterEnter.expanded === 'true' && afterEnter.rowsVisible === 5,
  JSON.stringify(afterEnter),
);
await page.keyboard.press('Space');
await page.waitForTimeout(300);
const afterSpace = await stripState();
check(
  'Space collapses it again',
  afterSpace.expanded === 'false' && afterSpace.rowsVisible === 2,
  JSON.stringify(afterSpace),
);

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
// The visible chip carries no state word - the icon and colour do that, and the
// icon is aria-hidden. So the accessible name is the ONLY thing telling a
// screen reader whether an action is done; it must name the state explicitly.
check('each chip states its own status in its accessible name', await page.evaluate(() => {
  const chips = [...document.querySelectorAll('required-chips ui-pill')];
  return (
    chips.length > 0 &&
    chips.every((c) => /: (pending|done)$/.test(c.getAttribute('aria-label') || '')) &&
    chips.every((c) => !/pending|done/i.test(c.textContent))
  );
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

console.log('\nRequired fields say so programmatically, not just visually');
// The visible "required" markers were removed. The fields are still required -
// Save stays disabled without them - so the requirement has to reach a screen
// reader some other way, or it reaches them not at all.
for (const [state, sel] of [
  ['02', 'record-form'],
  ['05', 'severity-dialog'],
  ['06', 'decision-dialog'],
]) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`${sel} textarea`, { timeout: 15000 });
  await page.waitForTimeout(400);
  const r = await page.evaluate((s) => {
    const host = document.querySelector(s);
    const areas = [...host.querySelectorAll('textarea')];
    return {
      allMarked: areas.length > 0 && areas.every((t) => t.getAttribute('aria-required') === 'true'),
      noVisibleMarker: ![...host.querySelectorAll('.field__label')].some((l) =>
        /\brequired\b/i.test(l.textContent),
      ),
    };
  }, sel);
  check(`${sel}: textarea is aria-required`, r.allMarked);
  check(`${sel}: no visible "required" marker on labels`, r.noVisibleMarker);
}

console.log('\nEvery tab stop paints a visible focus ring');
/**
 * Walked, not sampled. Material resets outline: none inside its own component
 * styles at a specificity a universal selector cannot reach, so mat-buttons,
 * tabs and button-toggles came up with no ring at all - invisible unless you
 * tab the whole page and read the computed style, which is what this does.
 */
const ringOf = () =>
  page.evaluate(() => {
    const a = document.activeElement;
    if (!a || a === document.body) return null;
    const cs = getComputedStyle(a);
    const rect = a.getBoundingClientRect();
    const caret = a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && a.type === 'text');
    const radio = a.closest('.mat-mdc-radio-button');
    return {
      key: `${a.tagName}.${typeof a.className === 'string' ? a.className.split(' ')[0] : ''}`,
      label: (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24),
      visible: rect.width > 0 && rect.height > 0,
      ringed:
        (parseFloat(cs.outlineWidth) > 0 && cs.outlineStyle !== 'none') ||
        cs.boxShadow !== 'none' ||
        caret ||
        !!(radio && getComputedStyle(radio).outlineStyle !== 'none'),
    };
  });
for (const state of ['01', '02', '05', '06', '09']) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('aml-case-modal, dialog-shell', { timeout: 15000 });
  await page.waitForTimeout(700);
  const seen = new Map();
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press('Tab');
    const r = await ringOf();
    if (r && !seen.has(r.key + r.label)) seen.set(r.key + r.label, r);
  }
  const stops = [...seen.values()].filter((r) => r.visible);
  const missing = stops.filter((r) => !r.ringed);
  check(`${state}: ${stops.length} tab stops, all with a focus ring`,
    stops.length > 0 && missing.length === 0,
    missing.map((m) => `${m.key} "${m.label}"`).join(', '));
}

console.log('\nDialogs: full-viewport scrim, inert, focus placed and trapped');
for (const [state, wantTag, wantLabel] of [
  ['06', 'TEXTAREA', null],
  ['05', 'INPUT', null],
  ['00b', 'BUTTON', 'Cancel'],
]) {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('dialog-shell .panel', { timeout: 15000 });
  await page.waitForTimeout(700);
  const d = await page.evaluate(() => {
    const host = document.querySelector('dialog-shell');
    const scrim = host.querySelector('.scrim').getBoundingClientRect();
    const a = document.activeElement;
    return {
      position: getComputedStyle(host).position,
      coversViewport:
        Math.round(scrim.width) === window.innerWidth &&
        Math.round(scrim.height) === window.innerHeight,
      activeTag: a.tagName,
      activeLabel: (a.textContent || '').replace(/\s+/g, ' ').trim(),
      inDialog: !!a.closest('dialog-shell'),
    };
  });
  check(`${state}: the scrim covers the whole viewport, not just the panel`,
    d.position === 'fixed' && d.coversViewport, `${d.position} ${d.coversViewport}`);
  check(`${state}: initial focus is the field, not the close button`,
    d.inDialog && d.activeTag === wantTag &&
      (wantLabel === null || d.activeLabel === wantLabel),
    `${d.activeTag} "${d.activeLabel}"`);

  // Clicking the scrim must not throw away a half-written note.
  await page.mouse.click(12, 12);
  await page.waitForTimeout(300);
  check(`${state}: clicking the scrim does not dismiss`,
    (await page.locator('dialog-shell').count()) === 1);

  let escaped = false;
  for (let i = 0; i < 25; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => !!document.activeElement.closest('dialog-shell')))) {
      escaped = true;
      break;
    }
  }
  check(`${state}: focus cannot leave the dialog`, !escaped);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(`${state}: Escape closes it`, (await page.locator('dialog-shell').count()) === 0);
}

console.log('\nNon-interactive content stays out of the tab order');
await page.goto(`${BASE}/?state=10`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('trigger-strip .trigger', { timeout: 15000 });
await page.waitForTimeout(600);
const offenders = await page.evaluate(() => {
  const bad = [];
  for (const sel of ['trigger-strip .trigger', 'trigger-strip .cell', 'ui-pill', '.timeline__item']) {
    for (const el of document.querySelectorAll(sel)) {
      const ti = el.getAttribute('tabindex');
      if (el.matches('button, a, input, select, textarea') || (ti !== null && ti !== '-1')) bad.push(sel);
    }
  }
  return [...new Set(bad)];
});
check('rows, cells and pills are content, not controls', offenders.length === 0,
  offenders.join(', '));

console.log('\nA full record-and-submit journey, keyboard only');
// BUTTONS matched on their own label: the dev switcher's <select> contains
// every state name, "02 - Record form open" among them, so a loose text match
// lands there and Enter does nothing.
const tabToButton = async (text, max = 80) => {
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate((t) => {
      const a = document.activeElement;
      if (!a || a.tagName !== 'BUTTON') return false;
      const label = (a.getAttribute('aria-label') || a.textContent || '').replace(/\s+/g, ' ').trim();
      return label === t || label.endsWith(t);
    }, text);
    if (hit) return true;
  }
  return false;
};
await page.goto(`${BASE}/?state=01`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('action-placeholder button', { timeout: 15000 });
await page.waitForTimeout(700);
check('Tab reaches Record', await tabToButton('Record'));
await page.keyboard.press('Enter');
await page.waitForTimeout(600);
check('Enter opens the form', (await page.locator('record-form form').count()) === 1);
let onTextarea = false;
for (let i = 0; i < 30 && !onTextarea; i++) {
  onTextarea = await page.evaluate(() => document.activeElement.tagName === 'TEXTAREA');
  if (!onTextarea) await page.keyboard.press('Tab');
}
check('Tab reaches the note', onTextarea);
await page.keyboard.type('Recorded entirely from the keyboard.');
let inRadios = false;
for (let i = 0; i < 25 && !inRadios; i++) {
  inRadios = await page.evaluate(() => !!document.activeElement.closest('mat-radio-group'));
  if (!inRadios) await page.keyboard.press('Tab');
}
check('Tab reaches the lock choice', inRadios);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(250);
check('arrow keys select within the radio group', await page.evaluate(() =>
  document.querySelectorAll('record-form .mat-mdc-radio-checked').length === 1));
check('Tab reaches Save', await tabToButton('Save outcome', 20));
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
check('Enter saves the outcome', (await page.locator('record-form form').count()) === 0);

await page.goto(`${BASE}/?state=03`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.footer button', { timeout: 15000 });
await page.waitForTimeout(700);
check('Tab reaches Submit decision', await tabToButton('Submit decision'));
await page.keyboard.press('Enter');
await page.waitForTimeout(700);
check('the decision dialog opens on the caret', await page.evaluate(() =>
  document.querySelector('decision-dialog') !== null && document.activeElement.tagName === 'TEXTAREA'));
await page.keyboard.type('Approved from the keyboard.');
check('Tab reaches the confirm', await tabToButton('Submit and resolve', 20));
await page.keyboard.press('Enter');
await page.waitForTimeout(800);
check('the case resolves without a mouse',
  (await page.locator('decision-dialog').count()) === 0 &&
    (await page.locator('case-header ui-pill[data-tone="success"]').count()) === 1);

console.log(`\npage errors: ${consoleErrors.length}`);
consoleErrors.slice(0, 3).forEach((e) => console.log(`  ! ${e.slice(0, 160)}`));

await browser.close();
console.log(
  failed === 0 && consoleErrors.length === 0
    ? '\nAll accessibility checks pass.'
    : `\n${failed} check(s) failed.`,
);
process.exit(failed === 0 && consoleErrors.length === 0 ? 0 : 1);
