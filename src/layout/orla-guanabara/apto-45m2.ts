import { polygonArea } from '../../engine/geometry';
import type { ApartmentLayout, Furniture, Opening, Provenance, Room, Vec2, Wall, WallStructure } from '../types';

/**
 * ORLA GUANABARA — Apartamento 2 quartos com suíte e varanda — 45,66 m²
 * Fonte: Book oficial Emccamp, página 17 (planta humanizada, sem cotas).
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │ ETAPA 1 — GEOMETRIA EM CONFERÊNCIA (status: draft)                   │
 * │                                                                      │
 * │ A planta NÃO possui cotas. Todas as posições foram MEDIDAS sobre a   │
 * │ imagem (1500 × 1061 px) e convertidas por uma escala calibrada pela  │
 * │ área privativa declarada (45,66 m²). Incerteza típica: ±5–10 cm.     │
 * │ Alturas (pé-direito, peitoris, vergas) são valores TÉCNICOS ADOTADOS.│
 * │ Nenhuma dessas medidas é informação oficial.                         │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Coordenadas abaixo em PIXELS DA IMAGEM ORIGINAL da página do book, para
 * permitir reconferência direta. Cada valor pode ser corrigido aqui quando
 * houver planta cotada; o restante do sistema se ajusta automaticamente.
 */

// ---------------------------------------------------------------------------
// Calibração
// ---------------------------------------------------------------------------

/** Contorno externo da unidade (faces externas das paredes), em px. */
const ENVELOPE_PX: Vec2[] = [
  [42, 318],
  [506, 318],
  [506, 434],
  [713, 434],
  [713, 788],
  [42, 788],
];

/** Área privativa declarada no book (confirmada). */
export const DECLARED_PRIVATE_AREA = 45.66;

/**
 * Escala (px/m) tal que a área do contorno = 45,66 m². Conferida com
 * objetos de dimensão padronizada desenhados na planta:
 *   cama de solteiro ≈ 70 px → 0,88 m (padrão 0,88 m)
 *   cama queen (largura) ≈ 127 px → 1,59 m (padrão 1,58 m)
 *   folha da porta de entrada ≈ 67 px → 0,84 m (padrão 0,80 m + batente)
 */
export const PX_PER_M = Math.sqrt(polygonArea(ENVELOPE_PX) / DECLARED_PRIVATE_AREA);

const ORIGIN_PX: Vec2 = [42, 318];
/** Recorte salvo em public/referencias (canto superior esquerdo, px da página). */
const CROP_PX: Vec2 = [20, 280];

const m = (px: number) => px / PX_PER_M;
const P = ([x, y]: Vec2): Vec2 => [m(x - ORIGIN_PX[0]), m(y - ORIGIN_PX[1])];

// ---------------------------------------------------------------------------
// Alturas adotadas (não oficiais)
// ---------------------------------------------------------------------------
const CEILING = 2.5; // pé-direito típico do padrão construtivo — A CONFIRMAR
const DOOR_HEAD = 2.1;
const WINDOW_SILL = 1.0;
const WINDOW_HEAD = 2.1;
const GUARD_HEIGHT = 1.1; // NBR 14718 (mínimo para guarda-corpo)

// Espessuras medidas (px) — concreto ~8 px ≈ 0,10 m; drywall adotado 0,08 m.
const T_CONCRETE = m(8);
const T_DRYWALL = 0.08;

// ---------------------------------------------------------------------------
// Construtores com rastreabilidade
// ---------------------------------------------------------------------------

interface OpeningPx {
  id: string;
  kind: Opening['kind'];
  /** Início e fim do vão ao longo do eixo da parede, em px (coordenada x ou y). */
  span: [number, number];
  sill?: number;
  head?: number;
  hinge?: Opening['hinge'];
  swing?: Opening['swing'];
  provenance?: Provenance;
  note?: string;
}

function wall(
  id: string,
  fromPx: Vec2,
  toPx: Vec2,
  thickness: number,
  structure: WallStructure,
  opts: { openings?: OpeningPx[]; height?: number; material?: string; note?: string; provenance?: Provenance } = {},
): Wall {
  const from = P(fromPx);
  const to = P(toPx);
  const horizontal = Math.abs(toPx[1] - fromPx[1]) < Math.abs(toPx[0] - fromPx[0]);
  const axisStart = horizontal ? fromPx[0] : fromPx[1];
  const dir = Math.sign((horizontal ? toPx[0] : toPx[1]) - axisStart) || 1;
  const openings = (opts.openings ?? []).map<Opening>((o) => {
    const a = (o.span[0] - axisStart) * dir;
    const b = (o.span[1] - axisStart) * dir;
    const isDoor = o.kind !== 'window';
    return {
      id: o.id,
      kind: o.kind,
      offset: m(Math.min(a, b)),
      width: m(Math.abs(b - a)),
      sill: o.sill ?? (isDoor ? 0 : WINDOW_SILL),
      head: o.head ?? (isDoor ? DOOR_HEAD : WINDOW_HEAD),
      hinge: o.hinge,
      swing: o.swing,
      provenance: o.provenance ?? 'measured',
      note: o.note,
    };
  });
  return {
    id,
    from,
    to,
    thickness,
    structure,
    height: opts.height,
    material: opts.material,
    openings,
    provenance: opts.provenance ?? 'measured',
    note: opts.note,
  };
}

function room(id: string, name: string, polygonPx: Vec2[], floorMaterial: string, extra: Partial<Room> = {}): Room {
  return { id, name, polygon: polygonPx.map(P), floorMaterial, provenance: 'measured', ...extra };
}

function boxPx(
  id: string,
  kind: Furniture['kind'],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  height: number,
  note?: string,
): Furniture {
  const [cx, cy] = P([(x0 + x1) / 2, (y0 + y1) / 2]);
  return { id, kind, position: [cx, cy], size: [m(x1 - x0), height, m(y1 - y0)], provenance: 'measured', note };
}

// ---------------------------------------------------------------------------
// Paredes (eixo central, px)
// ---------------------------------------------------------------------------

const walls: Wall[] = [
  // --- Contorno ---
  wall('ext-oeste', [46, 318], [46, 786], T_CONCRETE, 'concrete', {
    note: 'Parede do lado da entrada (provável circulação do pavimento).',
    openings: [
      {
        id: 'porta-entrada',
        kind: 'door',
        span: [710, 778],
        hinge: 'end',
        swing: -1,
        note: 'Folha desenhada aberta junto à parede inferior; seta de acesso no book.',
      },
    ],
  }),
  wall('ext-sul', [42, 782.5], [713, 782.5], m(7), 'concrete'),
  wall('ext-leste', [708.5, 434], [708.5, 788], m(9), 'concrete'),
  wall('ext-norte-suite', [502, 438], [713, 438], T_CONCRETE, 'concrete', {
    openings: [{ id: 'janela-suite', kind: 'window', span: [548, 657], note: 'Largura medida; peitoril/altura adotados.' }],
  }),
  wall('ext-norte-q2', [304, 322], [506, 322], T_CONCRETE, 'concrete', {
    openings: [{ id: 'janela-q2', kind: 'window', span: [355, 467], note: 'Largura medida; peitoril/altura adotados.' }],
  }),

  // --- Varanda ---
  wall('varanda-guarda-corpo', [106, 319.5], [304, 319.5], 0.04, 'railing', {
    height: GUARD_HEIGHT,
    material: 'railing',
    note: 'Faixa cinza contínua na borda da varanda: interpretada como guarda-corpo de vidro. Tipo e altura A CONFIRMAR.',
  }),
  wall('varanda-parapeito', [42, 319.5], [106, 319.5], m(5), 'parapet', {
    height: GUARD_HEIGHT,
    note: 'Trecho escuro estreito atrás da máquina de lavar: interpretado como parapeito. Pode ser parede inteira — A CONFIRMAR.',
  }),
  wall('varanda-porta-vidro', [165, 397.5], [320, 397.5], m(7), 'concrete', {
    note: 'Esquadria de vidro entre sala e varanda. Divisão de folhas (montante em ~242 px) visível; folha móvel não identificável.',
    openings: [
      {
        id: 'porta-correr-varanda',
        kind: 'sliding-door',
        span: [170, 314],
        note: 'Tratada como totalmente atravessável até definição da folha móvel.',
      },
    ],
  }),

  // --- Quarto 2 ---
  wall('sala-q2', [320, 318], [320, 480], T_CONCRETE, 'concrete'),
  wall('sala-q2-drywall', [318, 480], [318, 604], T_DRYWALL, 'drywall'),
  wall('q2-suite', [502, 318], [502, 480], T_CONCRETE, 'concrete'),
  wall('q2-suite-drywall', [502.5, 480], [502.5, 604], T_DRYWALL, 'drywall'),
  wall('q2-sul-drywall', [315, 601.5], [506, 601.5], T_DRYWALL, 'drywall', {
    openings: [{ id: 'porta-q2', kind: 'door', span: [326, 390], hinge: 'start', swing: -1 }],
  }),

  // --- Suíte (porta a partir da circulação) ---
  wall('circulacao-suite', [412, 604], [412, 681.5], T_DRYWALL, 'drywall', {
    note: 'Vão quase todo ocupado pela porta da suíte; existência de trecho fixo A CONFIRMAR.',
    openings: [{ id: 'porta-suite', kind: 'door', span: [607, 677], hinge: 'end', swing: -1 }],
  }),

  // --- Banheiros ---
  wall('banhos-norte-drywall', [324, 681.5], [708.5, 681.5], T_DRYWALL, 'drywall', {
    openings: [
      { id: 'porta-banho-social', kind: 'door', span: [333, 393], hinge: 'start', swing: 1 },
      { id: 'porta-banho-suite', kind: 'door', span: [523, 583], hinge: 'start', swing: 1 },
    ],
  }),
  wall('banho-social-sala', [320, 681.5], [320, 782.5], T_CONCRETE, 'concrete'),
  wall('banhos-divisa-drywall', [515, 681.5], [515, 782.5], 0.1, 'drywall', {
    note: 'Linha amarela + contorno escuro (511–524 px): espessura adotada 0,10 m.',
  }),

  // --- Área de serviço / cozinha ---
  wall('servico-cozinha-drywall', [46, 448], [165, 448], T_DRYWALL, 'drywall'),
  wall('servico-sala-drywall', [165, 396], [165, 532], T_DRYWALL, 'drywall', {
    note: 'Drywall atrás do sofá; separa cozinha e área de serviço do estar.',
  }),
];

// ---------------------------------------------------------------------------
// Ambientes (faces internas aproximadas, px)
// ---------------------------------------------------------------------------

const rooms: Room[] = [
  room(
    'varanda',
    'Varanda / Serviço',
    [[50, 323.5], [316, 323.5], [316, 394], [167, 394], [167, 446], [50, 446]],
    'porcelain',
    { outdoor: true, note: 'Interpretação PROVISÓRIA: varanda com área de serviço integrada (máquina e tanque).' },
  ),
  room('cozinha', 'Cozinha', [[50, 451], [163, 451], [163, 663], [50, 663]], 'porcelain', {
    note: 'Limite inferior pela linha cinza fina da planta (não é parede).',
  }),
  room(
    'estar',
    'Estar / Jantar',
    [[167, 401], [316, 401], [316, 778], [50, 778], [50, 663], [167, 663]],
    'porcelain',
  ),
  room('circulacao', 'Circulação', [[322, 605], [409, 605], [409, 678], [322, 678]], 'porcelain'),
  room('quarto2', 'Quarto 2', [[324, 326], [498, 326], [498, 598], [322, 598]], 'wood'),
  room('suite', 'Suíte', [[506, 442], [704, 442], [704, 678], [415, 678], [415, 605], [506, 605]], 'wood'),
  room('banho-social', 'Banho social', [[324, 685], [511, 685], [511, 779], [324, 779]], 'porcelain'),
  room('banho-suite', 'Banho suíte', [[520, 685], [704, 685], [704, 779], [520, 779]], 'porcelain'),
];

// ---------------------------------------------------------------------------
// Elementos fixos identificados na planta (shafts com "X")
// ---------------------------------------------------------------------------

const fixed: Furniture[] = [
  boxPx('shaft-banho-social', 'shaft', 438, 766, 512, 782, CEILING, 'Retângulo com "X" sob o chuveiro: interpretado como shaft. A CONFIRMAR.'),
  boxPx('shaft-banho-suite', 'shaft', 630, 766, 704, 782, CEILING, 'Retângulo com "X" sob o chuveiro: interpretado como shaft. A CONFIRMAR.'),
  boxPx('shaft-servico', 'shaft', 52, 390, 72, 445, CEILING, 'Retângulo com "X" na área de serviço: shaft ou aquecedor a gás. A CONFIRMAR.'),
];

// ---------------------------------------------------------------------------

export const orla45m2: ApartmentLayout = {
  id: 'orla-guanabara-2q-suite-45m2',
  name: 'Apartamento 2 quartos com suíte e varanda',
  development: 'Orla Guanabara',
  location: 'Niterói/RJ',
  status: 'draft',
  source: 'Book oficial Emccamp, p. 17 — planta humanizada sem cotas (medidas estimadas)',
  privateArea: DECLARED_PRIVATE_AREA,
  ceilingHeight: CEILING,
  ceilingHeightProvenance: 'assumed',
  northAngle: 0, // orientação solar desconhecida — A CONFIRMAR
  envelope: ENVELOPE_PX.map(P),
  reference: {
    url: '/referencias/orla-45m2-planta-p17.png',
    sizePx: [720, 520],
    originPx: [ORIGIN_PX[0] - CROP_PX[0], ORIGIN_PX[1] - CROP_PX[1]],
    pxPerMeter: PX_PER_M,
    calibration: 'Área do contorno externo = 45,66 m² (área privativa do book); conferida com camas e portas padrão.',
  },
  walls,
  rooms,
  furniture: fixed,
  spawn: { position: P([90, 745]), heading: 70 },
};

/** Converte um ponto em px da página do book para metros da planta (uso em testes/ferramentas). */
export const pagePxToPlan = P;
