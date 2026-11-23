import type { ApartmentLayout, Vec2 } from '../layout/types';
import { resolvePosition } from './collision';
import type { BoxCollider, Collider } from './geometry';
import { pointInPolygon } from './geometry';

/**
 * Validação do destino de teletransporte (clique na planta).
 *
 * Aceita só pontos dentro de um ambiente interno da geometria auditada, fora de paredes e móveis.
 * Um clique encostado numa parede ou móvel é ajustado pela colisão (empurrão curto), mas o destino
 * ajustado também precisa cair dentro de um ambiente. Clique fora do apartamento, sobre parede,
 * sobre móvel ou em área sem piso navegável é recusado (`ok: false`) e a câmera não se move.
 */
export type TeleportResult = { ok: true; position: Vec2; room: string } | { ok: false; reason: TeleportReason };
export type TeleportReason = 'fora-do-apartamento' | 'parede' | 'movel' | 'sem-espaco';

/** Distância máxima que a colisão pode deslocar o clique (m). Mais que isso = clique em obstáculo. */
const MAX_NUDGE = 0.3;

function roomAt(p: Vec2, layout: ApartmentLayout): string | null {
  for (const r of layout.rooms) if (pointInPolygon(p, r.polygon)) return r.id;
  return null;
}

function insideBox(p: Vec2, b: BoxCollider): boolean {
  const dx = p[0] - b.center[0];
  const dy = p[1] - b.center[1];
  const c = Math.cos(-b.angle);
  const s = Math.sin(-b.angle);
  const lx = dx * c - dy * s;
  const ly = dx * s + dy * c;
  return Math.abs(lx) <= b.halfSize[0] && Math.abs(ly) <= b.halfSize[1];
}

function insideWall(p: Vec2, colliders: readonly Collider[]): boolean {
  for (const c of colliders) {
    if (c.type !== 'segment') continue;
    const [ax, ay] = c.a;
    const dx = c.b[0] - ax;
    const dy = c.b[1] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
    if (Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t)) <= c.radius) return true;
  }
  return false;
}

/** Distância do ponto à superfície do obstáculo (negativa = dentro). */
function distanceTo(p: Vec2, c: Collider): number {
  if (c.type === 'segment') {
    const [ax, ay] = c.a;
    const dx = c.b[0] - ax;
    const dy = c.b[1] - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.max(0, Math.min(1, ((p[0] - ax) * dx + (p[1] - ay) * dy) / len2)) : 0;
    return Math.hypot(p[0] - (ax + dx * t), p[1] - (ay + dy * t)) - c.radius;
  }
  const rx = p[0] - c.center[0];
  const ry = p[1] - c.center[1];
  const cos = Math.cos(c.angle);
  const sin = Math.sin(c.angle);
  const qx = Math.abs(rx * cos + ry * sin) - c.halfSize[0];
  const qy = Math.abs(-rx * sin + ry * cos) - c.halfSize[1];
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0);
}

/** Livre para o visitante (círculo de raio `radius`): medida explícita contra cada obstáculo — o
 *  empurrão iterativo da colisão pode oscilar entre dois obstáculos num canto e parecer "livre". */
function isFree(p: Vec2, colliders: readonly Collider[], radius: number): boolean {
  return colliders.every((c) => distanceTo(p, c) >= radius - 2e-3);
}

export function validateTeleport(
  click: Vec2,
  layout: ApartmentLayout,
  colliders: readonly Collider[],
  radius: number,
): TeleportResult {
  if (!Number.isFinite(click[0]) || !Number.isFinite(click[1])) return { ok: false, reason: 'fora-do-apartamento' };
  if (insideWall(click, colliders)) return { ok: false, reason: 'parede' };
  if (!roomAt(click, layout)) return { ok: false, reason: 'fora-do-apartamento' };
  if (colliders.some((c) => c.type === 'box' && insideBox(click, c))) return { ok: false, reason: 'movel' };
  const p = resolvePosition(click, colliders, radius, 8);
  if (Math.hypot(p[0] - click[0], p[1] - click[1]) > MAX_NUDGE) return { ok: false, reason: 'sem-espaco' };
  const room = roomAt(p, layout);
  if (!room) return { ok: false, reason: 'fora-do-apartamento' };
  if (!isFree(p, colliders, radius)) return { ok: false, reason: 'sem-espaco' };
  return { ok: true, position: p, room };
}

export const TELEPORT_MESSAGES: Record<TeleportReason, string> = {
  'fora-do-apartamento': 'Fora do apartamento',
  parede: 'Sobre uma parede',
  movel: 'Sobre um móvel',
  'sem-espaco': 'Sem espaço para ficar em pé aqui',
};
