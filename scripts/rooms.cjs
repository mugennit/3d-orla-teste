/**
 * M3 — inspeção visual de TODOS os cômodos (inclusive os sem acabamento final).
 *
 * Uso:  npx vite preview --port 4173 &   node scripts/rooms.cjs [saida] [parâmetros-extra]
 * Captura poses `?pose=x,y,altura,rumo°,inclinação°,lente` em cada ambiente — cantos junto às
 * janelas, encontros parede/teto, soleiras e passagens, banheiros e portas — e monta
 * `<saida>/comodos.jpg`. Calcula também um indicador de MANCHAS ESCURAS por captura: % de pixels
 * mais de 28 níveis abaixo da média local (janela 15×15 numa versão 320×180). Bordas reais (batentes)
 * também contam um pouco; o número serve para comparar antes × depois na mesma pose.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = process.argv[2] || 'rooms-output';
const extra = process.argv[3] || '';
const BASE = process.env.TOUR_URL || 'http://localhost:4173/';
const W = 960;
const H = 540;
const POSES = [
  ['Sala · persiana e varanda', '2.4,3.8,1.6,0,0,16'],
  ['Sala · persiana, sofá e rack', '2.6,2.3,1.5,350,5,16'],
  ['Sala · sofá e rack (lateral)', '3.0,1.4,1.4,200,-10,16'],
  ['Cozinha · encontro parede/teto', '1.2,3.0,1.6,300,30,16'],
  ['Piso · cozinha/sala', '1.6,4.0,1.6,300,-45,16'],
  ['Entrada · porta e soleira', '1.0,5.2,1.6,270,-25,16'],
  ['Quarto 2 · canto da janela', '4.6,2.6,1.6,20,18,16'],
  ['Quarto 2 · canto oposto', '4.4,1.0,1.6,160,18,16'],
  ['Quarto 2 · soleira', '4.0,4.1,1.6,0,-55,16'],
  ['Suíte · canto da janela', '6.6,3.9,1.6,10,18,16'],
  ['Suíte · canto oposto', '7.6,2.0,1.6,200,18,16'],
  ['Circulação · piso e portas', '4.1,4.0,1.6,90,-40,16'],
  ['Banho social · porta', '4.2,4.05,1.6,180,-5,16'],
  ['Banho social · interno', '4.3,5.25,1.6,80,-10,16'],
  ['Banho social · teto', '4.6,5.2,1.5,0,45,16'],
  ['Banho suíte · porta', '6.8,4.1,1.6,180,-5,16'],
  ['Banho suíte · interno', '6.7,5.2,1.6,90,-10,16'],
  ['Varanda / serviço', '1.0,1.3,1.6,300,-20,16'],
];
fs.mkdirSync(out, { recursive: true });

async function stains(buf) {
  const { data, info } = await sharp(buf).resize(320, 180).greyscale().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const r = 7;
  let n = 0;
  let tot = 0;
  for (let y = r; y < h - r; y += 2) {
    for (let x = r; x < w - r; x += 2) {
      let s = 0;
      for (let j = -r; j <= r; j += 3) for (let i = -r; i <= r; i += 3) s += data[(y + j) * w + x + i];
      const mean = s / 25;
      if (mean - data[y * w + x] > 28) n++;
      tot++;
    }
  }
  return +((100 * n) / tot).toFixed(2);
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H } })).newPage();
  const tiles = [];
  const report = {};
  for (const [name, pose] of POSES) {
    await page.goto(`${BASE}?pose=${pose}${extra ? '&' + extra : ''}`);
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !document.querySelector('.loading-overlay'), null, { timeout: 600000 });
    await page.waitForFunction(() => window.__compareReady === true, null, { timeout: 120000 });
    await page.waitForTimeout(2500);
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, timeout: 600000 });
    fs.writeFileSync(path.join(out, `comodo-${String(tiles.length + 1).padStart(2, '0')}.png`), shot);
    report[name] = { pose, manchas_pct: await stains(shot) };
    const label = Buffer.from(`<svg width="${W}" height="36"><rect width="100%" height="100%" fill="black" opacity="0.6"/><text x="12" y="25" font-family="sans-serif" font-size="20" fill="white">${name} · manchas ${report[name].manchas_pct}%</text></svg>`);
    tiles.push(await sharp(shot).composite([{ input: label, left: 0, top: 0 }]).png().toBuffer());
    console.log(name, report[name].manchas_pct);
  }
  fs.writeFileSync(path.join(out, 'comodos.json'), JSON.stringify(report, null, 1));
  const cols = 3;
  await sharp({ create: { width: W * cols, height: H * Math.ceil(tiles.length / cols), channels: 3, background: '#000' } })
    .composite(tiles.map((t, i) => ({ input: t, left: (i % cols) * W, top: Math.floor(i / cols) * H })))
    .jpeg({ quality: 82 })
    .toFile(path.join(out, 'comodos.jpg'));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
