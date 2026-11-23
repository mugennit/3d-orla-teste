"""
M3 — Exportação da cena-mestra (master_scene.py) para o tour em Three.js.

Chamado por master_scene.py com --export. Mantém a cena-mestra como fonte única:
mesma geometria, mesmos modelos, texturas e luz. Etapas:

 1. limpeza para tempo real (objetos só de render saem; o hall provisório fica, sem colisão);
 2. materiais "achatados" para glTF: cadeias procedurais (ruído de variação, mapas derivados)
    viram a textura de imagem de origem ou um valor constante; coat, sheen, anisotropia,
    transmissão e IOR seguem como extensões KHR;
 3. bake difuso (direto + indireto) em UV2 por grupo (arch / furn), denoise OIDN, gravado em
    RGBM (faixa dinâmica 0..RGBM_RANGE, sem o corte por percentil do pipeline antigo);
 4. céu equirretangular visto pelas aberturas (mesma atenuação de câmera do render);
 5. glTF binário + bake_meta.json em .cache/build/ → pipeline/optimize.mjs.

Uso:
  PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/master_scene.py -- --export [--lm 1024] [--lm-samples 48] [--no-bake]
"""
import json
import os

import bmesh
import bpy
import numpy as np

import build_scene as B

ARGS = B.ARGS
LM = int(ARGS[ARGS.index('--lm') + 1]) if '--lm' in ARGS else 1024
LM_FURN = int(ARGS[ARGS.index('--lm-furn') + 1]) if '--lm-furn' in ARGS else LM
LM_FLOOR = int(ARGS[ARGS.index('--lm-floor') + 1]) if '--lm-floor' in ARGS else LM
LM_CEIL = int(ARGS[ARGS.index('--lm-ceil') + 1]) if '--lm-ceil' in ARGS else max(LM // 2, 512)
LM_SAMPLES = int(ARGS[ARGS.index('--lm-samples') + 1]) if '--lm-samples' in ARGS else 48
DO_BAKE = '--no-bake' not in ARGS
RGBM_RANGE = 8.0
DECIMATE_ABOVE = 60000
BUILD = B.BUILD

PASSTHROUGH = {'MIX', 'MIX_RGB', 'MATH', 'MAP_RANGE', 'HUE_SAT', 'BRIGHTCONTRAST', 'GAMMA', 'INVERT',
               'SEPARATE_COLOR', 'SEPARATE_RGB', 'RGBTOBW', 'VALTORGB', 'CURVE_RGB', 'MAPPING', 'BUMP', 'NORMAL_MAP'}


def _upstream_image(sock, depth=0):
    """Primeira textura de imagem a montante de um socket (atravessando nós de ajuste)."""
    if depth > 8 or not sock.is_linked:
        return None
    n = sock.links[0].from_node
    if n.type == 'TEX_IMAGE':
        return n
    if n.type not in PASSTHROUGH:
        return None
    for i in n.inputs:
        if i.type in ('RGBA', 'VALUE', 'VECTOR') and i.is_linked:
            r = _upstream_image(i, depth + 1)
            if r:
                return r
    return None


def _direct_ok(sock, kinds):
    """Ligação que o exportador glTF entende (imagem direta, ou Normal Map ← imagem)."""
    if not sock.is_linked:
        return True
    n = sock.links[0].from_node
    if n.type == 'TEX_IMAGE' and 'img' in kinds:
        return True
    if n.type == 'NORMAL_MAP' and 'nmap' in kinds:
        return n.inputs['Color'].is_linked and n.inputs['Color'].links[0].from_node.type == 'TEX_IMAGE'
    if n.type == 'SEPARATE_COLOR' and 'sep' in kinds:
        return n.inputs[0].is_linked and n.inputs[0].links[0].from_node.type == 'TEX_IMAGE'
    return False


def flatten_materials(report):
    for m in bpy.data.materials:
        if not m.node_tree:
            continue
        nt = m.node_tree
        b = next((n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not b:
            continue
        changes = []
        for name, kinds, fallback in (('Base Color', ('img',), None), ('Roughness', ('img', 'sep'), None),
                                      ('Metallic', ('img', 'sep'), None), ('Normal', ('nmap',), 'drop'),
                                      ('Coat Normal', ('nmap',), 'drop'), ('Alpha', ('img', 'sep'), None),
                                      ('Emission Color', ('img',), None)):
            s = b.inputs.get(name)
            if not s or not s.is_linked or _direct_ok(s, kinds):
                continue
            img = _upstream_image(s)
            if name in ('Normal', 'Coat Normal'):
                # Mantém um Normal Map com imagem a montante; descarta relevo procedural (Bump/ruído).
                nm = None
                n = s.links[0].from_node
                while n is not None and n.type == 'BUMP':
                    nxt = n.inputs['Normal']
                    n = nxt.links[0].from_node if nxt.is_linked else None
                if n is not None and n.type == 'NORMAL_MAP':
                    nm = n
                nt.links.remove(s.links[0])
                if nm and nm.inputs['Color'].is_linked and nm.inputs['Color'].links[0].from_node.type == 'TEX_IMAGE':
                    nt.links.new(nm.outputs['Normal'], s)
                    changes.append(f'{name}: bump procedural removido')
                else:
                    changes.append(f'{name}: removido')
                continue
            nt.links.remove(s.links[0])
            if name == 'Metallic':
                img = None  # cadeias derivadas (ex.: canal × fator) → constante (nenhum destes é metal)
            if img and name == 'Alpha':
                nt.links.new(img.outputs['Alpha'], s)
                changes.append(f'{name}: ← alfa de {img.image.name if img.image else "?"}')
            elif img:
                nt.links.new(img.outputs['Color'], s)
                changes.append(f'{name}: ← {img.image.name if img.image else "?"}')
            else:
                changes.append(f'{name}: constante {s.default_value if s.type == "VALUE" else tuple(round(v, 3) for v in s.default_value)}')
        if changes:
            report[m.name] = changes


def prepare_scene():
    """Objetos que não vão para o tour e marcas para o Three.js."""
    for o in list(bpy.data.objects):
        if o.type == 'CAMERA' and o.name.startswith('CAM_'):
            bpy.data.objects.remove(o)
    # Vidros e flores fora do bake de luz (transparentes), como no pipeline do tour.
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        if o.name.startswith('ENTORNO_'):
            o['provisorio'] = True
            o['lightmap'] = 'arch'  # recebe luz do bake (vista pela porta), sem colisão no tour
        if o.name.startswith(('DEC_vaso_vidro', 'DEC_flores', 'VIDROS')) or 'cortina' in o.name:
            o['lightmap'] = ''
        # Decoração pequena (livros, vasos, plantas, fruteira, tábua…): fora do atlas de móveis, onde
        # virava milhares de ilhas minúsculas e roubava resolução das superfícies grandes. No tour,
        # recebe a luz do ambiente capturado (irradiância do cubemap).
        if o.name.startswith('DEC_'):
            o['lightmap'] = ''
        # Paredes: vértices soldados e faces coplanares dissolvidas antes da UV do lightmap. As paredes
        # eram montadas em faixas de altura (peitoril, verga) sem vértices compartilhados: cada faixa
        # virava uma ilha e apareciam faixas/emendas horizontais (ex.: acima das janelas dos quartos).
        if o.name == 'ARQ_paredes':
            bm = bmesh.new()
            bm.from_mesh(o.data)
            n0 = len(bm.faces)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)
            bmesh.ops.dissolve_limit(bm, angle_limit=0.0175, verts=bm.verts, edges=bm.edges)
            bm.to_mesh(o.data)
            print(f'[export] paredes: {n0} → {len(bm.faces)} faces (soldadas e coplanares unidas)', flush=True)
            bm.free()
        # Malhas muito densas (tapete com relevo deslocado, plantas): decimação para tempo real.
        # O relevo fino continua no mapa de normais; a silhueta é preservada.
        tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
        if tris > DECIMATE_ABOVE:
            m = o.modifiers.new('rt_decimate', 'DECIMATE')
            m.ratio = max(DECIMATE_ABOVE / tris, 0.3)
            bpy.context.view_layer.objects.active = o
            for x in bpy.context.view_layer.objects:
                x.select_set(x == o)
            bpy.ops.object.modifier_apply(modifier=m.name)
            print(f'[export] decimado {o.name}: {tris} → {sum(len(p.vertices) - 2 for p in o.data.polygons)} tri', flush=True)


def write_rgbm(a, name):
    """RGBM 8 bits (PNG RGBA): rgb = c / (m * R), m = max(c)/R quantizado para cima. Linear."""
    c = np.clip(a / RGBM_RANGE, 0, 1)
    m = np.clip(np.max(c, axis=2, keepdims=True), 1e-6, 1)
    m = np.ceil(m * 255) / 255
    rgb = np.clip(c / m, 0, 1)
    out = np.dstack([rgb, m])
    h, w, _ = out.shape
    img = bpy.data.images.new(name, w, h, alpha=True, float_buffer=False)
    img.colorspace_settings.name = 'Non-Color'
    img.pixels.foreach_set(out.astype(np.float32).ravel())
    path = os.path.join(BUILD, name + '.png')
    img.filepath_raw = path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)
    return path


def bake_all(meta):
    sc = bpy.context.scene
    sc.cycles.samples = LM_SAMPLES
    sc.cycles.use_denoising = False
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 6
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 8
    # Sem cáusticas no bake: a luz rebatida por inox/verniz virava manchas e estrias no lightmap
    # difuso (pareciam reflexos "pintados" na laca e no piso). Os reflexos reais ficam no tempo real.
    sc.cycles.caustics_reflective = False
    sc.cycles.caustics_refractive = False
    sc.cycles.blur_glossy = 1.0
    hidden = [o for o in bpy.data.objects if o.type == 'MESH' and (o.name.startswith(('VIDROS', 'DEC_vaso_vidro')))]
    for o in hidden:
        o.hide_render = True  # vidro não bloqueia a luz no bake
    for group, size in (('arch', LM), ('floor', LM_FLOOR), ('ceil', LM_CEIL), ('furn', LM_FURN)):
        img = B.bake_group(group, size)
        dn = B.denoise(img)
        np.save(os.path.join(BUILD, f'lm_{group}_hdr.npy'), dn.astype(np.float16))
        write_rgbm(dn, f'lm_{group}')
        meta[f'lm_{group}'] = dict(size=size, encoding='rgbm', range=RGBM_RANGE,
                                   p50=float(np.percentile(B.lum(dn), 50)), p99=float(np.percentile(B.lum(dn), 99)))
        print(f'[bake] {group} {size}px ok {meta[f"lm_{group}"]}', flush=True)
    for o in hidden:
        o.hide_render = False
    for m in bpy.data.materials:
        if m.node_tree and 'LM_TARGET' in m.node_tree.nodes:
            m.node_tree.nodes.remove(m.node_tree.nodes['LM_TARGET'])


def export(exposure, white_balance, cameras):
    os.makedirs(BUILD, exist_ok=True)
    meta = {'source': 'master_scene', 'quality': f'lm{LM}/{LM_FLOOR}/{LM_CEIL}/{LM_FURN}-s{LM_SAMPLES}', 'exposure': exposure,
            'white_balance': white_balance}
    prepare_scene()
    report = {}
    flatten_materials(report)
    json.dump(report, open(os.path.join(BUILD, 'materials_flatten.json'), 'w'), indent=1, ensure_ascii=False)
    print(f'[export] materiais ajustados: {len(report)}', flush=True)
    if DO_BAKE:
        bake_all(meta)
        B.render_sky()
    for o in bpy.context.view_layer.objects:
        o.select_set(o.type == 'MESH' and not o.hide_render and not o.get('occluder'))
    bpy.ops.export_scene.gltf(filepath=os.path.join(BUILD, 'apto.glb'), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_extras=True, export_texcoords=True,
                              export_normals=True, export_tangents=True, export_materials='EXPORT',
                              export_image_format='AUTO', export_lights=False, export_cameras=False)
    json.dump(meta, open(os.path.join(BUILD, 'bake_meta.json'), 'w'), indent=1)
    json.dump(cameras, open(os.path.join(BUILD, 'cameras.json'), 'w'), indent=1)
    credits = json.load(open(os.path.join(B.ASSETS, 'credits.json')))
    used = {k: v for k, v in credits.items() if k in B.USED or k.startswith('Sketchfab:')}
    json.dump(used, open(os.path.join(BUILD, 'credits_used.json'), 'w'), indent=1, ensure_ascii=False)
    print('[export] concluído', meta, flush=True)
