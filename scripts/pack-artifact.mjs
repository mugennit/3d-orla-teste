/**
 * Empacota os modelos .glb em partes de texto base64 (≤ 12 MB) para a prévia
 * publicada como artifact, que não serve arquivos .glb. O deploy normal usa o .glb.
 * Uso: node scripts/pack-artifact.mjs <pasta-do-build>
 */
import { readFileSync, writeFileSync, rmSync } from 'node:fs';

const dir = process.argv[2];
const PART = 12 * 1024 * 1024;
for (const tier of ['desktop', 'mobile']) {
  const base = `${dir}/cenas/orla-45m2/${tier}`;
  const b64 = readFileSync(`${base}/apto.glb`).toString('base64');
  const parts = Math.ceil(b64.length / PART);
  for (let i = 0; i < parts; i++) writeFileSync(`${base}/apto.part${i}.txt`, b64.slice(i * PART, (i + 1) * PART));
  writeFileSync(`${base}/pack.json`, JSON.stringify({ parts }));
  rmSync(`${base}/apto.glb`);
  console.log(tier, parts, 'partes');
}
