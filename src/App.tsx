import { useCallback, useEffect, useState } from 'react';
import { TourScene, type ViewMode } from './components/scene/TourScene';
import { requestPointerLock } from './components/scene/FirstPersonController';
import { HelpPanel } from './components/ui/HelpPanel';
import { IconExpand, IconHelp, IconPlan, IconWalk } from './components/ui/Icons';
import { RoomIndicator } from './components/ui/RoomIndicator';
import { StartScreen } from './components/ui/StartScreen';
import { TouchLookArea } from './components/ui/TouchLookArea';
import { VirtualJoystick } from './components/ui/VirtualJoystick';
import { project } from './config/project';
import { resetInput } from './input/inputState';
import { headingToYaw, playerState } from './input/playerState';
import { useIsTouchDevice } from './input/useDevice';
import { useKeyboard } from './input/useKeyboard';
import { activeLayout } from './layout';
import { orlaPhotoScene } from './layout/orla-guanabara/cena';
import { LoadingOverlay } from './components/ui/LoadingOverlay';

/**
 * Cena fotorrealista (Etapa 2). Enquanto os arquivos otimizados não são
 * publicados, fica desativada por padrão; `?cena=foto` força a ativação e
 * `?cena=geometria` força a geometria provisória da Etapa 1.
 */
const PHOTO_READY = false;
const cenaParam = new URLSearchParams(window.location.search).get('cena');
const PHOTO = cenaParam === 'foto' || (PHOTO_READY && cenaParam !== 'geometria') ? orlaPhotoScene : undefined;

// Posição inicial a partir do layout.
playerState.position = activeLayout.spawn.position;
playerState.yaw = headingToYaw(activeLayout.spawn.heading);

export default function App() {
  const layout = activeLayout;
  const isTouch = useIsTouchDevice();
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState<ViewMode>('walk');
  const [locked, setLocked] = useState(false);
  const [help, setHelp] = useState(false);
  const [overlay, setOverlay] = useState(0);

  const walking = started && mode === 'walk';
  useKeyboard(walking && !help);

  const switchMode = useCallback((next: ViewMode) => {
    resetInput();
    if (next === 'plan' && document.pointerLockElement) document.exitPointerLock();
    setMode(next);
  }, []);

  const start = () => {
    setStarted(true);
    if (!isTouch) requestPointerLock();
  };

  const enterAt = useCallback(() => {
    switchMode('walk');
  }, [switchMode]);

  // Tab alterna entre visita e planta.
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        e.preventDefault();
        switchMode(mode === 'walk' ? 'plan' : 'walk');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [started, mode, switchMode]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div className={`app mode-${mode}${isTouch ? ' is-touch' : ''}`}>
      <div className="canvas-wrap">
        <TourScene
          layout={layout}
          mode={mode}
          active={walking}
          isTouch={isTouch}
          onLockChange={setLocked}
          onEnterAt={enterAt}
          overlayOpacity={mode === 'plan' ? overlay : 0}
          photo={PHOTO}
        />
      </div>

      {layout.status === 'provisional' && (
        <div className="provisional-banner" role="status">
          Cena de teste provisória — não representa o imóvel
        </div>
      )}
      {layout.status === 'draft' && (
        <div className="provisional-banner is-draft" role="status">
          {PHOTO
            ? 'Etapa 2 · sala e cozinha em avaliação · demais ambientes sem acabamento · medidas estimadas'
            : 'Etapa 1 · geometria em conferência · medidas estimadas · visual provisório'}
        </div>
      )}
      {PHOTO && <LoadingOverlay />}

      <header className="topbar">
        <div className="brand">
          <span className="brand-name">{project.development}</span>
          <span className="brand-sub">{project.unit} · {project.city}</span>
        </div>
        <div className="topbar-actions">
          <div className="segmented" role="tablist" aria-label="Modo de visualização">
            <button role="tab" aria-selected={mode === 'walk'} className={mode === 'walk' ? 'is-on' : ''} onClick={() => switchMode('walk')} disabled={!started}>
              <IconWalk /> <span>Visita</span>
            </button>
            <button role="tab" aria-selected={mode === 'plan'} className={mode === 'plan' ? 'is-on' : ''} onClick={() => switchMode('plan')} disabled={!started}>
              <IconPlan /> <span>Planta 3D</span>
            </button>
          </div>
          <button className="icon-btn" onClick={() => setHelp(true)} aria-label="Como navegar"><IconHelp /></button>
          <button className="icon-btn hide-ios" onClick={toggleFullscreen} aria-label="Tela cheia"><IconExpand /></button>
        </div>
      </header>

      {walking && <RoomIndicator layout={layout} />}

      {walking && isTouch && !help && (
        <>
          <TouchLookArea />
          <VirtualJoystick />
        </>
      )}

      {walking && !isTouch && (
        <>
          <div className="crosshair" aria-hidden="true" />
          {!locked && !help && <div className="hint-pill">Clique na cena para olhar com o mouse</div>}
          <div className="keys-hint" aria-hidden="true">
            <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> mover · Mouse olhar · <kbd>Shift</kbd> correr · <kbd>Tab</kbd> planta
          </div>
        </>
      )}

      {started && mode === 'plan' && overlay === 0 && (
        <div className="hint-pill">{isTouch ? 'Toque no piso' : 'Clique no piso'} para entrar naquele ponto · arraste para girar</div>
      )}

      {started && mode === 'plan' && layout.reference && (
        <div className="compare-panel">
          <button className={`compare-toggle${overlay > 0 ? ' is-on' : ''}`} onClick={() => setOverlay(overlay > 0 ? 0 : 0.6)}>
            {overlay > 0 ? 'Ocultar planta original' : 'Comparar com a planta original'}
          </button>
          {overlay > 0 && (
            <label className="compare-slider">
              <span>Transparência</span>
              <input
                type="range"
                min={0.05}
                max={1}
                step={0.05}
                value={overlay}
                onChange={(e) => setOverlay(Number(e.target.value))}
                aria-label="Opacidade da planta original"
              />
            </label>
          )}
        </div>
      )}

      {!started && <StartScreen layout={layout} isTouch={isTouch} onStart={start} />}
      {help && <HelpPanel isTouch={isTouch} onClose={() => setHelp(false)} />}
    </div>
  );
}
