import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * The attachment preview overlay.
 *
 * ONE KIND NOW. Attachments are images, so the PDF half of this suite is gone
 * with the iframe viewer it tested - and with verify/preview-pdf.mjs, which
 * existed only to page through the four-page sample in installed Chrome
 * because the bundled Chromium ships no PDF viewer.
 *
 * What that removed is worth stating, because it is not nothing: the header
 * used to differ by kind - a PDF got filename, size and Close, an image got
 * Download too - and a whole block here proved the difference. The header is
 * one header now, and it carries BOTH ways into the file: Download saves it,
 * Open in new tab hands it to the browser at full size.
 *
 * State 02 is the target because its draft carries the image attachment and
 * the sibling remove button on screen together.
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

const imgChip = '.file__open[aria-label="Open promo-catch-a-triple-wave.png"]';
const IMG = 'promo-catch-a-triple-wave.png';

// The panel is measured against the image's RENDERED width, so the image has
// to have decoded before any of it means anything. Waiting on .panel only says
// the overlay exists; a 190KB fixture is routinely still decoding at that
// point, and the size checks then compare against a zero-width img.
const openPreview = async (sel) => {
  await page.locator(sel).click();
  await page.waitForSelector('attachment-preview .panel');
  await page.waitForFunction(() => {
    const img = document.querySelector('attachment-preview img.image');
    return !!img && img.complete && img.naturalWidth > 0;
  }, null, { timeout: 10000 });
  await page.waitForTimeout(100);
};

console.log('\nattachment chips are buttons');
await go('02');
check(
  'every attachment renders a button inside its <li>',
  await page.evaluate(() => {
    const items = [...document.querySelectorAll('.files .file')];
    return items.length > 0 && items.every((li) => li.querySelector('button.file__open'));
  }),
);
check('list semantics survive', await page.locator('ul.files > li.file').count().then((n) => n >= 1));
check('image chip is named for the file', await page.locator(imgChip).count().then((n) => n === 1));
check(
  'no second view/preview icon inside the button',
  await page.locator(`${imgChip} mat-icon`).count().then((n) => n === 1),
);
check('full name available on hover', (await page.locator(imgChip).getAttribute('title')) === IMG);
check(
  'remove is a sibling of the open button, not a child',
  await page.evaluate(() => {
    const li = document.querySelector('.files .file');
    return !!li.querySelector(':scope > button.file__remove') && !li.querySelector('.file__open .file__remove');
  }),
);

console.log('\nremove still removes, and does not open a preview');
await page.locator(`.file__remove[aria-label="Remove ${IMG}"]`).click();
await page.waitForTimeout(250);
check('the file is gone', await page.locator(imgChip).count().then((n) => n === 0));
check('no preview opened', await page.locator('attachment-preview').count().then((n) => n === 0));

console.log('\nimage preview');
await go('02');
await openPreview(imgChip);
check('overlay is up', await page.locator('attachment-preview').count().then((n) => n === 1));
check('renders an image', await page.locator('attachment-preview img.image').count().then((n) => n === 1));
check('and no iframe survives from the PDF viewer',
  await page.locator('attachment-preview iframe').count().then((n) => n === 0));
check(
  'header names the file and its size',
  (await page.locator('attachment-preview .panel__title').innerText()) === IMG &&
    (await page.locator('attachment-preview .panel__size').innerText()).trim() === '188 KB',
);
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
check('alt text is the filename',
  (await page.locator('attachment-preview img.image').getAttribute('alt')) === IMG);

/**
 * Both ways into the file, side by side.
 *
 * They are different acts, not two spellings of one: saving a file you may not
 * want to keep, against looking at it larger than an overlay allows. Nothing
 * else in the overlay offers either - there is no viewer toolbar under an
 * image the way there was under a PDF - so an image header missing one of them
 * is a dead end.
 */
console.log('\nDownload and Open in new tab');
const actions = await page.evaluate(() => {
  const as = [...document.querySelectorAll('attachment-preview a.panel__action')];
  return as.map((a) => ({
    href: a.getAttribute('href'),
    download: a.getAttribute('download'),
    target: a.getAttribute('target'),
    rel: a.getAttribute('rel'),
    label: a.getAttribute('aria-label'),
    title: a.getAttribute('title'),
    icon: a.querySelector('mat-icon')?.textContent.trim(),
  }));
});
check('two anchors in the header', actions.length === 2, JSON.stringify(actions));
const dl = actions.find((a) => a.download);
const tab = actions.find((a) => a.target === '_blank');
check('Download saves under the file’s own name', dl?.download === IMG, JSON.stringify(dl));
check('Download is not the new-tab one', dl && dl.target !== '_blank', JSON.stringify(dl));
check('Open in new tab targets _blank at the same file',
  !!tab && tab.href === dl?.href, JSON.stringify(tab));
// A new tab opened from here must get no window.opener back into this
// document. The target is our own asset today; the href is attachment data,
// and the day it points elsewhere this is the line that has to already exist.
check('and carries rel="noopener"', !!tab && /noopener/.test(tab.rel ?? ''), tab?.rel);
check('both are named for a screen reader, and titled for a pointer',
  actions.every((a) => a.label?.includes(IMG) && !!a.title),
  JSON.stringify(actions.map((a) => [a.label, a.title])));
check('they do not share an icon', dl?.icon === 'download' && tab?.icon === 'open_in_new',
  `${dl?.icon} / ${tab?.icon}`);
// Order in the DOM is order in the tab sequence: keep, look at elsewhere,
// dismiss. Close is a button, so it is not in `actions`.
check('Download comes before Open in new tab', actions[0].download === IMG);
check('and Close is last, and is a button not a link',
  await page.evaluate(() => {
    const kids = [...document.querySelectorAll('attachment-preview .panel__head .panel__action')];
    const last = kids[kids.length - 1];
    return kids.length === 3 && last.tagName === 'BUTTON' &&
      last.getAttribute('aria-label') === 'Close preview';
  }));

console.log('\nfocus and dialog semantics');
check(
  'focus is inside the panel, and not on an action',
  await page.evaluate(() => {
    const panel = document.querySelector('attachment-preview .panel');
    return panel.contains(document.activeElement) && !document.activeElement.matches('.panel__action');
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
check('the attachment is still listed', await page.locator('ul.files > li.file').count().then((n) => n >= 1));

console.log('\nescape closes the preview and nothing else');
await page.keyboard.press('Escape');
await page.waitForTimeout(250);
check('preview gone', await page.locator('attachment-preview').count().then((n) => n === 0));
check('the case panel survived', await page.locator('aml-case-modal').count().then((n) => n === 1));
check(
  'focus is back on the attachment button that opened it',
  await page.evaluate((sel) => document.activeElement?.matches(sel), imgChip),
);

console.log('\nclose button, and focus handback');
await openPreview(imgChip);
await page.locator('attachment-preview button.panel__action[aria-label="Close preview"]').click();
await page.waitForTimeout(250);
check('preview gone', await page.locator('attachment-preview').count().then((n) => n === 0));
check(
  'focus is back on the image chip',
  await page.evaluate((sel) => document.activeElement?.matches(sel), imgChip),
);

console.log('\nkeyboard: the chip opens on Enter and traps focus');
await page.locator(imgChip).focus();
await page.keyboard.press('Enter');
await page.waitForSelector('attachment-preview .panel');
check('opened from the keyboard', await page.locator('attachment-preview').count().then((n) => n === 1));
// Six is more than the three actions in the header, so the sequence has to
// have wrapped at least once to still be inside.
for (let i = 0; i < 6; i++) await page.keyboard.press('Tab');
check(
  'six tabs later, focus is still inside the overlay',
  await page.evaluate(() => document.querySelector('attachment-preview').contains(document.activeElement)),
);
await page.keyboard.press('Escape');
await page.locator('attachment-preview').waitFor({ state: 'detached' });

console.log('\naxe-core over the open overlay, WCAG 2.1 A and AA');
await openPreview(imgChip);
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

console.log('\nthe scrim dismisses');
await page.locator('attachment-preview .scrim').click({ position: { x: 5, y: 5 } });
await page.locator('attachment-preview').waitFor({ state: 'detached' });
check('preview gone', await page.locator('attachment-preview').count().then((n) => n === 0));
check('the case panel survived', await page.locator('aml-case-modal').count().then((n) => n === 1));

/**
 * The header names the attachment that was clicked, and the <img> loads that
 * same file. If those two disagree the preview says one thing at the top and
 * shows another below it - which is what a shared sample asset used to
 * produce, and why each fixture resolves to its own document.
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
    const src = await page.evaluate(() =>
      document.querySelector('attachment-preview img.image').getAttribute('src'));
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

console.log('\nmobile: full screen');
await go('02');
await openPreview(imgChip);
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(300);
check(
  'the panel fills the viewport',
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
check('both actions survive the mobile header',
  await page.locator('attachment-preview a.panel__action').count().then((n) => n === 2));

console.log(`\npage errors: ${pageErrors.length}`);
pageErrors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 160)));

await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed || pageErrors.length ? 1 : 0);
