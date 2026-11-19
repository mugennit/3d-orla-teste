/**
 * Exporta o layout aprovado (geometria da Etapa 1) + mobiliário da sala/cozinha
 * para o pipeline do Blender. Uso: npx vite-node pipeline/export_layout.ts
 * Saída: .cache/build/layout.json (coordenadas em metros da planta; y para baixo).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { doorLeaves, wallLength, wallPieces } from '../src/engine/geometry';
import { orla45m2 as L, pagePxToPlan, PX_PER_M } from '../src/layout/orla-guanabara/apto-45m2';
import { salaCozinha, ZONE_ROOMS } from '../src/layout/orla-guanabara/sala-cozinha';
import type { Vec2, Wall } from '../src/layout/types';

const m = (px: number) => px / PX_PER_M;
const P = pagePxToPlan;

// --- Rodapés: trechos de face de parede que limitam os ambientes da zona ---
interface Run { wall: string; side: 1 | -1; t0: number; t1: number }
function baseboards(): Run[] {
  const runs: Run[] = [];
  const step = 0.01;
  const tol = 0.03;
  const isWalkableAt = (w: Wall, t: number) =>
    (w.openings ?? []).some((o) => o.kind !== 'window' && t > o.offset - 0.005 && t < o.offset + o.width + 0.005);
  const key = (w: string, s: number) => `${w}|${s}`;
  const samples = new Map<string, number[]>();
  for (const room of L.rooms.filter((r) => ZONE_ROOMS.includes(r.id))) {
    const poly = room.polygon;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let s = 0; s <= len; s += step) {
        const p: Vec2 = [a[0] + ((b[0] - a[0]) * s) / len, a[1] + ((b[1] - a[1]) * s) / len];
        for (const w of L.walls) {
          if (w.structure === 'railing' || w.structure === 'parapet') continue;
          const wl = wallLength(w);
          const ux = (w.to[0] - w.from[0]) / wl;
          const uy = (w.to[1] - w.from[1]) / wl;
          const t = (p[0] - w.from[0]) * ux + (p[1] - w.from[1]) * uy;
          if (t < 0 || t > wl) continue;
          const d = (p[0] - w.from[0]) * -uy + (p[1] - w.from[1]) * ux; // distância assinada (normal n = (−uy, ux))
          if (Math.abs(Math.abs(d) - w.thickness / 2) > tol) continue;
          if (isWalkableAt(w, t)) continue;
          const k = key(w.id, d > 0 ? 1 : -1);
          if (!samples.has(k)) samples.set(k, []);
          samples.get(k)!.push(t);
        }
      }
    }
  }
  for (const [k, ts] of samples) {
    const [wall, side] = k.split('|');
    ts.sort((x, y) => x - y);
    let s0 = ts[0]!;
    let prev = s0;
    for (const t of ts.slice(1).concat([Infinity])) {
      if (t - prev > 0.05) {
        if (prev - s0 > 0.05) runs.push({ wall: wall!, side: Number(side) as 1 | -1, t0: s0, t1: prev });
        s0 = t;
      }
      prev = t;
    }
  }
  return runs;
}

// --- Áreas de piso cerâmico em placas (px → m) ---
const tileRectsPx: [number, number, number, number][] = [
  [50, 451, 316, 779],
  [167, 401, 316, 451],
  [316, 604.7, 408.8, 678.3],
];

const zoneItems = salaCozinha.map((it) => ({
  ...it,
  rect: it.rectPx ? [...P([it.rectPx[0], it.rectPx[1]]), ...P([it.rectPx[2], it.rectPx[3]])] : undefined,
  at: it.atPx ? P(it.atPx) : undefined,
}));

const out = {
  generatedFrom: 'src/layout/orla-guanabara/apto-45m2.ts + sala-cozinha.ts',
  pxPerMeter: PX_PER_M,
  ceilingHeight: L.ceilingHeight,
  envelope: L.envelope,
  zoneRooms: ZONE_ROOMS,
  rooms: L.rooms.map((r) => ({ id: r.id, name: r.name, polygon: r.polygon, floorMaterial: r.floorMaterial, outdoor: !!r.outdoor })),
  walls: L.walls.map((w) => ({
    id: w.id,
    from: w.from,
    to: w.to,
    thickness: w.thickness,
    height: w.height ?? L.ceilingHeight,
    structure: w.structure,
    material: w.material ?? 'wall',
    openings: w.openings ?? [],
    pieces: wallPieces(w, L.ceilingHeight, true),
    leaves: doorLeaves(w),
  })),
  shafts: L.furniture.filter((f) => f.kind === 'shaft'),
  baseboards: baseboards(),
  tileRects: tileRectsPx.map(([x0, y0, x1, y1]) => [...P([x0, y0]), ...P([x1, y1])]),
  zoneItems,
  m: m(1),
};

mkdirSync('.cache/build', { recursive: true });
writeFileSync('.cache/build/layout.json', JSON.stringify(out, null, 1));
console.log(`layout.json: ${out.walls.length} paredes, ${out.baseboards.length} rodapés, ${zoneItems.length} itens`);
