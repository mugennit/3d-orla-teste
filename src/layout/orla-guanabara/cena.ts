import type { PhotoSceneConfig } from '../../components/scene/PhotoApartment';
import type { Furniture } from '../types';
import { furnitureColliders } from './sala-cozinha';

/**
 * Cena fotorrealista da Etapa 2 (sala integrada à cozinha), gerada por
 * `pipeline/` (Blender + bake de iluminação) e otimizada para a web.
 * Os demais ambientes aparecem só com arquitetura e luz pré-calculada,
 * sem detalhamento, até a aprovação da sala/cozinha.
 */
export const orlaPhotoScene: PhotoSceneConfig & { colliders: Furniture[] } = {
  baseUrl: 'cenas/orla-45m2',
  probe: [2.3, 3.3, 1.3],
  colliders: furnitureColliders(),
};
