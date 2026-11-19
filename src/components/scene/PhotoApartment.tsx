import { useGLTF, useTexture } from '@react-three/drei';
import { useFrame, useLoader, useThree } from '@react-three/fiber';
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

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
}

interface Meta {
  k_arch?: number;
  k_furn?: number;
}

const KEEP_IBL_SPECULAR = THREE.ShaderChunk.lights_fragment_maps.replace(
  'iblIrradiance += getIBLIrradiance( geometryNormal );',
  '/* irradiância difusa vem do lightmap */',
);

function prepareLightmap(t: THREE.Texture) {
  t.flipY = false;
  t.colorSpace = THREE.SRGBColorSpace;
  t.channel = 1;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 4;
  t.needsUpdate = true;
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
  const meta = JSON.parse(useLoader(THREE.FileLoader, `${base}/meta.json`) as string) as Meta;
  const gltf = useGLTF(`${base}/${tier}/apto.glb`, false, true);
  const [lmArch, lmFurn] = useTexture([`${base}/${tier}/lm_arch.webp`, `${base}/${tier}/lm_furn.webp`]) as [
    THREE.Texture,
    THREE.Texture,
  ];
  const ceilings = useRef<THREE.Object3D[]>([]);

  useMemo(() => {
    prepareLightmap(lmArch);
    prepareLightmap(lmFurn);
  }, [lmArch, lmFurn]);

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
      const group = mesh.userData.lightmap as 'arch' | 'furn' | undefined;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const next = mats.map((m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (!group || !std.isMeshStandardMaterial) {
          std.envMapIntensity = 1;
          return std;
        }
        const key = `${std.uuid}:${group}`;
        let c = clones.get(key) as THREE.MeshStandardMaterial | undefined;
        if (!c) {
          c = std.clone();
          c.lightMap = group === 'arch' ? lmArch : lmFurn;
          const k = (group === 'arch' ? meta.k_arch : meta.k_furn) ?? 1;
          c.lightMapIntensity = Math.PI / k;
          c.envMapIntensity = 1;
          c.onBeforeCompile = (shader) => {
            shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_maps>', KEEP_IBL_SPECULAR);
          };
          c.customProgramCacheKey = () => 'lightmapped';
          clones.set(key, c);
        }
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
    });
    ceilings.current = list;
  }, [gltf, lmArch, lmFurn, meta.k_arch, meta.k_furn]);

  useEffect(() => {
    for (const c of ceilings.current) c.visible = showCeiling;
  }, [showCeiling, gltf]);

  return <primitive object={gltf.scene} />;
}

/** Céu de fundo (visto pelas aberturas) + cubemap de reflexos capturado na sala. */
export function PhotoEnvironment({ config, exposure }: { config: PhotoSceneConfig; exposure: number }) {
  const sky = useTexture(`${config.baseUrl}/ceu.jpg`);
  const { gl, scene } = useThree();
  const captured = useRef(0);
  const target = useMemo(() => new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType }), []);
  const cubeCam = useMemo(() => new THREE.CubeCamera(0.05, 60, target), [target]);

  useLayoutEffect(() => {
    sky.mapping = THREE.EquirectangularReflectionMapping;
    sky.colorSpace = THREE.SRGBColorSpace;
    scene.background = sky;
    scene.backgroundIntensity = 1.6;
    gl.toneMapping = THREE.AgXToneMapping;
    gl.toneMappingExposure = exposure;
    return () => {
      scene.background = null;
      scene.environment = null;
    };
  }, [sky, scene, gl, exposure]);

  // Captura o ambiente depois que a cena está montada (2 quadros) e gera o PMREM.
  useFrame(() => {
    if (captured.current > 2) return;
    captured.current++;
    if (captured.current !== 2) return;
    const [x, y, h] = config.probe;
    cubeCam.position.set(x, h, y);
    const prevEnv = scene.environment;
    scene.environment = null;
    cubeCam.update(gl, scene);
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromCubemap(target.texture).texture;
    pmrem.dispose();
    scene.environment = env;
    prevEnv?.dispose?.();
  });

  return null;
}
