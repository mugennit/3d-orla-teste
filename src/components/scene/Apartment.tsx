import { useMemo } from 'react';
import * as THREE from 'three';
import { doorLeaves, wallLength, wallPieces } from '../../engine/geometry';
import type { ApartmentLayout, Opening, Room, Vec2, Wall } from '../../layout/types';
import { Furniture } from './Furniture';
import { getMaterial } from './materials';

interface Props {
  layout: ApartmentLayout;
  showCeiling: boolean;
}

/** Gera toda a arquitetura a partir dos dados do layout. */
export function Apartment({ layout, showCeiling }: Props) {
  return (
    <group>
      {layout.walls.map((w) => (
        <WallMesh key={w.id} wall={w} defaultHeight={layout.ceilingHeight} />
      ))}
      {layout.rooms.map((r) => (
        <RoomSurfaces
          key={r.id}
          room={r}
          ceilingHeight={layout.ceilingHeight}
          showCeiling={showCeiling && r.ceiling !== false && !layout.envelope}
        />
      ))}
      {layout.furniture.map((f) => (
        <Furniture key={f.id} item={f} />
      ))}
      {layout.envelope && (
        <Slabs envelope={layout.envelope} ceilingHeight={layout.ceilingHeight} showCeiling={showCeiling} />
      )}
    </group>
  );
}

function WallMesh({ wall, defaultHeight }: { wall: Wall; defaultHeight: number }) {
  const pieces = useMemo(() => wallPieces(wall, defaultHeight, true), [wall, defaultHeight]);
  const isGlass = wall.material === 'railing';
  return (
    <group>
      {pieces.map((p) => (
        <mesh
          key={p.key}
          position={[p.center[0], (p.bottom + p.top) / 2, p.center[1]]}
          rotation={[0, -p.angle, 0]}
          material={getMaterial(p.material)}
          castShadow={!isGlass}
          receiveShadow={!isGlass}
        >
          <boxGeometry args={[p.length, p.top - p.bottom, p.thickness]} />
        </mesh>
      ))}
      {isGlass && <RailingCap wall={wall} height={wall.height ?? 1.1} />}
      {(wall.openings ?? []).map((o) => (
        <OpeningFill key={o.id} wall={wall} opening={o} />
      ))}
      {doorLeaves(wall).map((d) => (
        <mesh
          key={d.key}
          position={[d.center[0], d.height / 2, d.center[1]]}
          rotation={[0, -d.angle, 0]}
          material={getMaterial('door')}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[d.width, d.height, d.thickness]} />
        </mesh>
      ))}
    </group>
  );
}

/** Corrimão metálico sobre guarda-corpos de vidro. */
function RailingCap({ wall, height }: { wall: Wall; height: number }) {
  const len = wallLength(wall);
  const angle = Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0]);
  const cx = (wall.from[0] + wall.to[0]) / 2;
  const cz = (wall.from[1] + wall.to[1]) / 2;
  return (
    <mesh position={[cx, height, cz]} rotation={[0, -angle, 0]} material={getMaterial('metal')} castShadow>
      <boxGeometry args={[len + 0.04, 0.04, 0.06]} />
    </mesh>
  );
}

/** Vidro e caixilho de janelas; batentes de portas. */
function OpeningFill({ wall, opening: o }: { wall: Wall; opening: Opening }) {
  const len = wallLength(wall) || 1;
  const angle = Math.atan2(wall.to[1] - wall.from[1], wall.to[0] - wall.from[0]);
  const mid = (o.offset + o.width / 2) / len;
  const cx = wall.from[0] + (wall.to[0] - wall.from[0]) * mid;
  const cz = wall.from[1] + (wall.to[1] - wall.from[1]) * mid;
  const h = o.head - o.sill;
  const frame = 0.04;
  const depth = Math.min(0.08, wall.thickness);
  const frameMat = getMaterial(o.kind === 'door' ? 'woodLight' : 'frame');

  return (
    <group position={[cx, o.sill, cz]} rotation={[0, -angle, 0]}>
      {o.kind === 'window' && (
        <mesh position={[0, h / 2, 0]} material={getMaterial('glass')} renderOrder={2}>
          <boxGeometry args={[o.width - frame * 2, h - frame * 2, 0.01]} />
        </mesh>
      )}
      {o.kind !== 'passage' && (
        <>
          <mesh position={[-o.width / 2 + frame / 2, h / 2, 0]} material={frameMat}>
            <boxGeometry args={[frame, h, depth]} />
          </mesh>
          <mesh position={[o.width / 2 - frame / 2, h / 2, 0]} material={frameMat}>
            <boxGeometry args={[frame, h, depth]} />
          </mesh>
          <mesh position={[0, h - frame / 2, 0]} material={frameMat}>
            <boxGeometry args={[o.width, frame, depth]} />
          </mesh>
          {o.kind === 'window' && (
            <mesh position={[0, frame / 2, 0]} material={frameMat}>
              <boxGeometry args={[o.width, frame, depth]} />
            </mesh>
          )}
        </>
      )}
    </group>
  );
}

/** Polígono da planta → THREE.Shape. `flip` inverte Y para gerar normal para cima. */
function shapeFromPolygon(room: Room, flip: boolean): THREE.Shape {
  const s = new THREE.Shape();
  room.polygon.forEach(([x, y], i) => {
    const py = flip ? -y : y;
    if (i === 0) s.moveTo(x, py);
    else s.lineTo(x, py);
  });
  s.closePath();
  return s;
}

function RoomSurfaces({
  room,
  ceilingHeight,
  showCeiling,
}: {
  room: Room;
  ceilingHeight: number;
  showCeiling: boolean;
}) {
  const floorGeo = useMemo(() => new THREE.ShapeGeometry(shapeFromPolygon(room, true)), [room]);
  const ceilGeo = useMemo(() => new THREE.ShapeGeometry(shapeFromPolygon(room, false)), [room]);

  return (
    <group>
      {/* Piso: shape (x, -y) girado -90° em X → normal para cima, z = y da planta. */}
      <mesh geometry={floorGeo} rotation={[-Math.PI / 2, 0, 0]} material={getMaterial(room.floorMaterial)} receiveShadow />
      {/* Teto: shape (x, y) girado +90° em X → normal para baixo. */}
      <mesh
        geometry={ceilGeo}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ceilingHeight, 0]}
        material={getMaterial('ceiling')}
        visible={showCeiling}
        castShadow
        receiveShadow
      />
    </group>
  );
}

/**
 * Lajes contínuas sob e sobre toda a unidade: evitam frestas entre os
 * polígonos dos ambientes e as faces das paredes (o piso de cada ambiente
 * fica 2 mm acima da laje inferior).
 */
function Slabs({ envelope, ceilingHeight, showCeiling }: { envelope: Vec2[]; ceilingHeight: number; showCeiling: boolean }) {
  const pseudo: Room = { id: 'slab', name: 'slab', polygon: envelope, floorMaterial: 'slab' };
  const floorGeo = useMemo(() => new THREE.ShapeGeometry(shapeFromPolygon(pseudo, true)), [envelope]); // eslint-disable-line react-hooks/exhaustive-deps
  const ceilGeo = useMemo(() => new THREE.ShapeGeometry(shapeFromPolygon(pseudo, false)), [envelope]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <group>
      <mesh geometry={floorGeo} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.002, 0]} material={getMaterial('slab')} receiveShadow />
      <mesh
        geometry={ceilGeo}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, ceilingHeight, 0]}
        material={getMaterial('ceiling')}
        visible={showCeiling}
        castShadow
        receiveShadow
      />
    </group>
  );
}
