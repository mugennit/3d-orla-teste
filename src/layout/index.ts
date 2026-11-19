import type { ApartmentLayout } from './types';
import { provisionalTestScene } from './provisional/testScene';

/**
 * Layout ativo do tour.
 *
 * Quando a planta oficial for digitalizada, crie
 * `src/layout/orla-guanabara/apto-2q.ts` e troque a referência abaixo.
 */
export const activeLayout: ApartmentLayout = provisionalTestScene;

export type { ApartmentLayout } from './types';
