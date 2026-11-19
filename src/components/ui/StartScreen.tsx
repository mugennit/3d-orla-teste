import { project } from '../../config/project';
import type { ApartmentLayout } from '../../layout/types';
import { ControlsList } from './HelpPanel';

interface Props {
  layout: ApartmentLayout;
  isTouch: boolean;
  onStart: () => void;
}

export function StartScreen({ layout, isTouch, onStart }: Props) {
  return (
    <div className="start-screen">
      <div className="panel start-panel">
        <p className="eyebrow">Tour virtual 3D · {project.city}</p>
        <h1>{project.development}</h1>
        <p className="lead">{project.unit} · {project.privateArea}</p>
        {layout.status === 'provisional' && (
          <p className="notice">
            Cena técnica de teste. A geometria do apartamento será construída a partir da planta oficial do book.
          </p>
        )}
        {layout.status === 'draft' && (
          <p className="notice">
            Etapa 1 — geometria em conferência com a planta do book. Medidas estimadas (planta sem cotas) e
            acabamentos ainda provisórios: este não é o visual final.
          </p>
        )}
        <ControlsList isTouch={isTouch} />
        <button className="btn-primary" onClick={onStart} autoFocus>
          Iniciar visita
        </button>
      </div>
    </div>
  );
}
