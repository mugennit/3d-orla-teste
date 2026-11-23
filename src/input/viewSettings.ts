import { controls } from '../config/controls';

/**
 * Campo de visão horizontal da visita (graus), ajustável pelo visitante.
 * Padrão 90° (≈ lente 0,6× de celular). Ordem de prioridade: `?fov=`, valor salvo, padrão.
 * A projeção é perspectiva retilínea comum: amplia o enquadramento sem alterar a geometria.
 */
export const FOV_MIN = 70;
export const FOV_MAX = 110;
const KEY = 'tour.hfov';

function initial(): number {
  const q = typeof window !== 'undefined' ? Number(new URLSearchParams(window.location.search).get('fov')) : NaN;
  if (Number.isFinite(q) && q > 0) return clamp(q);
  try {
    const v = Number(window.localStorage.getItem(KEY));
    if (Number.isFinite(v) && v > 0) return clamp(v);
  } catch {
    /* armazenamento indisponível */
  }
  return controls.horizontalFov;
}

const clamp = (v: number) => Math.max(FOV_MIN, Math.min(FOV_MAX, Math.round(v)));

export const viewSettings = { horizontalFov: typeof window !== 'undefined' ? initial() : controls.horizontalFov };

export function setHorizontalFov(v: number) {
  viewSettings.horizontalFov = clamp(v);
  try {
    window.localStorage.setItem(KEY, String(viewSettings.horizontalFov));
  } catch {
    /* armazenamento indisponível */
  }
}
