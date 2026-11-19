"""
Constrói a cena fotorrealista no Blender (sem interface) a partir do layout aprovado.

  PYTHONPATH=/opt/bpy python3 pipeline/build_scene.py [--quality preview|final] [--no-bake]

Entradas : .cache/build/layout.json  (pipeline/export_layout.ts)
           .cache/assets/...         (pipeline/fetch_assets.py — Poly Haven / ambientCG, CC0)
Saídas   : .cache/build/apto.glb, .cache/build/lm_arch.png, lm_furn.png, sky.jpg, scene.blend

Coordenadas: planta (x, y↓) → Blender (x, −y, z). O exportador glTF converte para Y-up,
resultando em (x, z, y) no Three.js — o mesmo sistema do tour.
"""
import bpy  # noqa: I001 — bpy precisa vir antes de bmesh/mathutils
import bmesh
import json
import math
import os
import random
import sys

import numpy as np
from mathutils import Matrix, Vector

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(REPO, '.cache', 'assets')
BUILD = os.path.join(REPO, '.cache', 'build')
TEX = os.path.join(BUILD, 'tex')
os.makedirs(TEX, exist_ok=True)

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else sys.argv[1:]
QUALITY = ARGS[ARGS.index('--quality') + 1] if '--quality' in ARGS else 'preview'
DO_BAKE = '--no-bake' not in ARGS
Q = {
    'preview': dict(lm=1024, samples=48, tex='1k'),
    'final': dict(lm=2048, samples=160, tex='2k'),
}[QUALITY]

L = json.load(open(os.path.join(BUILD, 'layout.json')))
H = L['ceilingHeight']
random.seed(7)


def V(x, y, z=0.0):
    return Vector((x, -y, z))


# =============================================================================
# Texturas: pré-processamento (tingimento/ajustes) com numpy, salvas em PNG/JPG
# para que o glTF exporte nós simples (imagem → canal).
# =============================================================================

USED = set()


def tex_path(kind, asset, name):
    USED.add(('Poly Haven' if kind == 'ph' else 'ambientCG') + ':' + asset)
    d = os.path.join(ASSETS, kind, asset)
    for f in sorted(os.listdir(d)):
        if name.lower() in f.lower():
            return os.path.join(d, f)
    raise FileNotFoundError(f'{asset}:{name}')


def load_np(path):
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return img, a.reshape(h, w, 4)


def save_np(arr, name, colorspace='sRGB', fmt='JPEG'):
    h, w, _ = arr.shape
    img = bpy.data.images.new(name, w, h, alpha=False, float_buffer=False)
    img.pixels.foreach_set(np.clip(arr, 0, 1).astype(np.float32).ravel())
    path = os.path.join(TEX, name + ('.jpg' if fmt == 'JPEG' else '.png'))
    img.filepath_raw = path
    img.file_format = fmt
    img.save()
    bpy.data.images.remove(img)
    return path


def processed(name, src, fn, colorspace='sRGB', fmt='JPEG'):
    """Gera (uma vez) uma textura derivada aplicando fn(rgb ndarray) → rgb."""
    out = os.path.join(TEX, name + ('.jpg' if fmt == 'JPEG' else '.png'))
    if os.path.exists(out):
        return out
    img, a = load_np(src)
    rgb = fn(a[..., :3].copy())
    res = np.dstack([rgb, np.ones(rgb.shape[:2], dtype=np.float32)])
    bpy.data.images.remove(img)
    return save_np(res, name, colorspace, fmt)


def lum(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def recolor(target, contrast=1.0, keep=0.0):
    """Mantém a variação de luminância da textura e aplica a cor-alvo (sRGB 0–1)."""
    t = np.array(target, dtype=np.float32)

    def fn(rgb):
        lu = lum(rgb)
        m = lu.mean()
        v = 1 + (lu - m) / max(m, 1e-3) * contrast
        out = t[None, None, :] * v[..., None]
        return out * (1 - keep) + rgb * keep
    return fn


def rough_fn(scale=1.0, offset=0.0):
    return lambda rgb: np.clip(rgb * scale + offset, 0, 1)


# =============================================================================
# Materiais (Principled BSDF exportável para glTF)
# =============================================================================
MATS = {}
TILE = {}  # tamanho do padrão (m) por material, para gerar UVs em metros


def image_node(nt, path, non_color=False, x=-600, y=0):
    n = nt.nodes.new('ShaderNodeTexImage')
    n.image = bpy.data.images.load(path, check_existing=True)
    if non_color:
        n.image.colorspace_settings.name = 'Non-Color'
    n.location = (x, y)
    return n


def make_mat(name, color=None, base=(0.8, 0.8, 0.8), normal=None, nstrength=1.0, rough=None,
             roughness=0.5, metallic=0.0, tile=1.0, emission=None, estrength=0.0, alpha=1.0,
             transmission=0.0, ior=1.45):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF')
    if color:
        nt.links.new(image_node(nt, color, y=300).outputs['Color'], bsdf.inputs['Base Color'])
    else:
        bsdf.inputs['Base Color'].default_value = (*base, 1)
    if rough:
        nt.links.new(image_node(nt, rough, True, y=0).outputs['Color'], bsdf.inputs['Roughness'])
    else:
        bsdf.inputs['Roughness'].default_value = roughness
    if normal:
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nm.inputs['Strength'].default_value = nstrength
        nt.links.new(image_node(nt, normal, True, y=-300).outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Metallic'].default_value = metallic
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*emission, 1)
        bsdf.inputs['Emission Strength'].default_value = estrength
    if alpha < 1:
        bsdf.inputs['Alpha'].default_value = alpha
        m.surface_render_method = 'BLENDED'
    if transmission:
        bsdf.inputs['Transmission Weight'].default_value = transmission
        bsdf.inputs['IOR'].default_value = ior
    MATS[name] = m
    TILE[name] = tile
    return m


def srgb(hexstr):
    h = hexstr.lstrip('#')
    return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(hexstr):
    return tuple(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in srgb(hexstr))


def build_materials():
    r = Q['tex']
    ph = lambda a, n: tex_path('ph', a, f'{n}_{r}')  # noqa: E731
    acg = lambda a, n: tex_path('acg', a, n)  # noqa: E731

    # Paredes: tinta acrílica fosca off-white, com microrrelevo do reboco.
    make_mat('paint', base=lin('#ebe7e0'), normal=ph('painted_plaster_wall', 'nor_gl'), nstrength=0.35,
             roughness=0.88, tile=2.0)
    make_mat('ceiling', base=lin('#f3f1ec'), roughness=0.92)
    # Porcelanato acetinado claro (variação sutil a partir do reboco pintado).
    make_mat('porcelain',
             color=processed(f'porcelain_{r}', ph('painted_plaster_wall', 'diff'), recolor(srgb('#d9d5ce'), 0.35)),
             normal=ph('painted_plaster_wall', 'nor_gl'), nstrength=0.08,
             rough=processed(f'porcelain_rough_{r}', ph('painted_plaster_wall', 'rough'), rough_fn(0.25, 0.22)),
             tile=0.6)
    make_mat('grout', base=lin('#b9b4ac'), roughness=0.9)
    make_mat('laminate', color=ph('laminate_floor_02', 'diff'), normal=ph('laminate_floor_02', 'nor_gl'),
             rough=ph('laminate_floor_02', 'rough'), tile=2.0)
    # Madeiras: carvalho claro (marcenaria da cozinha) e carvalho natural (rack/mesa).
    make_mat('oak_light',
             color=processed(f'oak_light2_{r}', ph('white_oak_veneer', 'diff'), recolor(srgb('#c9ab84'), 1.0, 0.2)),
             normal=ph('white_oak_veneer', 'nor_gl'), nstrength=0.5,
             rough=processed(f'oak_light_rough_{r}', ph('white_oak_veneer', 'rough'), rough_fn(0.8, 0.12)), tile=1.2)
    make_mat('oak_warm',
             color=processed(f'oak_warm_{r}', ph('oak_veneer_01', 'diff'), lambda x: np.clip(x * [0.93, 0.86, 0.80], 0, 1)),
             normal=ph('oak_veneer_01', 'nor_gl'), nstrength=0.5,
             rough=processed(f'oak_warm_rough_{r}', ph('oak_veneer_01', 'rough'), rough_fn(0.8, 0.1)), tile=1.2)
    make_mat('granite', color=processed('granite_beige', acg('Granite004B', 'Color'), lambda x: np.clip(x * 1.25 + 0.06, 0, 1)),
             normal=acg('Granite004B', 'NormalGL'), nstrength=0.25,
             rough=processed('granite_rough', acg('Granite004B', 'Roughness'), rough_fn(0.3, 0.12)), tile=0.8)
    make_mat('granite_dark', color=ph('granite_tile', 'diff'), normal=ph('granite_tile', 'nor_gl'), nstrength=0.3,
             roughness=0.3, tile=0.6)
    # Revestimento verde-azulado em peças verticais (metrô girado 90°).
    make_mat('backsplash',
             color=processed('backsplash_teal2', acg('Tiles032', 'Color'), recolor(srgb('#7c9fa1'), 0.75)),
             normal=acg('Tiles032', 'NormalGL'), nstrength=0.8,
             rough=processed('backsplash_rough', acg('Tiles032', 'Roughness'), rough_fn(0.6, 0.05)), tile=1.1)
    make_mat('lacquer_greige', base=lin('#cfcac1'), normal=acg('Fabric045', 'NormalGL'), nstrength=0.15,
             roughness=0.55, tile=0.4)
    make_mat('lacquer_white', base=lin('#efede8'), roughness=0.35)
    make_mat('ceramic_white', base=lin('#e9e6e0'), roughness=0.4)
    make_mat('glass_dark', base=lin('#2a2e30'), roughness=0.05)
    make_mat('steel', color=acg('Metal009', 'Color'), normal=acg('Metal009', 'NormalGL'), nstrength=0.3,
             rough=processed('steel_rough', acg('Metal009', 'Roughness'), rough_fn(0.5, 0.12)), metallic=1.0, tile=0.5)
    make_mat('chrome', base=lin('#d8d8d8'), roughness=0.08, metallic=1.0)
    make_mat('alu', base=lin('#c4c6c8'), roughness=0.32, metallic=1.0)
    make_mat('black_glass', base=lin('#0c0c0d'), roughness=0.06)
    make_mat('black_satin', base=lin('#1a1a1a'), roughness=0.45)
    make_mat('cast_iron', base=lin('#151515'), roughness=0.6, metallic=0.2)
    make_mat('linen_grey',
             color=processed('linen_grey', acg('Fabric045', 'Color'), recolor(srgb('#c9c6c0'), 0.6)),
             normal=acg('Fabric045', 'NormalGL'), nstrength=0.7, roughness=0.92, tile=0.25)
    make_mat('pillow_sage',
             color=processed('pillow_sage', acg('Fabric045', 'Color'), recolor(srgb('#8fa292'), 0.6)),
             normal=acg('Fabric045', 'NormalGL'), nstrength=0.7, roughness=0.95, tile=0.2)
    make_mat('pillow_ochre',
             color=processed('pillow_ochre', acg('Fabric045', 'Color'), recolor(srgb('#c49a62'), 0.6)),
             normal=acg('Fabric045', 'NormalGL'), nstrength=0.7, roughness=0.95, tile=0.2)
    make_mat('rug', color=processed('rug_woven', acg('Carpet014', 'Color'), recolor(srgb('#cdbfa8'), 0.9)),
             normal=acg('Carpet014', 'NormalGL'), nstrength=1.0, roughness=0.98, tile=0.35)
    make_mat('passepartout', base=lin('#f4f2ee'), roughness=0.9)
    make_mat('art_print', color=processed('art_print', acg('Travertine009', 'Color'),
                                          lambda x: np.clip((x - 0.5) * 1.15 + 0.55, 0, 1)), roughness=0.85, tile=1.0)
    make_mat('glass', base=(0.9, 0.95, 0.95), roughness=0.02, alpha=0.18)
    make_mat('led', base=(1, 0.9, 0.75), emission=(1.0, 0.82, 0.6), estrength=18.0, roughness=0.5)
    make_mat('slab', base=lin('#8d877e'), roughness=0.95)


# =============================================================================
# Geometria utilitária
# =============================================================================
COLL = {}


def coll(name):
    if name not in COLL:
        c = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(c)
        COLL[name] = c
    return COLL[name]


def world_uv(bm, tile, rot90=False, offset=(0.0, 0.0)):
    """UV em metros (projeção pela normal dominante de cada face) / tamanho do padrão."""
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = lp.vert.co
            if ax == 2:
                u, v = co.x, co.y
            elif ax == 0:
                u, v = co.y * (1 if n.x > 0 else -1), co.z
            else:
                u, v = co.x * (1 if n.y < 0 else -1), co.z
            if rot90:
                u, v = v, -u
            lp[uv].uv = (u / tile + offset[0], v / tile + offset[1])


def mesh_obj(name, bm, mat, group, props=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    if isinstance(mat, (list, tuple)):
        for mt in mat:
            me.materials.append(MATS[mt])
    else:
        me.materials.append(MATS[mat])
    ob = bpy.data.objects.new(name, me)
    coll(group).objects.link(ob)
    for k, v in (props or {}).items():
        ob[k] = v
    return ob


def bm_box(sx, sy, sz, center=(0, 0, 0), bevel=0.0, segments=2):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=bm.edges[:] + bm.verts[:], offset=min(bevel, min(sx, sy, sz) * 0.45),
                        segments=segments, affect='EDGES', profile=0.5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return bm


def box(name, mat, size, center, rotz=0.0, group='FURN', bevel=0.0, segments=2, props=None, uv_rot90=False,
        uv_offset=(0, 0)):
    """size/center em coordenadas Blender (m); rotz em rad em torno do centro."""
    bm = bm_box(*size, center=(0, 0, 0), bevel=bevel, segments=segments)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(rotz, 3, 'Z'))
    bmesh.ops.translate(bm, vec=Vector(center), verts=bm.verts)
    bm.normal_update()
    world_uv(bm, TILE.get(mat, 1.0), uv_rot90, uv_offset)
    return mesh_obj(name, bm, mat, group, props)


def plan_box(name, mat, x0, y0, x1, y1, z0, z1, **kw):
    """Caixa alinhada aos eixos a partir de um retângulo da planta (m)."""
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return box(name, mat, (abs(x1 - x0), abs(y1 - y0), z1 - z0), V(cx, cy, (z0 + z1) / 2), **kw)


def polygon_obj(name, poly, z, mat, group, flip=False, props=None):
    bm = bmesh.new()
    verts = [bm.verts.new(V(x, y, z)) for x, y in poly]
    f = bm.faces.new(verts)
    bm.normal_update()
    if (f.normal.z < 0) != flip:
        f.normal_flip()
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    world_uv(bm, TILE.get(mat, 1.0))
    return mesh_obj(name, bm, mat, group, props)


def join(objs, name):
    objs = [o for o in objs if o]
    if not objs:
        return None
    ctx = bpy.context
    for o in ctx.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    ctx.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    objs[0].name = name
    objs[0].data.name = name
    return objs[0]


def apply_subsurf(ob, levels=2):
    mod = ob.modifiers.new('sub', 'SUBSURF')
    mod.levels = levels
    mod.render_levels = levels
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)


# =============================================================================
# Arquitetura (todos os ambientes, pois define luz e sombra; detalhamento só na zona)
# =============================================================================

def wall_frame(w):
    fx, fy = w['from']
    tx, ty = w['to']
    ln = math.hypot(tx - fx, ty - fy)
    ux, uy = (tx - fx) / ln, (ty - fy) / ln
    return fx, fy, ux, uy, ln


GAP = 0.0007  # folga mínima entre peças encostadas: evita faces coincidentes (vazamento preto no lightmap)


def clean_walls(solids):
    """Gera as paredes como UMA malha sem sobreposições nem faces internas.

    `solids`: lista de (polígono shapely na planta, z0, z1). Para cada faixa de altura entre
    níveis consecutivos, une os polígonos sólidos naquela faixa e extruda só o contorno;
    faces horizontais apenas onde a parede começa/termina (topo de peitoril, fundo de verga).
    """
    from shapely.geometry import Polygon, MultiPolygon
    from shapely.geometry.polygon import orient
    from shapely.ops import unary_union
    from mathutils.geometry import tessellate_polygon

    levels = sorted({round(z, 4) for _, a, b in solids for z in (a, b)})
    bands = []
    for a, b in zip(levels[:-1], levels[1:]):
        polys = [poly for poly, z0, z1 in solids if z0 <= a + 1e-4 and z1 >= b - 1e-4]
        u = unary_union(polys).buffer(0) if polys else Polygon()
        bands.append((a, b, u.simplify(0.0003)))

    bm = bmesh.new()

    def parts(g):
        if g.is_empty:
            return []
        return list(g.geoms) if isinstance(g, MultiPolygon) or hasattr(g, 'geoms') else [g]

    def quad(p, q, z0, z1, out):
        vs = [bm.verts.new(V(p[0], p[1], z0)), bm.verts.new(V(q[0], q[1], z0)),
              bm.verts.new(V(q[0], q[1], z1)), bm.verts.new(V(p[0], p[1], z1))]
        f = bm.faces.new(vs)
        f.normal_update()
        if f.normal.dot(Vector((out[0], -out[1], 0))) < 0:
            f.normal_flip()

    def cap(poly, z, up):
        poly = orient(poly, 1.0)
        loops = [list(poly.exterior.coords)[:-1]] + [list(r.coords)[:-1] for r in poly.interiors]
        flat = [pt for lp in loops for pt in lp]
        tris = tessellate_polygon([[Vector((x, y, 0)) for x, y in lp] for lp in loops])
        vs = [bm.verts.new(V(x, y, z)) for x, y in flat]
        for t in tris:
            try:
                f = bm.faces.new([vs[i] for i in t])
            except ValueError:
                continue
            f.normal_update()
            if (f.normal.z > 0) != up:
                f.normal_flip()

    for a, b, u in bands:
        for poly in parts(u):
            poly = orient(poly, 1.0)  # exterior anti-horário, furos horário (coordenadas da planta)
            for ring in [poly.exterior, *poly.interiors]:
                c = list(ring.coords)
                for p, q in zip(c[:-1], c[1:]):
                    dx, dy = q[0] - p[0], q[1] - p[1]
                    if dx * dx + dy * dy < 1e-10:
                        continue
                    quad(p, q, a, b, (dy, -dx))
    # faces horizontais nas transições entre faixas (exceto piso e topo, nunca visíveis)
    for i in range(1, len(bands)):
        below, above, z = bands[i - 1][2], bands[i][2], bands[i][0]
        for poly in parts(below.difference(above).buffer(0)):
            if poly.area > 1e-6:
                cap(poly, z, up=True)
        for poly in parts(above.difference(below).buffer(0)):
            if poly.area > 1e-6:
                cap(poly, z, up=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0002)
    world_uv(bm, TILE['paint'])
    return mesh_obj('ARQ_paredes', bm, 'paint', 'ARCH')


def piece_polygon(p):
    from shapely.geometry import Polygon
    cx, cy = p['center']
    a = p['angle']
    ux, uy = math.cos(a), math.sin(a)
    nx, ny = -uy, ux
    hl, ht = p['length'] / 2, p['thickness'] / 2
    return Polygon([(cx + ux * sx * hl + nx * sy * ht, cy + uy * sx * hl + ny * sy * ht)
                    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1))])


def build_architecture():
    walls = []
    solids = []
    glass = []
    details = []
    for w in L['walls']:
        mat = 'paint'
        if w['structure'] == 'railing':
            for p in w['pieces']:
                ang = -p['angle']
                glass.append(box(f"{w['id']}_vidro", 'glass', (p['length'], 0.012, p['top'] - 0.06),
                                 V(p['center'][0], p['center'][1], (p['top'] - 0.06) / 2), ang, group='GLASS'))
                details.append(box(f"{w['id']}_corrimao", 'alu', (p['length'] + 0.02, 0.045, 0.045),
                                   V(p['center'][0], p['center'][1], p['top'] - 0.0225), ang, group='ARCH', bevel=0.004))
            continue
        for p in w['pieces']:
            solids.append((piece_polygon(p), p['bottom'], p['top']))
        for o in w['openings']:
            details += build_opening(w, o, glass)
        for lf in w['leaves']:
            details += build_leaf(w, lf)

    from shapely.geometry import box as sbox
    for sh in L['shafts']:
        x, y = sh['position']
        sx, _, sy = sh['size']
        solids.append((sbox(x - sx / 2, y - sy / 2, x + sx / 2, y + sy / 2), 0.0, H))

    clean_walls(solids)['lightmap'] = 'arch'
    d = join(details, 'ARQ_esquadrias')
    if d:
        d['lightmap'] = 'arch'
    join(glass, 'VIDROS')

    # Pisos: placas de porcelanato 60×60 com junta na zona; demais ambientes em plano contínuo.
    tiles = []
    T, G = 0.6, 0.003
    ox, oy = L['tileRects'][0][0], L['tileRects'][0][3]  # paginação a partir da parede de entrada e da parede sul
    for (x0, y0, x1, y1) in L['tileRects']:
        i0, i1 = math.floor((x0 - ox) / T), math.ceil((x1 - ox) / T)
        j0, j1 = math.floor((oy - y1) / T), math.ceil((oy - y0) / T)
        for i in range(i0, i1):
            for j in range(j0, j1):
                ax0, ax1 = ox + i * T + G / 2, ox + (i + 1) * T - G / 2
                ay1, ay0 = oy - j * T - G / 2, oy - (j + 1) * T + G / 2
                cx0, cx1, cy0, cy1 = max(ax0, x0), min(ax1, x1), max(ay0, y0), min(ay1, y1)
                if cx1 - cx0 < 0.004 or cy1 - cy0 < 0.004:
                    continue
                off = (random.random(), random.random())
                tiles.append(plan_box(f'placa_{i}_{j}_{len(tiles)}', 'porcelain', cx0, cy0, cx1, cy1, -0.012, 0.0,
                                      group='ARCH', bevel=0.0012, segments=1, uv_offset=off, uv_rot90=random.random() > 0.5))
    join(tiles, 'ARQ_piso_porcelanato')['lightmap'] = 'arch'
    grout = [plan_box(f'rejunte_{k}', 'grout', x0, y0, x1, y1, -0.014, -0.0025, group='ARCH')
             for k, (x0, y0, x1, y1) in enumerate(L['tileRects'])]
    join(grout, 'ARQ_rejunte')['lightmap'] = 'arch'

    floors = []
    for r in L['rooms']:
        if r['id'] in L['zoneRooms']:
            continue
        mat = 'laminate' if r['floorMaterial'] == 'wood' else 'porcelain'
        floors.append(polygon_obj(f"piso_{r['id']}", r['polygon'], 0.0, mat, 'ARCH'))
    join(floors, 'ARQ_pisos')['lightmap'] = 'arch'
    polygon_obj('laje_inferior', L['envelope'], -0.015, 'slab', 'ARCH')
    ceil = polygon_obj('ARQ_forro', L['envelope'], H, 'ceiling', 'ARCH', flip=True)
    ceil['lightmap'] = 'arch'
    ceil['ceiling'] = 1

    # Rodapés (porcelanato, 7 cm) na sala, cozinha e circulação.
    bb = []
    walls_by_id = {w['id']: w for w in L['walls']}
    for k, run in enumerate(L['baseboards']):
        w = walls_by_id[run['wall']]
        fx, fy, ux, uy, ln = wall_frame(w)
        nx, ny = -uy, ux
        off = run['side'] * (w['thickness'] / 2 + 0.006 + GAP)
        t0, t1 = run['t0'], run['t1']
        cx = fx + ux * (t0 + t1) / 2 + nx * off
        cy = fy + uy * (t0 + t1) / 2 + ny * off
        ang = math.atan2(uy, ux)
        bb.append(box(f'rodape_{k}', 'porcelain', (t1 - t0, 0.012, 0.07), V(cx, cy, 0.035), -ang, group='ARCH',
                      bevel=0.002, segments=1))
    join(bb, 'ARQ_rodapes')['lightmap'] = 'arch'


def along(w, t, n=0.0, z=0.0):
    fx, fy, ux, uy, _ = wall_frame(w)
    return V(fx + ux * t - uy * n, fy + uy * t + ux * n, z)


def build_opening(w, o, glass):
    fx, fy, ux, uy, ln = wall_frame(w)
    ang = -math.atan2(uy, ux)
    th = w['thickness']
    t0, t1 = o['offset'], o['offset'] + o['width']
    sill, head = o['sill'], o['head']
    out = []
    kind = o['kind']
    if kind == 'door':
        lin_w = th + 0.02
        # Batentes (marco) e guarnições nas duas faces — laca branca.
        for t in (t0 + 0.015 + GAP, t1 - 0.015 - GAP):
            out.append(box(f"{o['id']}_marco", 'lacquer_white', (0.03, lin_w, head - GAP), along(w, t, 0, (head - GAP) / 2), ang,
                           group='ARCH', bevel=0.002, segments=1))
        out.append(box(f"{o['id']}_marco_sup", 'lacquer_white', (o['width'], lin_w, 0.03), along(w, (t0 + t1) / 2, 0, head - 0.015),
                       ang, group='ARCH'))
        for side in (1, -1):
            n = side * (th / 2 + 0.005 + GAP)
            for t in (t0 - 0.03, t1 + 0.03):
                out.append(box(f"{o['id']}_guarn", 'lacquer_white', (0.07, 0.01, head + 0.07), along(w, t, n, (head + 0.07) / 2),
                               ang, group='ARCH', bevel=0.002, segments=1))
            out.append(box(f"{o['id']}_guarn_sup", 'lacquer_white', (o['width'] + 0.13, 0.01, 0.07), along(w, (t0 + t1) / 2, n, head + 0.035),
                           ang, group='ARCH', bevel=0.002, segments=1))
        out.append(box(f"{o['id']}_soleira", 'granite_dark', (o['width'], th + 0.02, 0.012), along(w, (t0 + t1) / 2, 0, -0.004),
                       ang, group='ARCH', bevel=0.002, segments=1))
    elif kind in ('window', 'sliding-door'):
        prof = 0.045
        depth = min(0.07, th)
        h = head - sill
        for t in (t0 + prof / 2 + GAP, t1 - prof / 2 - GAP):
            out.append(box(f"{o['id']}_alu", 'alu', (prof, depth, h), along(w, t, 0, sill + h / 2), ang, group='ARCH', bevel=0.003))
        out.append(box(f"{o['id']}_alu_sup", 'alu', (o['width'], depth, prof), along(w, (t0 + t1) / 2, 0, head - prof / 2), ang,
                       group='ARCH', bevel=0.003))
        out.append(box(f"{o['id']}_alu_inf", 'alu', (o['width'], depth, 0.02 if kind == 'sliding-door' else prof),
                       along(w, (t0 + t1) / 2, 0, sill + (0.01 if kind == 'sliding-door' else prof / 2)), ang, group='ARCH', bevel=0.003))
        out.append(box(f"{o['id']}_soleira", 'granite_dark', (o['width'] + 0.04, th + 0.03, 0.015),
                       along(w, (t0 + t1) / 2, 0, sill - 0.006), ang, group='ARCH', bevel=0.002, segments=1))
        if kind == 'window':
            # Janela de correr de 2 folhas (montante central visível na planta).
            mid = (t0 + t1) / 2
            out.append(box(f"{o['id']}_montante", 'alu', (0.05, depth * 0.8, h - 2 * prof), along(w, mid, 0, sill + h / 2), ang,
                           group='ARCH', bevel=0.003))
            for k, (a, b) in enumerate(((t0 + prof, mid), (mid, t1 - prof))):
                glass.append(box(f"{o['id']}_vidro{k}", 'glass', (b - a, 0.008, h - 2 * prof),
                                 along(w, (a + b) / 2, (k - 0.5) * 0.02, sill + h / 2), ang, group='GLASS'))
        # Porta de correr da varanda: folhas NÃO modeladas (ponto 3 da conferência em aberto).
    return out


def build_leaf(w, lf):
    out = []
    hx, hy = lf['hinge']
    cx, cy = lf['center']
    ang = -lf['angle']
    hgt = lf['height']
    out.append(box(f"{lf['key']}_folha", 'lacquer_white', (lf['width'], lf['thickness'], hgt), V(cx, cy, hgt / 2), ang,
                   group='ARCH', bevel=0.003, segments=2))
    # Maçaneta de alavanca (cromada) nas duas faces, junto à borda livre.
    fx, fy = hx + (cx - hx) * 2, hy + (cy - hy) * 2
    ex, ey = hx + (fx - hx) * 0.9, hy + (fy - hy) * 0.9
    nx, ny = -math.sin(lf['angle']), math.cos(lf['angle'])
    for s in (1, -1):
        base = V(ex + nx * s * 0.025, ey + ny * s * 0.025, 1.02)
        out.append(box('roseta', 'chrome', (0.05, 0.008, 0.05), base, ang, group='ARCH', bevel=0.004))
        lever = V(ex + nx * s * 0.05 - (fx - hx) * 0.05, ey + ny * s * 0.05 - (fy - hy) * 0.05, 1.02)
        out.append(box('alavanca', 'chrome', (0.13, 0.018, 0.018), lever, ang, group='ARCH', bevel=0.007))
    return out


# =============================================================================
# Mobiliário e marcenaria da sala/cozinha
# =============================================================================

def item(id_):
    return next(i for i in L['zoneItems'] if i['id'] == id_)


FACING = {'+x': 0.0, '+y': -math.pi / 2, '-x': math.pi, '-y': math.pi / 2}  # rotação Blender (frente local = +X)


def build_sofa():
    it = item('sofa')
    x0, y0, x1, y1 = it['rect']
    W, D = abs(y1 - y0), abs(x1 - x0)  # largura ao longo da parede, profundidade
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    parts = []
    # Sistema local: frente para +X, largura em Y. Depois gira/posiciona.
    arm = 0.13
    parts.append(box('sofa_base', 'linen_grey', (D - 0.01, W - 2 * arm + 0.02, 0.22), (0, 0, 0.12 + 0.11), bevel=0.03, segments=3))
    for s in (-1, 1):
        a = box('sofa_braco', 'linen_grey', (D, arm, 0.36), (0, s * (W / 2 - arm / 2), 0.12 + 0.18), bevel=0.045, segments=4)
        parts.append(a)
    cw = (W - 2 * arm) / 2
    for s in (-0.5, 0.5):
        seat = box('sofa_assento', 'linen_grey', (D - 0.2, cw - 0.01, 0.15), (0.08, s * cw, 0.34 + 0.075), bevel=0.05, segments=4)
        apply_subsurf(seat, 1)
        parts.append(seat)
        back = box('sofa_encosto', 'linen_grey', (0.2, cw - 0.01, 0.42), (-D / 2 + 0.12, s * cw, 0.38 + 0.21), bevel=0.07, segments=4)
        back.rotation_euler = (0, -0.16, 0)
        apply_subsurf(back, 1)
        parts.append(back)
    # Rolos laterais (book) e almofadas de decoração.
    for s in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.1, radius2=0.1, depth=0.42)
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'X'))
        bmesh.ops.translate(bm, vec=Vector((0.02, s * (W / 2 - arm - 0.11), 0.6)), verts=bm.verts)
        world_uv(bm, TILE['linen_grey'])
        parts.append(mesh_obj('sofa_rolo', bm, 'linen_grey', 'FURN'))
    for s, mt, rz in ((-0.18, 'pillow_sage', 0.25), (0.2, 'pillow_ochre', -0.2)):
        p = box('almofada', mt, (0.14, 0.42, 0.42), (-D / 2 + 0.3, s, 0.6), bevel=0.06, segments=4)
        p.rotation_euler = (rz * 0.3, -0.25, rz)
        apply_subsurf(p, 2)
        parts.append(p)
    for s in (-1, 1):
        for fx in (-1, 1):
            parts.append(box('sofa_pe', 'oak_warm', (0.04, 0.04, 0.12), (fx * (D / 2 - 0.06), s * (W / 2 - 0.06), 0.06), bevel=0.006))
    sofa = join(parts, 'MOV_sofa')
    sofa.rotation_euler = (0, 0, FACING[it['facing']])
    sofa.location = V(cx, cy, 0)
    sofa['lightmap'] = 'furn'
    return sofa


def build_rug():
    it = item('tapete')
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=128, radius1=it['scale'] / 2, radius2=it['scale'] / 2, depth=0.012)
    bmesh.ops.translate(bm, vec=V(it['at'][0], it['at'][1], 0.006), verts=bm.verts)
    world_uv(bm, TILE['rug'])
    o = mesh_obj('MOV_tapete', bm, 'rug', 'FURN')
    o['lightmap'] = 'furn'


def build_rack_tv_art():
    it = item('rack')
    x0, y0, x1, y1 = it['rect']
    z0, z1 = it['z']
    parts = [plan_box('rack_corpo', 'oak_warm', x0 + 0.02, y0 + 0.02, x1 - 0.005, y1 - 0.02, z0, z1, bevel=0.004)]
    n = 3
    L_ = (y1 - y0 - 0.04)
    for k in range(n):
        a = y0 + 0.02 + k * L_ / n + 0.0015
        b = y0 + 0.02 + (k + 1) * L_ / n - 0.0015
        parts.append(plan_box('rack_frente', 'oak_warm', x0 + 0.012, a, x0 + 0.025, b, z0 + 0.01, z1 - 0.01, bevel=0.002,
                              uv_rot90=True))
    r = join(parts, 'MOV_rack')
    r['lightmap'] = 'furn'

    tv = item('tv')
    tx, ty = tv['at']
    z0, z1 = tv['z']
    face = tx - 0.002
    w = 1.23
    t = [plan_box('tv_corpo', 'black_satin', face - 0.03, ty - w / 2, face, ty + w / 2, z0, z1, bevel=0.004),
         plan_box('tv_tela', 'black_glass', face - 0.0315, ty - w / 2 + 0.008, face - 0.03, ty + w / 2 - 0.008, z0 + 0.008, z1 - 0.012)]
    o = join(t, 'MOV_tv')
    o['lightmap'] = 'furn'

    art = item('arte-sofa')
    ax, ay = art['at']
    z0, z1 = art['z']
    aw = 0.9
    face = ax + 0.01  # ax já está na face do drywall
    parts = [plan_box('quadro_moldura', 'oak_warm', face, ay - aw / 2, face + 0.03, ay + aw / 2, z0, z1, bevel=0.003),
             plan_box('quadro_passe', 'passepartout', face + 0.03, ay - aw / 2 + 0.02, face + 0.031, ay + aw / 2 - 0.02, z0 + 0.02, z1 - 0.02),
             plan_box('quadro_arte', 'art_print', face + 0.031, ay - aw / 2 + 0.09, face + 0.032, ay + aw / 2 - 0.09, z0 + 0.09, z1 - 0.09)]
    q = join(parts, 'MOV_quadro')
    q['lightmap'] = 'furn'


PX = 79.88


def build_table():
    it = item('mesa')
    x0, y0, x1, y1 = it['rect']
    hz = it['z'][1]
    parts = [plan_box('mesa_tampo', 'oak_warm', x0, y0, x1, y1 - 0.01, hz - 0.03, hz, bevel=0.004, uv_rot90=True)]
    for lx in (x0 + 0.06, x1 - 0.06):
        for ly in (y0 + 0.06, y1 - 0.07):
            parts.append(plan_box('mesa_pe', 'oak_warm', lx - 0.022, ly - 0.022, lx + 0.022, ly + 0.022, 0, hz - 0.03, bevel=0.004))
    parts.append(plan_box('mesa_saia', 'oak_warm', x0 + 0.05, y0 + 0.05, x1 - 0.05, y1 - 0.06, hz - 0.1, hz - 0.03, bevel=0.003))
    o = join(parts, 'MOV_mesa')
    o['lightmap'] = 'furn'


def build_kitchen():
    base = item('bancada')
    x0, y0, x1, y1 = base['rect']  # x0 = face da parede; x1 = frente
    parts, steel, black = [], [], []
    top_z = 0.9
    # Rodapé recuado e corpo.
    parts.append(plan_box('coz_rodape', 'black_satin', x0, y0, x1 - 0.06, y1, 0, 0.1))
    parts.append(plan_box('coz_corpo', 'lacquer_greige', x0, y0, x1 - 0.022, y1, 0.1, top_z - 0.03))
    # Módulos: pia (2 portas) | forno + gaveta (sob o cooktop).
    sink_c = (455 + 545) / 2 / PX - 318 / PX
    cook_c = (552 + 603) / 2 / PX - 318 / PX
    split = (548 - 318) / PX
    fronts = [(y0 + 0.003, (y0 + split) / 2 - 0.0015), ((y0 + split) / 2 + 0.0015, split - 0.002)]
    for k, (a, b) in enumerate(fronts):
        parts.append(plan_box(f'coz_porta{k}', 'lacquer_greige', x1 - 0.022, a, x1, b, 0.11, top_z - 0.04, bevel=0.002))
    # Forno embutido (vidro preto + puxador inox) e gaveta inferior.
    oy0, oy1 = split + 0.004, y1 - 0.003
    black.append(plan_box('forno_vidro', 'black_glass', x1 - 0.022, oy0, x1, oy1, 0.3, top_z - 0.04, bevel=0.002))
    steel.append(plan_box('forno_puxador', 'steel', x1, oy0 + 0.05, x1 + 0.03, oy1 - 0.05, top_z - 0.12, top_z - 0.1, bevel=0.005))
    steel.append(plan_box('forno_painel', 'steel', x1 - 0.021, oy0, x1 + 0.001, oy1, top_z - 0.075, top_z - 0.04))
    parts.append(plan_box('coz_gaveta', 'lacquer_greige', x1 - 0.022, oy0, x1, oy1, 0.11, 0.297, bevel=0.002))
    # Tampo de granito com recorte da cuba.
    top = plan_box('coz_tampo', 'granite', x0, y0, x1 + 0.02, y1, top_z - 0.03, top_z, bevel=0.003)
    cut = plan_box('recorte', 'granite', x0 + 0.08, sink_c - 0.24, x0 + 0.48, sink_c + 0.24, top_z - 0.1, top_z + 0.1)
    mod = top.modifiers.new('cuba', 'BOOLEAN')
    mod.object = cut
    mod.operation = 'DIFFERENCE'
    bpy.context.view_layer.objects.active = top
    for o in bpy.context.view_layer.objects:
        o.select_set(o == top)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cut)
    # Cuba inox (paredes internas).
    cx0, cx1, cy0, cy1, d = x0 + 0.08, x0 + 0.48, sink_c - 0.24, sink_c + 0.24, 0.19
    steel.append(plan_box('cuba_fundo', 'steel', cx0, cy0, cx1, cy1, top_z - 0.03 - d, top_z - 0.03 - d + 0.004))
    for (a, b, c, e) in ((cx0, cy0, cx0 + 0.004, cy1), (cx1 - 0.004, cy0, cx1, cy1), (cx0, cy0, cx1, cy0 + 0.004), (cx0, cy1 - 0.004, cx1, cy1)):
        steel.append(plan_box('cuba_parede', 'steel', a, b, c, e, top_z - 0.03 - d, top_z - 0.03))
    # Torneira gourmet (tubo curvo).
    curve = bpy.data.curves.new('torneira', 'CURVE')
    curve.dimensions = '3D'
    curve.bevel_depth = 0.011
    curve.bevel_resolution = 4
    sp = curve.splines.new('BEZIER')
    pts = [V(x0 + 0.05, sink_c, top_z), V(x0 + 0.05, sink_c, top_z + 0.3), V(x0 + 0.2, sink_c, top_z + 0.38), V(x0 + 0.27, sink_c, top_z + 0.24)]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = 'AUTO'
    cob = bpy.data.objects.new('torneira', curve)
    coll('FURN').objects.link(cob)
    bpy.context.view_layer.objects.active = cob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == cob)
    bpy.ops.object.convert(target='MESH')
    cob.data.materials.clear()
    cob.data.materials.append(MATS['steel'])
    steel.append(cob)
    steel.append(plan_box('torneira_base', 'steel', x0 + 0.03, sink_c - 0.025, x0 + 0.07, sink_c + 0.025, top_z, top_z + 0.04, bevel=0.012))
    steel.append(plan_box('torneira_alavanca', 'steel', x0 + 0.04, sink_c + 0.02, x0 + 0.06, sink_c + 0.09, top_z + 0.16, top_z + 0.175, bevel=0.005))
    # Cooktop a gás 4 bocas: mesa inox, queimadores e grelhas de ferro.
    kx0, kx1 = x0 + 0.06, x0 + 0.56
    ky0, ky1 = cook_c - 0.29, cook_c + 0.29
    steel.append(plan_box('cooktop_mesa', 'steel', kx0, ky0, kx1, ky1, top_z, top_z + 0.008, bevel=0.004))
    for (bx, by, r) in ((kx0 + 0.13, ky0 + 0.15, 0.045), (kx0 + 0.13, ky1 - 0.15, 0.035), (kx1 - 0.15, ky0 + 0.15, 0.035), (kx1 - 0.15, ky1 - 0.15, 0.055)):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=r, radius2=r * 0.9, depth=0.02)
        bmesh.ops.translate(bm, vec=V(bx, by, top_z + 0.018), verts=bm.verts)
        world_uv(bm, 1.0)
        black.append(mesh_obj('queimador', bm, 'cast_iron', 'FURN'))
    for gy0, gy1 in ((ky0 + 0.02, cook_c - 0.005), (cook_c + 0.005, ky1 - 0.02)):
        for k in range(5):
            gx = kx0 + 0.04 + k * (kx1 - kx0 - 0.08) / 4
            black.append(plan_box('grelha', 'cast_iron', gx - 0.005, gy0, gx + 0.005, gy1, top_z + 0.03, top_z + 0.04, bevel=0.003))
        for gx0 in (kx0 + 0.04,):
            for gyy in (gy0, gy1 - 0.01):
                black.append(plan_box('grelha', 'cast_iron', gx0, gyy, kx1 - 0.04, gyy + 0.01, top_z + 0.03, top_z + 0.04, bevel=0.003))
    for k in range(4):
        steel.append(plan_box('botao', 'black_satin', kx1 - 0.04, ky0 + 0.06 + k * 0.035, kx1 - 0.01, ky0 + 0.085 + k * 0.035,
                              top_z + 0.008, top_z + 0.03, bevel=0.008))

    # Revestimento, prateleira com LED e aéreos em carvalho com módulo ripado.
    bs = item('revestimento')
    bz0, bz1 = bs['z']
    parts_b = [plan_box('revestimento', 'backsplash', x0 - 0.001, y0, x0 + 0.008, y1, bz0, bz1, uv_rot90=True)]
    sh = item('prateleira')
    sx0, sy0, sx1, sy1 = sh['rect']
    shz0, shz1 = sh['z']
    shelf = [plan_box('prateleira', 'oak_light', sx0 + 0.008, sy0 + 0.02, sx1, sy1 - 0.02, shz0, shz1, bevel=0.002)]
    leds = [plan_box('led_prateleira', 'led', sx1 - 0.04, sy0 + 0.03, sx1 - 0.02, sy1 - 0.03, shz0 - 0.004, shz0)]
    up = item('aereo')
    ux0, uy0, ux1, uy1 = up['rect']
    uz0, uz1 = up['z']
    uppers = [plan_box('aereo_corpo', 'oak_light', ux0 + 0.008, uy0, ux1 - 0.02, uy1, uz0, uz1)]
    leds.append(plan_box('led_aereo', 'led', ux1 - 0.06, uy0 + 0.03, ux1 - 0.04, y1 - 0.03, uz0 - 0.004, uz0))
    # Frentes: módulo ripado (0,42 m) junto à parede da área de serviço + portas lisas.
    rip = 0.42
    nslat = 14
    for k in range(nslat):
        a = uy0 + 0.004 + k * rip / nslat
        uppers.append(plan_box('ripado', 'oak_light', ux1 - 0.02, a, ux1 + 0.004, a + rip / nslat - 0.008, uz0 + 0.004, uz1 - 0.004,
                               bevel=0.003, uv_rot90=True))
    doors = []
    y_fr = uy0 + rip + 0.004
    over_fridge = (608 - 318) / PX
    n = 3
    for k in range(n):
        a = y_fr + k * (over_fridge - y_fr) / n + 0.0015
        b = y_fr + (k + 1) * (over_fridge - y_fr) / n - 0.0015
        doors.append(plan_box('aereo_porta', 'oak_light', ux1 - 0.02, a, ux1, b, uz0 + 0.003, uz1 - 0.003, bevel=0.002, uv_rot90=True))
    doors.append(plan_box('aereo_geladeira', 'oak_light', ux1 - 0.02, over_fridge + 0.0015, ux1, uy1 - 0.003, 1.88, uz1 - 0.003,
                          bevel=0.002, uv_rot90=True))
    k_ = join(parts + parts_b + shelf + uppers + doors, 'MOV_cozinha')
    k_['lightmap'] = 'furn'
    s_ = join(steel + black, 'MOV_cozinha_metais')
    s_['lightmap'] = 'furn'
    t_ = join([top], 'MOV_bancada')
    t_['lightmap'] = 'furn'
    join(leds, 'LUZ_led')

    # Geladeira inox (porta superior com painel de vidro preto, como na perspectiva).
    fr = item('geladeira')
    gx0, gy0, gx1, gy1 = fr['rect']
    gz1 = fr['z'][1]
    g = [plan_box('gel_corpo', 'steel', gx0 + 0.02, gy0 + 0.01, gx1 - 0.03, gy1 - 0.01, 0.0, gz1, bevel=0.012),
         plan_box('gel_porta_sup', 'steel', gx1 - 0.03, gy0 + 0.012, gx1, gy1 - 0.012, 1.18, gz1 - 0.01, bevel=0.01),
         plan_box('gel_porta_inf', 'steel', gx1 - 0.03, gy0 + 0.012, gx1, gy1 - 0.012, 0.03, 1.172, bevel=0.01),
         plan_box('gel_painel', 'black_glass', gx1, gy0 + 0.05, gx1 + 0.002, gy0 + 0.26, 1.35, 1.72, bevel=0.002),
         plan_box('gel_puxador', 'steel', gx1 + 0.005, gy1 - 0.07, gx1 + 0.03, gy1 - 0.05, 0.5, 1.65, bevel=0.008)]
    go = join(g, 'MOV_geladeira')
    go['lightmap'] = 'furn'


def build_service():
    """Máquina de lavar (abertura superior) e tanque, conforme desenhados na planta."""
    wm = item('maquina')
    x0, y0, x1, y1 = wm['rect']
    h = wm['z'][1]
    p = [plan_box('maq_corpo', 'lacquer_white', x0 + GAP, y0 + GAP, x1, y1, 0.0, h - 0.04, bevel=0.012, segments=3),
         plan_box('maq_tampa', 'lacquer_white', x0 + 0.02, y0 + 0.13, x1 - 0.02, y1 - 0.02, h - 0.04, h - 0.02, bevel=0.01, segments=3),
         plan_box('maq_visor', 'glass_dark', x0 + 0.08, y0 + 0.2, x1 - 0.08, y1 - 0.08, h - 0.02, h - 0.015, bevel=0.01),
         plan_box('maq_painel', 'lacquer_white', x0 + GAP, y0 + GAP, x1, y0 + 0.12, h - 0.04, h + 0.08, bevel=0.012, segments=3),
         plan_box('maq_display', 'black_glass', x0 + 0.15, y0 + 0.118, x1 - 0.15, y0 + 0.125, h - 0.01, h + 0.06, bevel=0.003)]
    o = join(p, 'MOV_maquina')
    o['lightmap'] = 'furn'
    tq = item('tanque')
    x0, y0, x1, y1 = tq['rect']
    h = tq['z'][1]
    body = plan_box('tanque_corpo', 'ceramic_white', x0 + GAP, y0, x1, y1, 0.0, h, bevel=0.01, segments=3)
    cut = plan_box('tanque_cuba', 'ceramic_white', x0 + 0.06, y0 + 0.05, x1 - 0.05, y1 - 0.05, h - 0.22, h + 0.1, bevel=0.03, segments=3)
    mod = body.modifiers.new('cuba', 'BOOLEAN')
    mod.object = cut
    mod.operation = 'DIFFERENCE'
    bpy.context.view_layer.objects.active = body
    for ob_ in bpy.context.view_layer.objects:
        ob_.select_set(ob_ == body)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cut)
    tor = plan_box('tanque_torneira', 'chrome', x0 + 0.015, (y0 + y1) / 2 - 0.012, x0 + 0.1, (y0 + y1) / 2 + 0.012, h + 0.15, h + 0.17, bevel=0.008)
    tb = plan_box('tanque_torneira_base', 'chrome', x0 + 0.005, (y0 + y1) / 2 - 0.02, x0 + 0.03, (y0 + y1) / 2 + 0.02, h + 0.05, h + 0.2, bevel=0.008)
    t = join([body, tor, tb], 'MOV_tanque')
    t['lightmap'] = 'furn'


def import_asset(asset, name):
    USED.add('Poly Haven:' + asset)
    path = os.path.join(ASSETS, 'ph', asset, '2k', f'{asset}.gltf')
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == 'MESH']
    for o in new:
        for c in o.users_collection:
            c.objects.unlink(o)
        coll('FURN').objects.link(o)
    # aplica transformações e junta num objeto
    for o in bpy.context.view_layer.objects:
        o.select_set(o in meshes)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    for o in new:
        if o.type != 'MESH':
            bpy.data.objects.remove(o)
    ob = join(meshes, name)
    return ob


def model_front(ob):
    """Frente do assento a partir da geometria: oposta ao encosto (vértices altos) em relação ao assento."""
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    zmin, zmax = min(v.z for v in vs), max(v.z for v in vs)
    h = zmax - zmin
    top = [v for v in vs if v.z > zmax - 0.15 * h]
    mid = [v for v in vs if zmin + 0.40 * h < v.z < zmin + 0.52 * h]
    c = lambda L_: sum(L_, Vector()) / len(L_)  # noqa: E731
    back = c(top) - c(mid)
    f = Vector((-back.x, -back.y))
    return f.normalized()


CHECKS = []


def check_seat(ob, it):
    """Verificação automática: assento voltado para a mesa, apoiado no piso, sem invadir a mesa."""
    mesa = item('mesa')
    x0, y0, x1, y1 = mesa['rect']
    tx, ty = (x0 + x1) / 2, (y0 + y1) / 2
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    cx = sum(v.x for v in vs) / len(vs)
    cy = sum(v.y for v in vs) / len(vs)
    want = Vector((1, 0)) if it['facing'] == '+x' else Vector((-1, 0))
    f = model_front(ob)
    zmin = min(v.z for v in vs)
    tz = mesa['z'][1]
    # nenhum vértice acima da altura do tampo-10 cm dentro do retângulo da mesa
    inv = [v for v in vs if v.z > tz - 0.1 and x0 + 0.005 < v.x < x1 - 0.005 and -y1 + 0.005 < v.y < -y0 - 0.005]
    res = {'id': it['id'], 'frente·direção_mesa': round(f.dot(want), 3), 'apoio_z': round(zmin, 4),
           'vertices_invadindo_mesa': len(inv), 'ok': f.dot(want) > 0.97 and abs(zmin) < 0.005 and not inv}
    CHECKS.append(res)
    print('[check]', res, flush=True)


def chair_texture(src):
    def fn(rgb):
        lu = lum(rgb)
        mk = np.clip((lu - 0.035) / 0.035, 0, 1)[..., None]  # 0 = pés (madeira escura), 1 = estofado
        leather = lu[lu > 0.07].mean()
        tgt = np.array(srgb('#bdb8b0'), dtype=np.float32)
        fabric = tgt[None, None, :] * (1 + (lu[..., None] - leather) / leather * 0.8)
        legs = rgb * 1.6 + np.array([0.06, 0.04, 0.02], dtype=np.float32)
        return fabric * mk + legs * (1 - mk)
    return processed('chair_upholstery', src, fn)


def place_assets():
    tinted = {}
    for it in L['zoneItems']:
        if it['kind'] != 'asset':
            continue
        ob = import_asset(it['asset'], f"DEC_{it['id']}")
        s = it.get('scale') or 1.0
        ob.scale = (s, s, s)
        bpy.context.view_layer.objects.active = ob
        for o in bpy.context.view_layer.objects:
            o.select_set(o == ob)
        bpy.ops.object.transform_apply(scale=True)
        mn = min((ob.matrix_world @ Vector(c)).z for c in ob.bound_box)
        cx = sum((ob.matrix_world @ Vector(c)).x for c in ob.bound_box) / 8
        cy = sum((ob.matrix_world @ Vector(c)).y for c in ob.bound_box) / 8
        bpy.ops.object.origin_set(type='ORIGIN_GEOMETRY', center='BOUNDS')
        rot = FACING.get(it.get('facing'), 0.0) + math.radians(-(it.get('rotation') or 0))
        if it.get('facing') and it['asset'] == 'dining_chair_02':
            # rotação calculada pela geometria do próprio modelo (não por suposição do eixo frontal)
            bpy.context.view_layer.update()
            f = model_front(ob)
            rot = FACING[it['facing']] - math.atan2(f.y, f.x)
        z_base = (it.get('z') or [0, 0])[0]
        if it['asset'] == 'modern_ceiling_lamp_01':
            z_base = H - (max((ob.matrix_world @ Vector(c)).z for c in ob.bound_box) - mn)
        ob.location = V(it['at'][0], it['at'][1], 0) + Vector((0, 0, z_base + (ob.location.z - mn)))
        # O importador glTF usa rotação em quaternion: sem trocar o modo, rotation_euler é ignorado
        # (causa raiz das cadeiras na orientação errada).
        ob.rotation_mode = 'XYZ'
        ob.rotation_euler = (0, 0, rot)
        # Ajustes de material para o estilo do book.
        for slot in ob.material_slots:
            m = slot.material
            if not m:
                continue
            nm = m.name.lower()
            if it['asset'] == 'dining_chair_02':
                for n in m.node_tree.nodes:
                    if n.type == 'TEX_IMAGE' and n.image and 'diff' in n.image.name:
                        n.image = bpy.data.images.load(chair_texture(n.image.filepath_from_user()), check_existing=True)
            if it['asset'] in ('potted_plant_02', 'potted_plant_01') and nm.endswith('_pot'):
                slot.material = MATS['ceramic_white']
        ob['lightmap'] = 'furn' if it['asset'] == 'dining_chair_02' else ''
        if it['asset'] == 'dining_chair_02':
            bpy.context.view_layer.update()
            check_seat(ob, it)
        if it['asset'] == 'dining_chair_02':
            tinted[it['id']] = ob
    return tinted


# =============================================================================
# Luz: céu físico + sol, portais nas aberturas, luzes artificiais da decoração
# =============================================================================

def build_lighting():
    sc = bpy.context.scene
    w = bpy.data.worlds.new('ceu')
    sc.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    bg = nt.nodes['Background']
    sky = nt.nodes.new('ShaderNodeTexSky')
    sky.sky_type = 'MULTIPLE_SCATTERING'
    sky.sun_disc = False
    sky.sun_elevation = math.radians(42)
    sky.sun_rotation = math.radians(200)
    # Abaixo do horizonte: névoa clara neutra (vista/entorno ainda desconhecidos — não inventar a Baía).
    tc = nt.nodes.new('ShaderNodeTexCoord')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    ramp = nt.nodes.new('ShaderNodeMapRange')
    ramp.inputs['From Min'].default_value = -0.02
    ramp.inputs['From Max'].default_value = 0.12
    mix = nt.nodes.new('ShaderNodeMix')
    mix.data_type = 'RGBA'
    col_a = next(i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA')
    col_b = next(i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA')
    res = next(o for o in mix.outputs if o.type == 'RGBA')
    col_a.default_value = (0.62, 0.66, 0.7, 1)
    nt.links.new(tc.outputs['Generated'], sep.inputs['Vector'])
    nt.links.new(sep.outputs['Z'], ramp.inputs['Value'])
    nt.links.new(ramp.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(sky.outputs['Color'], col_b)
    nt.links.new(res, bg.inputs['Color'])
    bg.inputs['Strength'].default_value = 0.35
    sun = bpy.data.lights.new('sol', 'SUN')
    sun.energy = 3.2
    sun.angle = math.radians(1.2)
    sun.color = (1.0, 0.96, 0.9)
    so = bpy.data.objects.new('LUZ_sol', sun)
    coll('LIGHTS').objects.link(so)
    so.rotation_euler = (math.radians(90 - 42), 0, math.radians(200 + 180 - 90))
    # Portal de luz na borda da varanda (guia a amostragem para dentro).
    xs = [p[0] for p in L['envelope']]
    portal = bpy.data.lights.new('portal', 'AREA')
    portal.shape = 'RECTANGLE'
    portal.cycles.is_portal = True
    railing = next(w_ for w_ in L['walls'] if w_['id'] == 'varanda-guarda-corpo')
    par = next(w_ for w_ in L['walls'] if w_['id'] == 'varanda-parapeito')
    x0, x1 = par['from'][0], railing['to'][0]
    yv = railing['from'][1] - 0.05
    portal.size, portal.size_y = (x1 - x0), H
    po = bpy.data.objects.new('LUZ_portal_varanda', portal)
    coll('LIGHTS').objects.link(po)
    po.location = V((x0 + x1) / 2, yv, H / 2)
    po.rotation_euler = (math.radians(-90), 0, 0)
    # Pendente da mesa: lâmpada quente dentro do globo.
    pend = item('pendente')
    pl = bpy.data.lights.new('pendente', 'POINT')
    pl.energy = 35
    pl.shadow_soft_size = 0.06
    pl.color = (1.0, 0.8, 0.58)
    plo = bpy.data.objects.new('LUZ_pendente', pl)
    coll('LIGHTS').objects.link(plo)
    plo.location = V(pend['at'][0], pend['at'][1], 1.72)
    return sky


# =============================================================================
# Lightmaps: UV2 compartilhada por grupo + bake difuso (luz direta + indireta)
# =============================================================================

def objects_for(group):
    return [o for o in bpy.data.objects if o.type == 'MESH' and o.get('lightmap') == group]


def drop_hidden_faces(objs):
    """Remove faces nunca visíveis (topo das paredes acima do forro, fundos apoiados no piso),
    liberando área do lightmap para as superfícies que aparecem."""
    for o in objs:
        bm = bmesh.new()
        bm.from_mesh(o.data)
        mw = o.matrix_world
        dead = []
        for f in bm.faces:
            c = mw @ f.calc_center_median()
            n = (mw.to_3x3() @ f.normal).normalized()
            if (n.z > 0.95 and c.z >= H - 0.002 and not o.get('ceiling')) or (n.z < -0.95 and c.z <= 0.002) or (n.z < -0.95 and c.z < -0.008):
                dead.append(f)
        bmesh.ops.delete(bm, geom=dead, context='FACES')
        bm.to_mesh(o.data)
        bm.free()


def lightmap_uvs(objs, margin=0.003):
    drop_hidden_faces(objs)
    for o in objs:
        me = o.data
        while 'lm' not in me.uv_layers and len(me.uv_layers) > 1:
            me.uv_layers.remove(me.uv_layers[-1])  # garante lightmap em TEXCOORD_1
        if 'lm' not in me.uv_layers:
            me.uv_layers.new(name='lm')
        me.uv_layers.active = me.uv_layers['lm']
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margin, area_weight=1.0, correct_aspect=True,
                             scale_to_bounds=False)
    bpy.ops.uv.average_islands_scale()
    bpy.ops.uv.pack_islands(margin=margin, rotate=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in objs:
        o.data.uv_layers.active = o.data.uv_layers[0]


def bake_group(group, size):
    objs = objects_for(group)
    lightmap_uvs(objs)
    img = bpy.data.images.new(f'LM_{group}', size, size, float_buffer=True)
    for o in objs:
        for slot in o.material_slots:
            nt = slot.material.node_tree
            n = nt.nodes.get('LM_TARGET') or nt.nodes.new('ShaderNodeTexImage')
            n.name = 'LM_TARGET'
            n.image = img
            nt.nodes.active = n
    for o in bpy.context.view_layer.objects:
        o.select_set(o in objs)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, margin=8, use_clear=True,
                        target='IMAGE_TEXTURES', uv_layer='lm')
    return img


def denoise(img):
    """Denoise do lightmap com Intel Open Image Denoise (filtro RTLightmap, CPU)."""
    import pyoidn  # instalado em /opt/pydeps (ver pipeline/README.md)
    w, h = img.size
    a = np.empty(w * h * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    rgb = np.ascontiguousarray(a.reshape(h, w, 4)[..., :3])
    np.save(os.path.join(BUILD, f'{img.name}_raw.npy'), rgb)
    return pyoidn.denoise(rgb, filter_type='RTLightmap', quality='high')


def write_lightmap(a, name):
    h, w, _ = a.shape
    lu = lum(a)
    valid = lu[lu > 1e-5]
    k = 0.92 / max(np.percentile(valid, 99.7), 1e-4) if valid.size else 1.0
    enc = np.clip(a * k, 0, 1) ** (1 / 2.2)  # gama 2.2 (decodificado no tour)
    out = np.dstack([enc, np.ones((h, w), dtype=np.float32)])
    path = save_np(out, name, fmt='PNG')
    os.replace(path, os.path.join(BUILD, f'{name}.png'))
    return float(k)


def render_sky():
    """Panorama equirretangular só do céu, para o fundo visto pelas aberturas."""
    sc = bpy.context.scene
    hidden = []
    for o in sc.objects:
        if not o.hide_render:
            hidden.append(o)
            o.hide_render = True
    cam = bpy.data.objects.new('sky_cam', bpy.data.cameras.new('sky_cam'))
    sc.collection.objects.link(cam)
    cam.data.type = 'PANO'
    cam.data.panorama_type = 'EQUIRECTANGULAR'
    cam.rotation_euler = (math.pi / 2, 0, 0)
    sc.camera = cam
    sc.render.resolution_x, sc.render.resolution_y = 2048, 1024
    sc.cycles.samples = 16
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.filepath = os.path.join(BUILD, 'sky.jpg')
    bpy.ops.render.render(write_still=True)
    for o in hidden:
        o.hide_render = False
    bpy.data.objects.remove(cam)


VIEWS = {
    'sala': ((2.95, 5.15, 1.55), (2.2, 0.9, 1.15)),
    'cozinha': ((1.45, 5.0, 1.55), (0.35, 2.0, 1.25)),
    'jantar': ((2.6, 2.5, 1.55), (1.0, 5.4, 0.85)),
    'tv': ((2.05, 1.7, 1.2), (3.9, 2.1, 1.05)),
}


def render_views(samples=64, res=(960, 540), names=None):
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.exposure = 1.2
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'JPEG'
    cam = bpy.data.objects.new('view_cam', bpy.data.cameras.new('view_cam'))
    cam.data.lens = 18
    sc.collection.objects.link(cam)
    sc.camera = cam
    for name, (eye, target) in VIEWS.items():
        if names and name not in names:
            continue
        cam.location = V(*eye)
        cam.rotation_euler = (V(*target) - V(*eye)).to_track_quat('-Z', 'Y').to_euler()
        sc.render.filepath = os.path.join(BUILD, f'view_{name}.jpg')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
    sc.cycles.use_denoising = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = 0


# =============================================================================

def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = Q['samples']
    sc.cycles.max_bounces = 8
    sc.cycles.diffuse_bounces = 6
    sc.cycles.glossy_bounces = 2
    sc.cycles.transmission_bounces = 4
    sc.cycles.use_denoising = False
    sc.render.threads_mode = 'AUTO'
    sc.view_settings.view_transform = 'Standard'

    build_materials()
    build_architecture()
    build_sofa()
    build_rug()
    build_rack_tv_art()
    build_table()
    build_kitchen()
    build_service()
    place_assets()
    build_lighting()

    meta = {'quality': QUALITY}
    if '--views' in ARGS:
        render_views()
    if DO_BAKE:
        for o in coll('GLASS').objects:
            o.hide_render = True  # vidro não bloqueia a luz no bake
        for group in ('arch', 'furn'):
            img = bake_group(group, Q['lm'])
            dn = denoise(img)
            meta[f'k_{group}'] = write_lightmap(dn, f'lm_{group}')
            print(f'[bake] {group} ok, k={meta[f"k_{group}"]:.4f}', flush=True)
        for o in coll('GLASS').objects:
            o.hide_render = False
        # Remove os nós de bake antes de exportar.
        for m in bpy.data.materials:
            if m.node_tree and 'LM_TARGET' in m.node_tree.nodes:
                m.node_tree.nodes.remove(m.node_tree.nodes['LM_TARGET'])
        render_sky()

    # Exporta tudo exceto luzes/portais.
    for o in bpy.context.view_layer.objects:
        o.select_set(o.type == 'MESH')
    bpy.ops.export_scene.gltf(filepath=os.path.join(BUILD, 'apto.glb'), export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_extras=True, export_texcoords=True,
                              export_normals=True, export_materials='EXPORT', export_image_format='AUTO',
                              export_lights=False, export_cameras=False)
    json.dump(meta, open(os.path.join(BUILD, 'bake_meta.json'), 'w'), indent=1)
    json.dump(CHECKS, open(os.path.join(BUILD, 'checks.json'), 'w'), indent=1, ensure_ascii=False)
    if not all(c['ok'] for c in CHECKS):
        print('[check] FALHOU: posicionamento/orientação inválidos', flush=True)
        sys.exit(2)
    credits = json.load(open(os.path.join(ASSETS, 'credits.json')))
    json.dump({k: v for k, v in credits.items() if k in USED}, open(os.path.join(BUILD, 'credits_used.json'), 'w'), indent=1,
              ensure_ascii=False)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BUILD, 'scene.blend'))
    print('[build] concluído', meta, flush=True)


if __name__ == '__main__':
    main()
