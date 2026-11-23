import { useGLTF, useTexture } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { suspend } from 'suspend-react';
import * as THREE from 'three';
import { applyBoxProjection, setWhiteBalance, type EnvBox } from './photoShaders';

/**
 * Cena fotorrealista gerada pelo pipeline do Blender (pipeline/build_scene.py):
 *  - geometria e mobiliário com materiais PBR;
 *  - iluminação global pré-calculada (lightmaps em UV2) → luz natural e
 *    sombras suaves sem custo em tempo real (bom desempenho no celular);
 *  - reflexos especulares a partir de um cubemap capturado no próprio
 *    ambiente (porcelanato, inox, vidros, laca).
 */

export interface PhotoSceneConfig {
  /** Pasta pública com meta.json, ceu.jpg e as pastas desktop/ e mobile/. */
  baseUrl: string;
  /** Ponto (m da planta) e altura onde o cubemap de reflexos é capturado. */
  probe: [number, number, number];
  /** Caixa do ambiente para os reflexos com correção de paralaxe: [x0, y0, x1, y1] da planta (m) e [piso, teto]. */
  envBox?: { rect: [number, number, number, number]; z: [number, number] };
}

function envBoxOf(config: PhotoSceneConfig): EnvBox | null {
  if (!config.envBox) return null;
  const [x0, y0, x1, y1] = config.envBox.rect;
  const [z0, z1] = config.envBox.z;
  const [px, py, ph] = config.probe;
  return { probe: new THREE.Vector3(px, ph, py), min: new THREE.Vector3(x0, z0, y0), max: new THREE.Vector3(x1, z1, y1) };
}

interface LightmapMeta {
  encoding: 'rgbm';
  range: number;
}

interface Meta {
  /** Pipeline antigo (build_scene.py): lightmap gama 2.2 normalizado por k. */
  k_arch?: number;
  k_furn?: number;
  /** M3 (master_scene.py --export): lightmaps RGBM lineares + calibração do tour. */
  source?: string;
  lm_arch?: LightmapMeta;
  lm_furn?: LightmapMeta;
  tour?: { exposure?: number; whiteBalance?: [number, number, number]; background?: number; envIntensity?: number };
}

/** RGBM linear (cena-mestra): irradiância = rgb · a · faixa. */
function rgbmChunk(range: number) {
  return THREE.ShaderChunk.lights_fragment_maps.replace(
    'iblIrradiance += getIBLIrradiance( geometryNormal );',
    '/* irradiância difusa vem do lightmap */',
  ).replace(
    'lightMapTexel.rgb * lightMapIntensity',
    `lightMapTexel.rgb * lightMapTexel.a * ${range.toFixed(3)} * lightMapIntensity`,
  );
}

const KEEP_IBL_SPECULAR = THREE.ShaderChunk.lights_fragment_maps.replace(
  'iblIrradiance += getIBLIrradiance( geometryNormal );',
  '/* irradiância difusa vem do lightmap */',
).replace(
  'lightMapTexel.rgb * lightMapIntensity',
  // leve correção de balanço de branco (luz do dia de interior, mais quente)
  'lightMapTexel.rgb * lightMapIntensity * vec3( 1.06, 1.0, 0.92 )',
);

/** Ajuste fino de materiais no tour (sem novo bake). Chave = nome do material no glTF. */
const LEGACY_MATERIAL_TUNING: Record<string, (m: THREE.MeshStandardMaterial) => void> = {
  // inox escovado: textura de origem escura demais para um eletrodoméstico
  steel: (m) => {
    m.color.setRGB(2.1, 2.1, 2.15);
    m.roughness = 0.85;
  },
  // tinta off-white levemente mais quente
  paint: (m) => m.color.setRGB(1.03, 1.0, 0.96),
};

/**
 * Materiais da cena-mestra que o glTF não descreve como no Cycles.
 *  - voile (cortinas): no Cycles é tecido translúcido iluminado por trás; o glTF exporta só o
 *    sheen e a cortina ficava opaca e cinza. Aqui: translúcida, sem escrever profundidade.
 */
function tuneMasterMaterial(m: THREE.MeshStandardMaterial) {
  if (m.userData.masterTuned) return;
  m.userData.masterTuned = true;
  if (m.name === 'voile') {
    m.transparent = true;
    m.opacity = 0.5;
    m.depthWrite = false;
    m.side = THREE.DoubleSide;
    m.emissive.setRGB(0.55, 0.56, 0.57); // luz do dia atravessando o tecido (não há lightmap nas cortinas)
  }
}

/**
 * Calibração do tour contra o render do Cycles: valores do meta.json (gravados pelo pipeline)
 * com sobreposição por URL para ajuste rápido sem novo build: ?exp=, ?wb=r,g,b, ?bg=, ?env=.
 */
function tourTuning(meta: Meta): NonNullable<Meta['tour']> {
  const q = new URLSearchParams(window.location.search);
  const t = { ...(meta.tour ?? {}) };
  if (q.get('exp')) t.exposure = Number(q.get('exp'));
  if (q.get('bg')) t.background = Number(q.get('bg'));
  if (q.get('env')) t.envIntensity = Number(q.get('env'));
  const wb = q.get('wb')?.split(',').map(Number);
  if (wb?.length === 3) t.whiteBalance = wb as [number, number, number];
  return t;
}

/**
 * Lightmaps via ImageBitmap SEM pré-multiplicação de alfa: no RGBM o alfa é o multiplicador de
 * intensidade (valores baixos); a decodificação padrão de <img> pré-multiplica e destrói a precisão
 * das cores nas áreas de alfa baixo (manchas na laca, no piso e nas portas).
 */
function useLightmaps(urls: [string, string]): [THREE.Texture, THREE.Texture] {
  const bitmaps = useLoader(THREE.ImageBitmapLoader, urls, (loader) => {
    (loader as THREE.ImageBitmapLoader).setOptions({ premultiplyAlpha: 'none', colorSpaceConversion: 'none', imageOrientation: 'none' });
  }) as ImageBitmap[];
  return useMemo(() => bitmaps.map((b) => new THREE.Texture(b)) as [THREE.Texture, THREE.Texture], [bitmaps]);
}

function prepareLightmap(t: THREE.Texture, linear: boolean) {
  t.flipY = false;
  t.premultiplyAlpha = false;
  t.colorSpace = linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.channel = 1;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
}

/**
 * Prévia publicada como artifact (VITE_PACKED=1): o .glb vem em partes de texto
 * base64 e é remontado como Blob no navegador. No deploy normal, usa o .glb direto.
 */
function useModelUrl(base: string, tier: string): string {
  const direct = `${base}/${tier}/apto.glb`;
  return suspend(async () => {
    if (import.meta.env.VITE_PACKED !== '1') return direct;
    const { parts } = (await (await fetch(`${base}/${tier}/pack.json`)).json()) as { parts: number };
    const texts = await Promise.all(
      Array.from({ length: parts }, (_, i) => fetch(`${base}/${tier}/apto.part${i}.txt`).then((r) => r.text())),
    );
    const bin = atob(texts.join(''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'model/gltf-binary' }));
  }, ['photo-model', base, tier]);
}

export function PhotoApartment({
  config,
  tier,
  showCeiling,
}: {
  config: PhotoSceneConfig;
  tier: 'desktop' | 'mobile';
  showCeiling: boolean;
}) {
  const base = config.baseUrl;
  const metaText = useLoader(THREE.FileLoader, `${base}/meta.json`) as string;
  const meta = useMemo(() => JSON.parse(metaText) as Meta, [metaText]);
  const gltf = useGLTF(useModelUrl(base, tier), false, true);
  const [lmArch, lmFurn] = useLightmaps([`${base}/${tier}/lm_arch.webp`, `${base}/${tier}/lm_furn.webp`]);
  const ceilings = useRef<THREE.Object3D[]>([]);
  const tune = useMemo(() => tourTuning(meta), [meta]);
  const box = useMemo(() => envBoxOf(config), [config]);
  // Balanço de branco global (antes do AgX), como no render do Blender. O pipeline antigo usa o
  // ajuste embutido no lightmap (KEEP_IBL_SPECULAR).
  useMemo(() => setWhiteBalance(meta.source ? (tune.whiteBalance ?? [1, 1, 1]) : [1, 1, 1]), [meta, tune]);

  useMemo(() => {
    prepareLightmap(lmArch, !!meta.lm_arch);
    prepareLightmap(lmFurn, !!meta.lm_furn);
  }, [lmArch, lmFurn, meta.lm_arch, meta.lm_furn]);

  // Associa lightmaps por grupo (userData.lightmap vem dos "extras" do glTF).
  useLayoutEffect(() => {
    const clones = new Map<string, THREE.Material>();
    const list: THREE.Object3D[] = [];
    gltf.scene.traverse((o) => {
      if (o.userData.ceiling) list.push(o);
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      // O GLTFLoader do three-stdlib nomeia TEXCOORD_1 como `uv2`; o Three r170 usa `uv1`.
      const geo = mesh.geometry;
      if (!geo.getAttribute('uv1') && geo.getAttribute('uv2')) geo.setAttribute('uv1', geo.getAttribute('uv2'));
      // Malhas com vários materiais viram um grupo: os "extras" ficam no nó pai.
      const group = (mesh.userData.lightmap || mesh.parent?.userData.lightmap || undefined) as 'arch' | 'furn' | undefined;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (std.isMeshStandardMaterial && !std.userData.tuned) {
          if (!meta.source) LEGACY_MATERIAL_TUNING[std.name]?.(std);
          std.userData.tuned = true;
        }
        if (std.isMeshStandardMaterial && meta.source) tuneMasterMaterial(std);
        if (!group || !std.isMeshStandardMaterial) {
          std.envMapIntensity = tune.envIntensity ?? 1;
          if (box && std.isMeshStandardMaterial && !std.userData.bp) {
            std.userData.bp = true;
            std.onBeforeCompile = (shader) => applyBoxProjection(shader, box);
            std.customProgramCacheKey = () => 'bp';
          }
          return std;
        }
        const key = `${std.uuid}:${group}`;
        let c = clones.get(key) as THREE.MeshStandardMaterial | undefined;
        if (!c) {
          c = std.clone();
          c.lightMap = group === 'arch' ? lmArch : lmFurn;
          const lm = group === 'arch' ? meta.lm_arch : meta.lm_furn;
          const chunk = lm ? rgbmChunk(lm.range) : KEEP_IBL_SPECULAR;
          if (lm) {
            c.lightMapIntensity = Math.PI; // bake difuso do Cycles = irradiância/π por unidade de albedo
          } else {
            const k = (group === 'arch' ? meta.k_arch : meta.k_furn) ?? 1;
            c.lightMapIntensity = Math.PI / k;
          }
          c.envMapIntensity = tune.envIntensity ?? 1;
          c.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', chunk);
            if (box) applyBoxProjection(shader, box);
          };
          c.customProgramCacheKey = () => (lm ? 'lightmapped-rgbm' : 'lightmapped') + (box ? '-bp' : '');
          clones.set(key, c);
        }
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
    });
    ceilings.current = list;
    (window as unknown as { __photo?: THREE.Object3D }).__photo = gltf.scene;
    // Depuração: ?lm=1 mostra apenas o lightmap.
    if (new URLSearchParams(window.location.search).get('lm') === '1') {
      gltf.scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const g = mesh.userData.lightmap || mesh.parent?.userData.lightmap;
        if (mesh.isMesh && g) {
          const t = g === 'arch' ? lmArch : lmFurn;
          const mb = new THREE.MeshBasicMaterial({ map: t });
          mesh.material = mb;
        }
      });
    }
  }, [gltf, lmArch, lmFurn, meta, tune, box]);

  useEffect(() => {
    for (const c of ceilings.current) c.visible = showCeiling;
  }, [showCeiling, gltf]);

  return <primitive object={gltf.scene} />;
}

/** Céu de fundo (visto pelas aberturas) + cubemap de reflexos capturado na sala. */
export function PhotoEnvironment({ config, exposure }: { config: PhotoSceneConfig; exposure: number }) {
  const sky = useTexture(`${config.baseUrl}/ceu.jpg`);
  const metaText = useLoader(THREE.FileLoader, `${config.baseUrl}/meta.json`) as string;
  const meta = useMemo(() => JSON.parse(metaText) as Meta, [metaText]);
  const { gl, scene } = useThree();
  const captured = useRef(0);
  const tune = useMemo(() => tourTuning(meta), [meta]);
  const exp = tune.exposure ?? exposure;
  const bg = tune.background ?? 1.6;

  useLayoutEffect(() => {
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky;
    scene.backgroundIntensity = bg;
    // Com scene.environment, a intensidade dos reflexos é da cena (envMapIntensity só vale com material.envMap).
    scene.environmentIntensity = tune.envIntensity ?? 1;
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = exp;
  }, [sky, scene, gl, exp, bg, tune]);

  // Limpeza apenas ao sair da cena fotorrealista.
  useEffect(
    () => () => {
      scene.background = null;
      scene.environment?.dispose();
      scene.environment = null;
    },
    [scene],
  );

  // Captura o ambiente (com os lightmaps já aplicados) alguns quadros após montar e gera o PMREM.
  useFrame(() => {
    if (captured.current > 3) return;
    captured.current++;
    if (captured.current !== 3) return;
    const [x, y, h] = config.probe;
    const prev = scene.environment;
    scene.environment = null;
    // fromScene captura a partir da origem: desloca a cena para que a origem caia no ponto de captura.
    scene.position.set(-x, -h, -y);
    scene.updateMatrixWorld(true);
    const pmrem = new THREE.PMREMGenerator(gl);
    const rt = pmrem.fromScene(scene, 0.02, 0.05, 60);
    pmrem.dispose();
    scene.position.set(0, 0, 0);
    scene.updateMatrixWorld(true);
    scene.environment = rt.texture;
    prev?.dispose?.();
  });

  return null;
}
