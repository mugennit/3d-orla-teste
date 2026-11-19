import { useRef } from 'react';
import { addLook } from '../../input/inputState';

/** Metade direita da tela: arrastar o dedo gira a câmera (horizontal e vertical). */
export function TouchLookArea() {
  const pointer = useRef<{ id: number; x: number; y: number } | null>(null);

  return (
    <div
      className="look-zone"
      onPointerDown={(e) => {
        if (pointer.current) return;
        pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const p = pointer.current;
        if (!p || p.id !== e.pointerId) return;
        addLook(e.clientX - p.x, e.clientY - p.y, 'touch');
        p.x = e.clientX;
        p.y = e.clientY;
      }}
      onPointerUp={(e) => {
        if (pointer.current?.id === e.pointerId) pointer.current = null;
      }}
      onPointerCancel={(e) => {
        if (pointer.current?.id === e.pointerId) pointer.current = null;
      }}
      aria-label="Área para girar a câmera"
    />
  );
}
