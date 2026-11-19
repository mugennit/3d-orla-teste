import type { ApartmentLayout } from './types';
import { orla45m2 } from './orla-guanabara/apto-45m2';

/**
 * Layout ativo do tour: Orla Guanabara, 2 quartos com suíte e varanda,
 * 45,66 m² — geometria da Etapa 1 (medidas estimadas, em conferência).
 */
export const activeLayout: ApartmentLayout = orla45m2;

export type { ApartmentLayout } from './types';
