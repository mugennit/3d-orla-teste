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
        <ControlsList isTouch={isTouch} />
        <button className="btn-primary" onClick={onStart} autoFocus>
          Iniciar visita
        </button>
      </div>
    </div>
  );
}
