/**
 * M3 v2 — capturas de evidência: teletransporte recusado na planta e campo de visão 80° × 90°.
 *
 * Uso:  npx vite preview --port 4173 &   node scripts/evidence.cjs [saida] [parâmetros-extra]
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const out = process.argv[2] || 'evidence-output';
const extra = process.argv[3] || '';
const BASE = process.env.TOUR_URL || 'http://localhost:4173/';
fs.mkdirSync(out, { recursive: true });

async function open(browser, query) {
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  await page.goto(`${BASE}?${query}${extra ? '&' + extra : ''}`);
  await page.waitForSelector('.btn-primary');
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => !document.querySelector('.loading-overlay'), null, { timeout: 600000 });
  await page.evaluate(() => document.querySelector('.btn-primary').click());
  await page.waitForTimeout(1500);
  return page;
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shot = (page, name) => page.screenshot({ path: path.join(out, name), timeout: 600000 });

  // 1) Campo de visão: mesma posição e direção, 80° (anterior) × 90° (novo padrão).
  for (const fov of [80, 90]) {
    const page = await open(browser, `fov=${fov}`);
    await page.evaluate(() => {
      const t = window.__tour;
      t.position = [3.0, 4.3];
      t.yaw = (-300 * Math.PI) / 180;
      t.pitch = -0.05;
      t.teleportVersion++;
    });
    await page.waitForTimeout(2500);
    await shot(page, `fov-${fov}.png`);
    await page.close();
  }

  // 2) Teletransporte: planta de topo, clique fora do apartamento → recusado com aviso.
  const page = await open(browser, 'x=1');
  await page.evaluate(() => document.exitPointerLock());
  await page.keyboard.press('Tab');
  await page.waitForTimeout(2000);
  const before = await page.evaluate(() => [...window.__tour.position]);
  await page.mouse.click(40, 660);
  await page.waitForTimeout(400);
  await shot(page, 'teleporte-fora-recusado.png');
  const r1 = await page.evaluate(() => window.__lastTeleport);
  const after = await page.evaluate(() => [...window.__tour.position]);
  const result = { fora: r1, posicao_inalterada: before[0] === after[0] && before[1] === after[1] };
  fs.writeFileSync(path.join(out, 'evidencias.json'), JSON.stringify(result, null, 1));
  console.log(JSON.stringify(result));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
