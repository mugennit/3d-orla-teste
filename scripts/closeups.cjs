/**
 * M3 — conferência de perto e de ângulos desfavoráveis (não só as câmeras "bonitas").
 *
 * Uso:  npx vite preview --port 4173 &   node scripts/closeups.cjs [saida] [parâmetros-extra]
 * Captura poses `?pose=x,y,altura,rumo°,inclinação°,lente` (planta em metros; rumo 0° = norte do
 * desenho/varanda, 90° = leste) e monta uma folha de contato `<saida>/perto.jpg`.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = process.argv[2] || 'closeups-output';
const extra = process.argv[3] || '';
const BASE = process.env.TOUR_URL || 'http://localhost:4173/';
const W = 960;
const H = 540;
const POSES = [
  ['sofá e quadro', '2.9,1.8,1.5,270,-8,24'],
  ['sofá de perto', '2.55,2.35,1.05,245,-28,26'],
  ['mesa e cadeiras', '2.2,4.25,1.35,180,-32,24'],
  ['bancada de perto', '1.05,3.0,1.6,270,-38,24'],
  ['geladeira de perto', '1.35,3.95,1.6,270,-12,22'],
  ['cortina e varanda', '2.5,1.75,1.6,0,0,22'],
  ['rack e TV', '2.4,1.9,1.4,90,-10,24'],
  ['entrada', '1.6,5.1,1.6,270,-5,22'],
  ['canto de parede e forro', '2.2,3.4,1.6,140,22,18'],
];
fs.mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  const tiles = [];
  for (const [name, pose] of POSES) {
    await page.goto(`${BASE}?pose=${pose}${extra ? '&' + extra : ''}`);
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !document.querySelector('.loading-overlay'), null, { timeout: 600000 });
    await page.waitForFunction(() => window.__compareReady === true, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, timeout: 600000 });
    const file = path.join(out, `perto-${tiles.length + 1}.png`);
    fs.writeFileSync(file, shot);
    const label = Buffer.from(`<svg width="${W}" height="36"><rect width="100%" height="100%" fill="black" opacity="0.55"/><text x="12" y="25" font-family="sans-serif" font-size="20" fill="white">${name}</text></svg>`);
    tiles.push(await sharp(shot).composite([{ input: label, left: 0, top: 0 }]).png().toBuffer());
    console.log('ok', name);
  }
  const cols = 3;
  const rows = Math.ceil(tiles.length / cols);
  await sharp({ create: { width: W * cols, height: H * rows, channels: 3, background: '#000' } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
    .jpeg({ quality: 85 })
    .toFile(path.join(out, 'perto.jpg'));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
