import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Rule 8 (severity ranking) and rule 5 (draft attachments).
 *
 * The ranking is NOT the intuitive one: mock-case.json ranks EDD above AML, so
 * AML -> EDD is an escalation. Every check here is written against that, so a
 * hardcoded direction anywhere fails loudly.
 */
const FIXTURE = JSON.parse(
  readFileSync(fileURLToPath(new URL('../src/app/core/mock-case.json', import.meta.url)), 'utf8'),
);
let SEV_TOKEN;

const BASE = process.env.BASE ?? 'http://localhost:4200';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

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
const headerPill = () => page.locator('case-header ui-pill[data-sev]');
const rgb = (el) => page.evaluate((e) => getComputedStyle(e).color, el);

// Read the tokens from the running app rather than restating their hex here.
// A literal in the test is just another copy of the value, free to drift the
// moment a token is retuned - which is exactly what happened when --sev-edd was
// darkened for contrast.
const token = async (name) =>
  page.evaluate((n) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${n})`;
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).color;
    probe.remove();
    return c;
  }, name);
let AML_TONE, EDD_TONE, WARN;

await go('01');
AML_TONE = await token('--sev-aml');
EDD_TONE = await token('--sev-edd');
WARN = await token('--warn');
console.log(`tokens: --sev-aml ${AML_TONE}  --sev-edd ${EDD_TONE}  --warn ${WARN}`);

console.log('\nPre-escalation states: the case opens at AML');
for (const state of ['00a', '01', '02', '10', '09']) {
  await go(state);
  const text = (await headerPill().innerText()).trim();
  const colour = await rgb(await headerPill().elementHandle());
  check(`${state}: header pill reads AML`, text === 'AML', text);
  check(`${state}: header pill is the AML tone`, colour === AML_TONE, colour);
}

console.log('\nPost-escalation states: EDD');
for (const state of ['03', '07']) {
  await go(state);
  const text = (await headerPill().innerText()).trim();
  const colour = await rgb(await headerPill().elementHandle());
  check(`${state}: header pill reads EDD`, text === 'EDD', text);
  check(`${state}: header pill is the EDD tone`, colour === EDD_TONE, colour);
}

console.log('\nThe severity event in the stream reads AML -> EDD, escalation');
await go('03');
const eventPills = await page.locator('event-row ui-pill').allInnerTexts();
check('event pills are AML then EDD', eventPills.map((t) => t.trim()).join('->') === 'AML->EDD',
  eventPills.join('->'));
check('the row calls it an escalation',
  (await page.locator('event-row .row').innerText()).includes('Severity escalation'));
/**
 * The direction arrow is gone. PROTOTYPE.md gave it a warn tone on escalation;
 * the label and the two pills carry the direction now, so there is nothing
 * left for a third signal to add. What matters is that the ONLY icon left is
 * the between-pills arrow.
 */
check('no direction arrow, only the between-pills one', await page.evaluate(() => {
  const icons = [...document.querySelectorAll('event-row mat-icon')].map((i) => i.textContent.trim());
  return icons.length === 1 && icons[0] === 'arrow_forward';
}));
// Primary ink, per 22319:5225 - the label is the row's heading now that the
// row is a card, and --ink-2 made it read as secondary to its own reason line.
// The pills are the only coloured parts now.
check('the label is primary ink',
  (await page.evaluate(() =>
    getComputedStyle(document.querySelector('event-row .row__label')).color)) === (await token('--ink')));

console.log('\nThe severity dialog: AML -> EDD with an Escalation badge');
await go('01'); // pre-escalation, so current severity is AML
await page.locator('.footer button:has-text("Adjust severity")').click();
await page.waitForTimeout(300);
check('dialog opens showing the current severity as AML',
  (await page.locator('severity-dialog .pair ui-pill').first().innerText()).trim() === 'AML');
await page.locator('severity-dialog mat-radio-button:has-text("EDD") input').check({ force: true });
await page.waitForTimeout(250);
const pair = (await page.locator('severity-dialog .pair ui-pill').allInnerTexts()).map((t) => t.trim());
check('the pill pair is AML -> EDD', pair[0] === 'AML' && pair[1] === 'EDD', pair.join('->'));
check('the badge says Escalation',
  (await page.locator('severity-dialog ui-pill[data-tone="warn"]').innerText()).includes('Escalation'));
check('the badge does NOT say De-escalation',
  !(await page.locator('severity-dialog ui-pill[data-tone="warn"]').innerText()).includes('De-escalation'));

console.log('\nAnd the reverse is a de-escalation');
await go('03'); // current severity EDD
await page.locator('.footer button:has-text("Adjust severity")').click();
await page.waitForTimeout(300);
await page.locator('severity-dialog mat-radio-button:has-text("AML") input').check({ force: true });
await page.waitForTimeout(250);
check('EDD -> AML is labelled De-escalation',
  (await page.locator('severity-dialog ui-pill[data-tone="warn"]').innerText()).includes('De-escalation'));

console.log('\nSaving a change applies the new severity everywhere');
await go('01');
await page.locator('.footer button:has-text("Adjust severity")').click();
await page.waitForTimeout(300);
await page.locator('severity-dialog mat-radio-button:has-text("EDD") input').check({ force: true });
await page.locator('severity-dialog textarea').fill('Open source findings require enhanced due diligence.');
await page.waitForTimeout(200);
await page.locator('severity-dialog button:has-text("Save severity")').click();
await page.waitForTimeout(400);
check('header pill is now EDD', (await headerPill().innerText()).trim() === 'EDD');
check('header pill is now the EDD tone', (await rgb(await headerPill().elementHandle())) === EDD_TONE);
check('a new event row says escalation',
  (await page.locator('event-row .row').last().innerText()).includes('Severity escalation'));

/**
 * The event row's shape: two lines, no box, and a first line that cannot give.
 *
 * The height check compares the row against ITSELF with a long reason
 * substituted in, rather than against a literal - the point is that the length
 * of someone's sentence does not move the row, and a hardcoded 74 would pass
 * just as well if both were wrong.
 */
console.log('\nSeverity event row: two lines, fixed first line');
const evShape = async () => page.evaluate(() => {
  const e = document.querySelector('event-row');
  const row = e.querySelector('.row');
  const head = e.querySelector('.row__head');
  const meta = e.querySelector('.row__meta');
  const reason = e.querySelector('.row__reason');
  const cs = getComputedStyle(row);
  return {
    h: Math.round(row.getBoundingClientRect().height),
    borderW: cs.borderTopWidth, bg: cs.backgroundColor, radius: cs.borderRadius,
    // Measured as the actual gap between the row's edge and its content, so a
    // reserved line inside the reason would show up as extra space below.
    padAbove: Math.round(head.getBoundingClientRect().top - row.getBoundingClientRect().top),
    padBelow: Math.round(row.getBoundingClientRect().bottom - reason.getBoundingClientRect().bottom),
    pillSizes: [...e.querySelectorAll('ui-pill')].map((x) => x.getAttribute('data-size')),
    iconSizes: [...e.querySelectorAll('mat-icon')].map((i) => getComputedStyle(i).width),
    // Right-aligned to the line, whole, and not clipped.
    metaFlushRight: Math.round(head.getBoundingClientRect().right - meta.getBoundingClientRect().right) === 0,
    metaClipped: meta.scrollWidth - meta.clientWidth > 1,
    headOverflows: head.scrollWidth - head.clientWidth > 1,
    reasonLines: Math.round(reason.getBoundingClientRect().height / 20),
    reasonClamped: reason.scrollHeight - reason.clientHeight > 1,
    hasTitle: !!reason.getAttribute('title'),
  };
});
const LONG = 'Escalated after the adverse media review surfaced two further matches that could not be excluded on name alone, and the source-of-funds documentation supplied by the player does not reconcile with the deposit pattern observed over the last ninety days.';
const setReason = (t) => page.evaluate((text) => {
  const r = document.querySelector('event-row .row__reason');
  r.textContent = text;
  r.setAttribute('title', text);
}, t);
const SHORT = await page.evaluate(() => document.querySelector('event-row .row__reason').textContent);
// 900 puts the panel at roughly the width one half of the dual layout gets, so
// this is the narrow stream and not a second run at the same size.
for (const [label, w] of [['1440', 1440], ['narrow panel', 900]]) {
  await page.setViewportSize({ width: w, height: 1000 });
  await page.waitForTimeout(350);
  await setReason(SHORT);
  await page.waitForTimeout(200);
  const short = await evShape();
  await setReason(LONG);
  await page.waitForTimeout(200);
  const long = await evShape();
  check(`${label}: no fill and no border`,
    short.borderW === '0px' && short.bg === 'rgba(0, 0, 0, 0)', `${short.borderW} ${short.bg}`);
  check(`${label}: both severity pills are sm`,
    short.pillSizes.length === 2 && short.pillSizes.every((s) => s === 'sm'), short.pillSizes.join(','));
  // One arrow now, between the pills - the direction arrow is gone.
  check(`${label}: the only arrow is 16px`,
    short.iconSizes.length === 1 && short.iconSizes[0] === '16px', short.iconSizes.join(','));
  // Hugging, not reserving: one line for a short reason, two for a long one.
  check(`${label}: a short reason is one line`, short.reasonLines === 1, `${short.reasonLines}`);
  check(`${label}: a long reason clamps at two`, long.reasonLines === 2 && long.reasonClamped,
    `${long.reasonLines} lines, clamped=${long.reasonClamped}`);
  check(`${label}: a short reason does not clamp`, !short.reasonClamped);
  check(`${label}: the full text is on title`, long.hasTitle);
  // The row is TALLER with a long reason - the old min-height made these equal
  // by reserving a line that was not being used.
  check(`${label}: the row grows by exactly the extra line`,
    long.h - short.h === 20, `${short.h} -> ${long.h}`);
  // ...and the padding is untouched by which of the two it is.
  check(`${label}: padding above and below is unchanged`,
    short.padAbove === long.padAbove && short.padBelow === long.padBelow,
    `above ${short.padAbove}/${long.padAbove}, below ${short.padBelow}/${long.padBelow}`);
  check(`${label}: author and time stay flush right`, long.metaFlushRight);
  check(`${label}: author and time are never clipped`, !long.metaClipped);
  check(`${label}: line one does not overflow`, !long.headOverflows);
}
await page.setViewportSize({ width: 1440, height: 1000 });
await setReason(SHORT);
await page.waitForTimeout(300);
check('the timeline entry names the direction', await (async () => {
  await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
  await page.waitForTimeout(300);
  const rows = await page.locator('player-info-panel .timeline__what').allInnerTexts();
  return rows.some((r) => r.includes('AML to EDD') && r.includes('escalation'));
})());

/**
 * The widget follows the escalation too - checked with the panel CLOSED,
 * because it has to be. The widget row does not render while a panel is open,
 * so the old side-by-side comparison is no longer a thing the composition can
 * show. Closing first still proves the point that matters: the badge is driven
 * by the store, not by anything the panel was holding open.
 */
check('the row is hidden while the panel is up',
  (await page.locator('back-office-widgets .w').count()) === 0);
/**
 * The widget's own view of the escalation is checked at the END of this file,
 * with the panel CLOSED.
 *
 * It used to minimise and read the row underneath. Minimising no longer brings
 * the row back - a minimised panel is still open, and its bar is its only
 * control surface - so there is no longer any point in the run where the panel
 * and its widget are both on screen. Closing is the only way to see the
 * widget, and closing here would take the case away from everything below.
 */

// ---------------------------------------------------------------- attachments
console.log('\nDraft attachments are removable; saved ones are not');
const dir = join(tmpdir(), 'aml-verify-files');
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, 'report.pdf'), '%PDF-1.4 fake');
writeFileSync(join(dir, 'notes.docx'), 'x');
writeFileSync(join(dir, 'oversize.pdf'), Buffer.concat([Buffer.from('%PDF-1.4'), Buffer.alloc(11 * 1024 * 1024)]));

await go('02'); // a draft carrying two valid files and two errors
check('draft chips each have a remove control',
  (await page.locator('record-form .file').count()) ===
    (await page.locator('record-form .file__remove').count()));
check('errors are shown alongside', (await page.locator('record-form .error').count()) === 2);

const before = await page.locator('record-form .file').count();
await page.locator('record-form .file__remove').first().click();
await page.waitForTimeout(300);
check('removing a chip while errors are on screen works',
  (await page.locator('record-form .file').count()) === before - 1);
check('and leaves the errors untouched', (await page.locator('record-form .error').count()) === 2);

await go('03');
check('saved outcome chips have no remove control',
  (await page.locator('outcome-card .file').count()) > 0 &&
    (await page.locator('outcome-card .file__remove').count()) === 0);

console.log('\nRemoving the last attachment leaves Save enabled');
await go('01');
await page.locator('action-placeholder button:has-text("Record")').first().click();
await page.waitForTimeout(300);
await page.locator('record-form textarea').fill('Note is the only required field.');
await page.locator('record-form mat-radio-button:has-text("Keep the case locked") input').check({ force: true });
await page.waitForTimeout(200);
await page.locator('record-form input[type=file]').setInputFiles([
  join(dir, 'report.pdf'), join(dir, 'notes.docx'), join(dir, 'oversize.pdf'),
]);
await page.waitForTimeout(400);
check('one file accepted, two rejected',
  (await page.locator('record-form .file').count()) === 1 &&
    (await page.locator('record-form .error').count()) === 2);
check('Save is enabled with an attachment',
  await page.locator('record-form button:has-text("Save outcome")').isEnabled());
await page.locator('record-form .file__remove').click();
await page.waitForTimeout(300);
check('the last attachment can be removed',
  (await page.locator('record-form .file').count()) === 0);
check('Save is STILL enabled with no attachments at all',
  await page.locator('record-form button:has-text("Save outcome")').isEnabled());
check('the note survived the removal',
  (await page.locator('record-form textarea').inputValue()) === 'Note is the only required field.');
await page.locator('record-form button:has-text("Save outcome")').click();
await page.waitForTimeout(400);
check('and it saves', (await page.locator('outcome-card').count()) === 1);
check('the saved outcome has no attachments and no remove control',
  (await page.locator('outcome-card .file__remove').count()) === 0);


// ---------------------------------------------- the confirmed ranking, in full
console.log('\nRanking: AML < EDD < COMPLIANCE, any direction allowed');

// Drive the dialog from a known current severity and read the badge back.
const directionFor = async (from, to) => {
  await go(from === 'AML' ? '01' : '03'); // 01 opens at AML, 03 sits at EDD
  if (from === 'COMPLIANCE') {
    // Walk EDD -> COMPLIANCE first so COMPLIANCE is the current severity.
    await page.locator('.footer button:has-text("Adjust severity")').click();
    await page.waitForTimeout(250);
    await page.locator('severity-dialog mat-radio-button:has-text("Compliance") input').check({ force: true });
    await page.locator('severity-dialog textarea').fill('Staging a de-escalation.');
    await page.waitForTimeout(150);
    await page.locator('severity-dialog button:has-text("Save severity")').click();
    await page.waitForTimeout(350);
    // Severity change lifts the lock (rule 8); re-lock to reopen the dialog.
    await page.locator('case-header button:has-text("Lock to me")').click();
    await page.waitForTimeout(250);
  }
  const current = (await page.locator('case-header ui-pill[data-sev]').innerText()).trim();
  await page.locator('.footer button:has-text("Adjust severity")').click();
  await page.waitForTimeout(250);
  const label = to === 'COMPLIANCE' ? 'Compliance' : to;
  await page.locator(`severity-dialog mat-radio-button:has-text("${label}") input`).check({ force: true });
  await page.waitForTimeout(200);
  const badge = (await page.locator('severity-dialog ui-pill[data-tone="warn"]').innerText()).trim();
  const options = (await page.locator('severity-dialog mat-radio-button').allInnerTexts()).map((t) => t.trim());
  return { current, badge, options };
};

for (const [from, to, expected] of [
  ['AML', 'EDD', 'Escalation'],
  ['EDD', 'COMPLIANCE', 'Escalation'],
  ['COMPLIANCE', 'AML', 'De-escalation'],
]) {
  const r = await directionFor(from, to);
  check(`current severity is ${from} as staged`, r.current.toUpperCase().startsWith(from.slice(0, 3)), r.current);
  check(
    `${from} -> ${to} reads ${expected}`,
    expected === 'Escalation'
      ? r.badge.includes('Escalation') && !r.badge.includes('De-escalation')
      : r.badge.includes('De-escalation'),
    r.badge,
  );
  check(
    `${from}: the radio group offers exactly the two non-current severities`,
    r.options.length === 2 && !r.options.some((o) => o.toUpperCase().startsWith(from.slice(0, 3))),
    r.options.join(' / '),
  );
}

// ------------------------------------------------------- decision card a11y
console.log('\nResolved decision card: every bit of copy clears WCAG AA');
await go('07');
const contrast = await page.evaluate(() => {
  const chan = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = (rgb) => {
    const [r, g, b] = rgb.match(/[\d.]+/g).slice(0, 3).map((n) => Number(n) / 255);
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const ratio = (a, b) => {
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  const card = document.querySelector('outcome-card .card--decision');
  if (!card) return null;
  const cs = getComputedStyle(card);
  const bg = cs.backgroundColor;

  // Every leaf element that actually renders text.
  const leaves = [...card.querySelectorAll('*')].filter(
    (e) => e.children.length === 0 && e.textContent.trim().length > 0,
  );
  const results = leaves.map((e) => {
    const s = getComputedStyle(e);
    const px = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight) || 400;
    // WCAG "large text": >=24px, or >=18.66px when bold.
    const large = px >= 24 || (px >= 18.66 && weight >= 700);
    return {
      text: e.textContent.trim().slice(0, 28),
      px,
      weight,
      required: large ? 3 : 4.5,
      ratio: Number(ratio(s.color, bg).toFixed(2)),
    };
  });
  return { bg, border: cs.borderTopColor, borderWidth: cs.borderTopWidth, results };
});

check('the decision card exists and is tinted', !!contrast && contrast.bg !== 'rgba(0, 0, 0, 0)',
  contrast?.bg);
check('border is 2px', contrast?.borderWidth === '2px', contrast?.borderWidth);
const worst = contrast.results.reduce((a, b) => (a.ratio < b.ratio ? a : b));
for (const r of contrast.results) {
  check(`"${r.text}" ${r.ratio}:1 (needs ${r.required})`, r.ratio >= r.required);
}
check(`worst element clears AA (${worst.ratio}:1 on "${worst.text}")`, worst.ratio >= worst.required);

// The one action on the card must not melt into the tint. Alpha is composited
// before measuring: Material's default outline is rgba(0,0,0,0.12), which a
// naive ratio would score as if it were solid black.
const action = await page.evaluate(() => {
  const chan = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const parse = (s) => s.match(/[\d.]+/g).map(Number);
  const over = (fg, bg) => {
    const f = parse(fg), b = parse(bg), a = f.length > 3 ? f[3] : 1;
    return [0, 1, 2].map((i) => f[i] * a + b[i] * (1 - a));
  };
  const lumArr = (a) => {
    const [r, g, b] = a.map((n) => n / 255);
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  };
  const ratio = (fg, bg) => {
    const f = lumArr(over(fg, bg)), b2 = lumArr(parse(bg).slice(0, 3));
    const [hi, lo] = [f, b2].sort((x, y) => y - x);
    return Number(((hi + 0.05) / (lo + 0.05)).toFixed(2));
  };
  const card = document.querySelector('outcome-card .card--decision');
  const btn = card.querySelector('.card__actions button');
  const cc = getComputedStyle(card), bc = getComputedStyle(btn);
  return {
    fillIsWhite: bc.backgroundColor === 'rgb(255, 255, 255)',
    boundary: ratio(bc.borderTopColor, cc.backgroundColor),
    label: ratio(bc.color, bc.backgroundColor),
  };
});
check('View snapshot sits on a white fill', action.fillIsWhite);
// The outline is deliberately Material's default, so the boundary is faint.
// What must hold is that the LABEL identifies the control (WCAG 1.4.11 asks
// 3:1 only of visual information required for identification).
console.log(`       (button boundary vs card tint: ${action.boundary}:1 - label carries identification)`);
check(`its label clears AA on that fill (${action.label}:1, needs 4.5)`, action.label >= 4.5);


// ------------------------------------------------------------- past AML cases
SEV_TOKEN = {
  AML: AML_TONE,
  EDD: EDD_TONE,
  COMPLIANCE: await token('--sev-compliance'),
};
console.log('\nPast AML cases: three shared columns, and severity frozen at resolution');
await go('01');
await page.locator('player-info-panel .mat-mdc-tab:has-text("Past AML cases")').click();
await page.waitForTimeout(400);

/**
 * The declared track, and what a subgrid row actually renders of it.
 *
 * .past declares the 90px ID column; each row is grid-template-columns:
 * subgrid with its own horizontal padding and column-gap, and BOTH eat into
 * the first track - the rendered cell is the parent track minus the row's
 * left padding minus half its gap. Asserting a hand-tuned band of pixels made
 * a padding change look like a broken column, so the band is derived instead
 * and the 90px design value is pinned separately, where it belongs.
 */
const track = await page.evaluate(() => {
  const parent = document.querySelector('.past');
  const row = document.querySelector('.past__row');
  const rcs = getComputedStyle(row);
  return {
    declared: parseFloat(getComputedStyle(parent).gridTemplateColumns.split(' ')[0]),
    padLeft: parseFloat(rcs.paddingLeft),
    gap: parseFloat(rcs.columnGap),
  };
});

const past = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.past__row')];
  const cell = (r, sel) => r.querySelector(sel).getBoundingClientRect();
  return rows.map((r) => ({
    tag: r.tagName.toLowerCase(),
    height: Math.round(r.getBoundingClientRect().height),
    idLeft: Math.round(cell(r, '.past__id').left),
    idWidth: Math.round(cell(r, '.past__id').width),
    sevLeft: Math.round(cell(r, '.past__sev').left),
    dateRight: Math.round(cell(r, '.past__date').right),
    idWeight: getComputedStyle(r.querySelector('.past__id')).fontWeight,
    dateAlign: getComputedStyle(r.querySelector('.past__date')).textAlign,
    dateWrap: getComputedStyle(r.querySelector('.past__date')).whiteSpace,
    idText: r.querySelector('.past__id').textContent.trim(),
    sev: r.querySelector('ui-pill[data-sev]').getAttribute('data-sev'),
    sevColour: getComputedStyle(r.querySelector('ui-pill[data-sev]')).color,
    text: r.textContent.replace(/\s+/g, ' ').trim(),
  }));
});

/**
 * Flush on this tab only.
 *
 * The rule is two halves and both matter: .info__body drops its side padding
 * so the rows reach the panel edges, and .past__row keeps 20px of its own so
 * the CONTENT still lines up with every other tab. Checking one without the
 * other would pass for a row whose text had slid to the edge with it.
 *
 * Source order is the trap here: .info__body--flush and .info__body have the
 * same specificity, so the flush rule declared first lost to the shorthand
 * that follows it. Asserting the computed padding is what catches that -
 * the class was on the element the whole time.
 */
const flush = await page.evaluate(() => {
  const body = document.querySelector('.info__body');
  const row = document.querySelector('.past__row');
  const br = body.getBoundingClientRect();
  const rr = row.getBoundingClientRect();
  const bcs = getComputedStyle(body);
  const rcs = getComputedStyle(row);
  return {
    bodyPad: `${bcs.paddingLeft}/${bcs.paddingRight}`,
    rowPad: `${rcs.paddingLeft}/${rcs.paddingRight}`,
    fills: Math.round(rr.left - br.left) === 0 && Math.round(br.right - rr.right) === 0,
    contentInset: [
      Math.round(row.querySelector('.past__id').getBoundingClientRect().left - br.left),
      Math.round(br.right - row.querySelector('.past__date').getBoundingClientRect().right),
    ],
  };
});
check('past-cases tab: the body has no side padding', flush.bodyPad === '0px/0px', flush.bodyPad);
check('past-cases tab: rows fill it edge to edge', flush.fills);
check('past-cases tab: the row carries the 20px instead', flush.rowPad === '20px/20px', flush.rowPad);
check('past-cases tab: content still sits on the 20px gutter',
  flush.contentInset.every((v) => v === 20), flush.contentInset.join(','));

// Timeline is a full-bleed row list too now, so Snapshot is the comparison:
// it is the tab whose content is prose rather than rows.
for (const tab of ['Snapshot']) {
  await page.locator(`player-info-panel .mat-mdc-tab:has-text("${tab}")`).click();
  await page.waitForTimeout(400);
  const pad = await page.evaluate(() => {
    const c = getComputedStyle(document.querySelector('.info__body'));
    return `${c.paddingLeft}/${c.paddingRight}`;
  });
  check(`${tab} tab keeps its 20px gutter`, pad === '20px/20px', pad);
}
await page.locator('player-info-panel .mat-mdc-tab:has-text("Past AML cases")').click();
await page.waitForTimeout(400);

check('one row per past case', past.length === FIXTURE.pastCases.length);
check('rows are real buttons', past.every((r) => r.tag === 'button'));
/**
 * Two lines now, so the equal-height and shared-column checks are gone with
 * the subgrid: rows are DIFFERENT heights by design, because the second line
 * is a reason that clamps at two. What replaces them is the head-line
 * contract - ID left, date flush right, neither truncating - plus the clamp.
 */
const twoLine = await page.evaluate(() => [...document.querySelectorAll('.past__row')].map((r) => {
  const head = r.querySelector('.past__head');
  const reason = r.querySelector('.past__reason');
  const date = r.querySelector('.past__date');
  const id = r.querySelector('.past__id');
  return {
    nestedButtons: r.querySelectorAll('button').length,
    dateFlushRight: Math.round(head.getBoundingClientRect().right - date.getBoundingClientRect().right) === 0,
    headOverflows: head.scrollWidth - head.clientWidth > 1,
    idTruncated: id.scrollWidth - id.clientWidth > 1,
    reasonLines: Math.round(reason.getBoundingClientRect().height / 20),
    hasTitle: !!reason.getAttribute('title'),
    // Same rhythm as the starred rows: 12px/20px.
    pad: getComputedStyle(r).padding,
    starredPad: getComputedStyle(document.querySelector('.starred__row') ?? r).padding,
  };
}));
check('the row is still ONE button, nothing nested inside it',
  twoLine.every((r) => r.nestedButtons === 0));
check('line one: the date is flush right and nothing truncates',
  twoLine.every((r) => r.dateFlushRight && !r.headOverflows && !r.idTruncated));
check('line two: at most two lines, full text on title',
  twoLine.every((r) => r.reasonLines >= 1 && r.reasonLines <= 2 && r.hasTitle),
  twoLine.map((r) => r.reasonLines).join(','));
check('rows carry the 12px/20px rhythm',
  twoLine.every((r) => r.pad === '12px 20px'), twoLine.map((r) => r.pad).join(' | '));
check('a long reason clamps and a short one does not',
  new Set(twoLine.map((r) => r.reasonLines)).size === 2,
  twoLine.map((r) => r.reasonLines).join(','));
check('IDs render as #NNNN at weight 600',
  past.every((r, i) => r.idText === `#${FIXTURE.pastCases[i].caseId}` && r.idWeight === '600'));
check('dates are right-aligned and never wrap',
  past.every((r) => r.dateAlign === 'right' && r.dateWrap === 'nowrap'));
check('the word "Case" is gone', past.every((r) => !/\bCase\b/.test(r.text)));
check('the "Resolved" status text is gone', past.every((r) => !/Resolved/i.test(r.text)));

// The pill records severity AT RESOLUTION. It must stay keyed on the stored
// string, never re-derived from the live ranking - a future refactor that
// "normalises" these against SEVERITY_RANK would be re-grading closed cases.
check('each pill shows the severity stored on that case',
  past.every((r, i) => r.sev === FIXTURE.pastCases[i].severity),
  past.map((r) => r.sev).join(','));
check('and is coloured by that stored value, not the current ranking',
  past.every((r) => r.sevColour === SEV_TOKEN[r.sev]),
  past.map((r) => `${r.sev}=${r.sevColour}`).join(' '));
check('a past pill can differ from the live case severity',
  past.some((r) => r.sev !== 'AML'));

await page.locator('.past__row').first().click();
await page.waitForTimeout(300);
check('clicking a row opens that case',
  (await page.locator('player-info-panel .placeholder').innerText()).includes(
    `#${FIXTURE.pastCases[0].caseId}`,
  ));

/**
 * Last, because it needs the panel gone: with a panel open - minimised or not -
 * there is no widget row to read. Driven from a fresh escalation so the check
 * does not depend on state carried down the whole file.
 */
console.log('\nThe widget carries the severity once the panel is closed');
await page.goto(`${BASE}/?state=01`, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);
await page.locator('workflow-panel .footer button:has-text("Adjust severity")').click();
await page.waitForTimeout(300);
await page.locator('severity-dialog mat-radio-button:has-text("EDD") input').click();
await page.locator('severity-dialog textarea').fill('Escalated for verification.');
await page.waitForTimeout(150);
await page.locator('severity-dialog button:has-text("Save severity")').click();
await page.waitForTimeout(500);
check('the panel now reads EDD',
  (await page.locator('case-header ui-pill[data-sev]').innerText()).trim() === 'EDD');
await page.keyboard.press('Escape');
await page.waitForTimeout(600);
check('closing the panel brings the row back',
  (await page.locator('back-office-widgets .w').count()) > 0);
check('the widget carries the same severity',
  (await page.locator('back-office-widgets .w__titles ui-pill[data-sev]').innerText()).trim() === 'EDD');

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0 ? '\nAll severity + attachment checks pass.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
