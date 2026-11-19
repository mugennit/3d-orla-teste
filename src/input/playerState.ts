import type { Vec2 } from '../layout/types';

/** Posição/orientação atuais do visitante, compartilhadas entre modos. */
export const playerState = {
  position: [0, 0] as Vec2,
  /** Rotação em torno do eixo vertical (rad, convenção Three.js). */
  yaw: 0,
  pitch: 0,
  /** Incrementado quando a posição é definida externamente (ex.: clique na planta). */
  teleportVersion: 0,
};

/** heading (graus, horário, 0 = -Y da planta) → yaw (rad, Three.js). */
export const headingToYaw = (deg: number) => (-deg * Math.PI) / 180;

export function teleport(position: Vec2, yaw?: number) {
  playerState.position = position;
  if (yaw !== undefined) playerState.yaw = yaw;
  playerState.teleportVersion++;
}

// Exposto para testes automatizados de ponta a ponta (somente leitura).
if (typeof window !== 'undefined') (window as unknown as { __tour: typeof playerState }).__tour = playerState;
