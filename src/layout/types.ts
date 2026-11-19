/**
 * Modelo de dados de uma unidade (apartamento).
 *
 * Toda a geometria da cena 3D é gerada a partir destes dados — nada é
 * modelado "à mão" nos componentes. Para construir o apartamento real basta
 * criar um novo arquivo de layout com as medidas extraídas da planta oficial.
 *
 * Sistema de coordenadas da PLANTA (2D, em metros):
 *   - origem no canto superior esquerdo da planta;
 *   - eixo X cresce para a direita;
 *   - eixo Y cresce para BAIXO (como na imagem da planta).
 *
 * Mapeamento para o mundo 3D (Three.js):
 *   planta (x, y)  →  mundo (x, altura, z = y)
 * Assim, coordenadas medidas diretamente sobre a imagem da planta podem ser
 * usadas sem conversão.
 */

export type Vec2 = readonly [x: number, y: number];

/** Status de fidelidade do layout em relação ao book oficial. */
export type LayoutStatus =
  /** Cena técnica de teste — NÃO representa o imóvel. */
  | 'provisional'
  /** Geometria extraída da planta oficial, aguardando conferência. */
  | 'draft'
  /** Geometria conferida e aprovada. */
  | 'approved';

export type OpeningKind = 'door' | 'window' | 'passage' | 'sliding-door';

/**
 * Origem de uma medida.
 *  - `confirmed`: lida diretamente de documento oficial (cota, quadro de áreas).
 *  - `measured`: medida sobre a imagem da planta com escala calibrada
 *    (incerteza típica de ±5–10 cm) — NÃO é informação oficial.
 *  - `assumed`: valor técnico típico adotado por falta de informação
 *    (ex.: pé-direito, peitoris) — NÃO é informação oficial.
 */
export type Provenance = 'confirmed' | 'measured' | 'assumed';

/** Rastreabilidade: de onde veio a medida e o que falta conferir. */
export interface Traceable {
  provenance?: Provenance;
  /** Observação de conferência (dúvida, interpretação, pendência). */
  note?: string;
}

export type WallStructure = 'concrete' | 'drywall' | 'parapet' | 'railing';

/** Vão (porta, janela, passagem) inserido ao longo de uma parede. */
export interface Opening extends Traceable {
  id: string;
  kind: OpeningKind;
  /** Distância (m) do ponto inicial da parede (`from`) até o início do vão. */
  offset: number;
  /** Largura do vão (m). */
  width: number;
  /** Altura do peitoril (m). 0 para portas e passagens. */
  sill: number;
  /** Altura da verga — topo do vão (m). */
  head: number;
  /** Portas de giro: lado da dobradiça ao longo da parede. */
  hinge?: 'start' | 'end';
  /**
   * Portas de giro: lado para o qual a folha abre, como sinal da normal
   * n = (−dy, dx) da parede (d = to − from, coordenadas da planta).
   */
  swing?: 1 | -1;
}

/** Parede reta definida pelo seu eixo central. */
export interface Wall extends Traceable {
  id: string;
  from: Vec2;
  to: Vec2;
  /** Espessura (m). */
  thickness: number;
  /** Altura (m). Se omitida, usa `ceilingHeight` do layout. */
  height?: number;
  openings?: Opening[];
  /** Chave do material (ver `materials.ts`). */
  material?: string;
  /** Sistema construtivo indicado na planta. */
  structure?: WallStructure;
}

/** Ambiente (cômodo) — define piso, teto e rótulo na planta 3D. */
export interface Room extends Traceable {
  id: string;
  name: string;
  /** Polígono do piso (sentido indiferente). */
  polygon: Vec2[];
  floorMaterial: string;
  /** Área declarada no book (m²), para conferência. */
  declaredArea?: number;
  /** Ambiente externo (varanda). */
  outdoor?: boolean;
  /** Possui laje/forro acima. Padrão: true. */
  ceiling?: boolean;
}

export type FurnitureKind =
  | 'placeholder-box'
  | 'sofa'
  | 'bed'
  | 'table'
  | 'chair'
  | 'cabinet'
  | 'counter'
  | 'plant'
  | 'rug'
  | 'shaft';

/** Peça de mobiliário. */
export interface Furniture extends Traceable {
  id: string;
  kind: FurnitureKind;
  /** Centro da peça na planta (m). */
  position: Vec2;
  /** Dimensões [largura (x), altura, profundidade (z)] em metros. */
  size: readonly [number, number, number];
  /** Rotação em torno do eixo vertical, em graus. */
  rotation?: number;
  material?: string;
  /** Se verdadeiro, bloqueia a passagem do visitante. Padrão: true. */
  solid?: boolean;
}

export interface SpawnPoint {
  position: Vec2;
  /** Direção inicial do olhar, em graus (0 = olhando para -Y da planta). */
  heading: number;
}

export interface ApartmentLayout {
  id: string;
  name: string;
  development: string;
  location: string;
  status: LayoutStatus;
  /** Referência da fonte das medidas (ex.: "Book oficial, pág. 12"). */
  source: string;
  /** Área privativa declarada (m²). */
  privateArea?: number;
  ceilingHeight: number;
  walls: Wall[];
  rooms: Room[];
  furniture: Furniture[];
  spawn: SpawnPoint;
  /** Direção do norte na planta (graus) — usada para posicionar o sol. */
  northAngle?: number;
  /** Proveniência do pé-direito. */
  ceilingHeightProvenance?: Provenance;
  /** Contorno externo da unidade (para conferência da área privativa). */
  envelope?: Vec2[];
  /** Calibração da imagem de referência (para sobrepor a planta original). */
  reference?: PlanReference;
}

/**
 * Imagem da planta usada como referência. Coordenadas da planta (m) e pixels
 * se relacionam por: x_m = (x_px - originPx[0]) / pxPerMeter (idem para y).
 */
export interface PlanReference {
  /** Caminho público da imagem (servida a partir de /public). */
  url: string;
  /** Tamanho da imagem em pixels. */
  sizePx: Vec2;
  /** Pixel (na imagem) correspondente à origem (0, 0) da planta. */
  originPx: Vec2;
  pxPerMeter: number;
  /** Como a escala foi obtida. */
  calibration: string;
}
