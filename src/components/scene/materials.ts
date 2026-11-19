import * as THREE from 'three';

/**
 * Biblioteca de materiais. As texturas são procedurais (geradas em canvas)
 * para não depender de downloads enquanto não houver as referências de
 * acabamento do memorial descritivo. Cada material pode ser trocado depois por
 * texturas PBR reais (albedo/normal/roughness) sem alterar o restante da cena.
 *
 * As UVs de pisos usam metros, então `repeat` = tamanho do padrão em metros.
 */

type Painter = (ctx: CanvasRenderingContext2D, size: number) => void;

function canvasTexture(size: number, paint: Painter, metersPerTile: number): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / metersPerTile, 1 / metersPerTile);
  tex.anisotropy = 8;
  return tex;
}

/** Pseudoaleatório determinístico (as texturas saem iguais a cada carga). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const paintWood =
  (base: [number, number, number], seed: number): Painter =>
  (ctx, size) => {
    const rand = rng(seed);
    const planks = 6;
    const h = size / planks;
    for (let i = 0; i < planks; i++) {
      const shift = (rand() - 0.5) * 18;
      const [r, g, b] = base.map((c) => Math.max(0, Math.min(255, c + shift)));
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(0, i * h, size, h);
      // veios
      for (let k = 0; k < 26; k++) {
        ctx.strokeStyle = `rgba(60,35,15,${0.04 + rand() * 0.07})`;
        ctx.lineWidth = 0.6 + rand() * 1.4;
        ctx.beginPath();
        const y = i * h + rand() * h;
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += size / 8) ctx.lineTo(x, y + (rand() - 0.5) * 3);
        ctx.stroke();
      }
      // junta de topo
      const jx = rand() * size;
      ctx.fillStyle = 'rgba(40,25,10,0.35)';
      ctx.fillRect(jx, i * h, 2, h);
      ctx.fillRect(0, i * h, size, 1.5);
    }
  };

const paintTiles =
  (base: string, grout: string, seed: number): Painter =>
  (ctx, size) => {
    const rand = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let k = 0; k < 900; k++) {
      ctx.fillStyle = `rgba(${rand() > 0.5 ? '255,255,255' : '120,110,100'},${rand() * 0.05})`;
      ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 6, 2 + rand() * 6);
    }
    ctx.strokeStyle = grout;
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, size, size);
  };

const paintFabric =
  (base: string, seed: number): Painter =>
  (ctx, size) => {
    const rand = rng(seed);
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, size, size);
    for (let y = 0; y < size; y += 2) {
      ctx.fillStyle = `rgba(0,0,0,${0.02 + rand() * 0.04})`;
      ctx.fillRect(0, y, size, 1);
    }
    for (let x = 0; x < size; x += 2) {
      ctx.fillStyle = `rgba(255,255,255,${0.015 + rand() * 0.03})`;
      ctx.fillRect(x, 0, 1, size);
    }
  };

const paintTestChecker: Painter = (ctx, size) => {
  const n = 4;
  const s = size / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#f2c94c' : '#2d2d2d';
      ctx.fillRect(i * s, j * s, s, s);
    }
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(0, size * 0.38, size, size * 0.24);
  ctx.fillStyle = '#b3261e';
  ctx.font = `bold ${size * 0.14}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TESTE', size / 2, size / 2);
};

const cache = new Map<string, THREE.Material>();

function create(key: string): THREE.Material {
  switch (key) {
    case 'wall':
      return new THREE.MeshStandardMaterial({ color: '#f1ede6', roughness: 0.92 });
    case 'ceiling':
      return new THREE.MeshStandardMaterial({ color: '#fbfaf7', roughness: 0.95 });
    case 'wood':
      return new THREE.MeshStandardMaterial({
        map: canvasTexture(512, paintWood([176, 132, 92], 7), 1.2),
        roughness: 0.55,
      });
    case 'porcelain':
      return new THREE.MeshStandardMaterial({
        map: canvasTexture(256, paintTiles('#d9d4cb', '#b9b2a6', 3), 0.9),
        roughness: 0.28,
        metalness: 0.02,
      });
    case 'deck':
      return new THREE.MeshStandardMaterial({
        map: canvasTexture(512, paintWood([140, 98, 64], 11), 1.0),
        roughness: 0.7,
      });
    case 'fabric':
      return new THREE.MeshStandardMaterial({ map: canvasTexture(128, paintFabric('#8f8a82', 5), 0.3), roughness: 0.95 });
    case 'linen':
      return new THREE.MeshStandardMaterial({ map: canvasTexture(128, paintFabric('#ece6dc', 9), 0.3), roughness: 0.9 });
    case 'rug':
      return new THREE.MeshStandardMaterial({ map: canvasTexture(128, paintFabric('#c8bba6', 13), 0.15), roughness: 1 });
    case 'woodDark':
      return new THREE.MeshStandardMaterial({ map: canvasTexture(256, paintWood([92, 62, 40], 17), 0.6), roughness: 0.5 });
    case 'woodLight':
      return new THREE.MeshStandardMaterial({ map: canvasTexture(256, paintWood([205, 178, 140], 19), 0.8), roughness: 0.6 });
    case 'metal':
      return new THREE.MeshStandardMaterial({ color: '#2b2b2b', roughness: 0.35, metalness: 0.8 });
    case 'frame':
      return new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: 0.4, metalness: 0.6 });
    case 'glass':
      return new THREE.MeshPhysicalMaterial({
        color: '#dfeef2',
        roughness: 0.05,
        metalness: 0,
        transmission: 0,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      });
    case 'railing':
      return new THREE.MeshPhysicalMaterial({
        color: '#cfe3e6',
        roughness: 0.08,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      });
    case 'plant':
      return new THREE.MeshStandardMaterial({ color: '#4f7a4a', roughness: 0.8 });
    case 'pot':
      return new THREE.MeshStandardMaterial({ color: '#d8d2c8', roughness: 0.7 });
    case 'test':
      return new THREE.MeshStandardMaterial({ map: canvasTexture(256, paintTestChecker, 1), roughness: 0.6 });
    case 'ground':
      return new THREE.MeshStandardMaterial({ color: '#9aa596', roughness: 1 });
    default:
      return new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.8 });
  }
}

export function getMaterial(key: string): THREE.Material {
  let m = cache.get(key);
  if (!m) {
    m = create(key);
    cache.set(key, m);
  }
  return m;
}
