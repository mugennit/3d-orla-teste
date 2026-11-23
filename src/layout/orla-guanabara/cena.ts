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
  // Volume da sala integrada à cozinha (planta auditada: Estar/Jantar + Cozinha), piso ao forro.
  envBox: { rect: [0.1, 1.04, 3.43, 5.76], z: [0, 2.5] },
  colliders: furnitureColliders(),
};
