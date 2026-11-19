import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { controls } from '../../config/controls';
import { moveWithCollisions } from '../../engine/collision';
import type { Bounds, Collider } from '../../engine/geometry';
import { addLook, consumeLook, inputState, isRunning, keyboardMove, keyboardTurn } from '../../input/inputState';
import { playerState } from '../../input/playerState';

interface Props {
  colliders: Collider[];
  bounds: Bounds;
  /** Desktop: usa Pointer Lock para olhar com o mouse. */
  pointerLock: boolean;
  onLockChange?: (locked: boolean) => void;
}

const { damp } = THREE.MathUtils;

/** Ajusta o FOV vertical para manter um campo de visão horizontal agradável em retrato e paisagem. */
function fovForAspect(aspect: number): number {
  const h = THREE.MathUtils.degToRad(controls.horizontalFov);
  const v = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(h / 2) / aspect));
  return THREE.MathUtils.clamp(v, controls.minVerticalFov, controls.maxVerticalFov);
}

export function requestPointerLock() {
  const canvas = document.querySelector('canvas');
  try {
    const p = canvas?.requestPointerLock?.() as unknown as Promise<void> | undefined;
    p?.catch?.(() => undefined);
  } catch {
    /* navegador sem suporte — o arraste continua funcionando */
  }
}

/**
 * Controlador de primeira pessoa: integra teclado, joystick virtual, mouse e
 * toque; aplica aceleração suave, rotação amortecida e colisões.
 */
export function FirstPersonController({ colliders, bounds, pointerLock, onLockChange }: Props) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);

  const target = useRef({ yaw: playerState.yaw, pitch: playerState.pitch });
  const velocity = useRef(new THREE.Vector2());
  const bob = useRef(0);
  const teleportSeen = useRef(playerState.teleportVersion);

  // Ao entrar no modo visita, assume a orientação salva.
  useEffect(() => {
    target.current.yaw = playerState.yaw;
    target.current.pitch = playerState.pitch;
    camera.rotation.order = 'YXZ';
  }, [camera]);

  useEffect(() => {
    camera.fov = fovForAspect(size.width / size.height);
    camera.near = 0.05;
    camera.far = 400;
    camera.updateProjectionMatrix();
  }, [camera, size]);

  // Mouse: pointer lock (desktop). Sem lock, arrastar com o botão pressionado também gira.
  useEffect(() => {
    if (!pointerLock) return;
    const el = gl.domElement;
    let dragging = false;
    const locked = () => document.pointerLockElement === el;
    const onMove = (e: MouseEvent) => {
      if (locked() || dragging) addLook(e.movementX, e.movementY, 'mouse');
    };
    const onDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      if (!locked()) requestPointerLock();
      dragging = true;
    };
    const onUp = () => (dragging = false);
    const onLock = () => onLockChange?.(locked());
    el.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onLock);
    return () => {
      el.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerlockchange', onLock);
      if (locked()) document.exitPointerLock();
    };
  }, [gl, pointerLock, onLockChange]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1);

    // Teleporte externo (clique na planta 3D).
    if (teleportSeen.current !== playerState.teleportVersion) {
      teleportSeen.current = playerState.teleportVersion;
      target.current.yaw = playerState.yaw;
      velocity.current.set(0, 0);
    }

    // --- Rotação ---
    const look = consumeLook();
    const sens = look.source === 'touch' ? controls.touchSensitivity : controls.mouseSensitivity;
    const t = target.current;
    t.yaw -= look.dx * sens + keyboardTurn() * controls.keyTurnSpeed * dt;
    t.pitch = THREE.MathUtils.clamp(t.pitch - look.dy * sens, -controls.maxPitch, controls.maxPitch);
    const smoothing = look.source === 'touch' ? controls.touchSmoothing : controls.mouseSmoothing;
    playerState.yaw = damp(playerState.yaw, t.yaw, smoothing, dt);
    playerState.pitch = damp(playerState.pitch, t.pitch, smoothing, dt);

    // --- Movimento ---
    const [kx, ky] = keyboardMove();
    let mx = kx + inputState.joystick.x;
    let my = ky + inputState.joystick.y;
    const mag = Math.hypot(mx, my);
    if (mag > 1) {
      mx /= mag;
      my /= mag;
    }
    const joyMag = Math.hypot(inputState.joystick.x, inputState.joystick.y);
    const speed = isRunning() || joyMag > 0.95 ? controls.runSpeed : controls.walkSpeed;

    const yaw = playerState.yaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);
    const desiredX = (fx * my + rx * mx) * speed;
    const desiredZ = (fz * my + rz * mx) * speed;
    const v = velocity.current;
    v.x = damp(v.x, desiredX, controls.acceleration, dt);
    v.y = damp(v.y, desiredZ, controls.acceleration, dt);
    if (Math.abs(v.x) < 1e-4 && Math.abs(v.y) < 1e-4) v.set(0, 0);

    if (v.x !== 0 || v.y !== 0) {
      playerState.position = moveWithCollisions(
        playerState.position,
        [v.x * dt, v.y * dt],
        colliders,
        controls.playerRadius,
        bounds,
      );
    }

    // --- Câmera ---
    const moving = v.length() / controls.walkSpeed;
    bob.current += dt * controls.headBobFrequency * Math.PI * 2 * Math.min(1, moving);
    const bobY = Math.sin(bob.current) * controls.headBobAmplitude * Math.min(1, moving);
    camera.position.set(playerState.position[0], controls.eyeHeight + bobY, playerState.position[1]);
    camera.rotation.set(playerState.pitch, playerState.yaw, 0, 'YXZ');
  });

  return null;
}
