import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { polygonArea } from '../../engine/geometry';
import { planEvidence, type PixelReader } from '../../engine/planEvidence';
import { validateLayout } from '../validate';
import { DECLARED_PRIVATE_AREA, orla45m2, PX_PER_M } from './apto-45m2';

const png = PNG.sync.read(readFileSync(resolve(__dirname, '../../../public/referencias/orla-45m2-planta-p17.png')));
const read: PixelReader = (x, y) => {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return null;
  const i = (y * png.width + x) * 4;
  return [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!];
};

describe('Orla Guanabara 45,66 m² — geometria da etapa 1', () => {
  it('layout é consistente (validador)', () => {
    expect(validateLayout(orla45m2).filter((i) => i.level === 'error')).toEqual([]);
  });

  it('está marcado como rascunho com medidas estimadas', () => {
    expect(orla45m2.status).toBe('draft');
    expect(orla45m2.ceilingHeightProvenance).toBe('assumed');
    for (const w of orla45m2.walls) expect(w.provenance).not.toBe('confirmed');
  });

  it('contorno externo reproduz a área privativa declarada', () => {
    expect(polygonArea(orla45m2.envelope!)).toBeCloseTo(DECLARED_PRIVATE_AREA, 2);
  });

  it('escala calibrada é coerente com objetos padrão (cama de solteiro ≈ 0,88 m)', () => {
    expect(70 / PX_PER_M).toBeGreaterThan(0.84);
    expect(70 / PX_PER_M).toBeLessThan(0.92);
  });

  it('a imagem de referência tem o tamanho registrado na calibração', () => {
    expect([png.width, png.height]).toEqual([...orla45m2.reference!.sizePx]);
  });

  const evidence = planEvidence(orla45m2, read);

  it('cada trecho de parede modelado coincide com traço de parede na planta', () => {
    const weak = evidence.filter((e) => e.kind === 'solid' && e.length >= 0.2 && e.score < 0.85);
    expect(weak.map((e) => `${e.label}: ${(e.score * 100).toFixed(0)}%`)).toEqual([]);
  });

  it('os vãos de porta modelados correspondem a vãos livres na planta', () => {
    const blocked = evidence.filter((e) => e.kind === 'opening' && e.score > 0.2);
    expect(blocked.map((e) => `${e.label}: ${(e.score * 100).toFixed(0)}%`)).toEqual([]);
  });
});
