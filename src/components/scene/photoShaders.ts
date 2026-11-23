import * as THREE from 'three';

/**
 * Ajustes de shader da cena fotorrealista (M3).
 *
 * 1. Reflexos com projeção em caixa (box projection / correção de paralaxe): o cubemap é
 *    capturado em um ponto da sala; sem correção, todo reflexo é tratado como "infinitamente
 *    distante" e aparece deslocado (piso e laca pareciam espelhos de outro ambiente). Com a
 *    caixa do ambiente (paredes, piso e teto da sala/cozinha), a direção refletida é intersectada
 *    com a caixa e o reflexo cai no lugar certo, como nas sondas de reflexo do Cycles/Eevee.
 * 2. Balanço de branco global antes do AgX, como o "White Balance" do Blender (8000 K), aplicado
 *    a tudo que a câmera vê (lightmaps, reflexos, céu).
 */

export interface EnvBox {
  /** Centro de captura do cubemap (coordenadas Three: x, altura, y da planta). */
  probe: THREE.Vector3;
  min: THREE.Vector3;
  max: THREE.Vector3;
}

const BOX_FN = /* glsl */ `
varying vec3 vBpWorld;
vec3 bpProject( vec3 dir ) {
  vec3 bmin = BP_MIN; vec3 bmax = BP_MAX;
  // Fora da caixa (outros cômodos), usa o reflexo sem correção.
  if ( any( lessThan( vBpWorld, bmin - 0.05 ) ) || any( greaterThan( vBpWorld, bmax + 0.05 ) ) ) return dir;
  vec3 n = normalize( dir );
  vec3 t1 = ( bmax - vBpWorld ) / n;
  vec3 t2 = ( bmin - vBpWorld ) / n;
  vec3 tf = max( t1, t2 );
  float t = min( min( tf.x, tf.y ), tf.z );
  return vBpWorld + n * t - BP_PROBE;
}
`;

const v3 = (v: THREE.Vector3) => `vec3( ${v.x.toFixed(4)}, ${v.y.toFixed(4)}, ${v.z.toFixed(4)} )`;

/** Trecho de envmap_physical_pars_fragment com o reflexo projetado na caixa. */
function envChunk(box: EnvBox) {
  const src = THREE.ShaderChunk.envmap_physical_pars_fragment;
  const target = 'reflectVec = inverseTransformDirection( reflectVec, viewMatrix );';
  if (!src.includes(target)) return src; // versão do Three diferente: mantém o padrão
  return (
    BOX_FN.replace('BP_MIN', v3(box.min)).replace('BP_MAX', v3(box.max)).replace('BP_PROBE', v3(box.probe)) +
    src.replace(target, `${target}\n\t\t\treflectVec = bpProject( reflectVec );`)
  );
}

/** Aplica a projeção em caixa ao shader (vertex: posição de mundo; fragment: reflexo). */
export function applyBoxProjection(shader: THREE.WebGLProgramParametersWithUniforms, box: EnvBox) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vBpWorld;')
    .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBpWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
  shader.fragmentShader = shader.fragmentShader.replace('#include <envmap_physical_pars_fragment>', envChunk(box));
}

let wbApplied = '';
const AGX_ORIGINAL = THREE.ShaderChunk.tonemapping_pars_fragment;

/** Balanço de branco antes do AgX (global; recompila os materiais quando muda). */
export function setWhiteBalance(wb: [number, number, number], look = 1) {
  const key = wb.join(',') + '|' + look;
  if (key === wbApplied) return false;
  wbApplied = key;
  let chunk = AGX_ORIGINAL.replace(
    'vec3 AgXToneMapping( vec3 color ) {',
    `vec3 AgXToneMapping( vec3 color ) {\n\tcolor *= vec3( ${wb.map((v) => v.toFixed(4)).join(', ')} );`,
  );
  // "Look" de contraste do AgX (ASC CDL, como os looks do Blender): potência após a sigmoide.
  if (look !== 1) {
    chunk = chunk.replace(
      'color = agxDefaultContrastApprox( color );',
      `color = agxDefaultContrastApprox( color );\n\tcolor = pow( max( color, vec3( 0.0 ) ), vec3( ${look.toFixed(3)} ) );`,
    );
  }
  THREE.ShaderChunk.tonemapping_pars_fragment = chunk;
  return true;
}
