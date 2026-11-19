import type { Furniture, Vec2 } from '../types';
import { pagePxToPlan, PX_PER_M } from './apto-45m2';

/**
 * ETAPA 2 — Sala integrada à cozinha: mobiliário e marcenaria.
 *
 * Posições tiradas do layout sugerido na planta humanizada do book (p. 17) e
 * da perspectiva oficial da cozinha (mesma página). Coordenadas em px da
 * página do book, como no layout da geometria. Esta é a FONTE ÚNICA usada:
 *  - pelas colisões do tour (este arquivo → `furnitureColliders`);
 *  - pela modelagem/iluminação no Blender (exportado por `pipeline/export_layout.ts`).
 *
 * Itens de decoração seguem o layout do book quando ele mostra o item
 * (sofá, tapete redondo, painel/rack, mesa com 4 cadeiras, vaso de planta,
 * bancada com pia/cooktop, geladeira) e, quando não mostra, são sugestões de
 * decoração coerentes com as perspectivas (identificadas como `decor`).
 */

export type ZoneItemKind =
  | 'sofa'
  | 'rug-round'
  | 'tv-rack'
  | 'tv'
  | 'dining-table'
  | 'kitchen-base'
  | 'kitchen-upper'
  | 'kitchen-shelf'
  | 'backsplash'
  | 'fridge'
  | 'wall-art'
  | 'washer'
  | 'laundry-sink'
  | 'asset';

export interface ZoneItem {
  id: string;
  kind: ZoneItemKind;
  /** Retângulo ocupado em planta, px da página: [x0, y0, x1, y1]. */
  rectPx?: [number, number, number, number];
  /** Ponto (px) para itens posicionados por centro. */
  atPx?: Vec2;
  /** Cotas verticais (m): base e topo. */
  z?: [number, number];
  /** Para onde a frente do item está voltada, nos eixos da planta (y para baixo). */
  facing?: '+x' | '-x' | '+y' | '-y';
  /** Rotação adicional em graus em torno do eixo vertical (objetos soltos). */
  rotation?: number;
  /** Asset CC0 (Poly Haven) e escala. */
  asset?: string;
  scale?: number;
  /** Bloqueia o visitante. */
  solid?: boolean;
  /** `book`: aparece no layout/perspectiva oficial; `decor`: sugestão coerente. */
  origin: 'book' | 'decor';
  note?: string;
}

export const ZONE_ROOMS = ['estar', 'cozinha', 'circulacao'];

export const salaCozinha: ZoneItem[] = [
  // ---------------- Estar ----------------
  { id: 'sofa', kind: 'sofa', rectPx: [169, 405, 225, 520], facing: '+x', solid: true, origin: 'book', note: 'Sofá 2 lugares com rolos nas laterais, encostado no drywall.' },
  { id: 'tapete', kind: 'rug-round', atPx: [219, 462], scale: 1.48, origin: 'book', note: 'Tapete redondo Ø ≈ 1,48 m (medido).' },
  { id: 'rack', kind: 'tv-rack', rectPx: [281, 401, 316, 605], z: [0.22, 0.52], solid: true, origin: 'book', note: 'Painel/rack em madeira ao longo da parede.' },
  { id: 'tv', kind: 'tv', atPx: [316, 481], z: [0.82, 1.52], origin: 'book', note: 'TV 55" na parede (preta no layout).' },
  { id: 'arte-sofa', kind: 'wall-art', atPx: [169, 462], z: [1.2, 1.85], origin: 'decor', note: 'Quadro sobre o sofá.' },

  // ---------------- Jantar ----------------
  { id: 'mesa', kind: 'dining-table', rectPx: [188, 690, 253, 778], z: [0, 0.76], solid: true, origin: 'book' },
  { id: 'cadeira-1', kind: 'asset', asset: 'dining_chair_02', atPx: [169, 712], facing: '+x', solid: true, origin: 'book' },
  { id: 'cadeira-2', kind: 'asset', asset: 'dining_chair_02', atPx: [169, 757], facing: '+x', solid: true, origin: 'book' },
  { id: 'cadeira-3', kind: 'asset', asset: 'dining_chair_02', atPx: [272, 712], facing: '-x', solid: true, origin: 'book' },
  { id: 'cadeira-4', kind: 'asset', asset: 'dining_chair_02', atPx: [272, 757], facing: '-x', solid: true, origin: 'book' },
  { id: 'pendente', kind: 'asset', asset: 'modern_ceiling_lamp_01', atPx: [220.5, 734], z: [1.55, 2.5], origin: 'decor' },

  // ---------------- Cozinha (perspectiva oficial) ----------------
  { id: 'bancada', kind: 'kitchen-base', rectPx: [50, 451, 97, 606], z: [0, 0.9], solid: true, origin: 'book', note: 'Bancada com pia (y≈455–545 px) e cooktop 4 bocas (y≈552–603 px); forno embutido sob o cooktop.' },
  { id: 'geladeira', kind: 'fridge', rectPx: [50, 608, 103, 662], z: [0, 1.82], solid: true, origin: 'book' },
  { id: 'revestimento', kind: 'backsplash', rectPx: [50, 451, 50, 606], z: [0.9, 1.78], origin: 'book', note: 'Revestimento verde-azulado em peças verticais.' },
  { id: 'prateleira', kind: 'kitchen-shelf', rectPx: [50, 451, 75, 606], z: [1.4, 1.43], origin: 'book', note: 'Prateleira com fita de LED (perspectiva).' },
  { id: 'aereo', kind: 'kitchen-upper', rectPx: [50, 451, 78, 662], z: [1.78, 2.46], origin: 'book', note: 'Armário aéreo em madeira clara; módulo ripado na extremidade.' },

  // ---------------- Área de serviço (elementos desenhados na planta; interpretação da varanda provisória) ----------------
  { id: 'maquina', kind: 'washer', rectPx: [53, 332, 103, 380], z: [0, 0.95], solid: true, origin: 'book', note: 'Máquina de lavar de abertura superior (tambor visto de cima na planta).' },
  { id: 'tanque', kind: 'laundry-sink', rectPx: [73, 395, 107, 438], z: [0, 0.86], solid: true, origin: 'book', note: 'Tanque ao lado do shaft/aquecedor.' },
  { id: 'planta-varanda', kind: 'asset', asset: 'potted_plant_01', atPx: [276, 360], scale: 0.85, solid: false, origin: 'book', note: 'Vaso com planta no canto da varanda.' },

  // ---------------- Decoração ----------------
  { id: 'planta-rack', kind: 'asset', asset: 'potted_plant_02', atPx: [297, 586], z: [0.52, 0.52], scale: 0.62, origin: 'book' },
  { id: 'vaso-rack-1', kind: 'asset', asset: 'ceramic_vase_03', atPx: [296, 418], z: [0.52, 0.52], scale: 1, origin: 'decor' },
  { id: 'vaso-rack-2', kind: 'asset', asset: 'ceramic_vase_02', atPx: [298, 432], z: [0.52, 0.52], scale: 0.7, origin: 'decor' },
  { id: 'bowl-mesa', kind: 'asset', asset: 'wooden_bowl_01', atPx: [220, 728], z: [0.76, 0.76], scale: 1, origin: 'decor' },
  { id: 'tabua', kind: 'asset', asset: 'wooden_cutting_board', atPx: [70, 528], z: [0.9, 0.9], rotation: 90, origin: 'decor' },
  { id: 'colher', kind: 'asset', asset: 'wooden_spoon', atPx: [72, 520], z: [0.945, 0.945], rotation: 80, origin: 'decor' },
  { id: 'suculenta', kind: 'asset', asset: 'potted_plant_04', atPx: [61, 470], z: [1.43, 1.43], scale: 0.9, origin: 'decor' },
  { id: 'vaso-prateleira-1', kind: 'asset', asset: 'ceramic_vase_01', atPx: [61, 590], z: [1.43, 1.43], scale: 0.55, origin: 'decor' },
  { id: 'vaso-prateleira-2', kind: 'asset', asset: 'ceramic_vase_04', atPx: [61, 572], z: [1.43, 1.43], scale: 0.5, origin: 'decor' },
];

/** Colisores 2D do mobiliário sólido (convertidos para metros da planta). */
export function furnitureColliders(): Furniture[] {
  const out: Furniture[] = [];
  for (const it of salaCozinha) {
    if (!it.solid) continue;
    if (it.rectPx) {
      const [x0, y0, x1, y1] = it.rectPx;
      out.push({
        id: `col-${it.id}`,
        kind: 'cabinet',
        position: pagePxToPlan([(x0 + x1) / 2, (y0 + y1) / 2]),
        size: [(x1 - x0) / PX_PER_M, 1, (y1 - y0) / PX_PER_M],
        provenance: 'measured',
      });
    } else if (it.atPx && it.asset === 'dining_chair_02') {
      out.push({
        id: `col-${it.id}`,
        kind: 'chair',
        position: pagePxToPlan(it.atPx),
        size: [0.42, 1, 0.42],
        provenance: 'measured',
      });
    }
  }
  return out;
}
