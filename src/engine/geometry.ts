import type { ApartmentLayout, Furniture, Opening, Vec2, Wall } from '../layout/types';

/** Trecho sólido de parede, pronto para virar uma malha (box) 3D. */
export interface WallPiece {
  key: string;
  /** Centro na planta (m). */
  center: Vec2;
  /** Comprimento ao longo do eixo da parede (m). */
  length: number;
  thickness: number;
  /** Cota inferior e superior (m). */
  bottom: number;
  top: number;
  /** Ângulo do eixo da parede (rad), medido no plano XZ. */
  angle: number;
  material: string;
}

export interface SegmentCollider {
  type: 'segment';
  a: Vec2;
  b: Vec2;
  /** Meia-espessura (m). */
  radius: number;
}

export interface BoxCollider {
  type: 'box';
  center: Vec2;
  halfSize: Vec2;
  /** Rotação (rad). */
  angle: number;
}

export type Collider = SegmentCollider | BoxCollider;

const EPS = 1e-6;

export function wallLength(w: Wall): number {
  return Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
}

/** Vãos ordenados e recortados ao comprimento da parede. */
function sortedOpenings(w: Wall): Opening[] {
  const len = wallLength(w);
  return [...(w.openings ?? [])]
    .map((o) => {
      const start = Math.max(0, o.offset);
      const end = Math.min(len, o.offset + o.width);
      return { ...o, offset: start, width: Math.max(0, end - start) };
    })
    .filter((o) => o.width > EPS)
    .sort((a, b) => a.offset - b.offset);
}

function pointAlong(w: Wall, t: number): Vec2 {
  const len = wallLength(w) || 1;
  const k = t / len;
  return [w.from[0] + (w.to[0] - w.from[0]) * k, w.from[1] + (w.to[1] - w.from[1]) * k];
}

/**
 * Decompõe uma parede em trechos sólidos: panos cheios entre vãos, e
 * peitoris/vergas acima e abaixo de cada vão.
 *
 * Com `extendEnds`, os panos das extremidades avançam meia espessura para
 * fechar os cantos onde duas paredes se encontram (apenas visual).
 */
export function wallPieces(w: Wall, defaultHeight: number, extendEnds = false): WallPiece[] {
  const height = w.height ?? defaultHeight;
  const len = wallLength(w);
  const angle = Math.atan2(w.to[1] - w.from[1], w.to[0] - w.from[0]);
  const material = w.material ?? 'wall';
  const pieces: WallPiece[] = [];

  const ext = extendEnds ? w.thickness / 2 : 0;
  const push = (key: string, s: number, e: number, bottom: number, top: number) => {
    if (e - s <= EPS || top - bottom <= EPS) return;
    if (s <= EPS) s -= ext;
    if (e >= len - EPS) e += ext;
    pieces.push({
      key: `${w.id}:${key}`,
      center: pointAlong(w, (s + e) / 2),
      length: e - s,
      thickness: w.thickness,
      bottom,
      top,
      angle,
      material,
    });
  };

  let cursor = 0;
  for (const o of sortedOpenings(w)) {
    const s = Math.max(cursor, o.offset);
    const e = o.offset + o.width;
    push(`solid-${cursor.toFixed(3)}`, cursor, s, 0, height);
    if (e > s) {
      push(`${o.id}-sill`, s, e, 0, Math.min(o.sill, height));
      push(`${o.id}-head`, s, e, Math.max(o.head, 0), height);
    }
    cursor = Math.max(cursor, e);
  }
  push(`solid-${cursor.toFixed(3)}`, cursor, len, 0, height);
  return pieces;
}

/** Um vão é atravessável se for porta/passagem com peitoril baixo. */
export function isWalkable(o: Opening): boolean {
  return o.kind !== 'window' && o.sill < 0.25 && o.head > 1.9;
}

/** Segmentos 2D de colisão de uma parede (excluindo vãos atravessáveis). */
export function wallColliders(w: Wall): SegmentCollider[] {
  const len = wallLength(w);
  const radius = w.thickness / 2;
  const out: SegmentCollider[] = [];
  let cursor = 0;
  for (const o of sortedOpenings(w)) {
    if (!isWalkable(o)) continue;
    if (o.offset - cursor > EPS) {
      out.push({ type: 'segment', a: pointAlong(w, cursor), b: pointAlong(w, o.offset), radius });
    }
    cursor = Math.max(cursor, o.offset + o.width);
  }
  if (len - cursor > EPS) {
    out.push({ type: 'segment', a: pointAlong(w, cursor), b: pointAlong(w, len), radius });
  }
  return out;
}

export function furnitureCollider(f: Furniture): BoxCollider | null {
  if (f.solid === false || f.kind === 'rug') return null;
  return {
    type: 'box',
    center: f.position,
    halfSize: [f.size[0] / 2, f.size[2] / 2],
    angle: ((f.rotation ?? 0) * Math.PI) / 180,
  };
}

export function buildColliders(layout: ApartmentLayout): Collider[] {
  const list: Collider[] = layout.walls.flatMap(wallColliders);
  for (const f of layout.furniture) {
    const c = furnitureCollider(f);
    if (c) list.push(c);
  }
  return list;
}

/** Área de um polígono (fórmula do laço). */
export function polygonArea(poly: readonly Vec2[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(sum) / 2;
}

export function polygonCentroid(poly: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p[0];
    y += p[1];
  }
  return [x / poly.length, y / poly.length];
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function layoutBounds(layout: ApartmentLayout): Bounds {
  const b: Bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const add = (p: Vec2) => {
    b.minX = Math.min(b.minX, p[0]);
    b.minY = Math.min(b.minY, p[1]);
    b.maxX = Math.max(b.maxX, p[0]);
    b.maxY = Math.max(b.maxY, p[1]);
  };
  layout.walls.forEach((w) => {
    add(w.from);
    add(w.to);
  });
  layout.rooms.forEach((r) => r.polygon.forEach(add));
  return b;
}

/** Ponto dentro de polígono (ray casting). */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
