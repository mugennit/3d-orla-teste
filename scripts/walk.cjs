/**
 * M3 — caminhada real pelo tour (controles normais, não câmeras de comparação).
 *
 * Uso:  npx vite preview --port 4173 &   node scripts/walk.cjs [saida] [parâmetros-extra] [celular]
 * Entra pela tela inicial, percorre entrada → jantar → sala → cozinha com o teclado (ou só
 * posiciona, no celular emulado), captura quadros durante o movimento e confere que as colisões
 * seguram o visitante nas passagens estreitas documentadas (0,66–0,72 m). Grava `<saida>/caminhada.jpg`.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = process.argv[2] || 'walk-output';
const extra = process.argv[3] || '';
const mobile = process.argv[4] === 'celular';
const BASE = process.env.TOUR_URL || 'http://localhost:4173/';
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext(mobile ? { ...devices['iPhone 13'] } : { viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?q=high${extra ? '&' + extra : ''}`);
  await page.waitForSelector('.btn-primary');
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => !document.querySelector('.loading-overlay'), null, { timeout: 600000 });
  await page.evaluate(() => document.querySelector('.btn-primary').click());
  await page.waitForTimeout(2000);
  const state = () => page.evaluate(() => ({ p: [...window.__tour.position], yaw: window.__tour.yaw }));
  const tp = (x, y, yawDeg) =>
    page.evaluate(([a, b, c]) => {
      const t = window.__tour;
      t.position = [a, b];
      t.yaw = (-c * Math.PI) / 180;
      t.pitch = 0;
      t.teleportVersion++;
    }, [x, y, yawDeg]);
  const frames = [];
  const shot = async (label) => {
    const vp = page.viewportSize();
    const buf = await page.screenshot({ clip: { x: 0, y: 0, width: vp.width, height: vp.height }, timeout: 600000 });
    const svg = Buffer.from(`<svg width="${vp.width}" height="34"><rect width="100%" height="100%" fill="black" opacity="0.55"/><text x="12" y="24" font-family="sans-serif" font-size="20" fill="white">${label}</text></svg>`);
    frames.push(await sharp(buf).resize(640, Math.round((640 * vp.height) / vp.width)).composite([{ input: await sharp(svg).resize(640).toBuffer(), left: 0, top: 0 }]).png().toBuffer());
  };
  const results = [];
  const walk = async (key, ms, label) => {
    const a = await state();
    if (mobile) return a;
    await page.keyboard.down(key);
    await page.waitForTimeout(ms / 2);
    await shot(`${label} (em movimento)`);
    await page.waitForTimeout(ms / 2);
    await page.keyboard.up(key);
    await page.waitForTimeout(400);
    const b = await state();
    results.push({ trecho: label, de: a.p.map((v) => +v.toFixed(2)), ate: b.p.map((v) => +v.toFixed(2)) });
    return b;
  };
  // Entrada (porta a oeste) olhando para o leste, rumo ao jantar.
  await tp(0.45, 5.3, 90);
  await page.waitForTimeout(1500);
  await shot('entrada');
  await walk('KeyW', 1600, 'entrada → jantar');
  await tp(2.2, 3.6, 0);
  await page.waitForTimeout(1500);
  await shot('circulação → varanda');
  await walk('KeyW', 1800, 'em direção à varanda (frente do sofá)');
  await tp(1.6, 3.0, 270);
  await page.waitForTimeout(1500);
  await shot('diante da bancada');
  const stop = await walk('KeyW', 1500, 'contra a bancada (colisão)');
  if (!mobile) results.push({ colisao_bancada_ok: stop.p[0] > 0.9 });
  await tp(2.9, 4.0, 225);
  await page.waitForTimeout(1500);
  await shot('vista diagonal sala/cozinha');
  fs.writeFileSync(path.join(out, 'caminhada.json'), JSON.stringify(results, null, 1));
  const w = 640;
  const h = Math.round((640 * page.viewportSize().height) / page.viewportSize().width);
  const cols = 3;
  await sharp({ create: { width: w * cols, height: h * Math.ceil(frames.length / cols), channels: 3, background: '#000' } })
    .composite(frames.map((f, i) => ({ input: f, left: (i % cols) * w, top: Math.floor(i / cols) * h })))
    .jpeg({ quality: 85 })
    .toFile(path.join(out, 'caminhada.jpg'));
  console.log(JSON.stringify(results));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
