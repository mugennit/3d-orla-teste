import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';

/** Progresso do download da cena (modelos, texturas e lightmaps). */
export function LoadingOverlay() {
  const { progress, active } = useProgress();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active && progress >= 100) {
      const t = window.setTimeout(() => setDone(true), 400);
      return () => window.clearTimeout(t);
    }
    setDone(false);
  }, [active, progress]);
  if (done) return null;
  return (
    <div className="loading-overlay" role="status" aria-live="polite">
      <div className="loading-card">
        <span>Carregando acabamentos e iluminação</span>
        <div className="loading-bar">
          <div style={{ width: `${Math.round(progress)}%` }} />
        </div>
        <small>{Math.round(progress)}%</small>
      </div>
    </div>
  );
}
