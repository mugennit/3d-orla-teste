import { PerformanceMonitor, Preload } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import * as THREE from 'three';
import { buildColliders, layoutBounds } from '../../engine/geometry';
import type { ApartmentLayout } from '../../layout/types';
import { Apartment } from './Apartment';
import { FirstPersonController } from './FirstPersonController';
import { Lighting } from './Lighting';
import { PhotoApartment, PhotoEnvironment, type PhotoSceneConfig } from './PhotoApartment';
import { PlanView } from './PlanView';
import type { Furniture } from '../../layout/types';

export type ViewMode = 'walk' | 'plan';

interface Props {
  layout: ApartmentLayout;
  mode: ViewMode;
  /** Controles ativos (após "Iniciar visita"). */
  active: boolean;
  isTouch: boolean;
  onLockChange: (locked: boolean) => void;
  onEnterAt: () => void;
  /** Opacidade da planta original sobreposta (0 = oculta). */
  overlayOpacity?: number;
  /** Cena fotorrealista (Blender + luz pré-calculada). Sem ela, usa a geometria provisória. */
  photo?: PhotoSceneConfig & { colliders: Furniture[] };
}

export function TourScene({ layout, mode, active, isTouch, onLockChange, onEnterAt, overlayOpacity = 0, photo }: Props) {
  const colliders = useMemo(
    () => buildColliders(photo ? { ...layout, furniture: [...layout.furniture, ...photo.colliders] } : layout),
    [layout, photo],
  );
  const bounds = useMemo(() => layoutBounds(layout), [layout]);
  // Qualidade: `?q=low` força o modo leve; o PerformanceMonitor também
  // reduz automaticamente (sem sombras, DPR 1) se o FPS cair.
  const [degraded, setDegraded] = useState(
    () => new URLSearchParams(window.location.search).get('q') === 'low',
  );
  const quality = degraded ? 'minimal' : isTouch ? 'low' : 'high';

  return (
    <Canvas
      shadows={photo ? false : 'soft'}
      dpr={degraded ? 1 : isTouch ? [1, 1.5] : [1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false }}
      camera={{ fov: 70, near: 0.05, far: 400, position: [0, 1.6, 0] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
      }}
    >
      <PerformanceMonitor onDecline={() => setDegraded(true)} flipflops={2} />
      <Suspense fallback={null}>
        {photo ? (
          <>
            <PhotoEnvironment config={photo} exposure={2.1} />
            <PhotoApartment config={photo} tier={isTouch || degraded ? 'mobile' : 'desktop'} showCeiling={mode === 'walk'} />
          </>
        ) : (
          <>
            <Lighting layout={layout} bounds={bounds} quality={quality} />
            <Apartment layout={layout} showCeiling={mode === 'walk'} />
          </>
        )}
        {mode === 'walk' ? (
          <FirstPersonController
            colliders={colliders}
            bounds={bounds}
            pointerLock={active && !isTouch}
            onLockChange={onLockChange}
          />
        ) : (
          <PlanView layout={layout} bounds={bounds} colliders={colliders} onEnterAt={onEnterAt} overlayOpacity={overlayOpacity} />
        )}
        <Preload all />
      </Suspense>
    </Canvas>
  );
}
