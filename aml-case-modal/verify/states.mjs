import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Severity expectations are derived from the fixture, never written out here.
// The ranking is not the intuitive one (EDD outranks AML), so a literal in a
// test is just another place the direction can be hardcoded wrong.
const { FIXTURE } = await import('./_fixture.mjs');
const SEV_EVENTS = FIXTURE.workflow.filter((w) => w.kind === 'event' && w.type === 'severity-change');
const OPENING_SEVERITY = SEV_EVENTS[0]?.from ?? FIXTURE.case.severity;
const POST_ESCALATION = SEV_EVENTS[SEV_EVENTS.length - 1]?.to ?? FIXTURE.case.severity;

const BASE = process.env.BASE ?? 'http://localhost:4200';
// fileURLToPath, not URL.pathname: pathname is percent-encoded, so this
// project's path (it contains spaces) produced a literal "AML%20Case%20..."
// directory next to Projects/ instead of writing into verify/shots.
const OUT = process.env.OUT ?? fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

// [state, assertions] - each assertion is [label, selector-or-fn, expectation]
const CHECKS = {
  '00a': async (p) => ({
    'header shows the opening severity': (await p.locator('case-header ui-pill[data-sev]').innerText()).trim() === OPENING_SEVERITY,
    'lock button says Lock to me': (await p.locator('case-header button:has-text("Lock to me")').count()) === 1,
    'record buttons disabled': await p.locator('action-placeholder button').first().isDisabled(),
    // Two assessments, the contact and Finalise.
    'four placeholders': (await p.locator('action-placeholder').count()) === 4,
    'submit disabled': await p.locator('.footer button:has-text("Submit decision")').isDisabled(),
  }),
  '00b': async (p) => ({
    'confirm dialog open': (await p.locator('confirm-unlock-dialog').count()) === 1,
    'names the owner': (await p.locator('confirm-unlock-dialog').innerText()).includes('M. Torres'),
    'confirm button says Unlock case': (await p.locator('confirm-unlock-dialog button:has-text("Unlock case")').count()) === 1,
    'header offers Force unlock': (await p.locator('case-header button:has-text("Force unlock")').count()) === 1,
  }),
  '01': async (p) => ({
    'four pending chips': (await p.locator('required-chips ui-pill[data-tone="outline"], required-chips risk-status [data-risk="action-required"]').count()) === 4,
    'every pending chip is an Action required pill': (await p.locator('required-chips risk-status [data-risk="action-required"]').count()) === 4,
    'four placeholders': (await p.locator('action-placeholder').count()) === 4,
    'Finalise visible but disabled':
      await p.locator('action-placeholder:has-text("Finalise risk assessment") button').isDisabled(),
    'record enabled': await p.locator('action-placeholder button').first().isEnabled(),
    'submit disabled': await p.locator('.footer button:has-text("Submit decision")').isDisabled(),
    // A manual case opens with its creation event, and the empty line is about
    // OUTCOMES - so it stays, below the event rather than above it.
    'creation event heads the stream':
      (await p.locator('.stream > event-row').first().locator('.row__label').innerText()).trim() ===
      'Manual case created - Referral',
    'creation event is unboxed and carries no pill':
      (await p.locator('.stream > event-row ui-pill').count()) === 0,
    // The generic empty line is gone in every state: the dashed placeholders
    // name each outstanding action, which says more than "nothing yet" above
    // them ever did.
    'no empty-stream line anywhere': (await p.locator('.stream__empty').count()) === 0,
  }),
  '02': async (p) => ({
    'record form open': (await p.locator('record-form form').count()) === 1,
    'two attachment errors': (await p.locator('record-form .error').count()) === 2,
    // One, not two: the PDF that used to sit beside the image went with PDF
    // support. What this frame proves is unchanged - the seeded errors do not
    // take the valid file down with them.
    'valid files kept': (await p.locator('record-form .file').count()) === 1,
    // No lock default (feedback 12 Nov 2026): the agent chooses every time.
    'lock choice has no default': (await p.locator('record-form fieldset.field--lock .mat-mdc-radio-checked').count()) === 0,
    'it is the Open source searches assessment': (await p.locator('record-form .form__title').innerText()).trim() === 'Assess risk - Open source searches',
    'Risk has no answer yet': (await p.locator('record-form fieldset.field--risk input:checked').count()) === 0,
    // Preview (13 Nov 2026): the options are plain, no status ink on either,
    // and no pill until one is chosen.
    'the answers are plain radios, no status ink': await p.evaluate(() =>
      [...document.querySelectorAll('record-form fieldset.field--risk .mdc-label')].every((l) => getComputedStyle(l).color === getComputedStyle(document.querySelector('record-form fieldset.field--lock .mdc-label')).color)),
    'no preview pill before a choice': (await p.locator('record-form .field__legend risk-status').count()) === 0,
    'save waits for the Risk answer': await p.locator('record-form button:has-text("Save assessment")').isDisabled(),
    // Answering and choosing the lock is all it takes: the file errors still do not block it.
    'save enabled despite the file errors once answered': await (async () => {
      await p.locator('record-form fieldset.field--risk mat-radio-button:has-text("No risk") input').check({ force: true });
      await p.locator('record-form fieldset.field--lock mat-radio-button:has-text("Keep the case locked") input').check({ force: true });
      await p.waitForTimeout(100);
      return p.locator('record-form button:has-text("Save assessment")').isEnabled();
    })(),
  }),
  '02b': async (p) => ({
    'form is Player contact': (await p.locator('record-form .form__title').innerText()).toLowerCase().includes('player contact'),
    'no errors': (await p.locator('record-form .error').count()) === 0,
    'save enabled': await p.locator('record-form button:has-text("Save outcome")').isEnabled(),
    // Both assessments and Finalise are still outstanding.
    'the other placeholders still present': (await p.locator('action-placeholder').count()) === 3,
  }),
  '03': async (p) => ({
    'every chip done, Finalise included': (await p.locator('required-chips ui-pill[data-tone="success"], required-chips risk-status [data-risk="risk"], required-chips risk-status [data-risk="no-risk"]').count()) === 4,
    'done assessment chips read No risk, not done': (await p.locator('required-chips risk-status [data-risk="no-risk"]').count()) === 2,
    'the risk assessment shows as finalised': (await p.locator('risk-assessment .ra-final').count()) === 1,
    'no placeholders': (await p.locator('action-placeholder').count()) === 0,
    // Two event rows now: the case's own creation heads the stream, and the
    // severity change sits between the outcomes. Counted apart, because only
    // a severity change carries pills.
    'creation event heads the stream':
      (await p.locator('.stream > event-row').first().locator('.row__label').innerText()).trim() ===
      'Manual case created - Referral',
    'severity event row shown': (await p.locator('event-row:has(ui-pill)').count()) === 1,
    'submit enabled': await p.locator('.footer button:has-text("Submit decision")').isEnabled(),
    'header severity is the post-escalation one': (await p.locator('case-header ui-pill[data-sev]').innerText()).trim() === POST_ESCALATION,
  }),
  '04': async (p) => ({
    // Overriding a system risk: the form opened from the field's status.
    'the form assesses Employment & occupation': (await p.locator('record-form .form__title').innerText()).trim() === 'Assess risk - Employment & occupation',
    'prefilled with the current answer': (await p.locator('record-form fieldset.field--risk mat-radio-button:has-text("No risk") input').isChecked()),
    'appended, not in a placeholder slot': (await p.locator('action-placeholder').count()) === 4,
    'the field shows No risk': (await p.locator('risk-assessment [data-field="employment-occupation"] risk-status .status').getAttribute('data-risk')) === 'no-risk',
  }),
  '05': async (p) => ({
    'severity dialog open': (await p.locator('severity-dialog').count()) === 1,
    'shows the current severity as the left pill': (await p.locator('severity-dialog .pair ui-pill').first().innerText()).trim() === POST_ESCALATION,
    'warns lock is lifted': (await p.locator('severity-dialog .warn-note').innerText()).toLowerCase().includes('lock is lifted'),
    'save disabled until reason': await p.locator('severity-dialog button:has-text("Save severity")').isDisabled(),
  }),
  '06': async (p) => ({
    'decision dialog open': (await p.locator('decision-dialog').count()) === 1,
    'one notice, one plain line': await (async () => {
      const met = p.locator('decision-dialog .notice');
      if ((await met.count()) !== 1) return false;
      return met.evaluate((el) => {
        const token = (n) => {
          const probe = document.createElement('span');
          probe.style.color = `var(${n})`;
          document.body.appendChild(probe);
          const c = getComputedStyle(probe).color;
          probe.remove();
          return c;
        };
        const span = el.querySelector('span');
        const lines = Math.round(
          span.getBoundingClientRect().height / parseFloat(getComputedStyle(span).lineHeight),
        );
        const bold = [...el.querySelectorAll('*')].some(
          (e) => Number(getComputedStyle(e).fontWeight) > 400,
        );
        const underlined = [...el.querySelectorAll('*')].some(
          (e) => getComputedStyle(e).textDecorationLine !== 'none',
        );
        const cs = getComputedStyle(el);
        return (
          lines === 1 &&
          !bold &&
          !underlined &&
          el.querySelectorAll('a').length === 0 &&
          !!el.querySelector('mat-icon') &&
          // Assert the tokens reach the element, not which hex they hold.
          cs.backgroundColor === token('--success-bg-subtle') &&
          cs.color === token('--success')
        );
      });
    })(),
    'one textarea': (await p.locator('decision-dialog textarea').count()) === 1,
    'button says Submit and resolve': (await p.locator('decision-dialog button:has-text("Submit and resolve")').count()) === 1,
  }),
  '07': async (p) => ({
    'status pill Resolved': (await p.locator('case-header ui-pill[data-tone="success"]').innerText()).trim() === 'Resolved',
    'no chips': (await p.locator('required-chips').count()) === 0,
    'no placeholders': (await p.locator('action-placeholder').count()) === 0,
    'no add action': (await p.locator('add-action-menu').count()) === 0,
    'no footer': (await p.locator('workflow-panel .footer').count()) === 0,
    'two tabs only': (await p.locator('player-info-panel .mat-mdc-tab').count()) === 2,
    'the first tab is Risk assessment': (await p.locator('player-info-panel .mat-mdc-tab').first().innerText()).trim() === 'Risk assessment',
    'the risk assessment shows as finalised': (await p.locator('risk-assessment .ra-final').count()) === 1,
    'no assess actions': (await p.locator('risk-assessment .ra-act').count()) === 0,
    'no Resync on a resolved case': (await p.locator('risk-assessment .ra-head__resync').count()) === 0,
    'decision card present': (await p.locator('outcome-card .card--decision').count()) === 1,
    'finalise card with its table': (await p.locator('outcome-card section-risk-table').count()) === 1,
    'no View snapshot anywhere': (await p.locator('outcome-card button:has-text("snapshot")').count()) === 0,
  }),
  '08': async (p) => ({
    'menu panel open': (await p.locator('.mat-mdc-menu-panel').count()) === 1,
    // Contact player and Add a note. Assessing is done from a field's status.
    'two items': (await p.locator('.mat-mdc-menu-panel button.mat-mdc-menu-item').count()) === 2,
  }),
  '09': async (p) => ({
    // "Dual modal" means two modals sharing the width - the companion SG-alert
    // modal is what forces the AML modal into its narrow layout. Asserting only
    // the segmented control let a lone narrow modal pass as this frame.
    'companion SG modal rendered': (await p.locator('sg-alert-modal').count()) === 1,
    'two modals side by side, comparable width': await (async () => {
      const sg = await p.locator('sg-alert-modal .sg').boundingBox();
      const aml = await p.locator('aml-case-modal .modal').boundingBox();
      return !!sg && !!aml && sg.x + sg.width <= aml.x + 1 && Math.abs(sg.width - aml.width) < 60;
    })(),
    'segmented control shown': (await p.locator('mat-button-toggle-group').count()) === 1,
    'only one panel rendered': (await p.locator('workflow-panel').count()) + (await p.locator('player-info-panel').count()) === 1,
    // The strip moved into the left column, and narrow has no columns - so it
    // is on the Player info segment, not the Workflow one this frame opens on.
    // Selected here rather than asserted absent: the claim is that the control
    // is the SAME one at this width, which needs the strip on screen to test.
    'trigger strip shows the same single control': await (async () => {
      await p.locator('mat-button-toggle:has-text("Player info")').click();
      await p.waitForTimeout(500);
      const n = await p.locator('trigger-strip .strip__gap').count();
      await p.locator('mat-button-toggle:has-text("Workflow")').click();
      await p.waitForTimeout(500);
      return n === 1;
    })(),
    'chips use short labels': await (async () => {
      const labels = (await p.locator('required-chips ui-pill').allInnerTexts()).map((t) => t.replace(/^\S+\s*/, '').trim());
      return labels.includes('Contact') && labels.includes('Finalise') && !labels.some((l) => l.startsWith('Assess risk'));
    })(),
    // The narrow footer no longer splits into two full-width halves - it is
    // the same right-aligned pair as every other footer.
    'footer buttons sit right at their natural width': await (async () => {
      const footer = await p.locator('workflow-panel .footer').boundingBox();
      const a = await p.locator('workflow-panel .footer button').first().boundingBox();
      const b = await p.locator('workflow-panel .footer button').last().boundingBox();
      if (!footer || !a || !b) return false;
      const usesFullWidth = a.x - footer.x <= 21;
      return !usesFullWidth && Math.abs(footer.x + footer.width - (b.x + b.width) - 20) < 2;
    })(),
  }),
  '10': async (p) => ({
    // No badge to read it from - the strip has no header at all now. 10 seeds
    // the strip EXPANDED, so every trigger is in the DOM and the count is the
    // row count.
    '20 triggers total': (await p.locator('trigger-strip .trigger').count()) === 20,
    // Rule 11, revised: no amber, no NEW marker, no banner, nothing blocked.
    'no new marker': (await p.locator('trigger-strip .trigger--new').count()) === 0,
    'the arrival is a workflow entry with a warning icon': (await p.locator('event-row:has-text("New trigger added - Threshold") mat-icon.row__icon--warn').count()) === 1,
    'no resync banner': (await p.locator('workflow-panel .resync').count()) === 0,
    'recording not blocked': await p.locator('action-placeholder:has-text("Contact player") button').isEnabled(),
    'Resync visible and enabled': (await p.locator('risk-assessment .ra-head__resync').getAttribute('aria-disabled')) === null,
  }),
  '12': async (p) => ({
    'resync dialog open': (await p.locator('resync-dialog').count()) === 1,
    'asks first': /Some actions might need to be recorded again/.test(await p.locator('resync-dialog').innerText()),
  }),
  '13': async (p) => ({
    'overlay shown': /Resyncing/.test(await p.locator('risk-assessment .ra-overlay').innerText()),
    'section busy': (await p.locator('risk-assessment .ra-body').getAttribute('aria-busy')) === 'true',
    'Resync disabled while it runs': (await p.locator('risk-assessment .ra-head__resync').getAttribute('aria-disabled')) === 'true',
  }),
  '14': async (p) => ({
    'resync entry names the changed risks': /Risk associated with Latest fraud scores and Deposit spike changed - manual action needed\./.test(await p.locator('event-row:has-text("Resync completed")').innerText()),
    'both fields Action required': (await p.locator('risk-assessment [data-field="latest-fraud-scores"] .status, risk-assessment [data-field="deposit-spike"] .status').evaluateAll((els) => els.every((e) => e.getAttribute('data-risk') === 'action-required'))),
    'two new assessment placeholders and Finalise': (await p.locator('action-placeholder').count()) === 3,
    'Finalise disabled': await p.locator('action-placeholder:has-text("Finalise risk assessment") button').isDisabled(),
  }),
  '15': async (p) => ({
    'finalise form open': (await p.locator('record-form .form__title').innerText()).trim() === 'Finalise risk assessment',
    'section table shown': (await p.locator('record-form section-risk-table tbody tr').count()) === 6,
    'no attachments': (await p.locator('record-form .field__actions').count()) === 0,
    'button says Record, not Finalise': (await p.locator('record-form button[type="submit"]').innerText()).trim() === 'Record',
  }),
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(String(e)));

let failures = 0;
for (const [state, check] of Object.entries(CHECKS)) {
  const before = consoleErrors.length;
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('aml-case-modal', { timeout: 10000 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/${state}.png`, fullPage: false });

  let results;
  try {
    results = await check(page);
  } catch (err) {
    console.log(`${state}: THREW ${err.message}`);
    failures++;
    continue;
  }
  const bad = Object.entries(results).filter(([, ok]) => !ok);
  const newErrors = consoleErrors.slice(before);
  if (bad.length === 0 && newErrors.length === 0) {
    console.log(`${state}: PASS (${Object.keys(results).length} checks)`);
  } else {
    failures++;
    console.log(`${state}: FAIL`);
    bad.forEach(([label]) => console.log(`    - ${label}`));
    newErrors.forEach((e) => console.log(`    ! console: ${e.slice(0, 200)}`));
  }
}

await browser.close();
console.log(failures === 0 ? `\nAll ${Object.keys(CHECKS).length} states pass.` : `\n${failures} state(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
