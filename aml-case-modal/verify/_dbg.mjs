import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
for (const vw of [1440, 1300, 1200, 1100, 1024, 980, 900, 820, 760]) {
  await p.setViewportSize({ width: vw, height: 900 });
  await p.goto('http://localhost:4200/?state=09', { waitUntil: 'networkidle' });
  await p.waitForTimeout(600);
  await p.locator('sg-alert-modal [aria-label="Close alert"], sg-alert-modal [aria-label="Close"]').first().click().catch(()=>{});
  await p.waitForTimeout(800);
  const m = await p.evaluate(() => {
    const a = document.querySelector('aml-case-modal');
    const row = document.querySelector('back-office-widgets .widgets');
    const g = (e) => e ? { l: Math.round(e.getBoundingClientRect().left), r: Math.round(e.getBoundingClientRect().right) } : null;
    return { panel: g(a), row: g(row), inner: window.innerWidth,
             overflow: a ? Math.round(a.getBoundingClientRect().right - window.innerWidth) : null,
             docScrollW: document.documentElement.scrollWidth };
  });
  const flag = m.overflow > 0 || m.docScrollW > m.inner ? '  <-- CROPPED' : '';
  console.log(`vw ${String(vw).padEnd(5)} panel=${JSON.stringify(m.panel)} row=${JSON.stringify(m.row)} overflow=${m.overflow} scrollW=${m.docScrollW}${flag}`);
}
await b.close();
