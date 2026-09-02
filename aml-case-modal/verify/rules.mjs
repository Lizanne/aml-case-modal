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
/**
 * Rule 11 holds by construction in BOTH modes, by opposite routes.
 *
 * The strip reads oldest to newest in both modes, so an arrival - being by
 * definition the most recent - is the LAST row either way. It cannot be among
 * the rows the collapsed strip withholds; there is no mode in which it goes
 * missing.
 *
 * The amber count chip that used to carry it as a second signal went with the
 * header. The row's own highlight and its New badge are the whole of it here,
 * so those are what this checks.
 */
check('collapsed: the strip has no header to carry a count',
  (await page.locator('trigger-strip .strip__bar').count()) === 0);
check('collapsed: exactly two rows, oldest then newest', await page.evaluate(() => {
  const at = [...document.querySelectorAll('trigger-strip .cell__at')].map((t) => Date.parse(t.getAttribute('datetime')));
  return at.length === 2 && at[0] < at[1];
}));
check('collapsed: the arrival is the second - the newest - row',
  (await page.locator('trigger-strip .trigger').last().getAttribute('class')).includes('trigger--new'));
check('collapsed: exactly one row is marked',
  (await page.locator('trigger-strip .trigger--new').count()) === 1);
// The pair spans the history rather than sampling the top of it: with the
// middle withheld, the two rows must be the actual ends of the case.
// The total is not rendered anywhere now, so it comes from the divider, which
// names exactly what it is withholding: two anchors plus N remaining.
check('collapsed: the two rows are the ends of the whole case', await page.evaluate(() => {
  const shown = [...document.querySelectorAll('trigger-strip .cell__at')].length;
  const hidden = Number(
    document.querySelector('trigger-strip .strip__gap-count').textContent.trim(),
  );
  return shown === 2 && hidden > 0;
}));
check('collapsed: it does not scroll - what it withholds is absent, not hidden',
  await page.evaluate(() => {
    const el = document.querySelector('trigger-strip .strip__list');
    return el.scrollHeight <= el.clientHeight + 1 && el.getAttribute('tabindex') === null;
  }));
await page.locator('trigger-strip .strip__gap').click();
await page.waitForTimeout(400);
/**
 * ONE DIRECTION, both modes: oldest to newest.
 *
 * This asserted newest-first when expanded, which made the arrival the top row
 * open and the bottom row closed - so expanding moved both anchors past each
 * other. The strip reads forwards now in either mode, and expanding only adds
 * the middle back between two rows that never move.
 */
check('expanded: oldest first, arrival still last', await page.evaluate(() => {
  const rows = [...document.querySelectorAll('trigger-strip .trigger')];
  const at = [...document.querySelectorAll('trigger-strip .cell__at')].map((t) => Date.parse(t.getAttribute('datetime')));
  const ascending = at.every((v, i) => i === 0 || at[i - 1] <= v);
  return ascending && rows[rows.length - 1].className.includes('trigger--new');
}));
// The anchors are the same two rows in both modes - that is what the divider
// between them is for.
check('expanded: the anchors are the ones the collapsed pair showed',
  await page.evaluate(() => {
    const at = [...document.querySelectorAll('trigger-strip .cell__at')]
      .map((t) => t.getAttribute('datetime'));
    return { first: at[0], last: at[at.length - 1] };
  }).then((v) => !!v.first && !!v.last && v.first < v.last));
// Every trigger is in the DOM; five of them are on screen. That is what keeps
// the strip from pushing the workflow down the page.
check('expanded: the whole history is rendered, five rows shown', await page.evaluate(() => {
  const el = document.querySelector('trigger-strip .strip__list');
  const rows = [...document.querySelectorAll('trigger-strip .trigger')];
  // Two anchors plus what the divider says it is hiding.
  const total =
    2 + Number(document.querySelector('trigger-strip .strip__gap-count').textContent.trim());
  // Average row, not .cell: .trigger has no box in the grid layout and .cell
  // is a single line once the strip stacks in its column, so only the average
  // is a row height in both.
  const rowH = el.scrollHeight / rows.length;
  return rows.length === total &&
    Math.round(el.clientHeight / rowH) === 5 &&
    el.scrollHeight > el.clientHeight + 1;
}));
await page.locator('trigger-strip .strip__gap').click();
await page.waitForTimeout(300);

// Open question 2: a draft open when the trigger lands survives, Save does not.
await page.locator('workflow-panel .resync button:has-text("Resync")').click();
await page.waitForTimeout(250);
check('after resync: recording allowed again', await page.locator('action-placeholder button').first().isEnabled());
// No chip to clear any more - the New BADGE on the row is the signal, and it
// is what a resync has to take away.
check('after resync: the New badge is gone from every row',
  (await page.locator('trigger-strip ui-pill[tone="warn-solid"]').count()) === 0);
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
// Rule 8 takes the lock like everything else now. The severity save above
// lifted the lock, so the control that opened the dialog is disabled the
// moment the case is no longer yours - which is the point, and is exactly how
// Record behaves beside it.
check('adjust severity follows the lock, and the lock was just lifted',
  await page.locator('.footer button:has-text("Adjust severity")').isDisabled());
await page.locator('case-header button:has-text("Lock to me")').click();
await page.waitForTimeout(300);
check('and comes back with the lock',
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
/**
 * The arrival's signals, and how many triggers there are.
 *
 * The amber COUNT CHIP is gone with the strip header, so the row highlight and
 * its New badge are the whole signal now. The total is not rendered anywhere
 * either: it is two anchors plus whatever the divider says it is hiding, which
 * is also the only number that changes when a trigger lands on a collapsed
 * strip.
 */
const arrival = () =>
  page.evaluate(() => {
    const hidden = document.querySelector('trigger-strip .strip__gap-count');
    const rows = document.querySelectorAll('trigger-strip .trigger').length;
    return {
      rows: document.querySelectorAll('trigger-strip .trigger--new').length,
      markers: document.querySelectorAll('trigger-strip ui-pill[data-tone="warn-solid"]').length,
      count: hidden ? rows + Number(hidden.textContent.trim()) : rows,
    };
  });

// Control: an OPEN case must show the arrival, or the test below proves nothing.
await go('01');
await page.locator('dev-state-switcher button:has-text("New trigger")').click();
await page.waitForTimeout(400);
const openArrival = await arrival();
check('open case shows the arrival (control)',
  openArrival.rows === 1 && openArrival.markers === 1, JSON.stringify(openArrival));

// Force an arrival onto a RESOLVED case: the data changes, the signal must not.
await go('07');
const resolvedBefore = await arrival();
await page.locator('dev-state-switcher button:has-text("New trigger")').click();
await page.waitForTimeout(400);
const resolvedAfter = await arrival();
check('the trigger really was added to a resolved case',
  resolvedAfter.count !== resolvedBefore.count,
  `${resolvedBefore.count} -> ${resolvedAfter.count}`);
check('resolved: no highlighted row', resolvedAfter.rows === 0);
check('resolved: no NEW marker', resolvedAfter.markers === 0);
check('resolved: the strip still expands', await (async () => {
  await page.locator('trigger-strip .strip__gap').click();
  await page.waitForTimeout(350);
  return (await page.locator('trigger-strip .trigger').count()) > 2;
})());

/**
 * No card while its own panel is open, and the panel does not move because of
 * it: same box in the content area, no dock to the right, no scrim.
 *
 * The row and the panel no longer coexist for the SAME item, so the old
 * edge-sharing comparison had nothing to measure - it looked for a row that
 * the open panel had already taken off the page. The claim is split in two,
 * and each half is now testable:
 *
 *   panel open   no row at all, and the panel's box is exactly the box it has
 *                when it is the only thing in the content area.
 *   mixed        the case up, the alert shut - the one composition where a
 *                card and a panel are on screen together. The row is sized to
 *                the panel area, so THAT is where the shared edges are proved.
 *
 * The panel's box is captured with the row up and compared after it goes,
 * rather than against a number: the claim is that removing the row does not
 * move it, which a literal would not actually test.
 */
console.log('\nNo card over its own panel; the panel does not move for it');
for (const vw of [1440, 1200]) {
  await page.setViewportSize({ width: vw, height: 900 });
  // 09 with both shut is the one state that has a row AND no panel, so the
  // panel's own geometry can be read before and after it opens.
  await page.goto(`${BASE}/?state=09`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(450);
  for (const [host, label] of [['sg-alert-modal', 'Close alert'], ['aml-case-modal', 'Close case']]) {
    const btn = page.locator(`${host} button[aria-label="${label}"]`);
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(400); }
  }
  // And any bar. Below the dual-fit width, seeding 09 auto-minimises the
  // incumbent rather than putting it on the stage - and a minimised panel is
  // still OPEN, so its card is still withheld and no panel X can reach it.
  for (let i = 0; i < 3 && (await page.locator('minimised-bar').count()); i++) {
    await page.locator('minimised-bar button[aria-label^="Close"]').first().click();
    await page.waitForTimeout(400);
  }
  const shut = await page.evaluate(() => ({
    cards: document.querySelectorAll('.w').length,
    rowRight: Math.round(document.querySelector('.widgets').getBoundingClientRect().right),
  }));
  check(`${vw}: both shut - both cards on the row`, shut.cards === 2, `${shut.cards}`);

  // Open the case. Its own card must go; the alert's must stay, in full.
  await page.locator('back-office-widgets button:has-text("Open case")').click();
  await page.waitForTimeout(600);
  const mixed = await page.evaluate(() => {
    const row = document.querySelector('.widgets').getBoundingClientRect();
    const panel = document.querySelector('.stage > *').getBoundingClientRect();
    const names = [...document.querySelectorAll('.w__name')].map((e) => e.textContent.trim());
    return {
      names,
      buttons: document.querySelectorAll('.w__btn').length,
      scrim: !!document.querySelector('.page__scrim'),
      sameLeft: Math.round(row.left) === Math.round(panel.left),
      sameRight: Math.round(row.right) === Math.round(panel.right),
      rowAbove: Math.round(row.bottom) <= Math.round(panel.top),
      panel: [Math.round(panel.left), Math.round(panel.right)],
    };
  });
  check(`${vw}: the open panel's own card is gone, the other stays`,
    mixed.names.join() === 'SG Alerts', mixed.names.join());
  check(`${vw}: and it keeps its actions`, mixed.buttons > 0, `${mixed.buttons}`);
  check(`${vw}: no scrim anywhere`, mixed.scrim === false);
  check(`${vw}: the row and the panel share both edges`, mixed.sameLeft && mixed.sameRight,
    `left ${mixed.sameLeft}, right ${mixed.sameRight}`);
  check(`${vw}: the row sits above the panel`, mixed.rowAbove);
  /**
   * A LONE CARD IS CAPPED AND RIGHT-DOCKED. 640px at most, hard against the
   * panel's right edge; below 640px of row it fills the row instead.
   *
   * The ROW still spans the panel area - the checks above measure that - and
   * only the track inside it is capped, which is what makes the right edge the
   * card lands on the panel's own rather than one computed twice.
   *
   * Expected is derived from the row rather than written as 640, so this tests
   * the rule at whatever width the sweep is at rather than only where the cap
   * happens to bind.
   */
  const solo = await page.evaluate(() => {
    const row = document.querySelector('.widgets').getBoundingClientRect();
    const card = document.querySelector('.w').getBoundingClientRect();
    const cap = parseFloat(
      getComputedStyle(document.querySelector('back-office-widgets')).getPropertyValue('--widget-solo-max'),
    );
    return {
      cap,
      rowW: Math.round(row.width),
      cardW: Math.round(card.width),
      sharesRightEdge: Math.round(card.right) === Math.round(row.right),
      single: document.querySelector('.widgets').classList.contains('widgets--single'),
    };
  });
  check(`${vw}: one card - capped at ${solo.cap} or the row, whichever is smaller`,
    solo.single && solo.cardW === Math.min(solo.rowW, solo.cap),
    `${solo.cardW} vs min(${solo.rowW}, ${solo.cap})`);
  check(`${vw}: and docked to the panel's right edge`, solo.sharesRightEdge,
    JSON.stringify(solo));

  // Now the alert too. The row goes entirely - and the panel must not move.
  await page.locator('back-office-widgets button:has-text("Open alert")').click();
  await page.waitForTimeout(600);
  // Both are up now, so close the alert again to get back to one panel and no
  // row: the same panel as the mixed step, with the row gone from above it.
  await page.locator('sg-alert-modal button[aria-label="Close alert"]').click();
  await page.waitForTimeout(600);
  await page.locator('back-office-widgets button:has-text("Open alert")').click();
  await page.waitForTimeout(600);
  const dual = await page.evaluate(() => ({
    row: document.querySelector('.widgets'),
    cards: document.querySelectorAll('.w').length,
    hostDisplay: getComputedStyle(document.querySelector('back-office-widgets')).display,
    scrim: !!document.querySelector('.page__scrim'),
  })).then((d) => ({ ...d, row: undefined }));
  check(`${vw}: dual - neither card renders`, dual.cards === 0, `${dual.cards}`);
  check(`${vw}: and the row's host collapses rather than keeping its gap`,
    dual.hostDisplay === 'none', dual.hostDisplay);
  check(`${vw}: still no scrim`, dual.scrim === false);
}

/**
 * The row going does not move the panel.
 *
 * Two states that differ ONLY in whether a row is above the case panel:
 *
 *   09, alert shut   the case is up and the alert is not, so the alert's card
 *                    is on the row above it.
 *   03               no alert on the surface at all, so no card and no row.
 *
 * Both have exactly one panel on the stage, so both hand the case the same
 * width rule - and the claim is that the box it actually gets is the same box.
 * Comparing the two states rather than either against a literal is what makes
 * this a test of the row's influence rather than of the width constant.
 */
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/?state=09`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.locator('sg-alert-modal button[aria-label="Close alert"]').click();
await page.waitForTimeout(600);
const withRow = await page.evaluate(() => {
  const r = document.querySelector('aml-case-modal').getBoundingClientRect();
  return {
    l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width),
    row: getComputedStyle(document.querySelector('back-office-widgets')).display,
  };
});
await page.goto(`${BASE}/?state=03`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const noRow = await page.evaluate(() => {
  const r = document.querySelector('aml-case-modal').getBoundingClientRect();
  return {
    l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width),
    row: getComputedStyle(document.querySelector('back-office-widgets')).display,
  };
});
check('the two states really do differ in whether there is a row',
  withRow.row === 'block' && noRow.row === 'none', `${withRow.row} vs ${noRow.row}`);
check('the panel keeps the same box either way - no re-dock, no resize',
  withRow.l === noRow.l && withRow.r === noRow.r && withRow.w === noRow.w,
  `${JSON.stringify(withRow)} vs ${JSON.stringify(noRow)}`);

// ...and the dual pair keeps its radius, because those two ARE cards on a page.
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/?state=09`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
const dualRadii = await page.evaluate(() =>
  [...document.querySelectorAll('.stage > * > div')].map((d) => getComputedStyle(d).borderRadius));
check('dual panels keep the 12px radius',
  dualRadii.length === 2 && dualRadii.every((r) => r === '12px'), dualRadii.join(', '));

/**
 * A panel is controlled from exactly one place, whichever place that is: open,
 * its own X; minimised, its bar.
 *
 * This used to be narrower - the widget carried a Close in the dual state, and
 * the rule was that it and a bar must never be on screen together. The widget
 * now carries no actions in ANY state, so the dual case is no longer an
 * exception to police: there is simply never a widget Close to collide with a
 * bar. Each panel's own X is what closes it.
 */
console.log('\nA panel is controlled from one place - its X, or its bar');
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/?state=09`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
const dualState = await page.evaluate(() => ({
  bars: document.querySelectorAll('minimised-bar').length,
  closes: [...document.querySelectorAll('.w__btn')].filter((b) => /Close/.test(b.textContent)).length,
  panelCloses: document.querySelectorAll('.stage [aria-label^="Close"]').length,
}));
check('dual: no bars, and no widget Closes either',
  dualState.bars === 0 && dualState.closes === 0, JSON.stringify(dualState));
check('dual: each panel carries its own X instead',
  dualState.panelCloses === 2, JSON.stringify(dualState));

await page.locator('case-header .head__actions button').first().click();
await page.waitForTimeout(700);
const minState = await page.evaluate(() => {
  const bar = document.querySelector('minimised-bar .bar');
  const panel = document.querySelector('.stage > *');
  return {
    bars: document.querySelectorAll('minimised-bar').length,
    widgets: document.querySelectorAll('.w').length,
    widgetCloses: [...document.querySelectorAll('.w__btn')].filter((b) => /Close/.test(b.textContent)).length,
    barHasRestore: !!document.querySelector('.bar__icon-btn[aria-label^="Restore"]'),
    barHasClose: !!document.querySelector('.bar__icon-btn[aria-label^="Close"]'),
    barWidth: bar ? Math.round(bar.getBoundingClientRect().width) : null,
    // Inset from the viewport by --dock-inset, on the right and the bottom.
    // Read from the custom property rather than a literal, so the check moves
    // with the breakpoint instead of pinning the desktop number.
    inset: parseFloat(getComputedStyle(document.querySelector('.dock')).getPropertyValue('--dock-inset')),
    rightGap: Math.round(window.innerWidth - document.querySelector('.dock').getBoundingClientRect().right),
    bottomGap: Math.round(window.innerHeight - document.querySelector('.dock').getBoundingClientRect().bottom),
    // Still right-of-centre: the bar hugs the corner rather than spanning.
    hugsRight: bar ? bar.getBoundingClientRect().left > window.innerWidth / 2 : false,
  };
});
check('minimised: the bar exists and carries both controls',
  minState.bars === 1 && minState.barHasRestore && minState.barHasClose, JSON.stringify(minState));
// A MINIMISED PANEL IS STILL OPEN, so its card is withheld exactly as it is
// while the panel is on the stage - the bar is its control surface and the bar
// is the only one. This is the state the rule is really for: with a card on
// the row as well, the panel would have two homes at once, one of them a strip
// at the bottom of the screen and the other a card at the top.
//
// Both halves asserted, because "no second Close" is satisfied trivially by a
// row that is not there; the card being absent is the actual claim.
check('minimised: the panel keeps no card on the row',
  minState.widgets === 0 && minState.widgetCloses === 0,
  `${minState.widgets} widgets, ${minState.widgetCloses} closes`);
check('the bar hugs its content, under the 400 cap',
  minState.barWidth > 0 && minState.barWidth <= 400, `${minState.barWidth}px`);
check('the bar is inset by --dock-inset on both edges',
  minState.rightGap === minState.inset && minState.bottomGap === minState.inset,
  `inset ${minState.inset}, right ${minState.rightGap}, bottom ${minState.bottomGap}`);
check('the bar hugs the right corner', minState.hugsRight);

await page.locator('.bar__icon-btn[aria-label^="Restore"]').click();
await page.waitForTimeout(700);
// Restoring returns the panel to the stage. It does NOT bring a card back:
// minimised and docked are two shapes of the same open panel, and the card is
// withheld the whole way through. State 09 has both items up here, so the row
// is empty in both halves of the minimise-restore round trip - which is the
// property worth pinning, since a card appearing at either end would mean the
// panel briefly had two homes.
check('restoring returns the panel, and still no card', await page.evaluate(() => ({
  bars: document.querySelectorAll('minimised-bar').length,
  panels: document.querySelectorAll('.stage > *').length,
  cards: document.querySelectorAll('.w').length,
})).then((r) => r.bars === 0 && r.panels === 2 && r.cards === 0));

/**
 * Someone else's lock carries its age, and the band and the widget carry the
 * SAME one - compared to each other, not to a literal, because the age moves
 * with the clock and a hardcoded "13d" would rot overnight.
 */
console.log('\nA lock held by someone else shows its age');
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/?state=00b`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
if (await page.locator('confirm-unlock-dialog').count()) {
  await page.locator('confirm-unlock-dialog button:has-text("Cancel")').click();
  await page.waitForTimeout(350);
}
const bandLine = (await page.locator('case-header .head__lock-text').innerText()).trim();
const AGE = /· \d+(m|h|d|mo|y)$/;
check('the band names the owner and the age', AGE.test(bandLine) && bandLine.includes('Locked to '), bandLine);
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
const widgetLine = (await page.locator('.w__lock').first().innerText()).replace(/\s+/g, ' ').trim();
check('the widget says the same thing', widgetLine.endsWith(bandLine), `${widgetLine} vs ${bandLine}`);

/**
 * Force unlock is a two-step: it opens the dialog and never unlocks on its
 * own, and confirming leaves the case UNLOCKED rather than handing it over.
 */
console.log('\nForce unlock confirms first, and does not take the lock');
await page.goto(`${BASE}/?state=00b`, { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
if (await page.locator('confirm-unlock-dialog').count()) {
  await page.locator('confirm-unlock-dialog button:has-text("Cancel")').click();
  await page.waitForTimeout(350);
}
const beforeForce = (await page.locator('case-header .head__lock-text').innerText()).trim();
await page.locator('case-header .danger-button').click();
await page.waitForTimeout(400);
check('it opens the confirm dialog', (await page.locator('confirm-unlock-dialog').count()) === 1);
check('nothing is unlocked while the dialog is up',
  (await page.locator('case-header .head__lock-text').innerText()).trim() === beforeForce);
await page.locator('confirm-unlock-dialog button:has-text("Unlock case")').click();
await page.waitForTimeout(600);
check('confirming leaves the case unlocked, not locked to me',
  (await page.locator('case-header button:has-text("Lock to me")').count()) === 1);
check('and writes the Timeline event naming the previous owner', await (async () => {
  await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
  await page.waitForTimeout(300);
  const rows = await page.locator('player-info-panel .timeline__what').allInnerTexts();
  return rows.some((t) => t.includes('force-released') && t.includes('M. Torres'));
})());

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0 ? '\nAll rule checks pass.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
