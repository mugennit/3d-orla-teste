/**
 * Monta capturas ANTES × DEPOIS lado a lado a partir de duas pastas de `scripts/rooms.cjs`.
 * Uso: node scripts/pairs.cjs <pasta-antes> <pasta-depois> <saida> "rotulo|NN[|NN...]" ...
 * (NN = número da captura comodo-NN.png; várias capturas por problema viram linhas da mesma imagem)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const [antes, depois, out, ...items] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const W = 960;
const H = 540;
const label = (t, color) =>
  Buffer.from(`<svg width="${W}" height="40"><rect width="100%" height="100%" fill="${color}" opacity="0.85"/><text x="14" y="28" font-family="sans-serif" font-size="22" fill="white">${t}</text></svg>`);

(async () => {
  for (const item of items) {
    const [name, ...ids] = item.split('|');
    const rows = [];
    for (const id of ids) {
      const f = `comodo-${id.padStart(2, '0')}.png`;
      const a = await sharp(path.join(antes, f)).resize(W, H).composite([{ input: label(`ANTES · ${name}`, '#8a1c14'), left: 0, top: 0 }]).png().toBuffer();
      const d = await sharp(path.join(depois, f)).resize(W, H).composite([{ input: label(`DEPOIS · ${name}`, '#1f5e2e'), left: 0, top: 0 }]).png().toBuffer();
      rows.push(a, d);
    }
    const slug = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    await sharp({ create: { width: W * 2, height: H * ids.length, channels: 3, background: '#000' } })
      .composite(rows.map((r, i) => ({ input: r, left: (i % 2) * W, top: Math.floor(i / 2) * H })))
      .jpeg({ quality: 84 })
      .toFile(path.join(out, `antes-depois-${slug}.jpg`));
    console.log('ok', slug);
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
