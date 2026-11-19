import { Environment, Lightformer, Sky } from '@react-three/drei';
import { useMemo } from 'react';
import type { Bounds } from '../../engine/geometry';
import { polygonCentroid } from '../../engine/geometry';
import type { ApartmentLayout } from '../../layout/types';
import { getMaterial } from './materials';

interface Props {
  layout: ApartmentLayout;
  bounds: Bounds;
  quality: 'high' | 'low' | 'minimal';
}

/**
 * Iluminação natural: sol direcional com sombras suaves, céu procedural,
 * luz de preenchimento hemisférica e um ambiente de reflexos gerado
 * localmente (sem baixar HDRIs).
 *
 * A posição do sol considera `northAngle`; quando a orientação real do
 * apartamento for conhecida (implantação no book), basta preenchê-la.
 */
export function Lighting({ layout, bounds, quality }: Props) {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cz = (bounds.minY + bounds.maxY) / 2;
  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 4;

  // Sol: noroeste-alto (tarde no hemisfério sul), relativo ao norte da planta.
  const sun = useMemo(() => {
    const north = ((layout.northAngle ?? 0) * Math.PI) / 180;
    const azimuth = north - Math.PI / 5; // um pouco a oeste do norte
    const elevation = (40 * Math.PI) / 180;
    const dist = 30;
    return [
      cx + Math.sin(azimuth) * Math.cos(elevation) * dist,
      Math.sin(elevation) * dist,
      cz - Math.cos(azimuth) * Math.cos(elevation) * dist,
    ] as [number, number, number];
  }, [layout.northAngle, cx, cz]);

  return (
    <>
      <Sky sunPosition={sun} turbidity={6} rayleigh={1.2} mieCoefficient={0.004} mieDirectionalG={0.85} />
      <hemisphereLight args={['#dfe9f3', '#b8a58c', 0.9]} />
      <ambientLight intensity={0.25} />
      <directionalLight
        position={sun}
        intensity={2.6}
        color="#fff3e0"
        castShadow={quality !== 'minimal'}
        shadow-mapSize={quality === 'high' ? [2048, 2048] : [1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-near={1}
        shadow-camera-far={80}
      >
        <object3D attach="target" position={[cx, 0, cz]} />
      </directionalLight>

      {/* Luz interna suave por ambiente (preenchimento, sem sombra). */}
      {layout.rooms
        .filter((r) => !r.outdoor)
        .map((r) => {
          const [x, y] = polygonCentroid(r.polygon);
          return <pointLight key={r.id} position={[x, layout.ceilingHeight - 0.3, y]} intensity={1.6} distance={6} decay={2} color="#ffe8cc" />;
        })}

      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={2} position={[0, 5, -9]} scale={[10, 5, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1} position={[-6, 2, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#ffe9cf" />
        <Lightformer form="rect" intensity={0.6} position={[6, 2, 2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} color="#dbe8ff" />
      </Environment>

      {/* Terreno neutro abaixo da unidade (provisório até termos a implantação). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, -0.05, cz]} material={getMaterial('ground')} receiveShadow>
        <circleGeometry args={[60, 48]} />
      </mesh>
    </>
  );
}
