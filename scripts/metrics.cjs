/**
 * Métricas de carregamento e de renderização da cena fotorrealista.
 *
 * Uso: npm run build && npx vite preview --port 4173 &
 *      node scripts/metrics.cjs
 *
 * Mede, para computador e celular (emulado): bytes transferidos, tempo até a
 * cena ficar pronta sob rede simulada, chamadas de desenho, triângulos e
 * texturas por quadro. O FPS real depende da GPU do aparelho; este ambiente
 * usa renderização por software, então o FPS medido aqui não é representativo
 * (use `?fps=1` no aparelho real).
 */
const { chromium, devices } = require('playwright');
const URL = process.env.TOUR_URL || 'http://localhost:4173/';

const profiles = [
  { name: 'Computador · banda larga 50 Mbit/s', ctx: { viewport: { width: 1440, height: 810 } }, net: { down: 50, up: 10, rtt: 20 }, cpu: 1 },
  { name: 'Celular · 4G (12 Mbit/s, 70 ms)', ctx: { ...devices['iPhone 13'] }, net: { down: 12, up: 4, rtt: 70 }, cpu: 4 },
  { name: 'Celular · 4G fraco (5 Mbit/s, 150 ms)', ctx: { ...devices['iPhone 13'] }, net: { down: 5, up: 1.5, rtt: 150 }, cpu: 4 },
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  for (const p of profiles) {
    const ctx = await browser.newContext(p.ctx);
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: p.net.rtt,
      downloadThroughput: (p.net.down * 1e6) / 8,
      uploadThroughput: (p.net.up * 1e6) / 8,
    });
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
    let bytes = 0;
    const byType = {};
    const urls = new Map();
    cdp.on('Network.responseReceived', (e) => urls.set(e.requestId, e.response.url));
    cdp.on('Network.loadingFinished', (e) => {
      bytes += e.encodedDataLength;
      const u = urls.get(e.requestId) || '';
      const k = /\.glb/.test(u) ? 'modelo (glb)' : /lm_.*\.webp/.test(u) ? 'lightmaps' : /ceu/.test(u) ? 'céu' : /\.js/.test(u) ? 'código (js)' : 'outros';
      byType[k] = (byType[k] || 0) + e.encodedDataLength;
    });
    const t0 = Date.now();
    await page.goto(URL);
    await page.waitForSelector('.btn-primary');
    const tUi = Date.now() - t0;
    await page.waitForTimeout(1000);
    await page.waitForFunction(() => !document.querySelector('.loading-overlay'), null, { timeout: 600000 });
    const tReady = Date.now() - t0 - 400; // o overlay some 400 ms após 100%
    await page.evaluate(() => document.querySelector('.btn-primary').click());
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => {
      const gl = window.__gl;
      const r = gl.info.render;
      return { calls: r.calls, triangles: r.triangles, textures: gl.info.memory.textures, geometries: gl.info.memory.geometries };
    });
    const mb = (b) => (b / 1024 / 1024).toFixed(1) + ' MB';
    console.log(`\n${p.name}`);
    console.log(`  interface pronta: ${(tUi / 1000).toFixed(1)} s · cena pronta: ${(tReady / 1000).toFixed(1)} s`);
    console.log(`  transferido: ${mb(bytes)} (${Object.entries(byType).map(([k, v]) => `${k} ${mb(v)}`).join(', ')})`);
    console.log(`  por quadro: ${info.calls} chamadas de desenho · ${(info.triangles / 1000).toFixed(0)} mil triângulos · ${info.textures} texturas · ${info.geometries} geometrias`);
    await ctx.close();
  }
  await browser.close();
})();
