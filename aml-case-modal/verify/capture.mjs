import { chromium } from 'playwright';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Renders every prototype state to a PNG for handoff into Figma.
 *
 * The dev harness is hidden for the capture - it is scaffolding, not the
 * design - but nothing else is touched, so what lands in Figma is the running
 * prototype rather than a mock-up of it.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const OUT = fileURLToPath(new URL('./captures/', import.meta.url));

export const STATES = [
  ['00a', 'Unlocked'],
  ['00b', 'Locked to other with force unlock dialog'],
  ['01', 'Locked empty'],
  ['02', 'Recording with attachment errors'],
  ['02b', 'Recording clean reverse order'],
  ['03', 'All required recorded'],
  ['04', 'Historical snapshot'],
  ['05', 'Adjust severity dialog'],
  ['06', 'Submit decision dialog'],
  ['07', 'Resolved'],
  ['08', 'Add action menu'],
  ['09', 'Dual modal'],
  ['10', 'Triggers expanded'],
  ['11', 'Past AML cases tab'],
];

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const manifest = [];
for (const [id, title] of STATES) {
  await page.goto(`${BASE}/?state=${id}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('aml-case-modal');
  // The dev harness is scaffolding; hide it and reclaim the space it held.
  await page.addStyleTag({
    content: `.page__dev, .skip-link { display: none !important; }
              .page { padding-top: 24px !important; }`,
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  const file = `${id} ${title}.png`;
  await page.screenshot({ path: OUT + file, fullPage: true });
  const box = await page.evaluate(() => ({
    w: document.documentElement.scrollWidth,
    h: document.documentElement.scrollHeight,
  }));
  manifest.push({ id, title, file, width: box.w, height: box.h });
  console.log(`${id.padEnd(4)} ${String(box.w).padStart(4)}x${String(box.h).toString().padEnd(4)}  ${file}`);
}

writeFileSync(OUT + 'manifest.json', JSON.stringify(manifest, null, 2));
console.log(`\n${manifest.length} captures -> ${OUT}`);
console.log('page errors:', errors.length);
errors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 160)));

await browser.close();
process.exit(errors.length ? 1 : 0);
