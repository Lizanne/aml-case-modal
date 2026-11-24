import { chromium } from 'playwright';

/**
 * The AML entry point on the player bar: Menu, SG / AML, AML Case.
 *
 * The Menu is a disclosure hanging from the bar. Choosing AML Case closes it
 * and opens the case panel - the same panel the widget's Open case opens.
 */
const BASE = process.env.BASE ?? 'http://localhost:4200';
const SHOTS = process.env.SHOTS;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));

let failed = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}${!ok && detail ? ` -> ${detail}` : ''}`);
  if (!ok) failed++;
};

const menuButton = page.locator('player-header .ph__action', { hasText: 'Menu' });
const menu = page.locator('player-menu');
const panel = page.locator('aml-case-modal');

const go = async (state) => {
  await page.goto(`${BASE}/?state=${state}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('player-header');
  await page.waitForTimeout(350);
};

console.log('\nMenu disclosure');
await go('02');
await page.keyboard.press('Escape');
await page.waitForTimeout(450);
check('the case panel starts closed', (await panel.count()) === 0);
check('Menu says it is collapsed', (await menuButton.getAttribute('aria-expanded')) === 'false');

await menuButton.click();
await page.waitForTimeout(250);
check('pressing Menu opens the panel', (await menu.count()) === 1);
check('and says so', (await menuButton.getAttribute('aria-expanded')) === 'true');
check(
  'focus moves into the menu',
  await page.evaluate(() => !!document.activeElement?.closest('player-menu')),
);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-1440.png` });

const sgAml = await page.evaluate(() => {
  const group = [...document.querySelectorAll('player-menu .pm__group')].find(
    (g) => g.querySelector('h3')?.textContent?.trim() === 'SG / AML',
  );
  return [...(group?.querySelectorAll('.pm__link') ?? [])].map((l) => ({
    label: l.textContent.trim(),
    tag: l.tagName,
  }));
});
const at = sgAml.findIndex((l) => l.label === 'AML Case');
check(
  'AML Case sits in SG / AML, straight after AML Risks, as a button',
  at > 0 && sgAml[at - 1].label === 'AML Risks' && sgAml[at].tag === 'BUTTON',
  JSON.stringify(sgAml),
);

const fit = await page.evaluate(() => {
  const m = document.querySelector('player-menu .pm').getBoundingClientRect();
  const bar = document.querySelector('player-header .ph').getBoundingClientRect();
  return { top: m.top, barBottom: bar.bottom, right: m.right, bottom: m.bottom };
});
check(
  'the panel hangs from the bar and stays in the viewport',
  Math.abs(fit.top - fit.barBottom) < 1 && fit.right <= 1440 && fit.bottom <= 1000,
  JSON.stringify(fit),
);

await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check('Escape closes the menu', (await menu.count()) === 0);
check(
  'and hands focus back to Menu',
  await page.evaluate(() => document.activeElement?.textContent?.includes('Menu') ?? false),
);

await menuButton.click();
await page.mouse.click(700, 960);
await page.waitForTimeout(150);
check('a press outside closes the menu', (await menu.count()) === 0);

console.log('\nAML Case');
await menuButton.click();
await menu.getByRole('button', { name: 'AML Case' }).click();
await page.waitForTimeout(500);
check('choosing AML Case closes the menu', (await menu.count()) === 0);
check('and opens the case panel', (await panel.count()) === 1);
check(
  'which takes focus',
  await page.evaluate(() => !!document.activeElement?.closest('aml-case-modal')),
);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-opened-case.png` });

await menuButton.click();
await page.waitForTimeout(200);
const colours = await page.evaluate(() => {
  const c = (sel) => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el).color : null;
  };
  return { modal: c('aml-case-modal .ra-link'), link: c('player-menu a.pm__link'), button: c('player-menu button.pm__link') };
});
check(
  'menu links are the modal link colour, the AML Case button included',
  !!colours.modal && colours.link === colours.modal && colours.button === colours.modal,
  JSON.stringify(colours),
);
await page.locator('player-menu a.pm__link').first().hover();
await page.waitForTimeout(250);
await page.locator('aml-case-modal .ra-link').first().scrollIntoViewIfNeeded();
const hoverMenu = await page.evaluate(() => getComputedStyle(document.querySelector('player-menu a.pm__link')).color);
const hoverToken = await page.evaluate(() => {
  const probe = document.createElement('span');
  probe.style.color = 'var(--link-hover)';
  document.body.append(probe);
  const v = getComputedStyle(probe).color;
  probe.remove();
  return v;
});
check('and hover to --link-hover, as the modal link does', hoverMenu === hoverToken, `${hoverMenu} vs ${hoverToken}`);

await page.keyboard.press('Escape');
await page.waitForTimeout(450);
check('Escape with the menu over an open panel closes only the menu',
  (await menu.count()) === 0 && (await panel.count()) === 1);

console.log('\nNarrow');
await page.setViewportSize({ width: 360, height: 760 });
await go('02');
await menuButton.click();
await page.waitForTimeout(250);
const narrow = await page.evaluate(() => {
  const m = document.querySelector('player-menu .pm');
  const r = m.getBoundingClientRect();
  return {
    left: r.left,
    right: r.right,
    bottom: r.bottom,
    scrolls: m.scrollHeight > m.clientHeight,
    pageW: document.documentElement.scrollWidth,
  };
});
check(
  'at 360 the panel keeps its gutters, scrolls inside, and adds no sideways scroll',
  narrow.left >= 16 && narrow.right <= 344 && narrow.bottom <= 760 && narrow.pageW <= 360,
  JSON.stringify(narrow),
);
if (SHOTS) await page.screenshot({ path: `${SHOTS}/menu-360.png` });

console.log(`\npage errors: ${pageErrors.length}`);
pageErrors.slice(0, 3).forEach((e) => console.log('  !', e.slice(0, 160)));

await browser.close();
console.log(failed ? `\n${failed} FAILED\n` : '\nall passed\n');
process.exit(failed || pageErrors.length ? 1 : 0);
