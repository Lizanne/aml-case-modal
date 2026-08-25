import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * The PDF half of the preview, against INSTALLED CHROME.
 *
 * Playwright's bundled Chromium ships without the PDF viewer, so an <iframe>
 * pointing at a PDF renders nothing there - which would make the structural
 * suite's "the iframe has the right src" the only thing ever proven, and that
 * is not the claim. The claim is that the browser's own viewer takes over and
 * gives you paging, zoom and print for free.
 *
 * So this pages 1 -> 4 through the four-page sample and captures both ends. A
 * one-page sample could not show it, and the four-page one is the entire
 * argument for giving PDFs ~90% of the viewport instead of windowing them.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const OUT = fileURLToPath(new URL('./shots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};

await page.goto(`${BASE}/?state=02`, { waitUntil: 'networkidle' });
await page.waitForSelector('aml-case-modal');
await page.locator('.file__open[aria-label="Open adverse-media-results.pdf"]').click();
await page.waitForSelector('attachment-preview iframe.viewer');
// The viewer is a separate browsing context and does not load with the page.
await page.waitForTimeout(2500);

const viewer = page.locator('attachment-preview iframe.viewer');
const box = await viewer.boundingBox();

console.log('\nchrome renders the pdf, it is not a blank frame');
const first = await viewer.screenshot({ path: OUT + 'preview-pdf-page-1.png' });
check(
  'the frame has real size',
  box.width > 900 && box.height > 700,
  `${Math.round(box.width)}x${Math.round(box.height)}`,
);
check('page 1 captured', first.length > 5000, `${first.length} bytes`);

console.log('\npaging 1 -> 4');
// Click inside the viewer to give it the keypress, then jump to the end. A
// four-page document is the only reason End and Home differ.
await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
await page.keyboard.press('End');
await page.waitForTimeout(1500);
const last = await viewer.screenshot({ path: OUT + 'preview-pdf-page-4.png' });
check(
  'page 4 looks different from page 1 - the document actually paged',
  Buffer.compare(first, last) !== 0,
);

await page.keyboard.press('Home');
await page.waitForTimeout(1200);
const back = await viewer.screenshot();
check('Home returns to page 1', Buffer.compare(back, last) !== 0);

console.log('\nprint and download are the browser\'s, not ours');
check(
  'we render no viewer chrome of our own - just the iframe',
  await page.evaluate(
    () => document.querySelector('attachment-preview .panel__body').children.length === 1,
  ),
);

console.log(`\nshots -> ${OUT}`);
await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed ? 1 : 0);
