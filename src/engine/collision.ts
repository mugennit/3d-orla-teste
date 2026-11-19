import type { Vec2 } from '../layout/types';
import type { Bounds, BoxCollider, Collider, SegmentCollider } from './geometry';

/**
 * Colisão 2D do visitante (círculo de raio `r`) contra paredes (segmentos
 * espessos) e móveis (retângulos orientados). O movimento é subdividido para
 * evitar "atravessar" paredes finas em quadros lentos, e o empurrão é feito
 * pela normal de contato — o que produz o deslizamento natural ao longo das
 * paredes, como em jogos de primeira pessoa.
 */

type Mut2 = [number, number];

function pushFromSegment(p: Mut2, c: SegmentCollider, r: number): boolean {
  const [ax, ay] = c.a;
  const [bx, by] = c.b;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t;
  const qy = ay + dy * t;
  let nx = p[0] - qx;
  let ny = p[1] - qy;
  const minDist = r + c.radius;
  const d2 = nx * nx + ny * ny;
  if (d2 >= minDist * minDist) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-9) {
    // Centro exatamente sobre o eixo: empurra pela perpendicular.
    const l = Math.sqrt(len2) || 1;
    nx = -dy / l;
    ny = dx / l;
    d = 0;
  } else {
    nx /= d;
    ny /= d;
  }
  const push = minDist - d;
  p[0] += nx * push;
  p[1] += ny * push;
  return true;
}

function pushFromBox(p: Mut2, c: BoxCollider, r: number): boolean {
  const cos = Math.cos(c.angle);
  const sin = Math.sin(c.angle);
  // Para o espaço local do retângulo.
  const rx = p[0] - c.center[0];
  const ry = p[1] - c.center[1];
  const lx = rx * cos + ry * sin;
  const ly = -rx * sin + ry * cos;
  const [hx, hy] = c.halfSize;
  const cx = Math.max(-hx, Math.min(hx, lx));
  const cy = Math.max(-hy, Math.min(hy, ly));
  let nx = lx - cx;
  let ny = ly - cy;
  const d2 = nx * nx + ny * ny;
  let outX: number;
  let outY: number;
  if (d2 > 1e-12) {
    if (d2 >= r * r) return false;
    const d = Math.sqrt(d2);
    nx /= d;
    ny /= d;
    outX = cx + nx * r;
    outY = cy + ny * r;
  } else {
    // Centro dentro do retângulo: sai pelo lado mais próximo.
    const px = hx - Math.abs(lx);
    const py = hy - Math.abs(ly);
    if (px < py) {
      outX = Math.sign(lx || 1) * (hx + r);
      outY = ly;
    } else {
      outX = lx;
      outY = Math.sign(ly || 1) * (hy + r);
    }
  }
  p[0] = c.center[0] + outX * cos - outY * sin;
  p[1] = c.center[1] + outX * sin + outY * cos;
  return true;
}

export function resolvePosition(pos: Vec2, colliders: readonly Collider[], radius: number, iterations = 4): Vec2 {
  const p: Mut2 = [pos[0], pos[1]];
  for (let i = 0; i < iterations; i++) {
    let hit = false;
    for (const c of colliders) {
      hit = (c.type === 'segment' ? pushFromSegment(p, c, radius) : pushFromBox(p, c, radius)) || hit;
    }
    if (!hit) break;
  }
  return p;
}

export function clampToBounds(pos: Vec2, b: Bounds, radius: number): Vec2 {
  return [
    Math.max(b.minX + radius, Math.min(b.maxX - radius, pos[0])),
    Math.max(b.minY + radius, Math.min(b.maxY - radius, pos[1])),
  ];
}

/**
 * Move o visitante de `from` por `delta`, respeitando colisões e limites.
 * O deslocamento é dividido em passos de no máximo `radius / 2`.
 */
export function moveWithCollisions(
  from: Vec2,
  delta: Vec2,
  colliders: readonly Collider[],
  radius: number,
  bounds?: Bounds,
): Vec2 {
  const dist = Math.hypot(delta[0], delta[1]);
  const steps = Math.max(1, Math.ceil(dist / (radius / 2)));
  let p: Vec2 = from;
  for (let i = 0; i < steps; i++) {
    p = [p[0] + delta[0] / steps, p[1] + delta[1] / steps];
    p = resolvePosition(p, colliders, radius);
    if (bounds) p = clampToBounds(p, bounds, radius);
  }
  return p;
}
