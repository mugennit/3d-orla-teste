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

/** Vão (porta, janela, passagem) inserido ao longo de uma parede. */
export interface Opening {
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
}

/** Parede reta definida pelo seu eixo central. */
export interface Wall {
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
}

/** Ambiente (cômodo) — define piso, teto e rótulo na planta 3D. */
export interface Room {
  id: string;
  name: string;
  /** Polígono do piso (sentido indiferente). */
  polygon: Vec2[];
  floorMaterial: string;
  /** Área declarada no book (m²), para conferência. */
  declaredArea?: number;
  /** Ambiente externo (varanda): sem teto interno. */
  outdoor?: boolean;
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
  | 'rug';

/** Peça de mobiliário. */
export interface Furniture {
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
}
