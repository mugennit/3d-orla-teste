import { describe, expect, it } from 'vitest';
import { activeLayout } from './index';
import { provisionalTestScene } from './provisional/testScene';
import { validateLayout } from './validate';

describe('validateLayout', () => {
  it('layout ativo não tem erros', () => {
    const errors = validateLayout(activeLayout).filter((i) => i.level === 'error');
    expect(errors).toEqual([]);
  });

  it('a cena de teste está marcada como provisória', () => {
    expect(provisionalTestScene.status).toBe('provisional');
  });

  it('detecta vão que ultrapassa a parede', () => {
    const bad = {
      ...provisionalTestScene,
      walls: [
        {
          id: 'w', from: [0, 0] as const, to: [1, 0] as const, thickness: 0.1,
          openings: [{ id: 'o', kind: 'door' as const, offset: 0.5, width: 1, sill: 0, head: 2.1 }],
        },
      ],
    };
    expect(validateLayout(bad).some((i) => i.message.includes('ultrapassa'))).toBe(true);
  });
});
