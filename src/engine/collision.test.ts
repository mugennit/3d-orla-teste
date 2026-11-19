import { describe, expect, it } from 'vitest';
import { moveWithCollisions, resolvePosition } from './collision';
import { buildColliders, wallColliders, wallPieces } from './geometry';
import type { Collider } from './geometry';
import type { ApartmentLayout, Wall } from '../layout/types';

const R = 0.25;

const wall: Wall = {
  id: 'w',
  from: [0, 0],
  to: [4, 0],
  thickness: 0.2,
  openings: [
    { id: 'door', kind: 'door', offset: 1, width: 1, sill: 0, head: 2.1 },
    { id: 'win', kind: 'window', offset: 2.5, width: 1, sill: 1, head: 2.2 },
  ],
};

describe('wallPieces', () => {
  it('divide a parede em panos, verga e peitoril', () => {
    const pieces = wallPieces(wall, 2.6);
    const keys = pieces.map((p) => p.key.split(':')[1]);
    expect(keys).toContain('door-head');
    expect(keys).toContain('win-sill');
    expect(keys).toContain('win-head');
    expect(keys).not.toContain('door-sill'); // porta não tem peitoril
    const total = pieces.filter((p) => p.bottom === 0 && p.top === 2.6).reduce((s, p) => s + p.length, 0);
    expect(total).toBeCloseTo(4 - 1 - 1);
  });
});

describe('wallColliders', () => {
  it('deixa a porta livre mas bloqueia a janela', () => {
    const cs = wallColliders(wall);
    expect(cs).toHaveLength(2);
    expect(cs[0]!.b[0]).toBeCloseTo(1);
    expect(cs[1]!.a[0]).toBeCloseTo(2);
    expect(cs[1]!.b[0]).toBeCloseTo(4);
  });
});

describe('colisão', () => {
  const colliders: Collider[] = wallColliders(wall);

  it('não atravessa parede sólida', () => {
    const end = moveWithCollisions([0.5, 1], [0, -3], colliders, R);
    expect(end[1]).toBeGreaterThanOrEqual(0.1 + R - 1e-6);
  });

  it('não atravessa mesmo com deslocamento grande em um quadro', () => {
    const end = moveWithCollisions([3, 1], [0, -10], colliders, R);
    expect(end[1]).toBeGreaterThan(0);
  });

  it('passa pela porta', () => {
    const end = moveWithCollisions([1.5, 1], [0, -2], colliders, R);
    expect(end[1]).toBeCloseTo(-1);
  });

  it('desliza ao longo da parede em movimento diagonal', () => {
    const end = moveWithCollisions([3, 0.5], [0.5, -1], colliders, R);
    expect(end[0]).toBeCloseTo(3.5, 1);
    expect(end[1]).toBeCloseTo(0.1 + R, 3);
  });

  it('é empurrado para fora de um móvel', () => {
    const box: Collider = { type: 'box', center: [0, 0], halfSize: [1, 0.5], angle: 0 };
    const p = resolvePosition([0.2, 0.1], [box], R);
    expect(p[1]).toBeCloseTo(0.5 + R);
    const q = resolvePosition([1.1, 0], [box], R);
    expect(q[0]).toBeCloseTo(1 + R);
  });

  it('respeita móveis rotacionados', () => {
    const box: Collider = { type: 'box', center: [0, 0], halfSize: [1, 0.2], angle: Math.PI / 2 };
    // Caixa girada 90°: o lado comprido fica ao longo do eixo Y.
    const p = resolvePosition([0, 0.9], [box], R); // perto da ponta → sai pela ponta
    expect(p[1]).toBeCloseTo(1 + R);
    const q = resolvePosition([0.1, 0], [box], R); // no meio → sai pela lateral
    expect(q[0]).toBeCloseTo(0.2 + R);
  });
});

describe('buildColliders', () => {
  it('ignora tapetes e móveis não sólidos', () => {
    const layout: ApartmentLayout = {
      id: 'x', name: 'x', development: 'x', location: 'x', status: 'provisional', source: '',
      ceilingHeight: 2.6, walls: [], rooms: [], spawn: { position: [0, 0], heading: 0 },
      furniture: [
        { id: 'r', kind: 'rug', position: [0, 0], size: [1, 0.01, 1] },
        { id: 'p', kind: 'plant', position: [0, 0], size: [1, 1, 1], solid: false },
        { id: 's', kind: 'sofa', position: [0, 0], size: [1, 1, 1] },
      ],
    };
    expect(buildColliders(layout)).toHaveLength(1);
  });
});
