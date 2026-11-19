import { useEffect, useState } from 'react';

/** Detecta se o dispositivo principal é de toque (celular/tablet). */
export function useIsTouchDevice(): boolean {
  const query = '(pointer: coarse)';
  const get = () =>
    typeof window !== 'undefined' &&
    (window.matchMedia?.(query).matches || navigator.maxTouchPoints > 0 && !window.matchMedia?.('(pointer: fine)').matches);
  const [touch, setTouch] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const onChange = () => setTouch(get());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return touch;
}
