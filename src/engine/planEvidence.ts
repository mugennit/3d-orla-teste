import type { ApartmentLayout, PlanReference, Vec2, Wall } from '../layout/types';
import { wallLength } from './geometry';

/**
 * Conferência objetiva do modelo contra a imagem da planta: amostra pixels
 * ao longo do eixo de cada trecho de parede e mede quanto deles coincide com
 * traço de parede na planta (preto/cinza escuro, amarelo do drywall ou faixa
 * cinza do guarda-corpo). Também verifica se os vãos de porta estão livres.
 */

export type RGB = readonly [number, number, number];
export type PixelReader = (x: number, y: number) => RGB | null;

/**
 * Traço de alvenaria/concreto (preto profundo) ou drywall (amarelo). Exclui
 * soleiras de pedra (cinza-esverdeado, ~55–100) e caixilhos.
 */
export function isMasonryPixel([r, g, b]: RGB): boolean {
  return Math.max(r, g, b) < 52 || (r > 190 && g > 180 && b < 110);
}

export function isWallPixel([r, g, b]: RGB): boolean {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < 85) return true; // concreto (preto / cinza escuro)
  if (r > 190 && g > 180 && b < 110) return true; // drywall (amarelo)
  if (max >= 85 && max < 150 && max - min < 28) return true; // faixa cinza (guarda-corpo, caixilhos)
  return false;
}

export interface SegmentEvidence {
  wallId: string;
  kind: 'solid' | 'opening';
  label: string;
  /** Comprimento do trecho (m). */
  length: number;
  /** Fração das amostras com traço de parede próximo ao eixo (0–1). */
  score: number;
  /** Extremidades na imagem de referência (px). */
  fromPx: Vec2;
  toPx: Vec2;
}

function toPx(ref: PlanReference, p: Vec2): Vec2 {
  return [p[0] * ref.pxPerMeter + ref.originPx[0], p[1] * ref.pxPerMeter + ref.originPx[1]];
}

function sample(
  ref: PlanReference,
  read: PixelReader,
  w: Wall,
  t0: number,
  t1: number,
  band: number,
  test: (p: RGB) => boolean = isWallPixel,
): { score: number; fromPx: Vec2; toPx: Vec2 } {
  const len = wallLength(w);
  const ux = (w.to[0] - w.from[0]) / len;
  const uy = (w.to[1] - w.from[1]) / len;
  const at = (t: number): Vec2 => toPx(ref, [w.from[0] + ux * t, w.from[1] + uy * t]);
  const a = at(t0);
  const b = at(t1);
  const lenPx = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const trim = Math.min(3, lenPx / 4);
  let hits = 0;
  let total = 0;
  for (let s = trim; s <= lenPx - trim; s += 1) {
    const k = s / lenPx;
    const cx = a[0] + (b[0] - a[0]) * k;
    const cy = a[1] + (b[1] - a[1]) * k;
    let found = false;
    for (let d = -band; d <= band && !found; d++) {
      const px = read(Math.round(cx - uy * d), Math.round(cy + ux * d));
      if (px && test(px)) found = true;
    }
    total++;
    if (found) hits++;
  }
  return { score: total ? hits / total : 0, fromPx: a, toPx: b };
}

export function planEvidence(layout: ApartmentLayout, read: PixelReader, band = 3): SegmentEvidence[] {
  const ref = layout.reference;
  if (!ref) return [];
  const out: SegmentEvidence[] = [];
  for (const w of layout.walls) {
    const len = wallLength(w);
    const ops = [...(w.openings ?? [])].sort((a, b) => a.offset - b.offset);
    let cursor = 0;
    const solid = (s: number, e: number) => {
      if (e - s < 0.08) return;
      const r = sample(ref, read, w, s, e, band);
      out.push({ wallId: w.id, kind: 'solid', label: `${w.id} [${s.toFixed(2)}–${e.toFixed(2)} m]`, length: e - s, ...r });
    };
    for (const o of ops) {
      solid(cursor, o.offset);
      if (o.kind === 'door') {
        // Centro do vão (60%) deve estar livre de alvenaria/drywall
        // (soleiras e batentes aparecem em cinza e são ignorados).
        const m = o.width * 0.2;
        const r = sample(ref, read, w, o.offset + m, o.offset + o.width - m, 0, isMasonryPixel);
        out.push({ wallId: w.id, kind: 'opening', label: o.id, length: o.width, ...r });
      }
      cursor = o.offset + o.width;
    }
    solid(cursor, len);
  }
  return out;
}
