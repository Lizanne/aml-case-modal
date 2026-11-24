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
check('Create AML case is not offered while a case is active (one open case per player)',
  (await page.getByRole('button', { name: 'Create AML case' }).count()) === 0);
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
check('both checkpoints carry an edit button, marked as not built',
  (await page.getByRole('button', { name: 'Edit the lifetime deposits checkpoint' }).getAttribute('aria-disabled')) === 'true' &&
  (await page.getByRole('button', { name: 'Edit the lifetime net loss checkpoint' }).getAttribute('aria-disabled')) === 'true');
check('each row leads with what it measures',
  (await page.locator('aml-dashboard .tbl--edd tbody th').allInnerTexts()).map((t) => t.split('\n')[0].trim()).join('|') === 'Lifetime deposits|Lifetime net loss');

console.log('\nPill');
const pills = await page.evaluate(() => {
  const read = (el) => { const c = getComputedStyle(el); return [c.height, c.paddingLeft, c.fontSize, c.lineHeight, c.fontWeight, c.borderRadius, c.backgroundColor, c.color].join(' '); };
  const probe = document.createElement('ui-pill');
  const band = document.querySelector('aml-dashboard .risk__band');
  // A real EDD pill at the default size, built the way the app builds one.
  for (const a of band.attributes) if (a.name.startsWith('_ngcontent') || a.name.startsWith('_nghost')) probe.setAttribute(a.name, '');
  probe.setAttribute('data-sev', 'EDD');
  probe.setAttribute('data-size', 'md');
  band.after(probe);
  const out = { band: read(band), edd: read(probe) };
  probe.remove();
  return out;
});
check('the High risk pill is the EDD pill: same size, type, ground and ink', pills.band === pills.edd, pills);

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
  /Overridden to 50 points until revoked by Amara Okafor\. System result: not met\./.test(seeded) && /Edit override/.test(seeded), seeded);
check('the total is stated in the risk card and the table foot, not a third time in the card head',
  (await page.locator('aml-dashboard .card__aside').count()) === 0);
check('the Override column is named', (await page.locator('aml-dashboard .tbl--score thead th').last().innerText()) === 'Override');
check('the total row sits on the same hairline as the rows above it', await page.evaluate(() => {
  const c = (sel) => getComputedStyle(document.querySelector(sel)).borderTopColor;
  return c('aml-dashboard .tbl--score tfoot th') === c('#score-domestic-pep > th');
}));
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
check('nothing in the dialog opens with a focus mark on it',
  await page.evaluate(() => !document.activeElement?.matches('input, textarea, button')));
const effect = async () => (await dialog.locator('.effect__row').allInnerTexts()).map((t) => t.replace(/arrow_forward/g, '>').replace(/\s+/g, ' ').trim()).join(' | ');
check('the dialog shows the change as before and after, for the field and the player',
  (await effect()) === 'This field 0 > changes to 75 points | Player total 200 > changes to 275 points | Risk rating High risk unchanged', await effect());
await dialog.getByRole('radio', { name: '0 points' }).check();
check('and says "unchanged" when the answer is what the field already scores',
  (await effect()) === 'This field 0 points unchanged | Player total 200 points unchanged | Risk rating High risk unchanged', await effect());
const hSame = await dialog.locator('.panel').evaluate((e) => e.getBoundingClientRect().height);
await dialog.getByRole('radio', { name: '75 points' }).check();
const hChanged = await dialog.locator('.panel').evaluate((e) => e.getBoundingClientRect().height);
check('the summary holds its height as the answer changes', hSame === hChanged, [hSame, hChanged]);
const h1 = await dialog.locator('.panel').evaluate((e) => e.getBoundingClientRect().height);
await dialog.getByRole('radio', { name: 'Until the override is revoked' }).check();
const h2 = await dialog.locator('.panel').evaluate((e) => e.getBoundingClientRect().height);
check('choosing the other duration does not change the dialog\'s height', h1 === h2, [h1, h2]);
await dialog.locator('.days__input').focus();
check('focusing the days field chooses days', await dialog.getByRole('radio', { name: 'For a number of days' }).isChecked());
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
const toast = page.locator('dashboard-toast .toast');
check('and says so, in a live region, with a way back',
  (await toast.locator('.toast__text').innerText()) === 'Override revoked. Sanctioned individual now scores 0 points.' &&
  (await page.locator('dashboard-toast [role="status"]').count()) === 1 &&
  (await toast.getByRole('button', { name: 'Undo' }).count()) === 1);
await toast.getByRole('button', { name: 'Undo' }).click();
await page.waitForTimeout(300);
const back = await row('Sanctioned individual').innerText();
check('Undo puts the override back as it was: points, span and reason',
  (await total()) === 775 && /Overridden to 500 points until revoked by Liz Fernandez/.test(back) && /Confirmed match after manual review\./.test(back), back);
check('and the toast then says restored, with nothing further to undo',
  /^Override restored\./.test(await toast.locator('.toast__text').innerText()) && (await toast.getByRole('button', { name: 'Undo' }).count()) === 0);
await toast.getByRole('button', { name: 'Dismiss' }).click();
check('Dismiss removes it', (await toast.count()) === 0);
await row('Sanctioned individual').getByRole('button', { name: /Edit override/ }).click();
await dialog.getByRole('button', { name: 'Revoke override' }).click();
await page.waitForTimeout(300);
await toast.hover();
await page.waitForTimeout(6500);
check('the toast waits while the pointer is on it', (await toast.count()) === 1);
await page.mouse.move(700, 300);
await page.waitForTimeout(6500);
check('and goes on its own once left alone', (await toast.count()) === 0);

await row('PAR link').getByRole('button', { name: /Override/ }).click();
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Escape closes the dialog and changes nothing', (await dialog.count()) === 0 && (await total()) === 275 && (await dash.isVisible()));

console.log('\nTables');
const lines = async () => page.evaluate(() => {
  const t = document.querySelector('aml-dashboard .mat-mdc-tab-body-active .card--tab table');
  const first = t.querySelector('thead th'); const last = t.querySelector('tbody tr:last-child td');
  return { top: getComputedStyle(first).borderTopWidth, bottom: getComputedStyle(last).borderBottomWidth, layout: getComputedStyle(t).tableLayout };
});
console.log('\nTabs');
await page.getByRole('tab', { name: /Case archive/ }).click();
await page.waitForTimeout(200);
check('opening a closed case is marked as not built',
  (await page.getByRole('button', { name: 'Open closed case #AML-0877' }).getAttribute('aria-disabled')) === 'true');
check('the archive lists closed cases with the four columns',
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active thead th').allInnerTexts()).slice(0, 4).join('|') === 'Date opened|Opening trigger|Date closed|Severity' &&
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active tbody tr').count()) === 3);
check('the archive table draws no line against its card, top or bottom', JSON.stringify(await lines()) === '{"top":"0px","bottom":"0px","layout":"fixed"}', await lines());
check('the risk stays on screen above the tabs', await page.locator('aml-dashboard .risk__score').isVisible());
await shot('dash-archive');
await page.getByRole('tab', { name: 'Overview' }).click();
await page.getByRole('button', { name: 'View the full audit log' }).click();
await page.waitForTimeout(200);
check('the snippet leads to the full log', (await page.getByRole('tab', { name: 'Audit log' }).getAttribute('aria-selected')) === 'true');
check('and takes focus to that tab, not back to the top of the page',
  await page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab' && document.activeElement.textContent.includes('Audit log')));
check('which is what, when, who - ten at a time',
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active thead th').allInnerTexts()).join('|') === 'When|What|Who' &&
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active tbody tr').count()) === 10 &&
  (await text('aml-dashboard .more')).replace(/\s+/g, ' ').trim() === 'Showing 10 of 19 Show 9 more');
await page.getByRole('button', { name: 'Show 9 more' }).click();
await page.waitForTimeout(150);
check('Show more brings the rest, and then steps aside',
  (await page.locator('aml-dashboard .mat-mdc-tab-body-active tbody tr').count()) === 19 &&
  (await page.locator('aml-dashboard .more button').count()) === 0);
check('nor does the audit log', JSON.stringify(await lines()) === '{"top":"0px","bottom":"0px","layout":"fixed"}', await lines());
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

console.log('\nNo active case');
await page.goto(`${BASE}/?state=07&section=aml-risks`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const create = page.getByRole('button', { name: 'Create AML case' });
check('with the case resolved, the card says so and offers Create beside it',
  /No active AML case/.test(await text('aml-dashboard .case')) && (await create.count()) === 1);
await create.click();
await page.waitForTimeout(300);
const makeDialog = page.locator('create-case-dialog');
const make = makeDialog.getByRole('button', { name: 'Create case' });
check('Create opens a dialog that waits for a severity and a reason', (await makeDialog.count()) === 1 && (await make.isDisabled()));
await makeDialog.getByRole('radio', { name: 'EDD' }).check();
await makeDialog.locator('textarea').fill('Customer mentioned a cash business on a call.');
await make.click();
await page.waitForTimeout(400);
check('creating closes the dialog, names the new case, and withdraws Create',
  (await makeDialog.count()) === 0 && /Active case #AML-1043 · EDD · opened/.test((await text('aml-dashboard .case')).replace(/\s+/g, ' ')) && (await create.count()) === 0);
check('and it is the newest audit event', /^AML case #AML-1043 created by an agent \(EDD severity\)/.test(await text('aml-dashboard .events__what')));

console.log('\nDev states');
const open = async (id) => {
  await page.goto(`${BASE}/?section=aml-risks&rstate=${id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
};
const facts = async () => ({
  total: await total(),
  band: await text('aml-dashboard .risk__band'),
  caseLine: (await text('aml-dashboard .case')).replace(/\s+/g, ' ').trim(),
  widget: await page.locator('back-office-widgets article.w').count(),
  panel: await panel.count(),
  drivers: await page.locator('aml-dashboard .drivers li').count(),
  more: (await page.locator('aml-dashboard .why__more').count()) ? await text('aml-dashboard .why__more') : '',
});
await page.goto(`${BASE}/?section=aml-risks`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
check('with no state asked for, the dashboard opens on R-03 with the case panel closed',
  new URL(page.url()).searchParams.get('rstate') === 'R-03' && (await panel.count()) === 0 && (await dash.isVisible()) && (await total()) === 200);
check('the switcher offers the dashboard\'s own states, not the modal\'s',
  (await page.locator('dev-state-switcher option').allInnerTexts()).map((t) => t.trim().slice(0, 4)).join(',') === 'R-01,R-02,R-03,R-04,R-05,R-06,R-07' &&
  (await text('dev-state-switcher .dev__label')) === 'Risk state');

await open('R-01');
let f = await facts();
check('R-01: 35 points, Low risk, no case, no AML widget, Create offered',
  f.total === 35 && f.band === 'Low risk' && f.widget === 0 && /^No active AML case Create AML case$/.test(f.caseLine), f);
check('R-01: the checkpoint is the low risk one, as production draws it',
  /Global low risk checkpoint/.test(await text('aml-dashboard .tbl--edd tbody')) && /£37,500 lifetime deposits/.test(await text('aml-dashboard .tbl--edd tbody')));

await open('R-02');
f = await facts();
check('R-02: 115 points, Medium risk, an AML case open, 10 points to High',
  f.total === 115 && f.band === 'Medium risk' && /^Active case #AML-1042 · AML/.test(f.caseLine) && f.widget === 1 &&
  (await text('aml-dashboard .risk__next')) === '10 points to High risk', f);
await row('Roulette').getByRole('button', { name: /Override/ }).click();
check('R-02: the dialog shows the rating about to change',
  (await dialog.locator('.effect__row').last().innerText()).replace(/arrow_forward/g, '>').replace(/\s+/g, ' ').trim() === 'Risk rating Medium risk > changes to High risk');
await dialog.locator('textarea').fill('Played roulette on a second device.');
await dialog.getByRole('button', { name: 'Save override' }).click();
await page.waitForTimeout(400);
check('R-02: one 10-point override crosses into High', (await total()) === 125 && (await text('aml-dashboard .risk__band')) === 'High risk');

await open('R-04');
f = await facts();
check('R-04: 1,105 points, Critical, five fields listed and eleven counted',
  f.total === 1105 && f.band === 'Critical' && f.drivers === 5 && f.more === 'and 11 more in the score-card below' &&
  (await page.locator('aml-dashboard .risk__next').count()) === 0, f);
check('R-04: the biggest field leads the list', /^Sanctioned individual\s+500$/.test((await page.locator('aml-dashboard .drivers li').first().innerText()).replace(/\s+/g, ' ')));

await open('R-05');
f = await facts();
const notes = (await page.locator('aml-dashboard .param__override').allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
check('R-05: four overrides, up and down, timed and until revoked',
  f.total === 245 && notes.length === 4 &&
  notes.filter((n) => /until revoked/.test(n)).length === 1 && notes.filter((n) => /until \d{2} \w{3} \d{4}/.test(n)).length === 3 &&
  notes.filter((n) => /Overridden to 0 points/.test(n)).length === 2, { f, notes });
check('R-05: a met field overridden to zero still says the system has it as met',
  /System result: met\./.test(await row('Roulette').innerText()) && /0\s*of\s*10/.test(await row('Roulette').locator('.num').innerText()));
const longRow = await page.evaluate(() => {
  const r = document.getElementById('score-high-deposit'); const t = r.closest('table');
  return { rowW: r.scrollWidth, tableW: t.clientWidth, h: r.getBoundingClientRect().height };
});
check('R-05: a long reason wraps inside its column', longRow.rowW <= longRow.tableW && longRow.h > 60, longRow);
await shot('dash-r05');

await open('R-06');
f = await facts();
check('R-06: zero points, Low risk, and the risk card says nothing is adding points',
  f.total === 0 && f.band === 'Low risk' && f.drivers === 0 && f.more === 'Nothing is adding points.' && f.widget === 0, f);
check('R-06: the latest events say what will appear there', /No AML events yet/.test(await text('aml-dashboard .grid__side')));
await page.getByRole('tab', { name: 'Case archive (0)' }).click();
await page.waitForTimeout(200);
check('R-06: so does the archive', /No closed AML cases/.test(await text('aml-dashboard .mat-mdc-tab-body-active')));
await page.getByRole('tab', { name: 'Audit log' }).click();
await page.waitForTimeout(200);
check('R-06: and the audit log', /No AML events yet/.test(await text('aml-dashboard .mat-mdc-tab-body-active')) && (await page.locator('aml-dashboard .more').count()) === 0);
await shot('dash-r06');

await open('R-07');
await page.getByRole('tab', { name: 'Case archive (12)' }).click();
await page.waitForTimeout(200);
check('R-07: twelve closed cases', (await page.locator('aml-dashboard .mat-mdc-tab-body-active tbody tr').count()) === 12);
await page.getByRole('tab', { name: 'Audit log' }).click();
await page.waitForTimeout(200);
check('R-07: sixty-four events, ten at a time', (await text('aml-dashboard .more')).replace(/\s+/g, ' ').trim() === 'Showing 10 of 64 Show 10 more');

await page.locator('dev-state-switcher select').selectOption('R-04');
await page.waitForTimeout(400);
check('choosing a state in the switcher applies it and goes back to Overview',
  (await total()) === 1105 && new URL(page.url()).searchParams.get('rstate') === 'R-04' &&
  (await page.getByRole('tab', { name: 'Overview' }).getAttribute('aria-selected')) === 'true');

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
const stacked = await page.evaluate(() => {
  const box = document.querySelector('aml-dashboard').getBoundingClientRect();
  const btn = document.querySelector('#score-domestic-pep button.text-btn').getBoundingClientRect();
  const card = document.querySelector('aml-dashboard .tbl--score').closest('.card__scroll');
  return { right: btn.right, edge: box.right, scrolls: card.scrollWidth > card.clientWidth + 1, opacity: getComputedStyle(document.querySelector('#score-domestic-pep button.text-btn')).opacity };
});
check('at 360 the score-card stacks: Override is on screen without scrolling sideways',
  stacked.right <= stacked.edge && !stacked.scrolls && stacked.opacity === '1', stacked);
await page.locator('#score-domestic-pep').scrollIntoViewIfNeeded();
await shot('dash-360');

console.log(`\npage errors: ${pageErrors.length}`);
pageErrors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 200)));
await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed || pageErrors.length ? 1 : 0);
