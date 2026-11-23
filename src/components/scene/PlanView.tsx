import { Html, OrbitControls, OrthographicCamera, useTexture } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { controls } from '../../config/controls';
import { TELEPORT_MESSAGES, validateTeleport, type TeleportResult } from '../../engine/teleport';
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
  /** Opacidade da planta original sobreposta (0 = oculta). */
  overlayOpacity?: number;
  /** Vista superior ortográfica verdadeira (perpendicular ao piso). */
  topo?: boolean;
  /** Exibe os balões com nome e área dos ambientes. */
  showLabels?: boolean;
}

const TRANSITION = 0.9; // s
/**
 * Altura do plano de corte da planta (m), como numa planta humanizada: as paredes
 * aparecem cortadas e os elementos altos (aéreos, pendente) não encobrem o piso.
 * A referência das medidas é o pé das paredes (nível do piso).
 */
export const PLAN_CUT_HEIGHT = 1.5;

/** Aplica o plano de corte horizontal enquanto a planta estiver aberta. */
function useSectionCut() {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    gl.clippingPlanes = [new THREE.Plane(new THREE.Vector3(0, -1, 0), PLAN_CUT_HEIGHT)];
    return () => {
      gl.clippingPlanes = [];
    };
  }, [gl]);
}

/**
 * Clique na planta → teletransporte VALIDADO (engine/teleport.ts): só ambientes internos, fora de
 * paredes e móveis. Destino recusado não move a câmera e mostra o motivo no ponto clicado.
 */
function useTeleport(layout: ApartmentLayout, colliders: Collider[], onEnterAt: () => void) {
  const [refused, setRefused] = useState<{ at: THREE.Vector3; text: string } | null>(null);
  useEffect(() => {
    if (!refused) return;
    const t = window.setTimeout(() => setRefused(null), 1800);
    return () => window.clearTimeout(t);
  }, [refused]);
  const tryTeleport = (point: THREE.Vector3, yaw: number): boolean => {
    const r: TeleportResult = validateTeleport([point.x, point.z], layout, colliders, controls.playerRadius);
    (window as unknown as { __lastTeleport?: TeleportResult }).__lastTeleport = r; // testes de ponta a ponta
    if (!r.ok) {
      setRefused({ at: point.clone(), text: TELEPORT_MESSAGES[r.reason] });
      return false;
    }
    teleport(r.position, yaw);
    playerState.pitch = 0;
    onEnterAt();
    return true;
  };
  const marker = refused ? (
    <Html position={[refused.at.x, 0.05, refused.at.z]} center zIndexRange={[30, 0]}>
      <div className="teleport-refused" role="status">{refused.text}</div>
    </Html>
  ) : null;
  return { tryTeleport, marker };
}

export function PlanView(props: Props) {
  useSectionCut();
  return props.topo ? <TopView {...props} /> : <PerspectivePlanView {...props} />;
}

/** Vista superior ORTOGRÁFICA: câmera diretamente acima, olhando a 90° para o piso. */
function TopView({ layout, bounds, colliders, onEnterAt, overlayOpacity = 0, showLabels = true }: Props) {
  const size = useThree((s) => s.size);
  const scene = useThree((s) => s.scene);
  // Fundo neutro claro na vista de topo (o céu equirretangular não faz sentido olhando para baixo).
  useEffect(() => {
    const prev = scene.background;
    scene.background = new THREE.Color('#e7e4de');
    return () => {
      scene.background = prev;
    };
  }, [scene]);
  const center = useMemo(
    () => new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minY + bounds.maxY) / 2),
    [bounds],
  );
  // Enquadramento: px por metro para caber o apartamento com margem.
  const zoom = useMemo(() => {
    const w = bounds.maxX - bounds.minX + 0.8;
    const h = bounds.maxY - bounds.minY + 0.8;
    const usableH = size.height - (size.width < 640 ? 200 : 170); // barra superior e avisos
    return Math.max(10, Math.min((size.width - 32) / w, usableH / h));
  }, [bounds, size]);

  const { tryTeleport, marker } = useTeleport(layout, colliders, onEnterAt);
  const handleFloorClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return;
    e.stopPropagation();
    tryTeleport(e.point, 0);
  };

  return (
    <>
      {/* Câmera acima do centro, rotação −90° em X: olha para baixo com o "norte" da planta para cima. */}
      <OrthographicCamera
        makeDefault
        position={[center.x, 40, center.z]}
        up={[0, 0, -1]}
        rotation={[-Math.PI / 2, 0, 0]}
        zoom={zoom}
        near={0.1}
        far={100}
      />
      <OrbitControls
        target={center}
        enableRotate={false}
        enableDamping
        dampingFactor={0.1}
        screenSpacePanning
        minZoom={zoom * 0.6}
        maxZoom={zoom * 6}
      />
      {/* Plano de clique maior que o apartamento: todo clique é avaliado (e recusado fora dele, com aviso). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center.x, 0.02, center.z]} onClick={handleFloorClick} visible={false}>
        <planeGeometry args={[bounds.maxX - bounds.minX + 40, bounds.maxY - bounds.minY + 40]} />
      </mesh>
      {marker}
      <PlayerMarker />
      {overlayOpacity > 0 && layout.reference && <PlanOverlay layout={layout} opacity={overlayOpacity} />}
      {showLabels && <RoomLabels layout={layout} />}
    </>
  );
}

function RoomLabels({ layout }: { layout: ApartmentLayout }) {
  return (
    <>
      {layout.rooms.map((r) => {
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

/** Planta 3D em perspectiva (vista aérea inclinada), com órbita, zoom, rótulos e "entrar aqui". */
function PerspectivePlanView({ layout, bounds, colliders, onEnterAt, showLabels = true }: Props) {
  const compare = false;
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

  const { tryTeleport, marker } = useTeleport(layout, colliders, onEnterAt);
  const handleFloorClick = (e: ThreeEvent<MouseEvent>) => {
    if (!ready || e.delta > 6) return; // ignora arrastes
    e.stopPropagation();
    // Entra olhando na mesma direção em que a planta está sendo vista.
    const dir = camera.getWorldDirection(new THREE.Vector3());
    tryTeleport(e.point, Math.atan2(-dir.x, -dir.z));
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
        <planeGeometry args={[bounds.maxX - bounds.minX + 40, bounds.maxY - bounds.minY + 40]} />
      </mesh>
      {marker}

      <PlayerMarker />

      {ready && showLabels && <RoomLabels layout={layout} />}
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

/**
 * Imagem da planta original alinhada pela calibração NO NÍVEL DO PISO (referência das
 * medidas = pé das paredes). Desenhada por cima de tudo (sem teste de profundidade).
 */
function PlanOverlay({ layout, opacity }: { layout: ApartmentLayout; opacity: number }) {
  const ref = layout.reference!;
  const tex = useTexture(ref.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  const w = ref.sizePx[0] / ref.pxPerMeter;
  const h = ref.sizePx[1] / ref.pxPerMeter;
  const cx = (ref.sizePx[0] / 2 - ref.originPx[0]) / ref.pxPerMeter;
  const cz = (ref.sizePx[1] / 2 - ref.originPx[1]) / ref.pxPerMeter;
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0.01, cz]} renderOrder={10}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial map={tex} transparent opacity={opacity} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}
