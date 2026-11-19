/**
 * Estado de entrada compartilhado entre a interface (DOM) e a cena 3D.
 * É um objeto mutável (não-React) para ser lido a cada quadro sem re-render.
 */
export type LookSource = 'mouse' | 'touch';

export const inputState = {
  /** Joystick virtual: x = lateral (+direita), y = frente (+frente). Valores em [-1, 1]. */
  joystick: { x: 0, y: 0 },
  /** Teclas pressionadas (event.code). */
  keys: new Set<string>(),
  /** Deltas de rotação acumulados (pixels) aguardando consumo pelo próximo quadro. */
  look: { dx: 0, dy: 0, source: 'mouse' as LookSource },
};

export function addLook(dx: number, dy: number, source: LookSource) {
  inputState.look.dx += dx;
  inputState.look.dy += dy;
  inputState.look.source = source;
}

export function consumeLook() {
  const { dx, dy, source } = inputState.look;
  inputState.look.dx = 0;
  inputState.look.dy = 0;
  return { dx, dy, source };
}

export function resetInput() {
  inputState.joystick.x = 0;
  inputState.joystick.y = 0;
  inputState.keys.clear();
  inputState.look.dx = 0;
  inputState.look.dy = 0;
}

const pressed = (...codes: string[]) => codes.some((c) => inputState.keys.has(c));

/** Vetor de movimento pelo teclado: [lateral, frente]. */
export function keyboardMove(): [number, number] {
  const x = (pressed('KeyD') ? 1 : 0) - (pressed('KeyA') ? 1 : 0);
  const y = (pressed('KeyW', 'ArrowUp') ? 1 : 0) - (pressed('KeyS', 'ArrowDown') ? 1 : 0);
  return [x, y];
}

/** Giro pelas setas laterais: -1 (esquerda) a 1 (direita). */
export function keyboardTurn(): number {
  return (pressed('ArrowRight', 'KeyE') ? 1 : 0) - (pressed('ArrowLeft', 'KeyQ') ? 1 : 0);
}

export function isRunning(): boolean {
  return pressed('ShiftLeft', 'ShiftRight');
}
