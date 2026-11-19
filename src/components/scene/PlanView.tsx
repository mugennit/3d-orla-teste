import { Html, OrbitControls, useTexture } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { controls } from '../../config/controls';
import { resolvePosition } from '../../engine/collision';
import type { Bounds, Collider } from '../../engine/geometry';
import { polygonArea, polygonCentroid } from '../../engine/geometry';
import type { ApartmentLayout } from '../../layout/types';
import { playerState, teleport } from '../../input/playerState';

interface Props {
  layout: ApartmentLayout;
  bounds: Bounds;
  colliders: Collider[];
  /** Clique no piso: posiciona o visitante e volta ao modo visita. */
  onEnterAt: () => void;
  /** Opacidade da planta original sobreposta; > 0 ativa a vista ortogonal de conferência. */
  overlayOpacity?: number;
}

const TRANSITION = 0.9; // s

/** Planta 3D vista de cima, com órbita, zoom, rótulos e "entrar aqui". */
export function PlanView({ layout, bounds, colliders, onEnterAt, overlayOpacity = 0 }: Props) {
  const compare = overlayOpacity > 0;
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const orbit = useRef<OrbitControlsImpl>(null);
  const [ready, setReady] = useState(false);

  const center = useMemo(
    () => new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minY + bounds.maxY) / 2),
    [bounds],
  );
  const extent = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  // Pose final: acima e levemente inclinada (planta "humanizada" em 3D) ou,
  // na conferência, exatamente de cima com FOV estreito (quase ortogonal),
  // para que o topo das paredes coincida com a imagem da planta.
  const fov = compare ? 12 : 45;
  const endPos = useMemo(() => {
    const aspect = size.width / size.height;
    if (compare) {
      const w = bounds.maxX - bounds.minX + 0.8;
      const h = bounds.maxY - bounds.minY + 0.8;
      const vfov = THREE.MathUtils.degToRad(fov);
      const distH = h / 2 / Math.tan(vfov / 2);
      const distW = w / 2 / (Math.tan(vfov / 2) * aspect);
      const dist = Math.max(distH, distW) * 1.12 + layout.ceilingHeight;
      return new THREE.Vector3(center.x, dist, center.z + 0.0001);
    }
    const dist = extent * (aspect < 1 ? 1.9 / aspect ** 0.5 : 1.35);
    return new THREE.Vector3(center.x, dist, center.z + dist * 0.38);
  }, [center, extent, size, compare, bounds, fov, layout.ceilingHeight]);

  const anim = useRef({ t: 0, fromPos: new THREE.Vector3(), fromQuat: new THREE.Quaternion(), toQuat: new THREE.Quaternion() });

  useEffect(() => {
    camera.fov = fov;
    camera.updateProjectionMatrix();
    const a = anim.current;
    a.t = 0;
    a.fromPos.copy(camera.position);
    a.fromQuat.copy(camera.quaternion);
    const m = new THREE.Matrix4().lookAt(endPos, center, compare ? new THREE.Vector3(0, 0, -1) : new THREE.Vector3(0, 1, 0));
    a.toQuat.setFromRotationMatrix(m);
    setReady(false);
  }, [camera, endPos, center, fov, compare]);

  useFrame((_, dt) => {
    const a = anim.current;
    if (a.t >= 1) return;
    a.t = Math.min(1, a.t + dt / TRANSITION);
    const k = a.t < 0.5 ? 4 * a.t ** 3 : 1 - (-2 * a.t + 2) ** 3 / 2; // easeInOutCubic
    camera.position.lerpVectors(a.fromPos, endPos, k);
    camera.quaternion.slerpQuaternions(a.fromQuat, a.toQuat, k);
    if (a.t >= 1) {
      orbit.current?.target.copy(center);
      orbit.current?.update();
      setReady(true);
    }
  });

  const handleFloorClick = (e: ThreeEvent<MouseEvent>) => {
    if (!ready || e.delta > 6) return; // ignora arrastes
    e.stopPropagation();
    const p = resolvePosition([e.point.x, e.point.z], colliders, controls.playerRadius);
    // Entra olhando na mesma direção em que a planta está sendo vista.
    const dir = camera.getWorldDirection(new THREE.Vector3());
    teleport(p, Math.atan2(-dir.x, -dir.z));
    playerState.pitch = 0;
    onEnterAt();
  };

  return (
    <>
      <OrbitControls
        ref={orbit}
        enabled={ready}
        target={center}
        enableDamping
        dampingFactor={0.08}
        enableRotate={!compare}
        minDistance={compare ? 4 : extent * 0.5}
        maxDistance={compare ? endPos.y * 1.5 : extent * 3}
        maxPolarAngle={Math.PI * 0.42}
        screenSpacePanning={false}
      />

      {/* Plano invisível para capturar cliques sobre o piso. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[center.x, 0.02, center.z]}
        onClick={handleFloorClick}
        visible={false}
      >
        <planeGeometry args={[bounds.maxX - bounds.minX, bounds.maxY - bounds.minY]} />
      </mesh>

      <PlayerMarker />

      {compare && layout.reference && (
        <PlanOverlay layout={layout} opacity={overlayOpacity} />
      )}

      {ready &&
        !compare &&
        layout.rooms.map((r) => {
          const [x, y] = polygonCentroid(r.polygon);
          const area = r.declaredArea ?? polygonArea(r.polygon);
          return (
            <Html key={r.id} position={[x, 0.1, y]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
              <div className="room-label">
                <span>{r.name}</span>
                <small>
                  {area.toFixed(2).replace('.', ',')} m²{r.declaredArea ? '' : ' (modelado)'}
                </small>
              </div>
            </Html>
          );
        })}
    </>
  );
}

/** Indicador da posição e direção do visitante na planta. */
function PlayerMarker() {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    g.position.set(playerState.position[0], 0.05, playerState.position[1]);
    g.rotation.y = playerState.yaw;
  });
  return (
    <group ref={ref}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.22, 32]} />
        <meshBasicMaterial color="#c9a96e" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -0.32]}>
        <coneGeometry args={[0.14, 0.3, 3]} />
        <meshBasicMaterial color="#0f1a24" />
      </mesh>
    </group>
  );
}

/** Imagem da planta original alinhada pela calibração, acima do topo das paredes. */
function PlanOverlay({ layout, opacity }: { layout: ApartmentLayout; opacity: number }) {
  const ref = layout.reference!;
  const tex = useTexture(ref.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = ref.sizePx[0] / ref.pxPerMeter;
  const h = ref.sizePx[1] / ref.pxPerMeter;
  const cx = (ref.sizePx[0] / 2 - ref.originPx[0]) / ref.pxPerMeter;
  const cz = (ref.sizePx[1] / 2 - ref.originPx[1]) / ref.pxPerMeter;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, layout.ceilingHeight + 0.02, cz]} renderOrder={10}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
