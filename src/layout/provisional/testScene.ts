import type { ApartmentLayout } from '../types';

/**
 * ⚠️  CENA DE TESTE PROVISÓRIA  ⚠️
 *
 * Esta cena existe SOMENTE para validar controles, colisões, iluminação e a
 * planta 3D. Medidas, divisórias, portas e janelas são arbitrárias (números
 * redondos) e NÃO representam o apartamento do Orla Guanabara.
 *
 * Ela será substituída pelo layout extraído da planta humanizada do book
 * oficial (ver `docs/PLANTA-REAL.md`).
 */
const T_EXT = 0.2; // espessura arbitrária de teste
const T_INT = 0.12; // espessura arbitrária de teste

export const provisionalTestScene: ApartmentLayout = {
  id: 'cena-teste-provisoria',
  name: 'Cena de teste provisória',
  development: 'Orla Guanabara',
  location: 'Niterói/RJ',
  status: 'provisional',
  source: 'Nenhuma — geometria arbitrária para testes técnicos',
  ceilingHeight: 2.6,
  northAngle: 0,
  spawn: { position: [2.0, 4.6], heading: 30 },
  walls: [
    // Contorno externo (retângulo 9 × 6 m, arbitrário)
    {
      id: 'ext-norte',
      from: [0, 0],
      to: [9, 0],
      thickness: T_EXT,
      openings: [
        { id: 'jan-a', kind: 'window', offset: 1.2, width: 2.0, sill: 1.0, head: 2.2 },
        { id: 'jan-b', kind: 'window', offset: 6.0, width: 1.5, sill: 1.1, head: 2.2 },
      ],
    },
    { id: 'ext-leste', from: [9, 0], to: [9, 6], thickness: T_EXT },
    { id: 'ext-sul-a', from: [9, 6], to: [0, 6], thickness: T_EXT, height: 2.6,
      openings: [
        { id: 'porta-ext', kind: 'sliding-door', offset: 5.4, width: 2.4, sill: 0, head: 2.3 },
      ],
    },
    { id: 'ext-oeste', from: [0, 6], to: [0, 0], thickness: T_EXT },

    // Divisória interna com porta
    {
      id: 'div-1',
      from: [5, 0],
      to: [5, 6],
      thickness: T_INT,
      openings: [{ id: 'porta-1', kind: 'door', offset: 3.6, width: 0.9, sill: 0, head: 2.1 }],
    },

    // Área externa de teste (guarda-corpo baixo)
    { id: 'ext-guarda-1', from: [0, 6], to: [0, 7.6], thickness: 0.1, height: 1.1, material: 'railing' },
    { id: 'ext-guarda-2', from: [0, 7.6], to: [5, 7.6], thickness: 0.1, height: 1.1, material: 'railing' },
    { id: 'ext-guarda-3', from: [5, 7.6], to: [5, 6], thickness: 0.1, height: 1.1, material: 'railing' },
  ],
  rooms: [
    {
      id: 'teste-a',
      name: 'Ambiente de teste A',
      polygon: [[0, 0], [5, 0], [5, 6], [0, 6]],
      floorMaterial: 'wood',
    },
    {
      id: 'teste-b',
      name: 'Ambiente de teste B',
      polygon: [[5, 0], [9, 0], [9, 6], [5, 6]],
      floorMaterial: 'porcelain',
    },
    {
      id: 'teste-ext',
      name: 'Área externa de teste',
      polygon: [[0, 6], [5, 6], [5, 7.6], [0, 7.6]],
      floorMaterial: 'deck',
      outdoor: true,
    },
  ],
  furniture: [
    { id: 'sofa', kind: 'sofa', position: [2.2, 1.0], size: [2.2, 0.85, 0.9], material: 'fabric' },
    { id: 'tapete', kind: 'rug', position: [2.2, 2.4], size: [2.4, 0.01, 1.7], material: 'rug' },
    { id: 'mesa-centro', kind: 'table', position: [2.2, 2.4], size: [1.0, 0.4, 0.6], material: 'woodDark' },
    { id: 'caixa-teste', kind: 'placeholder-box', position: [4.2, 5.2], size: [0.8, 0.8, 0.8] },
    { id: 'planta', kind: 'plant', position: [0.5, 0.5], size: [0.5, 1.4, 0.5] },
    { id: 'cama', kind: 'bed', position: [7.6, 2.0], size: [1.6, 0.55, 2.0], rotation: 0, material: 'linen' },
    { id: 'armario', kind: 'cabinet', position: [5.6, 1.2], size: [0.6, 2.2, 1.6], material: 'woodLight' },
    { id: 'cadeira-ext', kind: 'chair', position: [1.5, 6.8], size: [0.55, 0.85, 0.55], rotation: 20, material: 'woodDark' },
  ],
};
