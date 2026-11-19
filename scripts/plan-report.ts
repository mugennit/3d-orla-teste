/**
 * Gera o relatório de medidas da Etapa 1 a partir do layout (fonte única).
 * Uso: npx vite-node scripts/plan-report.ts
 * Saídas: docs/etapa1/medidas.md e docs/etapa1/layout.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { doorLeaves, polygonArea, wallLength, wallPieces } from '../src/engine/geometry';
import { planEvidence } from '../src/engine/planEvidence';
import { orla45m2 as L, PX_PER_M } from '../src/layout/orla-guanabara/apto-45m2';

const f2 = (n: number) => n.toFixed(2).replace('.', ',');
const prov = (p?: string) => ({ confirmed: 'confirmada', measured: 'medida na imagem', assumed: 'adotada' })[p ?? 'measured'];

const png = PNG.sync.read(readFileSync('public/referencias/orla-45m2-planta-p17.png'));
const ev = planEvidence(L, (x, y) => {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
  const i = (y * png.width + x) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
});

const lines: string[] = [];
lines.push('# Etapa 1 — Medidas do modelo (geradas automaticamente)', '');
lines.push('> Gerado por `scripts/plan-report.ts` a partir de `src/layout/orla-guanabara/apto-45m2.ts`.');
lines.push('> **Nenhuma medida abaixo é oficial**, exceto a área privativa (45,66 m²). A planta do book não tem cotas.', '');
lines.push('## Calibração', '');
lines.push(`- Escala: **${f2(PX_PER_M)} px/m** (1 px ≈ ${(100 / PX_PER_M).toFixed(1).replace('.', ',')} cm na imagem do book)`);
lines.push(`- Método: ${L.reference!.calibration}`);
lines.push(`- Área do contorno modelado: ${f2(polygonArea(L.envelope!))} m² (declarada: ${f2(L.privateArea!)} m² — **confirmada**)`);
lines.push(`- Pé-direito: ${f2(L.ceilingHeight)} m (**${prov(L.ceilingHeightProvenance)}**)`, '');

lines.push('## Ambientes (área interna modelada)', '');
lines.push('| Ambiente | Dimensões aprox. (m) | Área modelada (m²) | Origem | Observação |', '|---|---|---|---|---|');
let total = 0;
for (const r of L.rooms) {
  const xs = r.polygon.map((p) => p[0]);
  const ys = r.polygon.map((p) => p[1]);
  const a = polygonArea(r.polygon);
  total += a;
  lines.push(`| ${r.name} | ${f2(Math.max(...xs) - Math.min(...xs))} × ${f2(Math.max(...ys) - Math.min(...ys))} | ${f2(a)} | ${prov(r.provenance)} | ${r.note ?? ''} |`);
}
lines.push(`| **Soma das áreas internas** | | **${f2(total)}** | | Diferença para 45,66 m² = paredes (${f2(L.privateArea! - total)} m², ${((1 - total / L.privateArea!) * 100).toFixed(1).replace('.', ',')} %) |`, '');

lines.push('## Vãos', '');
lines.push('| Vão | Tipo | Largura (m) | Peitoril (m) | Altura/verga (m) | Largura | Alturas | Observação |', '|---|---|---|---|---|---|---|---|');
for (const w of L.walls)
  for (const o of w.openings ?? [])
    lines.push(`| ${o.id} | ${o.kind} | ${f2(o.width)} | ${f2(o.sill)} | ${f2(o.head)} | ${prov(o.provenance)} | adotadas | ${o.note ?? ''} |`);
lines.push('');

lines.push('## Paredes', '');
lines.push('| Parede | Sistema | Comprimento (m) | Espessura (m) | Coincidência com a planta | Observação |', '|---|---|---|---|---|---|');
for (const w of L.walls) {
  const segs = ev.filter((e) => e.wallId === w.id && e.kind === 'solid' && e.length >= 0.2);
  const score = segs.length ? Math.min(...segs.map((s) => s.score)) : NaN;
  lines.push(`| ${w.id} | ${w.structure} | ${f2(wallLength(w))} | ${f2(w.thickness)} | ${Number.isNaN(score) ? '—' : `${Math.round(score * 100)} %`} | ${w.note ?? ''} |`);
}
lines.push('', '_Coincidência: menor fração, entre os trechos sólidos da parede, de amostras do eixo modelado que caem sobre traço de parede na imagem (faixa de ±3 px ≈ ±4 cm)._', '');

writeFileSync('docs/etapa1/medidas.md', lines.join('\n') + '\n');

// Dados para a imagem anotada (px da imagem de referência).
const ref = L.reference!;
const toPx = (p: readonly [number, number]) => [p[0] * ref.pxPerMeter + ref.originPx[0], p[1] * ref.pxPerMeter + ref.originPx[1]];
writeFileSync(
  'docs/etapa1/layout.json',
  JSON.stringify(
    {
      pxPerMeter: ref.pxPerMeter,
      pieces: L.walls.flatMap((w) =>
        wallPieces(w, L.ceilingHeight)
          .filter((p) => p.bottom === 0)
          .map((p) => ({ id: w.id, structure: w.structure, center: toPx(p.center), length: p.length * ref.pxPerMeter, thickness: p.thickness * ref.pxPerMeter, angle: p.angle, top: p.top })),
      ),
      leaves: L.walls.flatMap(doorLeaves).map((d) => ({ hinge: toPx(d.hinge), center: toPx(d.center), width: d.width * ref.pxPerMeter })),
      shafts: L.furniture.map((f) => ({ id: f.id, center: toPx(f.position), size: [f.size[0] * ref.pxPerMeter, f.size[2] * ref.pxPerMeter] })),
      rooms: L.rooms.map((r) => ({ name: r.name, polygon: r.polygon.map(toPx) })),
    },
    null,
    1,
  ),
);
console.log('ok', ev.length, 'segmentos avaliados');
