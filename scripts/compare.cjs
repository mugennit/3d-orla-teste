/**
 * M3 — comparação lado a lado: render do Cycles × tour no navegador, mesma câmera.
 *
 * Uso:  npm run build && npx vite preview --port 4173 &
 *       node scripts/compare.cjs [pasta-saida] [cam1,cam2,...] [parâmetros-extra-da-url]
 *
 * Para cada câmera de pipeline/master_scene.py (CAMERAS → cameras.json) abre `?cam=<nome>`,
 * captura 1280×720 e monta `<saida>/cmp-<nome>.jpg` (esquerda: Cycles, direita: navegador).
 * Grava `<saida>/compare.json` com médias por canal (para calibrar exposição e balanço de
 * branco) e a diferença média de luminância. Referências: docs/m1/rodada4 (ou rodada3).
 *
 * O ambiente de testes usa renderização por software (SwiftShader): a imagem é a mesma de uma
 * GPU, mas o FPS medido aqui não vale para aparelhos reais (use ?fps=1 no aparelho).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = process.argv[2] || 'compare-output';
const cams = (process.argv[3] || 'sala-cozinha,cozinha,cozinha-book,jantar-detalhe,conf-cozinha-perto,conf-geladeira,conf-cuba,conf-mesa,sofa-detalhe').split(',');
const extra = process.argv[4] || '';
const BASE = process.env.TOUR_URL || 'http://localhost:4173/';
const W = 1280;
const H = 720;
fs.mkdirSync(out, { recursive: true });

function reference(name) {
  for (const d of ['docs/m1/rodada4', 'docs/m1/rodada3']) {
    const f = path.join(d, `final-${name}.jpg`);
    if (fs.existsSync(f)) return f;
  }
  return null;
}

async function stats(buf) {
  const { data, info } = await sharp(buf).resize(320, 180).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const m = [0, 0, 0];
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) m[c] += data[i * 3 + c];
    lum[i] = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
  }
  return { mean: m.map((v) => +(v / n).toFixed(1)), lum };
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && console.log('[navegador]', m.text()));
  const report = {};
  for (const name of cams) {
    const t0 = Date.now();
    await page.goto(`${BASE}?cam=${name}${extra ? '&' + extra : ''}`);
    await page.waitForTimeout(1500);
    await page.waitForFunction(() => !document.querySelector('.loading-overlay'), null, { timeout: 600000 });
    await page.waitForFunction(() => window.__compareReady === true, null, { timeout: 120000 });
    await page.waitForTimeout(2500); // captura do cubemap de reflexos e compilação dos shaders
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H }, timeout: 600000 });
    const tourFile = path.join(out, `tour-${name}.png`);
    fs.writeFileSync(tourFile, shot);
    const ref = reference(name);
    const entry = { tempo_s: +((Date.now() - t0) / 1000).toFixed(1) };
    const tour = await stats(shot);
    entry.tour = tour.mean;
    if (ref) {
      const refBuf = await sharp(ref).resize(W, H).toBuffer();
      const r = await stats(refBuf);
      entry.referencia = path.basename(path.dirname(ref)) + '/' + path.basename(ref);
      entry.cycles = r.mean;
      entry.razao_canais = r.mean.map((v, i) => +(v / Math.max(tour.mean[i], 1)).toFixed(3));
      let d = 0;
      for (let i = 0; i < r.lum.length; i++) d += Math.abs(r.lum[i] - tour.lum[i]);
      entry.dif_luminancia_media = +(d / r.lum.length).toFixed(1);
      const label = (txt) => Buffer.from(`<svg width="${W}" height="40"><rect width="100%" height="100%" fill="black" opacity="0.55"/><text x="16" y="27" font-family="sans-serif" font-size="22" fill="white">${txt}</text></svg>`);
      await sharp({ create: { width: W * 2, height: H, channels: 3, background: '#000' } })
        .composite([
          { input: refBuf, left: 0, top: 0 },
          { input: shot, left: W, top: 0 },
          { input: label(`Cycles (Blender) · ${name}`), left: 0, top: 0 },
          { input: label(`Navegador (Three.js) · ${name}`), left: W, top: 0 },
        ])
        .jpeg({ quality: 88 })
        .toFile(path.join(out, `cmp-${name}.jpg`));
    }
    report[name] = entry;
    console.log(name, JSON.stringify(entry));
  }
  fs.writeFileSync(path.join(out, 'compare.json'), JSON.stringify(report, null, 1));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
