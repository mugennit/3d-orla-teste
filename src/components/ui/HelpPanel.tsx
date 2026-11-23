import { useState } from 'react';
import { FOV_MAX, FOV_MIN, setHorizontalFov, viewSettings } from '../../input/viewSettings';
import { IconClose } from './Icons';

/** Ajuste do campo de visão horizontal (70–110°; padrão 90° ≈ lente 0,6×). */
export function FovControl() {
  const [fov, setFov] = useState(viewSettings.horizontalFov);
  return (
    <label className="compare-slider fov-control">
      Campo de visão: {fov}°{fov === 90 ? ' (padrão, ≈ 0,6×)' : ''}
      <input
        type="range"
        min={FOV_MIN}
        max={FOV_MAX}
        step={1}
        value={fov}
        onChange={(e) => {
          setHorizontalFov(Number(e.target.value));
          setFov(viewSettings.horizontalFov);
        }}
        aria-label="Campo de visão horizontal em graus"
      />
    </label>
  );
}

export function ControlsList({ isTouch }: { isTouch: boolean }) {
  return isTouch ? (
    <ul className="controls-list">
      <li><b>Joystick</b> (canto inferior esquerdo) — caminhar; empurre até a borda para andar mais rápido</li>
      <li><b>Arraste no lado direito</b> — olhar ao redor</li>
      <li><b>Planta 3D</b> — toque no piso para entrar naquele ponto</li>
    </ul>
  ) : (
    <ul className="controls-list">
      <li><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou setas — caminhar</li>
      <li><b>Mouse</b> — olhar ao redor (clique na cena para capturar)</li>
      <li><kbd>Shift</kbd> — andar mais rápido · <kbd>Q</kbd>/<kbd>E</kbd> — girar</li>
      <li><kbd>Esc</kbd> — liberar o mouse · <kbd>Tab</kbd> — alternar visita/planta</li>
      <li><b>Planta 3D</b> — clique no piso para entrar naquele ponto</li>
    </ul>
  );
}

export function HelpPanel({ isTouch, onClose }: { isTouch: boolean; onClose: () => void }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="panel help-panel" role="dialog" aria-label="Como navegar" onClick={(e) => e.stopPropagation()}>
        <button className="icon-btn panel-close" onClick={onClose} aria-label="Fechar"><IconClose /></button>
        <h2>Como navegar</h2>
        <ControlsList isTouch={isTouch} />
        <FovControl />
      </div>
    </div>
  );
}
