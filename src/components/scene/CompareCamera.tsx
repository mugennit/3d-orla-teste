import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useState } from 'react';
import * as THREE from 'three';

/**
 * Modo de comparação com o Cycles (M3): `?cam=<nome>` posiciona a câmera exatamente como a câmera
 * homônima de `pipeline/master_scene.py` (CAMERAS), exportada para `<cena>/cameras.json`:
 * olho e alvo em metros da planta, lente em mm (sensor de 36 mm, ajuste horizontal),
 * deslocamento óptico vertical (shift_y) e câmera nivelada ou inclinada (pitch).
 * Usado pelas capturas lado a lado (scripts/compare.cjs); a navegação normal não é afetada.
 */
export interface BlenderCamera {
  eye: [number, number, number];
  target: [number, number, number];
  lens: number;
  shift_y?: number;
  pitch?: boolean;
}

const Q = new URLSearchParams(window.location.search);
/** `?cam=<nome>` (câmera do Blender) ou `?pose=x,y,altura,rumo°,inclinação°,lente` (testes de perto). */
export const COMPARE_CAM = Q.get('cam') ?? (Q.get('pose') ? 'pose' : null);

function poseCamera(): BlenderCamera | null {
  const p = Q.get('pose')?.split(',').map(Number);
  if (!p || p.length < 4) return null;
  const [x = 0, y = 0, h = 1.6, rumo = 0, incl = 0, lens = 18] = p;
  // rumo: 0° = -y da planta (norte do desenho), sentido horário — mesmo do spawn do layout.
  const r = (rumo * Math.PI) / 180;
  const i = (incl * Math.PI) / 180;
  const tx = x + Math.sin(r) * Math.cos(i);
  const ty = y - Math.cos(r) * Math.cos(i);
  return { eye: [x, y, h], target: [tx, ty, h + Math.sin(i)], lens, pitch: incl !== 0 };
}

export function CompareCamera({ baseUrl }: { baseUrl: string }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const [cam, setCam] = useState<BlenderCamera | null>(null);

  useEffect(() => {
    if (!COMPARE_CAM) return;
    if (COMPARE_CAM === 'pose') {
      setCam(poseCamera());
      return;
    }
    void fetch(`${baseUrl}/cameras.json`)
      .then((r) => r.json())
      .then((all: Record<string, BlenderCamera>) => setCam(all[COMPARE_CAM] ?? null));
  }, [baseUrl]);

  useFrame(() => {
    if (!cam) return;
    const [ex, ey, ez] = cam.eye;
    const [tx, ty, tz] = cam.target;
    const dx = tx - ex;
    const dy = ty - ey;
    const yaw = Math.atan2(-dx, -dy);
    const pitch = cam.pitch ? Math.atan2(tz - ez, Math.hypot(dx, dy)) : 0;
    camera.position.set(ex, ez, ey); // planta (x, y) + altura → Three (x, altura, y)
    camera.rotation.order = 'YXZ';
    camera.rotation.set(pitch, yaw, 0);
    const aspect = size.width / size.height;
    const hfov = 2 * Math.atan(18 / cam.lens);
    camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hfov / 2) / aspect));
    camera.aspect = aspect;
    camera.near = 0.02;
    camera.updateProjectionMatrix();
    // shift_y do Blender: fração da maior dimensão do sensor → deslocamento em NDC.
    camera.projectionMatrix.elements[9] += 2 * (cam.shift_y ?? 0) * aspect;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    (window as unknown as { __compareReady?: boolean }).__compareReady = true;
  });

  return null;
}
