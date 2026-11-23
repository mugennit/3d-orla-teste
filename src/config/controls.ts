/** Parâmetros de navegação — ajuste fino da sensação de "videogame". */
export const controls = {
  /** Altura dos olhos (m). */
  eyeHeight: 1.6,
  /** Raio do visitante para colisão (m). */
  playerRadius: 0.25,
  /** Velocidade de caminhada (m/s). */
  walkSpeed: 1.6,
  /** Velocidade correndo — Shift (m/s). */
  runSpeed: 2.8,
  /** Rapidez com que a velocidade atinge o alvo (maior = mais responsivo). */
  acceleration: 10,
  /** Sensibilidade do mouse (rad por pixel). */
  mouseSensitivity: 0.0022,
  /** Sensibilidade do arraste no celular (rad por pixel). */
  touchSensitivity: 0.0055,
  /** Suavização da rotação: mouse (resposta rápida) e toque (mais macio). */
  mouseSmoothing: 30,
  touchSmoothing: 14,
  /** Rotação pelas setas ← → (rad/s). */
  keyTurnSpeed: 1.8,
  /** Limite de inclinação vertical (rad). */
  maxPitch: (80 * Math.PI) / 180,
  /** Campo de visão horizontal padrão (graus) — ≈ lente 0,6× de celular; ajustável na ajuda (70–110°). */
  horizontalFov: 90,
  /** Limite vertical (retrato): evita distorção exagerada nas bordas em telas estreitas. */
  maxVerticalFov: 100,
  minVerticalFov: 50,
  /** Balanço sutil da cabeça ao caminhar. */
  headBobAmplitude: 0.018,
  headBobFrequency: 1.9,
  /** Zona morta do joystick (0–1). */
  joystickDeadzone: 0.12,
} as const;
