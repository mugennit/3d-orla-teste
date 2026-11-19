import { buildColliders, polygonArea, wallLength } from '../engine/geometry';
import { resolvePosition } from '../engine/collision';
import type { ApartmentLayout } from './types';

export interface LayoutIssue {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Verificações de consistência do layout. Rodam nos testes automatizados e
 * ajudam a conferir a digitalização da planta oficial.
 */
export function validateLayout(layout: ApartmentLayout, playerRadius = 0.25): LayoutIssue[] {
  const issues: LayoutIssue[] = [];
  const ids = new Set<string>();
  const checkId = (id: string, what: string) => {
    if (ids.has(id)) issues.push({ level: 'error', message: `ID duplicado (${what}): ${id}` });
    ids.add(id);
  };

  for (const w of layout.walls) {
    checkId(w.id, 'parede');
    const len = wallLength(w);
    if (len <= 0) issues.push({ level: 'error', message: `Parede ${w.id} com comprimento zero` });
    if (w.thickness <= 0) issues.push({ level: 'error', message: `Parede ${w.id} com espessura inválida` });
    const height = w.height ?? layout.ceilingHeight;
    const ops = [...(w.openings ?? [])].sort((a, b) => a.offset - b.offset);
    ops.forEach((o, i) => {
      checkId(o.id, 'vão');
      if (o.offset < 0 || o.offset + o.width > len + 1e-6) {
        issues.push({ level: 'error', message: `Vão ${o.id} ultrapassa a parede ${w.id}` });
      }
      if (o.head > height + 1e-6 || o.sill < 0 || o.sill >= o.head) {
        issues.push({ level: 'error', message: `Vão ${o.id} com peitoril/verga inválidos` });
      }
      const next = ops[i + 1];
      if (next && next.offset < o.offset + o.width - 1e-6) {
        issues.push({ level: 'error', message: `Vãos ${o.id} e ${next.id} se sobrepõem` });
      }
    });
  }

  for (const r of layout.rooms) {
    checkId(r.id, 'ambiente');
    if (r.polygon.length < 3) issues.push({ level: 'error', message: `Ambiente ${r.id} com polígono inválido` });
    if (r.declaredArea) {
      const area = polygonArea(r.polygon);
      const diff = Math.abs(area - r.declaredArea) / r.declaredArea;
      if (diff > 0.05) {
        issues.push({
          level: 'warning',
          message: `Ambiente ${r.name}: área modelada ${area.toFixed(2)} m² difere da declarada ${r.declaredArea.toFixed(2)} m²`,
        });
      }
    }
  }

  layout.furniture.forEach((f) => checkId(f.id, 'móvel'));

  const colliders = buildColliders(layout);
  const p = layout.spawn.position;
  const resolved = resolvePosition(p, colliders, playerRadius);
  if (Math.hypot(resolved[0] - p[0], resolved[1] - p[1]) > 1e-6) {
    issues.push({ level: 'error', message: 'Ponto inicial do visitante está dentro de um obstáculo' });
  }

  if (layout.status !== 'provisional' && !layout.source.trim()) {
    issues.push({ level: 'error', message: 'Layout não provisório sem fonte das medidas' });
  }

  return issues;
}
