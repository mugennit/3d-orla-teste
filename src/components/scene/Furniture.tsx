import type { Furniture as FurnitureItem } from '../../layout/types';
import { getMaterial } from './materials';

/**
 * Mobiliário paramétrico simples (primitivas), dimensionado pelos dados.
 * Na fase de acabamento, cada tipo pode ser trocado por um modelo GLB
 * otimizado mantendo a mesma posição/tamanho/colisão.
 */
export function Furniture({ item }: { item: FurnitureItem }) {
  const [w, h, d] = item.size;
  const rot = ((item.rotation ?? 0) * Math.PI) / 180;
  return (
    <group position={[item.position[0], 0, item.position[1]]} rotation={[0, -rot, 0]}>
      <Shape kind={item.kind} w={w} h={h} d={d} material={item.material} />
    </group>
  );
}

interface ShapeProps {
  kind: FurnitureItem['kind'];
  w: number;
  h: number;
  d: number;
  material?: string;
}

function Box({
  pos,
  size,
  mat,
}: {
  pos: [number, number, number];
  size: [number, number, number];
  mat: string;
}) {
  return (
    <mesh position={pos} material={getMaterial(mat)} castShadow receiveShadow>
      <boxGeometry args={size} />
    </mesh>
  );
}

function Shape({ kind, w, h, d, material }: ShapeProps) {
  switch (kind) {
    case 'sofa': {
      const m = material ?? 'fabric';
      const seatH = h * 0.5;
      const arm = 0.18;
      return (
        <>
          <Box pos={[0, seatH / 2, 0.05]} size={[w, seatH, d - 0.1]} mat={m} />
          <Box pos={[0, h / 2, -d / 2 + 0.1]} size={[w, h, 0.2]} mat={m} />
          <Box pos={[-w / 2 + arm / 2, h * 0.35, 0]} size={[arm, h * 0.7, d]} mat={m} />
          <Box pos={[w / 2 - arm / 2, h * 0.35, 0]} size={[arm, h * 0.7, d]} mat={m} />
        </>
      );
    }
    case 'bed': {
      const m = material ?? 'linen';
      return (
        <>
          <Box pos={[0, 0.15, 0]} size={[w, 0.3, d]} mat="woodDark" />
          <Box pos={[0, 0.3 + (h - 0.3) / 2, 0.02]} size={[w - 0.04, h - 0.3, d - 0.06]} mat={m} />
          <Box pos={[0, 0.55, -d / 2 + 0.04]} size={[w + 0.06, 1.1, 0.08]} mat="woodDark" />
          <Box pos={[-w / 4, h + 0.06, -d / 2 + 0.3]} size={[w / 2 - 0.1, 0.12, 0.35]} mat="linen" />
          <Box pos={[w / 4, h + 0.06, -d / 2 + 0.3]} size={[w / 2 - 0.1, 0.12, 0.35]} mat="linen" />
        </>
      );
    }
    case 'table': {
      const m = material ?? 'woodDark';
      const top = 0.04;
      const leg = 0.05;
      return (
        <>
          <Box pos={[0, h - top / 2, 0]} size={[w, top, d]} mat={m} />
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <Box
                key={`${sx}${sz}`}
                pos={[sx * (w / 2 - leg), (h - top) / 2, sz * (d / 2 - leg)]}
                size={[leg, h - top, leg]}
                mat="metal"
              />
            )),
          )}
        </>
      );
    }
    case 'chair': {
      const m = material ?? 'woodDark';
      const seat = 0.45;
      return (
        <>
          <Box pos={[0, seat, 0]} size={[w, 0.05, d]} mat={m} />
          <Box pos={[0, (seat + h) / 2, -d / 2 + 0.03]} size={[w, h - seat, 0.05]} mat={m} />
          {[-1, 1].flatMap((sx) =>
            [-1, 1].map((sz) => (
              <Box key={`${sx}${sz}`} pos={[sx * (w / 2 - 0.03), seat / 2, sz * (d / 2 - 0.03)]} size={[0.04, seat, 0.04]} mat="metal" />
            )),
          )}
        </>
      );
    }
    case 'plant':
      return (
        <>
          <mesh position={[0, 0.2, 0]} material={getMaterial('pot')} castShadow receiveShadow>
            <cylinderGeometry args={[w * 0.35, w * 0.28, 0.4, 20]} />
          </mesh>
          <mesh position={[0, 0.4 + (h - 0.4) / 2, 0]} material={getMaterial('plant')} castShadow>
            <sphereGeometry args={[w / 2, 16, 12]} />
          </mesh>
        </>
      );
    case 'rug':
      return (
        <mesh position={[0, 0.006, 0]} material={getMaterial(material ?? 'rug')} receiveShadow>
          <boxGeometry args={[w, 0.012, d]} />
        </mesh>
      );
    case 'placeholder-box':
      return <Box pos={[0, h / 2, 0]} size={[w, h, d]} mat="test" />;
    case 'shaft':
      return <Box pos={[0, h / 2, 0]} size={[w, h, d]} mat="wall" />;
    case 'cabinet':
    case 'counter':
    default:
      return <Box pos={[0, h / 2, 0]} size={[w, h, d]} mat={material ?? 'woodLight'} />;
  }
}
