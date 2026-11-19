import { useRef, useState } from 'react';
import { controls } from '../../config/controls';
import { inputState } from '../../input/inputState';

const RADIUS = 56; // px — curso máximo do manche

/**
 * Joystick virtual (canto inferior esquerdo). Usa Pointer Events com captura
 * do ponteiro, então funciona em multitoque junto com a área de olhar.
 */
export function VirtualJoystick() {
  const baseRef = useRef<HTMLDivElement>(null);
  const pointer = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0, active: false });

  const update = (clientX: number, clientY: number) => {
    const base = baseRef.current;
    if (!base) return;
    const r = base.getBoundingClientRect();
    let dx = clientX - (r.left + r.width / 2);
    let dy = clientY - (r.top + r.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) {
      dx = (dx / len) * RADIUS;
      dy = (dy / len) * RADIUS;
    }
    setKnob({ x: dx, y: dy, active: true });
    // Normaliza com zona morta e curva suave para controle fino.
    const nx = dx / RADIUS;
    const ny = -dy / RADIUS;
    const m = Math.hypot(nx, ny);
    const dz = controls.joystickDeadzone;
    if (m < dz) {
      inputState.joystick.x = 0;
      inputState.joystick.y = 0;
    } else {
      const scaled = ((m - dz) / (1 - dz)) ** 1.3;
      inputState.joystick.x = (nx / m) * scaled;
      inputState.joystick.y = (ny / m) * scaled;
    }
  };

  const release = () => {
    pointer.current = null;
    inputState.joystick.x = 0;
    inputState.joystick.y = 0;
    setKnob({ x: 0, y: 0, active: false });
  };

  return (
    <div
      className="joystick-zone"
      onPointerDown={(e) => {
        if (pointer.current !== null) return;
        pointer.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        update(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (e.pointerId === pointer.current) update(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => e.pointerId === pointer.current && release()}
      onPointerCancel={(e) => e.pointerId === pointer.current && release()}
      onLostPointerCapture={(e) => e.pointerId === pointer.current && release()}
      aria-label="Joystick de movimento"
      role="application"
    >
      <div ref={baseRef} className={`joystick-base${knob.active ? ' is-active' : ''}`}>
        <div className="joystick-knob" style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }} />
      </div>
    </div>
  );
}
