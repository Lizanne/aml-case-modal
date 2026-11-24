import { chromium } from 'playwright';

/**
 * APP-17691: the AML dashboard in player details.
 *
 * Reached from Menu, SG / AML, AML Risks. The score-card's arithmetic has its
 * own test (verify/aml-risk.mjs); this is the screen: that the risk is on the
 * first view, that an override moves the total and says so, and that the
 * dashboard and the case panel never share the stage.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const SHOTS = process.env.SHOTS;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && pageErrors.push(m.text()));

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail !== undefined ? ` -> ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  if (!ok) failed++;
};
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

const dash = page.locator('aml-dashboard');
const panel = page.locator('aml-case-modal');
const dialog = page.locator('score-override-dialog');
const menuButton = page.locator('player-header .ph__action', { hasText: 'Menu' });
const text = (sel) => page.locator(sel).first().innerText();
const total = async () => Number(await text('aml-dashboard .risk__score'));
const row = (name) => page.locator('aml-dashboard .tbl--score tbody tr', { hasText: name }).first();

console.log('\nGetting there');
await page.goto(`${BASE}/?state=02`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
check('the dashboard is not on the page until it is asked for', (await dash.count()) === 0);
check('the case panel is up', (await panel.count()) === 1);
await menuButton.click();
await page.locator('player-menu').getByRole('button', { name: 'AML Risks' }).click();
await page.waitForTimeout(600);
check('Menu, AML Risks shows the dashboard', await dash.isVisible());
check('and the case panel steps down to its bar', (await panel.count()) === 0 && (await page.locator('minimised-bar').count()) === 1);
check('the URL says so', new URL(page.url()).searchParams.get('section') === 'aml-risks');
check('focus is in the dashboard', await page.evaluate(() => !!document.activeElement?.closest('aml-dashboard')));

console.log('\nFirst view (requirement 1)');
const first = await page.evaluate(() => {
  const r = (sel) => document.querySelector(sel)?.getBoundingClientRect();
  return { score: r('aml-dashboard .risk__score'), band: r('aml-dashboard .risk__band'), caseBox: r('aml-dashboard .case'), why: r('aml-dashboard .why'), h: innerHeight };
});
check('the rating, the score and the active case are above the fold',
  first.score.bottom < first.h && first.band.bottom < first.h && first.caseBox.bottom < first.h && first.why.bottom < first.h, first);
check('the active case is one line of text with one link, not a second Open case button',
  /^Active case #AML-1042 · \w+ · opened \d{2} \w{3} \d{4}$/.test((await text('aml-dashboard .case')).replace(/\s+/g, ' ').trim()) &&
  (await page.locator('aml-dashboard').getByRole('button', { name: 'Open case', exact: true }).count()) === 0);
check('the card says how far the next band is', (await text('aml-dashboard .risk__next')) === '250 points to Critical');

console.log('\nWhat is adding points');
const driverRows = (await page.locator('aml-dashboard .drivers li').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
check('the five biggest fields, biggest first, overrides marked', driverRows.length === 5 &&
  driverRows.join('|') === 'Linked account (similar details) 50|Occupation associated with risk Overridden 50|PAR link 50|High single deposit: £2,000 20|Stacking deposits 20', driverRows);
check('the sixth is counted, not listed', (await text('aml-dashboard .why__more')) === 'and 1 more in the score-card below');
await page.locator('aml-dashboard .drivers .text-btn', { hasText: 'PAR link' }).click();
await page.waitForTimeout(700);
const landed = await page.evaluate(() => {
  const row = document.getElementById('score-par-link').getBoundingClientRect();
  const box = document.querySelector('aml-dashboard').getBoundingClientRect();
  return { inView: row.top >= box.top && row.bottom <= box.bottom, focus: document.activeElement?.getAttribute('aria-label') };
});
check('a field in the list goes to its row, with focus on its Override', landed.inView && landed.focus === 'Override: PAR link', landed);
await dash.evaluate((el) => el.scrollTo(0, 0));
await page.waitForTimeout(200);
check('200 points is High risk', (await total()) === 200 && (await text('aml-dashboard .risk__band')) === 'High risk');
check('the four bands and their ranges are printed',
  (await page.locator('aml-dashboard .scale__key').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ')).join('|') ===
    'Low risk 0–74|Medium risk 75–124|High risk 125–449|Critical 450+');
const marker = await page.evaluate(() => {
  const m = document.querySelector('aml-dashboard .scale__marker').getBoundingClientRect();
  const seg = document.querySelector('aml-dashboard .scale__seg.is-current').getBoundingClientRect();
  return { x: m.left + m.width / 2, from: seg.left, to: seg.right, band: document.querySelector('aml-dashboard .scale__seg.is-current').dataset.band };
});
check('the marker sits inside the High band', marker.band === 'high' && marker.x >= marker.from && marker.x <= marker.to, marker);
check('the scale has one spoken sentence', ((await page.locator('aml-dashboard .scale').getAttribute('aria-label')) ?? '').startsWith('200 points, High risk.'));
const doc = page.locator('aml-dashboard .ad__doc');
check('the documentation link opens a new tab, safely',
  (await doc.getAttribute('target')) === '_blank' && ((await doc.getAttribute('rel')) ?? '').includes('noopener'));
check('there is a Create AML case button', (await page.getByRole('button', { name: 'Create AML case' }).count()) === 1);
await shot('dash-overview');

console.log('\nLayout');
const edges = await page.evaluate(() => {
  const r = (sel) => document.querySelector(sel).getBoundingClientRect();
  return {
    // The stage is the box the widget row and the panels share.
    widgets: Math.round(r('.stage').right),
    hero: r('aml-dashboard .hero'),
    rail: r('aml-dashboard .grid__side'),
    main: r('aml-dashboard .grid__main'),
  };
});
check('the dashboard runs to the page\'s right edge, where the widget row ends', Math.abs(edges.hero.right - edges.widgets) <= 1, edges);
check('the risk card spans the main column and the rail',
  Math.abs(edges.hero.left - edges.main.left) <= 1 && Math.abs(edges.hero.right - edges.rail.right) <= 1, edges);

console.log('\nEDD checkpoints');
check('the card keeps its three columns and gains Actions on crossing',
  (await page.locator('aml-dashboard .card').filter({ hasText: 'Next EDD checkpoints' }).locator('thead th').allInnerTexts()).slice(0, 4).join('|') ===
    'Checkpoint|Next threshold|Player position|Actions on crossing');
check('both checkpoints can be edited',
  (await page.getByRole('button', { name: 'Edit the lifetime deposits checkpoint' }).count()) === 1 &&
  (await page.getByRole('button', { name: 'Edit the lifetime net loss checkpoint' }).count()) === 1);

console.log('\nScore-card');
check('23 parameters in 6 sections',
  (await page.locator('aml-dashboard .tbl--score tbody tr:not(.band)').count()) === 23 &&
  (await page.locator('aml-dashboard .tbl--score tr.band').count()) === 6);
check('every parameter has an info button with a name',
  (await page.locator('aml-dashboard .tbl--score button.info[aria-label^="About "]').count()) === 23);
check('a zero says what it is a zero of', (await row('Domestic PEP').locator('.num').innerText()).replace(/\s+/g, '') === '0of75');
check('a met field shows its points and nothing else', (await row('PAR link').locator('.num').innerText()).trim() === '50');
const seeded = await row('Occupation associated with risk').innerText();
check('an overridden field says so, to what, for how long, by whom',
  /Overridden to 50 points until revoked by Amara Okafor/.test(seeded) && /Edit override/.test(seeded), seeded);
check('the foot total matches the head', (await text('aml-dashboard tfoot .sum')) === '200');
const sums = (await page.locator('aml-dashboard tr.band .num').allInnerTexts()).map(Number);
check('section subtotals add up to it', sums.reduce((a, b) => a + b, 0) === 200, sums);

console.log('\nOverride');
await row('Domestic PEP').getByRole('button', { name: /Override/ }).click();
await page.waitForTimeout(300);
check('Override opens the dialog', (await dialog.count()) === 1);
check('it opens on the opposite of the current result', await dialog.getByRole('radio', { name: '75 points' }).isChecked());
check('and on a number of days', await dialog.getByRole('radio', { name: 'For a number of days' }).isChecked());
const save = dialog.getByRole('button', { name: 'Save override' });
check('Save waits for a reason', await save.isDisabled());
await dialog.locator('textarea').fill('Customer disclosed a council seat on a call.');
check('then is available', await save.isEnabled());
await dialog.locator('.days__input').fill('0');
check('zero days is refused, with a message', (await save.isDisabled()) && (await dialog.locator('.days__error').count()) === 1);
await dialog.locator('.days__input').fill('14');
// The stepper arrows fire a native change, which used to bubble into the
// radio group and unset it - taking the field away mid-click.
await dialog.locator('.days__input').focus();
await page.keyboard.press('ArrowUp');
await dialog.locator('.days__input').dispatchEvent('change');
await page.waitForTimeout(100);
check('stepping the days keeps the field and its radio',
  (await dialog.locator('.days__input').count()) === 1 &&
  (await dialog.locator('.days__input').inputValue()) === '15' &&
  (await dialog.getByRole('radio', { name: 'For a number of days' }).isChecked()));
await dialog.locator('.days__input').fill('14');
await shot('dash-override-dialog');
await save.click();
await page.waitForTimeout(400);
check('saving closes the dialog', (await dialog.count()) === 0);
check('the total moves to 275', (await total()) === 275 && (await text('aml-dashboard tfoot .sum')) === '275');
const pep = await row('Domestic PEP').innerText();
check('the row shows the override and its end date', /Overridden to 75 points until \d{2} \w{3} \d{4} by Liz Fernandez/.test(pep), pep);
check('the newest event is the override',
  /^Domestic PEP overridden to 75 points, for 14 days: total 275/.test(await text('aml-dashboard .events__what')));

await row('Sanctioned individual').getByRole('button', { name: /Override/ }).click();
await dialog.locator('textarea').fill('Confirmed match after manual review.');
await dialog.getByRole('radio', { name: 'Until the override is revoked' }).check();
await dialog.getByRole('button', { name: 'Save override' }).click();
await page.waitForTimeout(400);
check('crossing 450 makes it Critical', (await total()) === 775 && (await text('aml-dashboard .risk__band')) === 'Critical');
check('and the rating change is logged as the system\'s', /^Risk rating changed from High risk to Critical/.test(await text('aml-dashboard .events__what')));
check('nothing is promised above Critical', (await page.locator('aml-dashboard .risk__next').count()) === 0);

await row('Sanctioned individual').getByRole('button', { name: /Edit override/ }).click();
await dialog.getByRole('button', { name: 'Revoke override' }).click();
await page.waitForTimeout(400);
check('revoking hands the field back to the system', (await total()) === 275 && /Not met/.test(await row('Sanctioned individual').innerText()));

await row('PAR link').getByRole('button', { name: /Override/ }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes the dialog and changes nothing', (await dialog.count()) === 0 && (await total()) === 275 && (await dash.isVisible()));

console.log('\nTabs');
await page.getByRole('tab', { name: /Case archive/ }).click();
await page.waitForTimeout(200);
check('the archive lists closed cases with the four columns',
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active thead th').allInnerTexts()).slice(0, 4).join('|') === 'Date opened|Opening trigger|Date closed|Severity' &&
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active tbody tr').count()) === 3);
check('the risk stays on screen above the tabs', await page.locator('aml-dashboard .risk__score').isVisible());
await shot('dash-archive');
await page.getByRole('tab', { name: 'Overview' }).click();
await page.getByRole('button', { name: 'View the full audit log' }).click();
await page.waitForTimeout(200);
check('the snippet leads to the full log', (await page.getByRole('tab', { name: 'Audit log' }).getAttribute('aria-selected')) === 'true');
check('which is what, when, who - every event',
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active thead th').allInnerTexts()).join('|') === 'When|What|Who' &&
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active tbody tr').count()) === 15);
await shot('dash-audit');

console.log('\nWith the case panel');
await page.getByRole('tab', { name: 'Overview' }).click();
await page.locator('aml-dashboard .case__link').click();
await page.waitForTimeout(600);
check('the case link brings the panel up', (await panel.count()) === 1);
check('and the dashboard under it is hidden and inert',
  (await dash.getAttribute('inert')) !== null && !(await dash.isVisible()));
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check('closing the panel gives the dashboard back', (await dash.isVisible()) && (await dash.getAttribute('inert')) === null);

console.log('\nNarrow');
await page.setViewportSize({ width: 360, height: 760 });
await page.goto(`${BASE}/?state=02&section=aml-risks`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const narrow = await page.evaluate(() => ({
  pageW: document.documentElement.scrollWidth,
  dashW: document.querySelector('aml-dashboard').scrollWidth,
  clientW: document.querySelector('aml-dashboard').clientWidth,
}));
check('at 360 nothing scrolls sideways but the tables inside their cards',
  narrow.pageW <= 360 && narrow.dashW <= narrow.clientW, narrow);
await shot('dash-360');

console.log(`\npage errors: ${pageErrors.length}`);
pageErrors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 200)));
await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed || pageErrors.length ? 1 : 0);
