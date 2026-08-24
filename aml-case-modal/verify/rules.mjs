import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Direction is derived from the fixture's confirmed ranking, never assumed:
// the order is not the intuitive one and has already been re-confirmed once.
const ORDER = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/core/mock-case.json', import.meta.url)), 'utf8'),
).severityRanking.order; // high to low
const rank = (s) => ORDER.length - ORDER.indexOf(s);
const directionOf = (from, to) => (rank(to) > rank(from) ? 'Escalation' : 'De-escalation');

const BASE = process.env.BASE ?? 'http://localhost:4200';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1180, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const check = (label, ok) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failed++;
};
const go = async (state) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('aml-case-modal');
  await page.waitForTimeout(200);
};

// Fill a record-form: note, optional lock choice, then save.
async function fillForm({ note, lockChoice }) {
  await page.locator('record-form textarea').fill(note);
  if (lockChoice) {
    await page.locator(`record-form mat-radio-button:has-text("${lockChoice}") input`).check({ force: true });
  }
  await page.waitForTimeout(120);
}

console.log('\nRule 3 - lock is what gates action');
await go('00a');
check('unlocked: Record is disabled', await page.locator('action-placeholder button').first().isDisabled());
await page.locator('case-header button:has-text("Lock to me")').click();
await page.waitForTimeout(200);
check('after locking: Record is enabled', await page.locator('action-placeholder button').first().isEnabled());
// Lock and unlock are case history, not workflow: Timeline only.
const timeline = async () => {
  await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
  await page.waitForTimeout(250);
  return page.locator('player-info-panel .timeline__what').allInnerTexts();
};
check('locking wrote NO stream event', (await page.locator('event-row').count()) === 0);
check('locking wrote a Timeline entry', (await timeline()).some((t) => t === 'Case locked'));
await page.locator('case-header button:has-text("Unlock")').click();
await page.waitForTimeout(250);
check('unlocking wrote NO stream event', (await page.locator('event-row').count()) === 0);
check('unlocking wrote a Timeline entry', (await timeline()).some((t) => t === 'Case unlocked'));

console.log('\nRule 3 - force unlock, and open question 4 (owner’s draft is lost)');
await go('00b');
check('self-unlock path not offered for another’s lock', (await page.locator('case-header button:has-text("Force unlock")').count()) === 1);
await page.locator('confirm-unlock-dialog button:has-text("Unlock case")').click();
await page.waitForTimeout(200);
check('case is now unlocked', (await page.locator('case-header button:has-text("Lock to me")').count()) === 1);
check('force unlock wrote NO stream event', (await page.locator('event-row').count()) === 0);
check('force unlock named the previous owner in the Timeline', await (async () => {
  await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
  await page.waitForTimeout(250);
  const rows = await page.locator('player-info-panel .timeline__what').allInnerTexts();
  return rows.some((t) => t.includes('force-released') && t.includes('M. Torres'));
})());

console.log('\nRules 4, 5, 6 - record both required actions, in reverse order');
await go('01');
check('submit disabled with nothing recorded', await page.locator('.footer button:has-text("Submit decision")').isDisabled());
// Contact player first - rule 4 says order does not matter.
await page.locator('action-placeholder:has-text("Contact player") button').click();
await page.waitForTimeout(200);
await fillForm({ note: 'Called the player on their verified number.' });
check('rule 5: save blocked with a note but no lock choice',
  await page.locator('record-form button:has-text("Save outcome")').isDisabled());
await fillForm({ note: 'Called the player on their verified number.', lockChoice: 'Keep the case locked' });
check('rule 5: save enabled once the lock choice is explicit',
  await page.locator('record-form button:has-text("Save outcome")').isEnabled());
await page.locator('record-form button:has-text("Save outcome")').click();
await page.waitForTimeout(250);
check('one chip done, one still pending',
  (await page.locator('required-chips ui-pill[data-tone="success"]').count()) === 1 &&
  (await page.locator('required-chips ui-pill[data-tone="outline"]').count()) === 1);
check('rule 6: saved card has no edit control',
  (await page.locator('outcome-card button:has-text("Edit")').count()) === 0);
check('rule 6: saved attachments have no remove control',
  (await page.locator('outcome-card .file__remove').count()) === 0);
check('submit still disabled with one required action outstanding',
  await page.locator('.footer button:has-text("Submit decision")').isDisabled());

console.log('\nRule 7 - an extra action does not satisfy or re-gate anything');
await page.locator('add-action-menu button:has-text("Add action")').click();
await page.waitForTimeout(250);
await page.locator('.mat-mdc-menu-panel button:has-text("Add a note")').click();
await page.waitForTimeout(200);
await fillForm({ note: 'Chased the documentation by email.', lockChoice: 'Keep the case locked' });
await page.locator('record-form button:has-text("Save outcome")').click();
await page.waitForTimeout(250);
check('extra note saved as an ordinary card', (await page.locator('outcome-card').count()) === 2);
check('extra note did not satisfy the outstanding requirement',
  (await page.locator('required-chips ui-pill[data-tone="success"]').count()) === 1);
check('submit still disabled', await page.locator('.footer button:has-text("Submit decision")').isDisabled());
check('placeholder for the outstanding action remains',
  (await page.locator('action-placeholder').count()) === 1);

console.log('\nRule 11 - a mid-case trigger blocks recording until resync');
await page.locator('dev-state-switcher button:has-text("New trigger")').click();
await page.waitForTimeout(250);
check('snapshot flagged out of sync', (await page.locator('workflow-panel .resync').count()) === 1);
check('recording blocked', await page.locator('action-placeholder button').first().isDisabled());
// The arrival occupies the top row in BOTH modes - it is sorted first, so the
// collapsed two-row preview always contains it. It is never hidden behind the
// overflow badge.
check('collapsed: the count chip carries the arrival',
  (await page.locator('trigger-strip .strip__bar ui-pill[data-tone="warn"]').count()) === 1);
check('collapsed: the arrival is the top preview row',
  (await page.locator('trigger-strip .trigger').first().getAttribute('class')).includes('trigger--new'));
check('collapsed: it is inside the preview, not behind the badge',
  (await page.locator('trigger-strip .trigger--new').count()) === 1);
await page.locator('trigger-strip .strip__verb').click();
await page.waitForTimeout(300);
check('expanded: still pinned top with the NEW marker',
  (await page.locator('trigger-strip .trigger').first().getAttribute('class')).includes('trigger--new'));
await page.locator('trigger-strip .strip__verb').click();
await page.waitForTimeout(300);

// Open question 2: a draft open when the trigger lands survives, Save does not.
await page.locator('workflow-panel .resync button:has-text("Resync")').click();
await page.waitForTimeout(250);
check('after resync: recording allowed again', await page.locator('action-placeholder button').first().isEnabled());
check('after resync: NEW highlight cleared on the chip',
  (await page.locator('trigger-strip .strip__bar ui-pill[data-tone="warn"]').count()) === 0);
check('after resync: NEW highlight cleared on the rows',
  (await page.locator('trigger-strip .trigger--new').count()) === 0);

console.log('\nOpen question 2 - a trigger landing mid-draft preserves the draft');
await page.locator('action-placeholder button').first().click();
await page.waitForTimeout(200);
await fillForm({ note: 'Half-written search notes.', lockChoice: 'Keep the case locked' });
await page.locator('dev-state-switcher button:has-text("New trigger")').click();
await page.waitForTimeout(250);
check('draft still open', (await page.locator('record-form form').count()) === 1);
check('draft text preserved', (await page.locator('record-form textarea').inputValue()) === 'Half-written search notes.');
check('save withheld', await page.locator('record-form button:has-text("Save outcome")').isDisabled());
check('form states the reason', (await page.locator('record-form .warn-note').innerText()).includes('Resync required'));
await page.locator('workflow-panel .resync button:has-text("Resync")').click();
await page.waitForTimeout(250);
check('save re-enabled after resync', await page.locator('record-form button:has-text("Save outcome")').isEnabled());

console.log('\nRules 4 and 9 - both recorded unlocks submit; submitting resolves');
await page.locator('record-form button:has-text("Save outcome")').click();
await page.waitForTimeout(250);
check('both chips done', (await page.locator('required-chips ui-pill[data-tone="success"]').count()) === 2);
check('no placeholders left', (await page.locator('action-placeholder').count()) === 0);
check('submit now enabled', await page.locator('.footer button:has-text("Submit decision")').isEnabled());
await page.locator('.footer button:has-text("Submit decision")').click();
await page.waitForTimeout(250);
check('decision dialog blocks an empty decision',
  await page.locator('decision-dialog button:has-text("Submit and resolve")').isDisabled());
await page.locator('decision-dialog textarea').fill('Source of funds verified. No further concerns.');
await page.waitForTimeout(150);
await page.locator('decision-dialog button:has-text("Submit and resolve")').click();
await page.waitForTimeout(300);

console.log('\nRule 10 - resolved is read-only');
check('status is Resolved', (await page.locator('case-header ui-pill[data-tone="success"]').innerText()).trim() === 'Resolved');
check('no chips', (await page.locator('required-chips').count()) === 0);
check('no footer', (await page.locator('workflow-panel .footer').count()) === 0);
check('no add action', (await page.locator('add-action-menu').count()) === 0);
check('no lock control', (await page.locator('case-header button:has-text("Lock")').count()) === 0);
check('tabs reduced to two', (await page.locator('player-info-panel .mat-mdc-tab').count()) === 2);
check('no snapshot selected', (await page.locator('player-info-panel .empty').innerText()).includes('No snapshot selected'));
await page.locator('outcome-card').first().locator('button:has-text("View snapshot")').click();
await page.waitForTimeout(250);
// The historical view is the shared snapshot header, whose label names the
// action the snapshot came from.
check('View snapshot fills the left panel',
  (await page.locator('player-info-panel .snapshot-head__back').count()) === 1 &&
    (await page.locator('player-info-panel .snapshot-head__label').innerText()).startsWith('Snapshot from '));

console.log('\nRule 8 - severity change applies everywhere and lifts the lock');
await go('03');
check('starts locked to me', (await page.locator('case-header button:has-text("Unlock")').count()) === 1);
await page.locator('.footer button:has-text("Adjust severity")').click();
await page.waitForTimeout(200);
await page.locator('severity-dialog mat-radio-button:has-text("Compliance") input').check({ force: true });
await page.waitForTimeout(150);
const expectedDirection = directionOf('EDD', 'COMPLIANCE');
check(`EDD -> COMPLIANCE labelled as a ${expectedDirection.toLowerCase()}`, await (async () => {
  const badge = (await page.locator('severity-dialog ui-pill[data-tone="warn"]').innerText()).trim();
  return expectedDirection === 'Escalation'
    ? badge.includes('Escalation') && !badge.includes('De-escalation')
    : badge.includes('De-escalation');
})());
await page.locator('severity-dialog textarea').fill('Reassessed against the compliance ranking.');
await page.waitForTimeout(150);
await page.locator('severity-dialog button:has-text("Save severity")').click();
await page.waitForTimeout(300);
check('header pill now Compliance',
  (await page.locator('case-header ui-pill[data-sev]').innerText()).trim() === 'Compliance');
check('lock was lifted', (await page.locator('case-header button:has-text("Lock to me")').count()) === 1);
check('re-lock is one click away', await page.locator('case-header button:has-text("Lock to me")').isEnabled());
check('event row logged', (await page.locator('event-row .row').count()) === 2);
check('adjust severity still enabled while open',
  await page.locator('.footer button:has-text("Adjust severity")').isEnabled());

console.log('\nStream carries outcomes and severity changes only');
check('the lock lift did not add a stream event',
  (await page.locator('event-row').count()) === 2);
check('every stream event is a severity change', await page.evaluate(() =>
  [...document.querySelectorAll('event-row')].every((e) =>
    /Severity (escalation|de-escalation)/.test(e.textContent)),
));
check('the lock lift IS in the Timeline', await (async () => {
  await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
  await page.waitForTimeout(250);
  const rows = await page.locator('player-info-panel .timeline__what').allInnerTexts();
  return rows.some((t) => t.includes('lock lifted'));
})());
/**
 * An event stays LIGHTER than an outcome card: no fill and no border, against
 * a card that has both. Compared against the card itself rather than to
 * literals - "lighter" is a relation between the two, and hardcoded values
 * would go on passing if the card changed underneath them.
 */
check('event rows are unfilled and unbordered, lighter than a card', await page.evaluate(() => {
  const row = document.querySelector('event-row .row');
  const card = document.querySelector('outcome-card .card:not(.card--decision)');
  if (!row || !card) return false;
  const r = getComputedStyle(row);
  const c = getComputedStyle(card);
  const bare = (r.backgroundColor === 'rgba(0, 0, 0, 0)' || r.backgroundColor === 'transparent')
    && parseFloat(r.borderTopWidth) === 0 && parseFloat(r.borderLeftWidth) === 0;
  // The card is the one that is filled AND boxed; that difference IS the
  // hierarchy, so assert the card's side of it too.
  const cardIsBoxed = parseFloat(c.borderTopWidth) > 0
    && c.backgroundColor !== 'rgba(0, 0, 0, 0)';
  return bare && cardIsBoxed;
}));
check('an outcome card is still boxed and white', await page.evaluate(() => {
  const card = document.querySelector('outcome-card .card:not(.card--decision)');
  if (!card) return false;
  const s = getComputedStyle(card);
  return s.backgroundColor === 'rgb(255, 255, 255)' && parseFloat(s.borderTopWidth) >= 1;
}));

console.log('\nRules 10 + 11 - a resolved case never advertises an arrival');
const arrival = () =>
  page.evaluate(() => ({
    chip: document.querySelectorAll('trigger-strip .strip__bar ui-pill[data-tone="warn"]').length,
    rows: document.querySelectorAll('trigger-strip .trigger--new').length,
    markers: document.querySelectorAll('trigger-strip ui-pill[data-tone="warn-solid"]').length,
    count: document.querySelector('trigger-strip .strip__bar ui-pill')?.textContent.trim(),
  }));

// Control: an OPEN case must show the arrival, or the test below proves nothing.
await go('01');
await page.locator('dev-state-switcher button:has-text("New trigger")').click();
await page.waitForTimeout(400);
const openArrival = await arrival();
check('open case shows the arrival (control)',
  openArrival.chip === 1 && openArrival.rows === 1 && openArrival.markers === 1);

// Force an arrival onto a RESOLVED case: the data changes, the signal must not.
await go('07');
const resolvedBefore = await arrival();
await page.locator('dev-state-switcher button:has-text("New trigger")').click();
await page.waitForTimeout(400);
const resolvedAfter = await arrival();
check('the trigger really was added to a resolved case',
  resolvedAfter.count !== resolvedBefore.count,
  `${resolvedBefore.count} -> ${resolvedAfter.count}`);
check('resolved: no amber count', resolvedAfter.chip === 0);
check('resolved: no highlighted row', resolvedAfter.rows === 0);
check('resolved: no NEW marker', resolvedAfter.markers === 0);
check('resolved: the strip still expands', await (async () => {
  await page.locator('trigger-strip .strip__verb').click();
  await page.waitForTimeout(350);
  return (await page.locator('trigger-strip .trigger').count()) > 2;
})());

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0 ? '\nAll rule checks pass.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
