import { useEffect } from 'react';
import { inputState } from './inputState';

const HANDLED = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'ShiftLeft', 'ShiftRight',
]);

/** Registra WASD / setas / Shift no estado de entrada. */
export function useKeyboard(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const down = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (!HANDLED.has(e.code)) return;
      inputState.keys.add(e.code);
      if (e.code.startsWith('Arrow')) e.preventDefault();
    };
    const up = (e: KeyboardEvent) => inputState.keys.delete(e.code);
    const clear = () => inputState.keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      clear();
    };
  }, [enabled]);
}
