/**
 * Teste de fumaça de ponta a ponta (desktop + celular emulado).
 *
 * Uso:  npm run build && npx vite preview --port 4173 &
 *       node scripts/smoke.cjs [pasta-de-capturas]
 *
 * Requer o pacote `playwright` com Chromium disponível no ambiente.
 */
const { chromium, devices } = require('playwright');
const fs = require('fs');

const URL = process.env.TOUR_URL || 'http://localhost:4173/?q=low';
const out = process.argv[2] || 'smoke-output';
fs.mkdirSync(out, { recursive: true });

const failures = [];
const check = (cond, msg) => {
  console.log(`${cond ? '✔' : '✘'} ${msg}`);
  if (!cond) failures.push(msg);
};
const state = (page) => page.evaluate(() => ({ p: [...window.__tour.position], yaw: window.__tour.yaw, pitch: window.__tour.pitch }));

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [];

  // ---------------- Desktop ----------------
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('console', (m) => m.type() === 'error' && errors.push('desktop: ' + m.text()));
  page.on('pageerror', (e) => errors.push('desktop: ' + e.message));
  await page.goto(URL);
  await page.waitForSelector('.btn-primary');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/desktop-1-inicio.png` });
  await page.click('.btn-primary');
  await page.waitForTimeout(500);

  const s0 = await state(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const s1 = await state(page);
  const d1 = Math.hypot(s1.p[0] - s0.p[0], s1.p[1] - s0.p[1]);
  check(d1 > 0.3, `WASD: visitante se move para frente (${d1.toFixed(2)} m)`);

  await page.mouse.move(480, 300);
  await page.mouse.down();
  for (let i = 0; i < 10; i++) await page.mouse.move(480 + i * 20, 300 - i * 5);
  await page.mouse.up();
  await page.waitForTimeout(400);
  const s2 = await state(page);
  check(Math.abs(s2.yaw - s1.yaw) > 0.1 && Math.abs(s2.pitch - s1.pitch) > 0.02, 'Mouse: câmera gira na horizontal e vertical');

  // Colisão: no Quarto 2, anda 8 s em direção à parede da janela
  // (face interna em y ≈ 0,10 m; raio do visitante 0,25 m → para em ≈ 0,35 m).
  await page.evaluate(() => { window.__tour.position = [4.61, 1.78]; window.__tour.yaw = 0; window.__tour.pitch = 0; window.__tour.teleportVersion++; });
  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  await page.waitForTimeout(8000);
  await page.keyboard.up('ShiftLeft');
  await page.keyboard.up('KeyW');
  const s3 = await state(page);
  check(s3.p[1] >= 0.35 - 0.02 && s3.p[1] < 0.6, `Colisão: visitante parou na parede da janela (y = ${s3.p[1].toFixed(3)})`);
  await page.screenshot({ path: `${out}/desktop-2-parede.png` });

  await page.evaluate(() => document.exitPointerLock());
  await page.waitForTimeout(200);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(1600);
  check(await page.locator('.mode-plan').count() === 1, 'Tab: alterna para a planta 3D');
  await page.screenshot({ path: `${out}/desktop-3-planta.png` });
  await page.mouse.click(480, 330);
  await page.waitForTimeout(1000);
  check(await page.locator('.mode-walk').count() === 1, 'Planta 3D: clique no piso entra no modo visita');
  const s4 = await state(page);
  check(
    Math.hypot(s4.p[0] - s3.p[0], s4.p[1] - s3.p[1]) > 0.3 && s4.p[0] > 0 && s4.p[0] < 8.4 && s4.p[1] > 0 && s4.p[1] < 5.9,
    `Planta 3D: visitante posicionado no ponto clicado (${s4.p.map((v) => v.toFixed(2)).join(', ')})`,
  );
  await page.screenshot({ path: `${out}/desktop-4-entrar-aqui.png` });

  // ---------------- Celular ----------------
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const m = await ctx.newPage();
  m.on('console', (msg) => msg.type() === 'error' && errors.push('mobile: ' + msg.text()));
  m.on('pageerror', (e) => errors.push('mobile: ' + e.message));
  await m.goto(URL);
  await m.waitForSelector('.btn-primary');
  await m.waitForTimeout(1500);
  await m.screenshot({ path: `${out}/mobile-1-inicio.png` });
  await m.tap('.btn-primary');
  await m.waitForTimeout(500);
  check(await m.locator('.joystick-base').count() === 1, 'Celular: joystick virtual visível');

  const cdp = await ctx.newCDPSession(m);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const box = await m.locator('.joystick-base').boundingBox();
  const jx = box.x + box.width / 2;
  const jy = box.y + box.height / 2;
  const t0 = await state(m);
  // Dedo 1 no joystick + dedo 2 arrastando no lado direito (multitoque).
  await touch('touchStart', [{ x: jx, y: jy, id: 1 }]);
  await touch('touchMove', [{ x: jx, y: jy - 40, id: 1 }]);
  await touch('touchStart', [{ x: jx, y: jy - 40, id: 1 }, { x: 300, y: 450, id: 2 }]);
  for (let i = 1; i <= 12; i++) {
    await touch('touchMove', [{ x: jx, y: jy - 40, id: 1 }, { x: 300 + i * 5, y: 450 + i * 2, id: 2 }]);
    await m.waitForTimeout(25);
  }
  await m.waitForTimeout(700);
  const t1 = await state(m);
  await touch('touchEnd', []);
  check(Math.hypot(t1.p[0] - t0.p[0], t1.p[1] - t0.p[1]) > 0.3, 'Celular: joystick movimenta o visitante');
  check(Math.abs(t1.yaw - t0.yaw) > 0.1 && Math.abs(t1.pitch - t0.pitch) > 0.02, 'Celular: arraste à direita gira a câmera (H e V)');
  await m.screenshot({ path: `${out}/mobile-2-visita.png` });
  await m.tap('button[role=tab]:nth-child(2)');
  await m.waitForTimeout(1600);
  await m.screenshot({ path: `${out}/mobile-3-planta.png` });

  check(errors.length === 0, `Sem erros no console${errors.length ? ': ' + errors.join(' | ') : ''}`);
  await browser.close();
  if (failures.length) {
    console.error(`\n${failures.length} verificação(ões) falharam.`);
    process.exit(1);
  }
  console.log('\nTodas as verificações passaram.');
})();
