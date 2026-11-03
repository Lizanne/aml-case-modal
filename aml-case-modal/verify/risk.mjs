import { chromium } from 'playwright';

/**
 * The Risk assessment, end to end, through the real controls.
 *
 *   - the section replaces the snapshot: grouped fields, statuses on every
 *     field that can carry one, none on Account information, a tooltip each
 *   - a new trigger is a workflow entry with a warning icon - no amber, no
 *     banner, nothing blocked
 *   - Resync is always visible, asks first, overlays the section, then
 *     applies the three rules and writes "Resync completed"
 *   - clicking a status opens the Assess risk form; saving updates the field
 *   - Finalise stays visible but disabled until no field is Action required,
 *     and the case cannot close until it is done
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

let failed = 0;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};
const go = async (state) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('aml-case-modal');
  await page.waitForTimeout(300);
};
// Resync stays focusable when it cannot be used, so "off" is aria-disabled.
const resyncOff = async () => (await page.locator('risk-assessment .ra-head__resync').getAttribute('aria-disabled')) === 'true';
const field = (id) => page.locator(`risk-assessment [data-field="${id}"]`);
// Press a row's action the way a person would: with the row in the middle of
// the panel, not scrolled flush under the sticky section band, and with no
// tooltip left open over it from an earlier keyboard check.
const act = async (id) => {
  await page.evaluate((fid) => {
    document.activeElement?.blur?.();
    const row = document.querySelector(`risk-assessment [data-field="${fid}"]`);
    const body = row.closest('.info__body');
    body.scrollTop += row.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientHeight / 2;
  }, id);
  await page.mouse.move(0, 0);
  await page.locator('.mat-mdc-tooltip').waitFor({ state: 'detached', timeout: 3000 }).catch(() => {});
  await field(id).locator('.ra-act').click({ timeout: 5000 });
};
const statusOf = (id) => field(id).locator('risk-status .status').getAttribute('data-risk');
const chips = () =>
  page.locator('required-chips ui-pill, required-chips risk-status .status').evaluateAll((els) =>
    els.map((e) => ({ label: e.getAttribute('aria-label') })),
  );
const amberRows = () =>
  page.evaluate(() =>
    [...document.querySelectorAll('aml-case-modal trigger-strip ui-pill')].filter(
      (p) => p.textContent.trim() === 'New',
    ).length,
  );

async function assess(id, answer, note) {
  await act(id);
  await page.waitForTimeout(400);
  await page.locator('record-form textarea').fill(note);
  await page
    .locator(`record-form fieldset.field--risk mat-radio-button:has-text("${answer === 'Yes' ? 'Risk flagged' : 'No risk'}") input`)
    .check({ force: true });
  await page.waitForTimeout(100);
  await page.locator('record-form button[type="submit"]').click();
  await page.waitForTimeout(250);
}

console.log('\nThe section');
await go('01');
const tabs = await page.locator('player-info-panel .mdc-tab').allInnerTexts();
check('the first tab is Risk assessment', tabs[0]?.trim() === 'Risk assessment', tabs.join('|'));
check('no Snapshot tab anywhere', !tabs.some((t) => /snapshot/i.test(t)));
const sections = await page.locator('risk-assessment .ra-sec__title').allInnerTexts();
check('seven sections, in the PDF order', sections.length === 7 && /ACCOUNT INFORMATION/.test(sections[0].toUpperCase()), sections.join('|'));
console.log('\nOrder: the work is above the fold');
const accToggle = page.locator('risk-assessment .ra-toggle');
const text = (sel) => page.evaluate((s) => document.querySelector(s)?.textContent.replace(/\s+/g, ' ').trim() ?? '', sel);
check('Account information opens collapsed, as a disclosure with its count',
  (await accToggle.getAttribute('aria-expanded')) === 'false' && /6 fields/.test(await text('risk-assessment .ra-toggle')) &&
  (await page.locator('risk-assessment .ra-sec').first().locator('.ra-row').count()) === 0);
check('the first assessed field is in view without scrolling', await page.evaluate(() => {
  const body = document.querySelector('.info__body').getBoundingClientRect();
  const row = document.querySelector('risk-assessment [data-field="employment-occupation"]').getBoundingClientRect();
  return row.bottom <= body.bottom;
}));
await accToggle.click(); await page.waitForTimeout(200);
check('it opens on click, rows return', (await accToggle.getAttribute('aria-expanded')) === 'true' && (await page.locator('risk-assessment .ra-sec').first().locator('.ra-row').count()) === 6);
check('Account information shows no status', (await page.locator('risk-assessment .ra-sec').first().locator('risk-status').count()) === 0);
await accToggle.click(); await page.waitForTimeout(200);
const sum = await text('risk-assessment .ra-sum');
check('the summary counts the panel', /2 to assess\s*·\s*10 flagged\s*·\s*6 no risk/.test(sum), sum);
const headBefore = await page.evaluate(() => document.querySelector('.head__main').getBoundingClientRect().top);
await page.locator('risk-assessment .ra-sum__filter').click(); await page.waitForTimeout(300);
check('"2 to assess" shows only the fields to assess - both, on one screen, under their own bands', await page.evaluate(() => {
  const rows = [...document.querySelectorAll('risk-assessment .ra-row')];
  const body = document.querySelector('.info__body').getBoundingClientRect();
  const bands = [...document.querySelectorAll('risk-assessment .ra-sec__title')].map((b) => b.textContent.trim());
  return rows.map((r) => r.dataset.field).join() === 'document-requests,open-source-searches' &&
    rows.every((r) => r.querySelector('risk-status [data-risk="action-required"]') && r.getBoundingClientRect().top >= body.top && r.getBoundingClientRect().bottom <= body.bottom) &&
    bands.join('|') === 'Verification risks|Open source intelligence';
}));
check('the count reads as pressed, and the way back is offered', (await page.locator('risk-assessment .ra-sum__filter').getAttribute('aria-pressed')) === 'true' &&
  (await page.locator('risk-assessment .ra-sum__all').innerText()).trim() === 'Show all');
check('the view is announced', /Showing 2 fields to assess/.test(await text('risk-assessment .ra-live')));
check('nothing scrolled: the modal shell and the case header stay put', await page.evaluate((before) => {
  const modal = document.querySelector('.modal');
  return (!modal || modal.scrollTop === 0) && document.querySelector('.info__body').scrollTop === 0 &&
    Math.abs(document.querySelector('.head__main').getBoundingClientRect().top - before) < 1;
}, headBefore));
check('Account information is folded out of the view', (await page.locator('risk-assessment .ra-toggle').count()) === 0);
await assess('document-requests', 'No', 'All documents approved.');
check('a field assessed in the view stays in it with its new status; the other still waits', await page.evaluate(() => {
  const rows = [...document.querySelectorAll('risk-assessment .ra-row')];
  const st = (r) => r.querySelector('risk-status .status').getAttribute('data-risk');
  return rows.map((r) => r.dataset.field + ':' + st(r)).join() === 'document-requests:no-risk,open-source-searches:action-required';
}));
check('the count follows', /1 to assess/.test(await text('risk-assessment .ra-sum')));
check('focus came back to the assessed row\'s action', await page.evaluate(() => document.activeElement?.closest('.ra-row')?.dataset.field === 'document-requests' && document.activeElement.classList.contains('ra-act--change')));
await page.locator('risk-assessment .ra-sum__all').click(); await page.waitForTimeout(300);
check('Show all brings the whole panel back', (await page.locator('risk-assessment .ra-row').count()) === 18 &&
  (await page.locator('risk-assessment .ra-sum__filter').getAttribute('aria-pressed')) === 'false' &&
  (await page.locator('risk-assessment .ra-sum__all').count()) === 0 &&
  /Showing all fields/.test(await text('risk-assessment .ra-live')));
await go('01');
check('the status is the sm pill: 20 tall, 12px word, 12px icon, centred in the head, 4px above the values', await page.evaluate(() => {
  const r = document.querySelector('risk-assessment [data-field="vpn-usage"]');
  const pill = r.querySelector('risk-status ui-pill'), icon = pill.querySelector('mat-icon');
  const pr = pill.getBoundingClientRect(), hr = r.querySelector('.ra-row__head').getBoundingClientRect();
  const val = r.querySelector('.ra-row__value').getBoundingClientRect().top;
  return pill.dataset.size === 'sm' && Math.abs(pr.height - 20) < 0.6 && getComputedStyle(pill).fontSize === '12px' &&
    Math.abs(icon.getBoundingClientRect().width - 12) < 0.6 && Math.abs(pr.top - hr.top - 2) < 0.6 && Math.abs(val - hr.bottom - 4) < 0.6;
}));
check('in the chip bar the status is the md pill, the same size as the other chips: 24 tall, 14px word, 16px icon', await page.evaluate(() => {
  const pills = [...document.querySelectorAll('required-chips ui-pill')];
  const hs = pills.map((p) => Math.round(p.getBoundingClientRect().height));
  const assess = pills.filter((p) => p.closest('risk-status'));
  return hs.every((h) => h === 24) && assess.length === 2 && assess.every((p) => p.dataset.size === 'md' && getComputedStyle(p).fontSize === '14px' &&
    Math.abs(p.querySelector('mat-icon').getBoundingClientRect().width - 16) < 0.6);
}));
await page.evaluate(() => { document.querySelector('.info__body').scrollTop = 0; });
console.log('\nSection bands');
check('a section title is a full-bleed band on the page tint, with a rule on top', await page.evaluate(() => {
  const band = document.querySelectorAll('risk-assessment .ra-sec__title')[1];
  const body = document.querySelector('.info__body').getBoundingClientRect();
  const r = band.getBoundingClientRect(); const cs = getComputedStyle(band);
  return Math.abs(r.left - body.left) < 1 && Math.abs(r.right - body.right) < 1 &&
    cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && parseFloat(cs.borderTopWidth) === 1 && cs.position === 'sticky';
}));
check('its label stays on the 20px gutter, in primary ink', await page.evaluate(() => {
  const label = document.querySelectorAll('risk-assessment .ra-sec__label')[1];
  const body = document.querySelector('.info__body').getBoundingClientRect();
  const ink = getComputedStyle(label).color;
  const probe = document.createElement('span'); probe.style.color = 'var(--foreground-primary)'; document.body.appendChild(probe);
  const want = getComputedStyle(probe).color; probe.remove();
  return Math.round(label.getBoundingClientRect().left - body.left) === 20 && ink === want;
}));
check('24px of clear space above a band, against a 21px row rhythm', await page.evaluate(() => {
  const secs = [...document.querySelectorAll('risk-assessment .ra-sec')];
  const prevRows = secs[1].querySelectorAll('.ra-row');
  const lastRow = prevRows[prevRows.length - 1].getBoundingClientRect();
  const band = secs[2].querySelector('.ra-sec__title').getBoundingClientRect();
  return Math.round(band.top - lastRow.bottom) === 24;
}));
check('the band is sticky: scrolled into a section, its title holds the top', await page.evaluate(() => {
  const body = document.querySelector('.info__body');
  const sec = document.querySelectorAll('risk-assessment .ra-sec')[4];
  const top = body.getBoundingClientRect().top;
  // Into the section by 80px: measured from the scrollport, not offsetTop,
  // which is relative to .ra-body.
  body.scrollTop += sec.getBoundingClientRect().top - top + 80;
  const band = sec.querySelector('.ra-sec__title').getBoundingClientRect();
  body.scrollTop = 0;
  return Math.abs(band.top - top) < 1;
}));
check('the three statuses wear the ui-pill tones: tint, subdued rim, ink', await page.evaluate(() => {
  const cs = (s) => getComputedStyle(document.querySelector(`risk-assessment risk-status [data-risk="${s}"]`));
  const is = (s, bg, rim, ink) => { const c = cs(s); return c.backgroundColor === bg && c.borderTopColor === rim && c.color === ink; };
  return is('risk', 'rgb(254, 242, 242)', 'rgb(254, 202, 202)', 'rgb(127, 29, 29)') &&
    is('no-risk', 'rgb(240, 253, 244)', 'rgb(187, 247, 208)', 'rgb(20, 83, 45)') &&
    is('action-required', 'rgb(254, 243, 199)', 'rgb(253, 230, 138)', 'rgb(120, 53, 15)');
}));
check('Employment & occupation is No risk', (await statusOf('employment-occupation')) === 'no-risk');
check('Linked accounts is Risk flagged', (await statusOf('linked-accounts')) === 'risk');
check('Open source searches is Action required', (await statusOf('open-source-searches')) === 'action-required');
check('Document requests is Action required', (await statusOf('document-requests')) === 'action-required');
const infoCount = await page.locator('risk-assessment button.ra-info').count();
const rowCount = await page.locator('risk-assessment .ra-row').count();
// 18 at rest: the six Account information rows are behind their disclosure.
check('every field has an info button', infoCount === rowCount && rowCount === 18, `${infoCount}/${rowCount}`);
// Reached by keyboard: Material shows a tooltip on keyboard focus, not on a
// scripted one, so focus the field before it and Tab across.
await page.locator('risk-assessment [data-field="employment-occupation"] .ra-act').focus();
await page.keyboard.press('Tab');
await page.waitForTimeout(700);
const tip = await page.locator('.ra-tooltip').innerText().catch(() => '');
check('the tooltip says what it is and when it is a risk', /SEON/.test(tip) && /Risk if: Any SEON score is above 100/.test(tip), tip);
await act('employment-occupation'); await page.waitForTimeout(300);
check('opening a form scrolls nothing above the panels', await page.evaluate(() => {
  const modal = document.querySelector('.modal');
  return !modal || modal.scrollTop === 0;
}));
check('the open row says Assessing on its bottom line, and its label line is unchanged', await page.evaluate(() => {
  const r = document.querySelector('risk-assessment [data-field="employment-occupation"]');
  return /Assessing$/.test(r.querySelector('.ra-row__meta').textContent.trim()) && !r.querySelector('.ra-row__head .ra-row__assessing');
}));
check('the open row has no action - its form is already up', (await field('employment-occupation').locator('.ra-act').count()) === 0 &&
  (await field('employment-occupation').locator('.ra-row__meta').count()) === 1);
await page.locator('record-form button:has-text("Cancel")').click(); await page.waitForTimeout(300);
check('every status row says who set it', await page.evaluate(() => {
  const meta = (id) => document.querySelector(`risk-assessment [data-field="${id}"] .ra-row__meta`)?.textContent.replace(/\s+/g, ' ').trim();
  return /^Not assessed yet\s*·\s*Assess$/.test(meta('document-requests')) && /^From the system\s*·\s*Change$/.test(meta('verification-result'));
}));
check('the pill alone holds the right edge of line 1', await page.evaluate(() => {
  const r = document.querySelector('risk-assessment [data-field="verification-result"]');
  const pill = r.querySelector('risk-status').getBoundingClientRect().right, head = r.querySelector('.ra-row__head').getBoundingClientRect().right;
  return Math.abs(pill - head) < 1 && !r.querySelector('.ra-row__head .ra-act');
}));
check('a status is never a button, only a label', (await page.locator('risk-assessment risk-status button').count()) === 0);
check('an assessed field carries a Change assessment icon button', (await field('employment-occupation').locator('.ra-act--change[aria-label="Change assessment of Employment & occupation"]').count()) === 1);
check('a field to assess carries an Assess button, named for its field', (await field('document-requests').locator('.ra-act--assess').getAttribute('aria-label')) === 'Assess Document requests' &&
  (await field('document-requests').locator('.ra-act--assess').innerText()).trim() === 'Assess');
check('informational fields have no action', (await page.locator('risk-assessment .ra-row').filter({ hasNot: page.locator('risk-status') }).locator('.ra-act').count()) === 0);
check('the action does not make the row taller', await page.evaluate(() => {
  const head = (id) => document.querySelector(`risk-assessment [data-field="${id}"] .ra-row__head`).getBoundingClientRect().height;
  return head('document-requests') <= 24.5 && head('employment-occupation') <= 24.5;
}));
check('Resync is visible and enabled', !(await resyncOff()));

console.log('\nRequired list on a new case');
const c1 = (await chips()).map((c) => c.label);
check('assess both manual fields, contact the player, finalise',
  c1.length === 4 &&
  c1.some((l) => l.startsWith('Assess risk - Open source searches')) &&
  c1.some((l) => l.startsWith('Assess risk - Document requests')) &&
  c1.some((l) => l.startsWith('Contact player')) &&
  c1.some((l) => l.startsWith('Finalise risk assessment')), c1.join('|'));
const finalizeBtn = page.locator('action-placeholder:has-text("Finalise risk assessment") button');
check('Finalise is visible', (await finalizeBtn.count()) === 1);
check('Finalise is disabled while fields are Action required', await finalizeBtn.isDisabled());
check('it says which fields are left',
  /Assess Document requests and Open source searches first/.test(await page.locator('action-placeholder:has-text("Finalise risk assessment")').innerText()));
check('Submit decision is disabled', await page.locator('workflow-panel footer button:has-text("Submit decision")').isDisabled());

console.log('\nNo View snapshot');
await go('03');
check('no outcome card offers View snapshot', (await page.locator('outcome-card button:has-text("snapshot")').count()) === 0);

console.log('\nA new trigger arrives');
await go('01');
await page.locator('button:has-text("New trigger")').click();
await page.waitForTimeout(300);
const entry = page.locator('event-row:has-text("New trigger added")');
check('a workflow entry: New trigger added - type', (await entry.count()) === 1 && /New trigger added - System - Threshold/.test(await entry.innerText()));
check('it carries a warning icon', (await entry.locator('mat-icon.row__icon--warn').innerText()).trim() === 'warning_amber');
check('no amber New badge in the trigger strip', (await amberRows()) === 0);
check('no out-of-sync banner', (await page.locator('workflow-panel .resync').count()) === 0 && !/out of sync/i.test(await page.locator('aml-case-modal').innerText()));
check('recording is not blocked', await page.locator('action-placeholder:has-text("Contact player") button').isEnabled());
check('Resync is still visible and enabled', !(await resyncOff()));

console.log('\nResync');
await page.locator('risk-assessment .ra-head__resync').click();
await page.waitForTimeout(300);
const dlg = page.locator('resync-dialog');
check('asks first', (await dlg.count()) === 1 && /Some actions might need to be recorded again/.test(await dlg.innerText()));
await dlg.locator('button:has-text("Cancel")').click();
await page.waitForTimeout(200);
check('Cancel changes nothing', (await page.locator('event-row:has-text("Resync completed")').count()) === 0 && (await statusOf('latest-fraud-scores')) === 'no-risk');
await page.locator('risk-assessment .ra-head__resync').click();
await page.waitForTimeout(200);
await page.locator('resync-dialog button.confirm').click();
await page.waitForTimeout(250);
check('the section is overlaid with Resyncing', (await page.locator('risk-assessment .ra-overlay').count()) === 1 && /Resyncing/.test(await page.locator('risk-assessment .ra-overlay').innerText()));
check('the section is aria-busy', (await page.locator('risk-assessment .ra-body').getAttribute('aria-busy')) === 'true');
check('Resync is disabled while it runs', await resyncOff());
await page.waitForTimeout(1700);
check('the overlay is gone', (await page.locator('risk-assessment .ra-overlay').count()) === 0);
const done = page.locator('event-row:has-text("Resync completed")');
const doneText = await done.innerText().catch(() => '');
check('workflow entry: Resync completed', (await done.count()) === 1);
check('it lists the updated values',
  /Updated values: Pending withdrawals, Latest fraud scores, VPN usage, Active payment methods, Deposit spike\./.test(doneText), doneText);
check('it names the risks that changed',
  /Risk associated with Latest fraud scores and Deposit spike changed - manual action needed\./.test(doneText), doneText);
check('value and risk changed: Action required', (await statusOf('latest-fraud-scores')) === 'action-required' && (await statusOf('deposit-spike')) === 'action-required');
check('value changed, risk not: status kept', (await statusOf('vpn-usage')) === 'risk' && (await statusOf('active-payment-methods')) === 'no-risk');
check('the new value replaces the old', /112 · 05 May 2026/.test(await field('latest-fraud-scores').innerText()) && /4 active cards/.test(await field('active-payment-methods').innerText()));
check('no history is shown', !/3 active cards/.test(await field('active-payment-methods').innerText()));
// Behind the disclosure, so open it to read it.
await page.locator('risk-assessment .ra-toggle').click(); await page.waitForTimeout(200);
check('informational values update too', /£1,250.04 total/.test(await field('pending-withdrawals').innerText()));
await page.locator('risk-assessment .ra-toggle').click(); await page.waitForTimeout(200);
const c2 = (await chips()).map((c) => c.label);
check('both join the required list', c2.some((l) => l.startsWith('Assess risk - Latest fraud scores')) && c2.some((l) => l.startsWith('Assess risk - Deposit spike')), c2.join('|'));
check('the announcement says what happened', /Resync completed\. Updated values/.test(await page.locator('risk-assessment .ra-live').innerText()));

console.log('\nA resync with nothing new');
await page.locator('risk-assessment .ra-head__resync').click();
await page.waitForTimeout(200);
await page.locator('resync-dialog button.confirm').click();
await page.waitForTimeout(1900);
const lastEntry = page.locator('event-row:has-text("Resync completed")').last();
check('No changes', /No changes\./.test(await lastEntry.innerText()));

console.log('\nAssessing a field from its status');
await act('latest-fraud-scores');
await page.waitForTimeout(500);
const form = page.locator('record-form');
check('opens the Assess risk form', (await form.count()) === 1 && /Assess risk - Latest fraud scores/.test(await form.locator('h3').innerText()));
check('Risk Yes/No comes after the attachments',
  await page.evaluate(() => {
    const att = document.querySelector('record-form .field__actions');
    const risk = document.querySelector('record-form fieldset.field--risk');
    return !!att && !!risk && (att.compareDocumentPosition(risk) & Node.DOCUMENT_POSITION_FOLLOWING) > 0;
  }));
check('Action required has no preselected answer', (await form.locator('fieldset.field--risk input:checked').count()) === 0);
check('the options are radios named with the outcomes, stacked like the lock choice', await page.evaluate(() => {
  const radios = [...document.querySelectorAll('record-form fieldset.field--risk mat-radio-button')];
  const labels = radios.map((r) => r.textContent.trim());
  const tops = radios.map((r) => Math.round(r.getBoundingClientRect().top));
  return labels.join() === 'Risk flagged,No risk' && tops[1] > tops[0] &&
    document.querySelectorAll('record-form fieldset.field--risk risk-status').length === 0;
}));
check('the group is a named radiogroup', await page.evaluate(() => {
  const g = document.querySelector('record-form fieldset.field--risk mat-radio-group');
  return g.getAttribute('role') === 'radiogroup' && g.getAttribute('aria-label') === 'Your assessment' &&
    g.querySelectorAll('input[type="radio"]').length === 2;
}));
check('focus is in the note', await page.evaluate(() => document.activeElement?.tagName === 'TEXTAREA'));
await form.locator('textarea').fill('Score of 112 traced to a shared device flag; reviewed with fraud team.');
check('Save is disabled until a Risk answer is chosen', await form.locator('button[type="submit"]').isDisabled());
await form.locator('fieldset.field--risk mat-radio-button:has-text("Risk flagged") input').check({ force: true });
await page.waitForTimeout(100);
await form.locator('button[type="submit"]').click();
await page.waitForTimeout(300);
check('the field now says Risk flagged', (await statusOf('latest-fraud-scores')) === 'risk');
check('and who assessed it', /Assessed by/.test(await field('latest-fraud-scores').innerText()));
const card = page.locator('outcome-card:has-text("Assess risk - Latest fraud scores")');
check('recorded in the workflow, with what it was', (await card.count()) === 1 && /Risk flagged/.test(await card.innerText()) && /Was Action required/.test(await card.innerText()));

console.log('\nOverride a system risk');
await assess('employment-occupation', 'Yes', 'Occupation updated by the player to a cash-intensive role.');
check('No risk overridden to Risk flagged', (await statusOf('employment-occupation')) === 'risk');
check('the card says what it replaced', /Was No risk/.test(await page.locator('outcome-card:has-text("Employment & occupation")').innerText()));

console.log('\nFinalize, then close');
await assess('deposit-spike', 'No', 'Spike matches a declared bonus payment.');
await assess('open-source-searches', 'No', 'No adverse media.');
check('Finalise still disabled with Document requests left', await finalizeBtn.isDisabled());
await assess('document-requests', 'No', 'Documents in order.');
check('Finalise is enabled once nothing is Action required', await finalizeBtn.isEnabled());
await page.locator('action-placeholder:has-text("Contact player") button').click();
await page.waitForTimeout(200);
await page.locator('record-form textarea').fill('Spoke to the player.');
await page.locator('record-form button[type="submit"]').click();
await page.waitForTimeout(250);
check('Submit decision still disabled before Finalise', await page.locator('workflow-panel footer button:has-text("Submit decision")').isDisabled());
await finalizeBtn.click();
await page.waitForTimeout(300);
const fin = page.locator('record-form');
check('Finalise has no attachments', (await fin.locator('.field__actions').count()) === 0 && (await fin.locator('fieldset.field--risk').count()) === 0);
// Icon ligatures stripped: the row is its section name and its status word.
const rows = await fin.locator('section-risk-table tbody tr').evaluateAll((trs) =>
  trs.map((tr) => `${tr.querySelector('th').textContent.trim()} ${tr.querySelector('.status__text').textContent.trim()}`),
);
check('it shows a table of sections, without Account information', rows.length === 6 && !rows.some((r) => /Account information/.test(r)), rows.join('|'));
check('a section is Risk flagged if any field in it is, in the same words as the rows', rows.includes('Verification risks Risk flagged') && rows.includes('Open source intelligence No risk'), rows.join('|'));
await fin.locator('textarea').fill('Overall: enhanced monitoring.');
await fin.locator('button[type="submit"]').click();
await page.waitForTimeout(300);
check('the finalise card carries the table', (await page.locator('outcome-card:has-text("Risk assessment finalised") section-risk-table').count()) === 1);
check('no assess actions once finalised', (await page.locator('risk-assessment .ra-act').count()) === 0);
check('Resync stays visible but disabled', (await page.locator('risk-assessment .ra-head__resync').count()) === 1 && await resyncOff());
check('Submit decision is enabled', await page.locator('workflow-panel footer button:has-text("Submit decision")').isEnabled());

console.log('\nSegmented layout: a status brings the workflow forward');
await page.setViewportSize({ width: 700, height: 900 });
await go('01');
await page.locator('mat-button-toggle:has-text("Player info") button').click();
await page.waitForTimeout(300);
await act('employment-occupation');
await page.waitForTimeout(500);
check('the workflow is shown with the form in it', (await page.locator('record-form').count()) === 1 && (await page.locator('record-form').isVisible()));
await page.setViewportSize({ width: 1440, height: 1000 });

console.log('\nNo lock, no assessing');
await go('00a');
check('no assess actions when unlocked', (await page.locator('risk-assessment .ra-act').count()) === 0);
check('Resync is visible but disabled', await resyncOff());

console.log('\nFocus returned by a dialog does not paint the button grey');
await go('01');
const layer = () => page.evaluate(() => {
  const btn = document.querySelector('risk-assessment .ra-head__resync');
  return { focused: document.activeElement === btn, opacity: getComputedStyle(btn.querySelector('.mat-mdc-button-persistent-ripple'), '::before').opacity };
});
await page.locator('risk-assessment .ra-head__resync').click(); await page.waitForTimeout(300);
await page.locator('resync-dialog button:has-text("Cancel")').click(); await page.waitForTimeout(400);
await page.mouse.move(900, 600); await page.waitForTimeout(200);
const afterCancel = await layer();
check('after Cancel the button holds focus but shows no state layer', afterCancel.focused && afterCancel.opacity === '0', JSON.stringify(afterCancel));
await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab'); await page.waitForTimeout(200);
const keyboard = await layer();
check('keyboard focus still paints it', keyboard.focused && keyboard.opacity === '0.12', JSON.stringify(keyboard));

console.log('\nAn unsaved draft is never replaced');
await go('02');
const typed = await page.locator('record-form textarea').inputValue();
await act('employment-occupation');
await page.waitForTimeout(500);
check('the open draft stays, note intact',
  (await page.locator('record-form .form__title').innerText()).trim() === 'Assess risk - Open source searches' &&
  (await page.locator('record-form textarea').inputValue()) === typed);
check('it says why the new one did not open',
  /Save or cancel this draft before starting Assess risk - Employment & occupation\./.test(await page.locator('record-form .conflict').innerText()));
await page.locator('record-form button:has-text("Cancel")').click();
await page.waitForTimeout(300);
await act('employment-occupation');
await page.waitForTimeout(400);
check('once it is cancelled, the status opens its form',
  (await page.locator('record-form .form__title').innerText()).trim() === 'Assess risk - Employment & occupation' &&
  (await page.locator('record-form .conflict').count()) === 0);

console.log('\nFocus is handed back, never dropped');
const activeIs = (sel) => page.evaluate((s) => document.activeElement?.matches(s) ?? false, sel);
await go('01');
await act('employment-occupation');
await page.waitForTimeout(400);
await page.locator('record-form textarea').fill('Checked.');
await page.keyboard.press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
await page.waitForTimeout(400);
check('after saving, focus is back on the status it came from',
  await activeIs('risk-assessment [data-field="employment-occupation"] .ra-act'));
await act('verification-result');
await page.waitForTimeout(400);
await page.locator('record-form button:has-text("Cancel")').click();
await page.waitForTimeout(400);
check('after cancelling, the same', await activeIs('risk-assessment [data-field="verification-result"] .ra-act'));
await page.locator('action-placeholder[data-key="player-contact"] button').click();
await page.waitForTimeout(300);
await page.locator('record-form textarea').fill('Called.');
await page.locator('record-form button[type="submit"]').click();
await page.waitForTimeout(400);
check('saved from a placeholder: focus on the new card', await activeIs('outcome-card .card'));
await page.locator('action-placeholder[data-key="assess:document-requests"] button').click();
await page.waitForTimeout(300);
await page.locator('record-form button:has-text("Cancel")').click();
await page.waitForTimeout(400);
check('cancelled from a placeholder: focus back on its button',
  await activeIs('action-placeholder[data-key="assess:document-requests"] button'));
await page.locator('risk-assessment .ra-head__resync').click();
await page.waitForTimeout(300);
await page.locator('resync-dialog button.confirm').click();
await page.waitForTimeout(300);
check('during a resync, focus is still on Resync', await activeIs('risk-assessment .ra-head__resync'));
check('and it reads as unavailable', await resyncOff());
await page.waitForTimeout(1800);
check('after it, focus is still on Resync, available again',
  (await activeIs('risk-assessment .ra-head__resync')) && !(await resyncOff()));

console.log('\nKeyboard users hear why Resync is unavailable');
await go('00a');
// The DOM property, not Playwright's isEnabled(): that treats aria-disabled as
// disabled, which is exactly the distinction being tested.
check('unlocked: Resync is focusable but unavailable',
  (await page.evaluate(() => {
    const b = document.querySelector('risk-assessment .ra-head__resync');
    b.focus();
    return !b.disabled && document.activeElement === b;
  })) && (await resyncOff()));
check('its reason is attached', await page.evaluate(() => {
  const b = document.querySelector('risk-assessment .ra-head__resync');
  const id = b.getAttribute('aria-describedby') ?? '';
  return id.split(' ').some((x) => document.getElementById(x)?.textContent.trim() === 'Lock the case to resync.');
}));
await page.locator('risk-assessment .ra-head__resync').click({ force: true });
await page.waitForTimeout(300);
check('pressing it opens nothing', (await page.locator('resync-dialog').count()) === 0);
check('but it explains itself: the reason shows as its tooltip', /Lock the case to resync\./.test(await page.locator('.mat-mdc-tooltip').innerText().catch(() => '')));

console.log('\nHit areas and labels');
await go('01');
check('info and action hit areas are at least 40px tall', await page.evaluate(() => {
  const h = (sel) => {
    const el = document.querySelector(sel);
    const before = getComputedStyle(el, '::before');
    return el.getBoundingClientRect().height - parseFloat(before.top) - parseFloat(before.bottom);
  };
  return h('risk-assessment .ra-info') >= 40 && h('risk-assessment .ra-act') >= 40;
}));
const chipText = await page.locator('required-chips risk-status .status__text').allInnerTexts();
check('assessment chips show the field alone', chipText.some((t) => /Open source searches$/.test(t.trim())) && !chipText.some((t) => /Assess risk -/.test(t)), chipText.join('|'));
check('an assessment chip is the field\'s status pill, named with its status', await page.evaluate(() => {
  const chip = document.querySelector('required-chips risk-status .status');
  return chip?.getAttribute('data-risk') === 'action-required' &&
    /^Assess risk - .*: Action required$/.test(chip.getAttribute('aria-label') ?? '') &&
    chip.getAttribute('title') === 'Action required';
}));
check('the placeholder shows the field and its status pill',
  (await page.locator('action-placeholder[data-key="assess:document-requests"] .slot__title > span').first().innerText()).trim() === 'Document requests' &&
  (await page.locator('action-placeholder[data-key="assess:document-requests"] risk-status [data-risk="action-required"]').count()) === 1);
// Once assessed, the chip reads the answer rather than "done".
await act('document-requests');
await page.waitForTimeout(400);
await page.locator('record-form textarea').fill('In order.');
await page.locator('record-form fieldset.field--risk mat-radio-button:has-text("Risk flagged") input').check({ force: true });
await page.locator('record-form button[type="submit"]').click();
await page.waitForTimeout(400);
check('a Risk flagged assessment is a red chip, not a green tick', await page.evaluate(() => {
  const chips = [...document.querySelectorAll('required-chips risk-status .status')];
  const docs = chips.find((c) => /Document requests/.test(c.getAttribute('aria-label') ?? ''));
  return docs?.getAttribute('data-risk') === 'risk' && /: Risk flagged$/.test(docs.getAttribute('aria-label'));
}));
// Document requests was just assessed above, so its placeholder is gone; read the other one.
check('and each Assess button names its field',
  (await page.locator('action-placeholder[data-key="assess:open-source-searches"] button').getAttribute('aria-label')) === 'Assess Open source searches');

console.log('\nThe open assessment is marked on its row');
await go('01');
check('nothing is marked at rest', (await page.locator('risk-assessment .ra-row--open').count()) === 0);
await act('employment-occupation');
await page.waitForTimeout(400);
check('the row whose form is open is tinted and current',
  (await page.locator('risk-assessment .ra-row--open').count()) === 1 &&
  (await field('employment-occupation').getAttribute('aria-current')) === 'true' &&
  /Assessing/.test(await field('employment-occupation').innerText()));
check('the tint reaches the panel edges', await page.evaluate(() => {
  const row = document.querySelector('risk-assessment .ra-row--open').getBoundingClientRect();
  const body = document.querySelector('.info__body').getBoundingClientRect();
  return Math.abs(row.left - body.left) < 1 && Math.abs(row.right - body.right) < 1;
}));
check('the content stays on the gutter', await page.evaluate(() => {
  const open = document.querySelector('risk-assessment .ra-row--open .ra-row__label').getBoundingClientRect().left;
  const other = document.querySelector('risk-assessment .ra-row:not(.ra-row--open) .ra-row__label').getBoundingClientRect().left;
  return Math.abs(open - other) < 1;
}));
await page.locator('record-form button:has-text("Cancel")').click();
await page.waitForTimeout(300);
check('cancel clears it', (await page.locator('risk-assessment .ra-row--open').count()) === 0);
await page.locator('action-placeholder[data-key="assess:document-requests"] button').click();
await page.waitForTimeout(400);
check('opened from a placeholder, the row is marked too',
  (await field('document-requests').getAttribute('aria-current')) === 'true');
await page.locator('record-form textarea').fill('In order.');
await page.locator('record-form fieldset.field--risk mat-radio-button:has-text("No risk") input').check({ force: true });
await page.locator('record-form button[type="submit"]').click();
await page.waitForTimeout(400);
check('save clears it', (await page.locator('risk-assessment .ra-row--open').count()) === 0);

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
