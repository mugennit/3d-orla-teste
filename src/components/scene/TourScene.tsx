import { PerformanceMonitor, Preload } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Suspense, useMemo, useState } from 'react';
import * as THREE from 'three';
import { buildColliders, layoutBounds } from '../../engine/geometry';
import type { ApartmentLayout } from '../../layout/types';
import { Apartment } from './Apartment';
import { FirstPersonController } from './FirstPersonController';
import { Lighting } from './Lighting';
import { PlanView } from './PlanView';

export type ViewMode = 'walk' | 'plan';

interface Props {
  layout: ApartmentLayout;
  mode: ViewMode;
  /** Controles ativos (após "Iniciar visita"). */
  active: boolean;
  isTouch: boolean;
  onLockChange: (locked: boolean) => void;
  onEnterAt: () => void;
}

export function TourScene({ layout, mode, active, isTouch, onLockChange, onEnterAt }: Props) {
  const colliders = useMemo(() => buildColliders(layout), [layout]);
  const bounds = useMemo(() => layoutBounds(layout), [layout]);
  // Qualidade: `?q=low` força o modo leve; o PerformanceMonitor também
  // reduz automaticamente (sem sombras, DPR 1) se o FPS cair.
  const [degraded, setDegraded] = useState(
    () => new URLSearchParams(window.location.search).get('q') === 'low',
  );
  const quality = degraded ? 'minimal' : isTouch ? 'low' : 'high';

  return (
    <Canvas
      shadows="soft"
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
        <Lighting layout={layout} bounds={bounds} quality={quality} />
        <Apartment layout={layout} showCeiling={mode === 'walk'} />
        {mode === 'walk' ? (
          <FirstPersonController
            colliders={colliders}
            bounds={bounds}
            pointerLock={active && !isTouch}
            onLockChange={onLockChange}
          />
        ) : (
          <PlanView layout={layout} bounds={bounds} colliders={colliders} onEnterAt={onEnterAt} />
        )}
        <Preload all />
      </Suspense>
    </Canvas>
  );
}
