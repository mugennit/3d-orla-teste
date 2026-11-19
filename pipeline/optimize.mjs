/**
 * Otimiza a cena exportada pelo Blender para a web, em dois perfis:
 *   desktop: texturas PBR até 2048 px, lightmaps 4096 px (ou o tamanho do bake)
 *   mobile : texturas PBR até 1024 px, lightmaps 2048 px
 * Malhas comprimidas com Meshopt; texturas em WebP; duplicatas removidas.
 *
 * Uso: node pipeline/optimize.mjs   (lê .cache/build, escreve public/cenas/orla-45m2/)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import { copyFileSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';

const BUILD = '.cache/build';
const OUT = 'public/cenas/orla-45m2';

const profiles = {
  desktop: { tex: 2048, lm: 4096, quality: 88 },
  mobile: { tex: 1024, lm: 2048, quality: 82 },
};

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const meta = JSON.parse(readFileSync(`${BUILD}/bake_meta.json`, 'utf8'));
const kb = (f) => `${(statSync(f).size / 1024 / 1024).toFixed(1)} MB`;

for (const [name, p] of Object.entries(profiles)) {
  const dir = `${OUT}/${name}`;
  mkdirSync(dir, { recursive: true });
  const doc = await io.read(`${BUILD}/apto.glb`);
  await doc.transform(
    dedup(),
    prune(),
    weld(),
    resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [p.tex, p.tex], quality: p.quality }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(`${dir}/apto.glb`, doc);
  const files = [`${dir}/apto.glb`];
  for (const g of ['arch', 'furn']) {
    const src = `${BUILD}/lm_${g}.png`;
    try {
      const img = sharp(src);
      const { width } = await img.metadata();
      const size = Math.min(width, p.lm);
      await img.resize(size, size).webp({ quality: 92, smartSubsample: true }).toFile(`${dir}/lm_${g}.webp`);
      files.push(`${dir}/lm_${g}.webp`);
    } catch (e) {
      console.warn(`lightmap ${g} ausente:`, e.message);
    }
  }
  console.log(name, files.map((f) => `${f.split('/').pop()} ${kb(f)}`).join(' · '));
}

try {
  await sharp(`${BUILD}/sky.jpg`).resize(2048, 1024).jpeg({ quality: 85 }).toFile(`${OUT}/ceu.jpg`);
} catch {
  console.warn('céu ausente');
}
writeFileSync(`${OUT}/meta.json`, JSON.stringify({ ...meta, generatedAt: new Date().toISOString() }, null, 1));
try {
  copyFileSync(`${BUILD}/credits_used.json`, `${OUT}/creditos.json`);
} catch {
  /* sem créditos */
}
