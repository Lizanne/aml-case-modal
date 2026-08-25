import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * The attachment preview overlay.
 *
 * Structural and keyboard checks only. The PDF path's real proof - paging 1 to
 * 4 in the four-page sample - needs a browser with the PDF viewer, which the
 * bundled Chromium does not ship; verify/preview-pdf.mjs does that half against
 * installed Chrome.
 *
 * State 02 is the target because its draft carries both kinds at once, so the
 * two sizes and the sibling remove button are all on screen together.
 */
const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core'), 'utf8');

const BASE = process.env.BASE ?? 'http://localhost:4200';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

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

const pdfChip = '.file__open[aria-label="Open adverse-media-results.pdf"]';
const imgChip = '.file__open[aria-label="Open sanctions-screen.png"]';

console.log('\nattachment chips are buttons');
await go('02');
check(
  'every attachment renders a button inside its <li>',
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.files .file')];
    return items.length > 0 && items.every((li) => li.querySelector('button.file__open'));
  }),
);
check('list semantics survive', await page.locator('ul.files > li.file').count().then((n) => n === 2));
check('pdf chip is named for the file', await page.locator(pdfChip).count().then((n) => n === 1));
check('image chip is named for the file', await page.locator(imgChip).count().then((n) => n === 1));
check(
  'no second view/preview icon inside the button',
  await page.locator(`${pdfChip} mat-icon`).count().then((n) => n === 1),
);
check(
  'full name available on hover',
  (await page.locator(pdfChip).getAttribute('title')) === 'adverse-media-results.pdf',
);
check(
  'remove is a sibling of the open button, not a child',
  await page.evaluate(() => {
    const li = document.querySelector('.files .file');
    return !!li.querySelector(':scope > button.file__remove') && !li.querySelector('.file__open .file__remove');
  }),
);

console.log('\nremove still removes, and does not open a preview');
await page.locator('.file__remove[aria-label="Remove sanctions-screen.png"]').click();
await page.waitForTimeout(250);
check('the file is gone', await page.locator(imgChip).count().then((n) => n === 0));
check('no preview opened', await page.locator('attachment-preview').count().then((n) => n === 0));

console.log('\npdf preview');
await go('02');
await page.locator(pdfChip).click();
await page.waitForSelector('attachment-preview .panel');
check('overlay is up', await page.locator('attachment-preview').count().then((n) => n === 1));
check('renders an iframe, not an image', await page.locator('attachment-preview iframe.viewer').count().then((n) => n === 1));
check(
  'iframe points at the sample pdf',
  (await page.locator('attachment-preview iframe.viewer').getAttribute('src'))?.includes(
    'assets/samples/adverse-media-results.pdf',
  ),
);
check(
  'header names the file and its size',
  (await page.locator('attachment-preview .panel__title').innerText()) === 'adverse-media-results.pdf' &&
    (await page.locator('attachment-preview .panel__size').innerText()).trim() === '2.1 MB',
);
// The viewer's own toolbar already carries download, print and paging, so a
// second Download drawn above it would be the same control twice.
check(
  'no Download in a pdf header - the viewer already has one',
  await page.locator('attachment-preview a.panel__action').count().then((n) => n === 0),
);
check(
  'the pdf header is filename, size and Close',
  await page
    .locator('attachment-preview button.panel__action[aria-label="Close preview"]')
    .count()
    .then((n) => n === 1),
);
check(
  'panel is ~90% of the viewport',
  await page.evaluate(() => {
    const b = document.querySelector('attachment-preview .panel').getBoundingClientRect();
    return b.width / innerWidth > 0.72 && b.height / innerHeight > 0.85;
  }),
);
check(
  'focus is inside the panel, and not on Download',
  await page.evaluate(() => {
    const panel = document.querySelector('attachment-preview .panel');
    return panel.contains(document.activeElement) && !document.activeElement.matches('a.panel__action');
  }),
);
check('dialog is labelled by its heading', await page.evaluate(() => {
  const panel = document.querySelector('attachment-preview .panel');
  const id = panel.getAttribute('aria-labelledby');
  return panel.getAttribute('aria-modal') === 'true' && !!id && !!document.getElementById(id);
}));

console.log('\nthe panel behind keeps its state');
check(
  'the draft note is still there',
  await page.evaluate(() => {
    const t = document.querySelector('record-form textarea');
    return !!t && t.value.startsWith('Adverse media check complete');
  }),
);
check('both attachments still listed', await page.locator('ul.files > li.file').count().then((n) => n === 2));

console.log('\nescape closes the preview and nothing else');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('preview gone', await page.locator('attachment-preview').count().then((n) => n === 0));
check('the case panel survived', await page.locator('aml-case-modal').count().then((n) => n === 1));
check(
  'focus is back on the attachment button that opened it',
  await page.evaluate(
    (sel) => document.activeElement?.matches(sel),
    pdfChip,
  ),
);

console.log('\nimage preview');
await page.locator(imgChip).click();
await page.waitForSelector('attachment-preview .panel');
check('renders an image, not an iframe', await page.locator('attachment-preview img.image').count().then((n) => n === 1));
check(
  'windowed to the image, not to 90% of the screen',
  await page.evaluate(() => {
    const panel = document.querySelector('attachment-preview .panel').getBoundingClientRect();
    const img = document.querySelector('attachment-preview img.image');
    // The panel hugs the image's rendered width, give or take nothing: no
    // padding on the body. A 90%-of-viewport panel would fail both halves.
    return Math.abs(panel.width - img.getBoundingClientRect().width) < 2 && panel.width < innerWidth * 0.9;
  }),
);
check(
  'the image actually decoded',
  await page.evaluate(() => {
    const img = document.querySelector('attachment-preview img.image');
    return img.complete && img.naturalWidth > 0;
  }),
);
check(
  'alt text is the filename',
  (await page.locator('attachment-preview img.image').getAttribute('alt')) === 'sanctions-screen.png',
);
// The other half of the rule: an image has no viewer toolbar under it, so the
// header's Download is the only way to save the file and has to be there.
check(
  'an image header DOES carry Download',
  (await page.locator('attachment-preview a.panel__action').getAttribute('download')) ===
    'sanctions-screen.png',
);

console.log('\nclose button, and focus handback');
await page.locator('attachment-preview button.panel__action').click();
await page.waitForTimeout(250);
check('preview gone', await page.locator('attachment-preview').count().then((n) => n === 0));
check(
  'focus is back on the image chip',
  await page.evaluate((sel) => document.activeElement?.matches(sel), imgChip),
);

/**
 * Deliberately the IMAGE, not the PDF.
 *
 * Tab out of a PDF <iframe>'s viewer and focus is in a different document, so
 * the parent's keydown handler never sees Escape - a browser-level limit of
 * embedding a viewer, not something this component can intercept. Testing the
 * trap against the PDF would only be testing that limit. Escape from the PDF
 * panel itself is covered above, and Close and the scrim work regardless.
 */
console.log('\nkeyboard: the chip opens on Enter and traps focus');
await page.locator(imgChip).focus();
await page.keyboard.press('Enter');
await page.waitForSelector('attachment-preview .panel');
check('opened from the keyboard', await page.locator('attachment-preview').count().then((n) => n === 1));
for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
check(
  'six tabs later, focus is still inside the overlay',
  await page.evaluate(() => document.querySelector('attachment-preview').contains(document.activeElement)),
);
await page.keyboard.press('Escape');
await page.locator('attachment-preview').waitFor({ state: 'detached' });

console.log('\naxe-core over the open overlay, WCAG 2.1 A and AA');
await page.locator(pdfChip).click();
await page.waitForSelector('attachment-preview .panel');
await page.evaluate(AXE);
const res = await page.evaluate(async () =>
  window.axe.run(document, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
  }),
);
// Same known exception as verify/a11y.mjs: the CDK overlay container sits
// outside any landmark.
const real = res.violations.filter((v) => v.id !== 'region');
check('no violations', real.length === 0, real.map((v) => `${v.id} (${v.nodes.length})`).join(', '));

/* The scrim, on the PDF panel that is already open. Closing this way rather
   than with Escape also proves the way out that still works when focus has
   gone into the viewer's own document. */
console.log('\nthe scrim dismisses');
await page.locator('attachment-preview .scrim').click({ position: { x: 5, y: 5 } });
await page.locator('attachment-preview').waitFor({ state: 'detached' });
check('preview gone', await page.locator('attachment-preview').count().then((n) => n === 0));
check('the case panel survived', await page.locator('aml-case-modal').count().then((n) => n === 1));

/**
 * The header names the attachment that was clicked. The browser's PDF toolbar
 * names the file actually loaded. If those two are not the same file, the
 * preview says one thing at the top and another immediately below it - which
 * is exactly what a shared sample asset used to produce.
 *
 * Checked against the URL rather than the toolbar, because the toolbar lives
 * in a document this cannot reach; the toolbar shows the URL's last segment,
 * so agreeing with the URL is agreeing with the toolbar.
 */
console.log('\nevery chip opens its own file, under its own name');
for (const state of ['02', '02b', '03', '07']) {
  await go(state);
  const chips = await page.locator('.file__open').count();
  if (!chips) continue;
  for (let i = 0; i < chips; i++) {
    const chip = page.locator('.file__open').nth(i);
    const name = (await chip.getAttribute('aria-label')).replace(/^Open /, '');
    await chip.click();
    await page.waitForSelector('attachment-preview .panel');
    const src = await page.evaluate(() => {
      const el = document.querySelector('attachment-preview iframe.viewer, attachment-preview img.image');
      return el.getAttribute('src');
    });
    const title = await page.locator('attachment-preview .panel__title').innerText();
    check(
      `${state}: ${name} -> ${src.split('/').pop()}`,
      title === name && src.split('/').pop() === name,
      `header "${title}", loaded "${src}"`,
    );
    await page.locator('attachment-preview button.panel__action[aria-label="Close preview"]').click();
    await page.locator('attachment-preview').waitFor({ state: 'detached' });
  }
}

console.log('\nmobile: full screen, both kinds');
await go('02');
await page.locator(pdfChip).click();
await page.waitForSelector('attachment-preview .panel');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
check(
  'pdf fills the viewport',
  await page.evaluate(() => {
    const b = document.querySelector('attachment-preview .panel').getBoundingClientRect();
    return Math.abs(b.width - innerWidth) < 1 && Math.abs(b.height - innerHeight) < 1;
  }),
);
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
await page.locator(imgChip).scrollIntoViewIfNeeded();
await page.locator(imgChip).click();
await page.waitForSelector('attachment-preview .panel');
check(
  'image fills the viewport too',
  await page.evaluate(() => {
    const b = document.querySelector('attachment-preview .panel').getBoundingClientRect();
    return Math.abs(b.width - innerWidth) < 1 && Math.abs(b.height - innerHeight) < 1;
  }),
);
check(
  'the image is contained inside it',
  await page.evaluate(() => {
    const p = document.querySelector('attachment-preview .panel').getBoundingClientRect();
    const i = document.querySelector('attachment-preview img.image').getBoundingClientRect();
    return i.width <= p.width + 1 && i.height <= p.height + 1;
  }),
);

console.log(`\npage errors: ${pageErrors.length}`);
pageErrors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 160)));

await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed || pageErrors.length ? 1 : 0);
