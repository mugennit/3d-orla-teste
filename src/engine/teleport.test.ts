import { describe, expect, it } from 'vitest';
import { orla45m2 } from '../layout/orla-guanabara/apto-45m2';
import { furnitureColliders } from '../layout/orla-guanabara/sala-cozinha';
import { buildColliders } from './geometry';
import { validateTeleport } from './teleport';

const R = 0.25;
const layout = { ...orla45m2, furniture: [...orla45m2.furniture, ...furnitureColliders()] };
const colliders = buildColliders(layout);
const tp = (x: number, y: number) => validateTeleport([x, y], layout, colliders, R);

describe('teletransporte pela planta — só destinos internos e caminháveis', () => {
  it('aceita o centro dos ambientes', () => {
    expect(tp(2.5, 3.6)).toMatchObject({ ok: true, room: 'estar' });
    expect(tp(4.6, 1.8)).toMatchObject({ ok: true, room: 'quarto2' });
    expect(tp(7.0, 3.0)).toMatchObject({ ok: true, room: 'suite' });
    expect(tp(4.0, 4.05)).toMatchObject({ ok: true, room: 'circulacao' });
    expect(tp(2.4, 0.5)).toMatchObject({ ok: true, room: 'varanda' });
  });

  it('recusa cliques fora do apartamento (todos os lados)', () => {
    for (const [x, y] of [[-0.8, 3], [9.2, 3], [4, -0.6], [4, 6.6], [7.5, 0.8], [-3, -3], [20, 20]] as const) {
      expect(tp(x, y), `(${x}, ${y})`).toEqual({ ok: false, reason: 'fora-do-apartamento' });
    }
  });

  it('recusa cliques sobre paredes', () => {
    // parede leste da sala (alvenaria, x = 3,48) e drywall entre sala e quarto 2 (x = 3,455)
    expect(tp(3.48, 1.0)).toMatchObject({ ok: false });
    expect(tp(3.455, 2.8)).toMatchObject({ ok: false, reason: 'parede' });
    // parede externa oeste
    expect(tp(0.05, 3.0)).toMatchObject({ ok: false, reason: 'parede' });
  });

  it('recusa cliques sobre móveis (sofá, mesa, bancada, geladeira)', () => {
    expect(tp(1.95, 1.8)).toEqual({ ok: false, reason: 'movel' }); // sofá
    expect(tp(2.23, 5.2)).toEqual({ ok: false, reason: 'movel' }); // mesa de jantar
    expect(tp(0.35, 2.6)).toEqual({ ok: false, reason: 'movel' }); // bancada da cozinha
  });

  it('clique encostado na parede é ajustado para dentro do ambiente e livre de colisão', () => {
    const r = tp(4.5, 3.65); // circulação, a 6 cm da face do drywall do quarto 2
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.position[1]).toBeGreaterThan(3.65);
      expect(Math.hypot(r.position[0] - 4.5, r.position[1] - 3.65)).toBeLessThanOrEqual(0.3);
    }
  });

  it('nenhum destino aceito numa varredura da planta cai fora de um ambiente ou dentro de obstáculo', () => {
    let accepted = 0;
    for (let x = -1; x <= 9.5; x += 0.1) {
      for (let y = -1; y <= 7; y += 0.1) {
        const r = tp(x, y);
        if (!r.ok) continue;
        accepted++;
        expect(validateTeleport(r.position, layout, colliders, R)).toMatchObject({ ok: true });
      }
    }
    expect(accepted).toBeGreaterThan(1000); // a área interna continua amplamente acessível
  });
});
