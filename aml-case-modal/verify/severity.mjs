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
let AML_RED, EDD_AMBER, WARN;

await go('01');
AML_RED = await token('--sev-aml');
EDD_AMBER = await token('--sev-edd');
WARN = await token('--warn');
console.log(`tokens: --sev-aml ${AML_RED}  --sev-edd ${EDD_AMBER}  --warn ${WARN}`);

console.log('\nPre-escalation states: the case opens at AML, red');
for (const state of ['00a', '01', '02', '10', '09']) {
  await go(state);
  const text = (await headerPill().innerText()).trim();
  const colour = await rgb(await headerPill().elementHandle());
  check(`${state}: header pill reads AML`, text === 'AML', text);
  check(`${state}: header pill is AML red`, colour === AML_RED, colour);
}

console.log('\nPost-escalation states: EDD, amber');
for (const state of ['03', '07']) {
  await go(state);
  const text = (await headerPill().innerText()).trim();
  const colour = await rgb(await headerPill().elementHandle());
  check(`${state}: header pill reads EDD`, text === 'EDD', text);
  check(`${state}: header pill is EDD amber`, colour === EDD_AMBER, colour);
}

console.log('\nThe severity event in the stream reads AML -> EDD, escalation');
await go('03');
const eventPills = await page.locator('event-row ui-pill').allInnerTexts();
check('event pills are AML then EDD', eventPills.map((t) => t.trim()).join('->') === 'AML->EDD',
  eventPills.join('->'));
check('the row calls it an escalation',
  (await page.locator('event-row .row').innerText()).includes('Severity escalation'));
check('the arrow points up',
  (await page.locator('event-row .row .row__icon').innerText()).trim() === 'arrow_upward');
// PROTOTYPE.md: an escalation arrow is in the warn colour. Only escalation.
check('the escalation arrow is the warn tone',
  (await page.evaluate(() =>
    getComputedStyle(document.querySelector('event-row .row__icon')).color)) === WARN);
check('the rest of the row stays secondary ink',
  (await page.evaluate(() =>
    getComputedStyle(document.querySelector('event-row .row__label')).color)) === (await token('--ink-2')));

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
check('header pill is now amber', (await rgb(await headerPill().elementHandle())) === EDD_AMBER);
check('the widget follows too',
  (await page.locator('back-office-widgets .w__sev[data-sev]').innerText()).trim() === 'EDD');
check('a new event row says escalation',
  (await page.locator('event-row .row').last().innerText()).includes('Severity escalation'));
check('the timeline entry names the direction', await (async () => {
  await page.locator('player-info-panel .mat-mdc-tab:has-text("Timeline")').click();
  await page.waitForTimeout(300);
  const rows = await page.locator('player-info-panel .timeline__what').allInnerTexts();
  return rows.some((r) => r.includes('AML to EDD') && r.includes('escalation'));
})());

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
  AML: AML_RED,
  EDD: EDD_AMBER,
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
check('every row is a single line of equal height',
  new Set(past.map((r) => r.height)).size === 1);
check('all rows share the ID column', new Set(past.map((r) => r.idLeft)).size === 1);
check('all rows share the severity column', new Set(past.map((r) => r.sevLeft)).size === 1);
check('all dates end on the same right edge', new Set(past.map((r) => r.dateRight)).size === 1);
check('the ID column is declared at 90px', track.declared === 90, `${track.declared}px`);
const expectedId = Math.round(track.declared - track.padLeft - track.gap / 2);
check('every ID cell renders that track less the row inset',
  past.every((r) => Math.abs(r.idWidth - expectedId) <= 1),
  `${past.map((r) => r.idWidth).join(',')} vs ${expectedId} ` +
    `(90 - ${track.padLeft} padding - ${track.gap / 2} half-gap)`);
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

console.log(`\nconsole errors: ${errors.length}`);
errors.slice(0, 5).forEach((e) => console.log(`  ! ${e.slice(0, 200)}`));

await browser.close();
console.log(failed === 0 && errors.length === 0 ? '\nAll severity + attachment checks pass.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 && errors.length === 0 ? 0 : 1);
