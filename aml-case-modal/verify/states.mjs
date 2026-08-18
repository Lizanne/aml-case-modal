import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Severity expectations are derived from the fixture, never written out here.
// The ranking is not the intuitive one (EDD outranks AML), so a literal in a
// test is just another place the direction can be hardcoded wrong.
const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/core/mock-case.json', import.meta.url)), 'utf8'),
);
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
    'two placeholders': (await p.locator('action-placeholder').count()) === 2,
    'submit disabled': await p.locator('.footer button:has-text("Submit decision")').isDisabled(),
  }),
  '00b': async (p) => ({
    'confirm dialog open': (await p.locator('confirm-unlock-dialog').count()) === 1,
    'names the owner': (await p.locator('confirm-unlock-dialog').innerText()).includes('M. Torres'),
    'confirm button says Unlock case': (await p.locator('confirm-unlock-dialog button:has-text("Unlock case")').count()) === 1,
    'header offers Force unlock': (await p.locator('case-header button:has-text("Force unlock")').count()) === 1,
  }),
  '01': async (p) => ({
    'two pending chips': (await p.locator('required-chips ui-pill[data-tone="outline"]').count()) === 2,
    'two placeholders': (await p.locator('action-placeholder').count()) === 2,
    'record enabled': await p.locator('action-placeholder button').first().isEnabled(),
    'submit disabled': await p.locator('.footer button:has-text("Submit decision")').isDisabled(),
  }),
  '02': async (p) => ({
    'record form open': (await p.locator('record-form form').count()) === 1,
    'two attachment errors': (await p.locator('record-form .error').count()) === 2,
    'valid files kept': (await p.locator('record-form .file').count()) === 2,
    'save disabled (no lock choice)': await p.locator('record-form button:has-text("Save outcome")').isDisabled(),
  }),
  '02b': async (p) => ({
    'form is Player contact': (await p.locator('record-form .form__title').innerText()).toLowerCase().includes('player contact'),
    'no errors': (await p.locator('record-form .error').count()) === 0,
    'save enabled': await p.locator('record-form button:has-text("Save outcome")').isEnabled(),
    'open-source placeholder still present': (await p.locator('action-placeholder').count()) === 1,
  }),
  '03': async (p) => ({
    'both chips done': (await p.locator('required-chips ui-pill[data-tone="success"]').count()) === 2,
    'no placeholders': (await p.locator('action-placeholder').count()) === 0,
    'severity event row shown': (await p.locator('event-row .row').count()) === 1,
    'submit enabled': await p.locator('.footer button:has-text("Submit decision")').isEnabled(),
    'header severity is the post-escalation one': (await p.locator('case-header ui-pill[data-sev]').innerText()).trim() === POST_ESCALATION,
  }),
  '04': async (p) => ({
    // The historical view is the shared snapshot header now, not a tinted
    // banner: the source action is the header LABEL.
    'snapshot header shown': (await p.locator('player-info-panel .snapshot-head').count()) === 1,
    'names source action': (await p.locator('player-info-panel .snapshot-head__label').innerText()).includes('Open source searches'),
    'timestamp reads as captured': (await p.locator('player-info-panel .snapshot-head__value').innerText()).startsWith('Captured '),
    'way back is the header control': (await p.locator('player-info-panel .snapshot-head .snapshot-head__back').count()) === 1,
  }),
  '05': async (p) => ({
    'severity dialog open': (await p.locator('severity-dialog').count()) === 1,
    'shows the current severity as the left pill': (await p.locator('severity-dialog .pair ui-pill').first().innerText()).trim() === POST_ESCALATION,
    'warns lock is lifted': (await p.locator('severity-dialog .warn-note').innerText()).toLowerCase().includes('lock is lifted'),
    'save disabled until reason': await p.locator('severity-dialog button:has-text("Save severity")').isDisabled(),
  }),
  '06': async (p) => ({
    'decision dialog open': (await p.locator('decision-dialog').count()) === 1,
    'requirements-met note is one plain line': await (async () => {
      const met = p.locator('decision-dialog .met');
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
          cs.backgroundColor === token('--success-bg') &&
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
    'no snapshot selected': (await p.locator('player-info-panel .empty').innerText()).includes('No snapshot selected'),
    'decision card present': (await p.locator('outcome-card .card--decision').count()) === 1,
    // The header meta carries the moment; the footer must not restate it.
    'no card restates the snapshot time': await (async () => {
      const cards = await p.locator('outcome-card').all();
      for (const c of cards) if (/Captured/i.test(await c.innerText())) return false;
      return cards.length > 0;
    })(),
    'View snapshot is the whole label': (
      await p.locator('outcome-card .card__actions').first().innerText()
    ).replace(/\s+/g, ' ').trim().endsWith('View snapshot'),
  }),
  '08': async (p) => ({
    'menu panel open': (await p.locator('.mat-mdc-menu-panel').count()) === 1,
    'three items': (await p.locator('.mat-mdc-menu-panel button.mat-mdc-menu-item').count()) === 3,
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
    'trigger strip shows the same single control': (await p.locator('trigger-strip .strip__verb').count()) === 1,
    'chips use short labels': (await p.locator('required-chips ui-pill').first().innerText()).includes('Searches'),
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
    // The badge is the single source of the count; assert it there rather
    // than off the scroll note, which only exists while expanded.
    '20 triggers total': (await p.locator('trigger-strip .strip__bar ui-pill').innerText()).trim() === '20 triggers',
    'new marker present': (await p.locator('trigger-strip .trigger--new').count()) === 1,
    'new row is first': (await p.locator('trigger-strip .trigger').first().getAttribute('class')).includes('trigger--new'),
    'resync banner shown': (await p.locator('workflow-panel .resync').count()) === 1,
    'recording blocked': await p.locator('action-placeholder button').first().isDisabled(),
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
console.log(failures === 0 ? '\nAll 13 states pass.' : `\n${failures} state(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
