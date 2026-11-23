"""
CENA-MESTRA — Sala integrada à cozinha (M1).

Visualização arquitetônica de interiores em Cycles, produzida no Blender a partir da
geometria auditada (arquitetura e cozinha reaproveitadas de build_scene.py) com
mobiliário de alto detalhe, materiais fisicamente calibrados e luz natural de interiores.

  PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/master_scene.py -- [--preview] [--samples N] [--res 1920x1080]

Saídas: .cache/master/sala-cozinha.blend e .cache/master/render-*.jpg
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
if '--quality' not in sys.argv:
    sys.argv += ['--quality', 'final']  # texturas 2K na cena-mestra

import build_scene as B  # noqa: E402
import models as M  # noqa: E402
import bmesh  # noqa: E402
import bpy  # noqa: E402
import math  # noqa: E402
import random  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

ARGS = B.ARGS
PREVIEW = '--preview' in ARGS
SAMPLES = int(ARGS[ARGS.index('--samples') + 1]) if '--samples' in ARGS else (48 if PREVIEW else 512)
RES = tuple(int(v) for v in (ARGS[ARGS.index('--res') + 1] if '--res' in ARGS else ('960x540' if PREVIEW else '1920x1080')).split('x'))
OUT = os.path.join(B.REPO, '.cache', 'master')
WINDOW_SKY = float(ARGS[ARGS.index('--window') + 1]) if '--window' in ARGS else 0.45
EXPOSURE = float(ARGS[ARGS.index('--exposure') + 1]) if '--exposure' in ARGS else 1.3
# Jantar (rodada 3c): deslocamento da mesa em x (m, negativo = oeste) e cadeiras recolhidas.
MESA_DX = float(ARGS[ARGS.index('--mesa-dx') + 1]) if '--mesa-dx' in ARGS else 0.0  # testado −0,10 e −0,15: piora a entrada
CHAIRS_TUCKED = '--cadeiras-afastadas' not in ARGS
OAK_TILE = 0.95  # m por repetição da lâmina de carvalho (mesa)
TUCK = 0.04  # quanto a frente do assento entra sob o tampo (limitado pelos pés da mesa)
BLEND_NAME = ARGS[ARGS.index('--blend') + 1] if '--blend' in ARGS else 'sala-cozinha.blend'
os.makedirs(OUT, exist_ok=True)
V = B.V
H = B.H
random.seed(11)


# =============================================================================
# Materiais: refinamento físico para render (sobre a biblioteca de build_scene)
# =============================================================================

def bsdf(name):
    return B.MATS[name].node_tree.nodes['Principled BSDF']


def swap_color(mat, name, src_fn):
    nt = B.MATS[mat].node_tree
    b = nt.nodes['Principled BSDF']
    for lk in nt.links:
        if lk.to_socket == b.inputs['Base Color'] and lk.from_node.type == 'TEX_IMAGE':
            lk.from_node.image = bpy.data.images.load(B.processed(name, *src_fn), check_existing=True)


def swap_rough(mat, name, src, scale, offset):
    nt = B.MATS[mat].node_tree
    b = nt.nodes['Principled BSDF']
    for lk in nt.links:
        if lk.to_socket == b.inputs['Roughness'] and lk.from_node.type == 'TEX_IMAGE':
            img = bpy.data.images.load(B.processed(name, src, B.rough_fn(scale, offset)), check_existing=True)
            img.colorspace_settings.name = 'Non-Color'
            lk.from_node.image = img


def add_variation(mat, scale=6.0, color_amt=0.08, rough_amt=0.06, bump=0.0, bump_scale=None):
    """Quebra a uniformidade: variação sutil de cor/rugosidade (ruído em coordenadas do objeto)
    e microrrelevo opcional. Só para o render da cena-mestra."""
    nt = B.MATS[mat].node_tree
    b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord')
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = scale
    nz.inputs['Detail'].default_value = 6
    nz.inputs['Roughness'].default_value = 0.55
    nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])

    def src(sock, kind):
        for lk in nt.links:
            if lk.to_socket == sock:
                return lk.from_socket
        if kind == 'color':
            n = nt.nodes.new('ShaderNodeRGB')
            n.outputs[0].default_value = sock.default_value
            return n.outputs[0]
        n = nt.nodes.new('ShaderNodeValue')
        n.outputs[0].default_value = sock.default_value
        return n.outputs[0]

    if color_amt:
        c = src(b.inputs['Base Color'], 'color')
        mix = nt.nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.blend_type = 'OVERLAY'
        mix.inputs['Factor'].default_value = color_amt
        ca = next(i for i in mix.inputs if i.name == 'A' and i.type == 'RGBA')
        cb = next(i for i in mix.inputs if i.name == 'B' and i.type == 'RGBA')
        out = next(o for o in mix.outputs if o.type == 'RGBA')
        nt.links.new(c, ca)
        nt.links.new(nz.outputs['Color'], cb)
        nt.links.new(out, b.inputs['Base Color'])
    if rough_amt:
        r = src(b.inputs['Roughness'], 'value')
        sub = nt.nodes.new('ShaderNodeMath')
        sub.operation = 'SUBTRACT'
        sub.inputs[1].default_value = 0.5
        nt.links.new(nz.outputs['Fac'], sub.inputs[0])
        mad = nt.nodes.new('ShaderNodeMath')
        mad.operation = 'MULTIPLY_ADD'
        mad.inputs[1].default_value = rough_amt * 2
        nt.links.new(sub.outputs[0], mad.inputs[0])
        nt.links.new(r, mad.inputs[2])
        nt.links.new(mad.outputs[0], b.inputs['Roughness'])
    if bump:
        bn = nt.nodes.new('ShaderNodeBump')
        bn.inputs['Strength'].default_value = bump
        h = nz
        if bump_scale:
            h = nt.nodes.new('ShaderNodeTexNoise')
            h.inputs['Scale'].default_value = bump_scale
            h.inputs['Detail'].default_value = 8
            nt.links.new(tc.outputs['Object'], h.inputs['Vector'])
        nt.links.new(h.outputs['Fac'], bn.inputs['Height'])
        for lk in list(nt.links):
            if lk.to_socket == b.inputs['Normal']:
                nt.links.new(lk.from_socket, bn.inputs['Normal'])
        nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])


def refine_materials():
    acg = lambda a, n: B.tex_path('acg', a, n)  # noqa: E731
    ph = lambda a, n: B.tex_path('ph', a, f'{n}_2k')  # noqa: E731
    # Cores calibradas (albedo físico): linho cinza-claro de verdade, não branco.
    swap_color('linen_grey', 'linen_grey_m1', (acg('Fabric045', 'Color'), B.recolor(B.srgb('#a8a49c'), 0.7)))
    swap_color('rug', 'rug_m1', (acg('Carpet014', 'Color'), B.recolor(B.srgb('#b9a98f'), 1.0)))
    # Porcelanato acetinado com reflexo (rugosidade ~0,15–0,25).
    swap_rough('porcelain', 'porcelain_rough_m1', ph('painted_plaster_wall', 'rough'), 0.16, 0.1)
    # Tecidos: brilho de fibra (sheen) — o que diferencia tecido de plástico.
    for n, sheen in (('linen_grey', 0.6), ('pillow_sage', 0.6), ('pillow_ochre', 0.6), ('rug', 0.8)):
        b = bsdf(n)
        b.inputs['Sheen Weight'].default_value = sheen
        b.inputs['Sheen Roughness'].default_value = 0.6
        b.inputs['Sheen Tint'].default_value = (1, 1, 1, 1)
    # Inox escovado: anisotropia na direção da escovação.
    b = bsdf('steel')
    b.inputs['Anisotropic'].default_value = 0.6
    b.inputs['Metallic'].default_value = 1.0
    b.inputs['Base Color'].default_value = (0.62, 0.62, 0.63, 1)
    st = B.MATS['steel'].node_tree
    for lk in list(st.links):
        if lk.to_socket == b.inputs['Base Color']:
            st.links.remove(lk)
    # Vidro real para o render (no tour continua transparente simples).
    g = bsdf('glass')
    g.inputs['Alpha'].default_value = 1.0
    g.inputs['Transmission Weight'].default_value = 1.0
    g.inputs['Roughness'].default_value = 0.0
    g.inputs['IOR'].default_value = 1.5
    B.MATS['glass'].surface_render_method = 'DITHERED'
    # Porcelanato acetinado: reflexo suave e legível (sinal forte de realismo).
    b = bsdf('porcelain')
    b.inputs['Specular IOR Level'].default_value = 0.55
    b.inputs['Coat Weight'].default_value = 0.15
    b.inputs['Coat Roughness'].default_value = 0.18
    # Madeiras com verniz acetinado.
    for n in ('oak_light', 'oak_warm'):
        b = bsdf(n)
        b.inputs['Coat Weight'].default_value = 0.25
        b.inputs['Coat Roughness'].default_value = 0.3
    # Laca: leve verniz.
    for n in ('lacquer_white', 'lacquer_greige'):
        bsdf(n).inputs['Coat Weight'].default_value = 0.2
    # Granito polido: grão mais fino (escala real ~0,35 m) e contraste moderado.
    swap_color('granite', 'granite_m3', (acg('Granite004B', 'Color'),
               lambda x: B.np.clip((x - x.mean(axis=(0, 1))) * 0.55 + x.mean(axis=(0, 1)) * 1.18 + 0.05, 0, 1)))
    b = bsdf('granite')
    b.inputs['Coat Weight'].default_value = 0.5
    b.inputs['Coat Roughness'].default_value = 0.05
    # Revestimento cerâmico vitrificado.
    bsdf('backsplash').inputs['Coat Weight'].default_value = 0.6
    bsdf('backsplash').inputs['Coat Roughness'].default_value = 0.04

    # Variação: nenhuma superfície perfeitamente uniforme.
    add_variation('paint', scale=1.5, color_amt=0.05, rough_amt=0.05, bump=0.04, bump_scale=120)
    add_variation('ceiling', scale=1.2, color_amt=0.04, rough_amt=0.03)
    add_variation('oak_warm', scale=3, color_amt=0.12, rough_amt=0.08)
    add_variation('oak_light', scale=3, color_amt=0.1, rough_amt=0.08)
    add_variation('linen_grey', scale=2.5, color_amt=0.1, rough_amt=0.04, bump=0.08, bump_scale=40)
    add_variation('steel', scale=9, color_amt=0.0, rough_amt=0.08)  # marcas sutis de uso no inox
    add_variation('lacquer_greige', scale=4, color_amt=0.03, rough_amt=0.06)
    add_variation('porcelain', scale=2, color_amt=0.0, rough_amt=0.05)
    # Rodada 3: carvalho natural para a mesa (menos alaranjado).
    # Rodada 4: textura 2k e escala real da folha de lâmina (~0,95 m por repetição, antes 0,45 m, que
    # comprimia as "catedrais" do veio e o deixava ondulado de perto). UV do tampo refeita após o
    # arredondamento (ver veneer_uv).
    def ph2k(asset, kind):
        return os.path.join(B.ASSETS, 'ph', asset, f'{kind}_2k.jpg')
    B.make_mat('oak_table',
               color=B.processed('oak_table_2k', ph2k('oak_veneer_01', 'diff'), lambda x: B.np.clip((x - x.mean()) * 0.8 + x.mean() * B.np.array([0.98, 0.93, 0.87]), 0, 1)),
               normal=ph2k('oak_veneer_01', 'nor_gl'), nstrength=0.3,
               rough=B.processed('oak_table_rough_2k', ph2k('oak_veneer_01', 'rough'), B.rough_fn(0.55, 0.12)), tile=OAK_TILE)
    bsdf('oak_table').inputs['Coat Weight'].default_value = 0.2
    bsdf('oak_table').inputs['Coat Roughness'].default_value = 0.25
    add_variation('oak_table', scale=1.5, color_amt=0.04, rough_amt=0.05)
    # Novos materiais da cena-mestra.
    B.make_mat('voile', base=(0.92, 0.91, 0.88), roughness=0.9)
    v = bsdf('voile')
    v.inputs['Transmission Weight'].default_value = 0.0
    v.inputs['Subsurface Weight'].default_value = 0.0
    v.inputs['Sheen Weight'].default_value = 0.4
    # tecido fino translúcido: mistura difuso + translúcido + passagem direta
    nt = B.MATS['voile'].node_tree
    out = nt.nodes['Material Output']
    tr = nt.nodes.new('ShaderNodeBsdfTranslucent')
    tr.inputs['Color'].default_value = (0.95, 0.93, 0.9, 1)
    tp = nt.nodes.new('ShaderNodeBsdfTransparent')
    m1 = nt.nodes.new('ShaderNodeMixShader')
    m1.inputs['Fac'].default_value = 0.45
    m2 = nt.nodes.new('ShaderNodeMixShader')
    m2.inputs['Fac'].default_value = 0.35
    nt.links.new(v.outputs['BSDF'], m1.inputs[1])
    nt.links.new(tr.outputs['BSDF'], m1.inputs[2])
    nt.links.new(m1.outputs['Shader'], m2.inputs[1])
    nt.links.new(tp.outputs['BSDF'], m2.inputs[2])
    nt.links.new(m2.outputs['Shader'], out.inputs['Surface'])
    for i, col in enumerate(['#3d4a52', '#b9a58a', '#7b4b3a', '#d9d4c8', '#55634f', '#c4b9a3', '#2e2e30', '#8a7f72']):
        B.make_mat(f'book_{i}', base=B.lin(col), roughness=0.6)
    B.make_mat('paper', base=B.lin('#efe9dc'), roughness=0.9)
    B.make_mat('brass', base=B.lin('#c9a46a'), roughness=0.25, metallic=1.0)
    B.make_mat('ceramic_matte_sand', base=B.lin('#cdbfae'), roughness=0.7)
    B.make_mat('ceramic_glazed_white', base=B.lin('#f1efe9'), roughness=0.12)
    B.make_mat('throw_knit', color=B.processed('throw_knit', acg('Fabric045', 'Color'), B.recolor(B.srgb('#b38a63'), 1.2)),
               normal=acg('Fabric045', 'NormalGL'), nstrength=1.2, roughness=0.95, tile=0.12)
    bsdf('throw_knit').inputs['Sheen Weight'].default_value = 0.7
    B.make_mat('rug_binding', base=B.lin('#9c8a70'), roughness=0.9)
    bsdf('rug_binding').inputs['Sheen Weight'].default_value = 0.5
    B.make_mat('linen_piping', color=B.processed('linen_grey_m1', acg('Fabric045', 'Color'), B.recolor(B.srgb('#a8a49c'), 0.7)),
               roughness=0.9, tile=0.05)


# =============================================================================
# Simulação de tecido: almofadas "infladas" com caimento e rugas reais
# =============================================================================

def inflate(ob, pressure=4.0, frames=18, shrink=0.0, quality=6):
    """Infla uma malha fechada com cloth + pressão (sem gravidade) e aplica o resultado."""
    sc = bpy.context.scene
    mod = ob.modifiers.new('cloth', 'CLOTH')
    s = mod.settings
    s.quality = quality
    s.mass = 0.3
    s.tension_stiffness = 40
    s.compression_stiffness = 40
    s.shear_stiffness = 20
    s.bending_stiffness = 2.0
    s.use_pressure = True
    s.uniform_pressure_force = pressure
    s.shrink_min = shrink
    s.effector_weights.gravity = 0.0
    mod.collision_settings.use_self_collision = False
    mod.point_cache.frame_start = 1
    mod.point_cache.frame_end = frames
    for f in range(1, frames + 1):
        sc.frame_set(f)
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    sc.frame_set(1)
    return ob


def cushion(name, mat, size, center, cuts=14, pressure=4.0, bevel=0.02, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=size, verts=bm.verts)
    bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, affect='EDGES')
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=cuts // 3, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(B.MATS[mat])
    ob = bpy.data.objects.new(name, me)
    B.coll('FURN').objects.link(ob)
    inflate(ob, pressure=pressure)
    sub = ob.modifiers.new('sub', 'SUBSURF')
    sub.levels = sub.render_levels = 1
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=sub.name)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.rotation_euler = rot
    ob.location = center
    return ob


def smooth_box(name, mat, size, center, bevel=0.03, sub=2):
    ob = B.box(name, mat, size, center, bevel=bevel, segments=3)
    m = ob.modifiers.new('sub', 'SUBSURF')
    m.levels = m.render_levels = sub
    bpy.context.view_layer.objects.active = ob
    for o in bpy.context.view_layer.objects:
        o.select_set(o == ob)
    bpy.ops.object.modifier_apply(modifier=m.name)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def tapered_leg(name, mat, top_r, bot_r, height, base, splay=(0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=bot_r, radius2=top_r, depth=height)
    bmesh.ops.translate(bm, vec=Vector((0, 0, height / 2)), verts=bm.verts)
    if splay != (0, 0):
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, height), matrix=Matrix.Rotation(splay[0], 3, 'Y') @ Matrix.Rotation(splay[1], 3, 'X'))
    bmesh.ops.translate(bm, vec=Vector(base), verts=bm.verts)
    B.world_uv(bm, B.TILE.get(mat, 1.0), rot90=True)
    ob = B.mesh_obj(name, bm, mat, 'FURN')
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def place(obs, name, facing, at, group='furn'):
    o = B.join(obs, name)
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0, 0, B.FACING[facing])
    o.location = V(at[0], at[1], 0)
    o['lightmap'] = group
    return o


# =============================================================================
# Mobiliário de alto detalhe (posições e medidas do book: sala-cozinha.ts)
# =============================================================================

def seat_dip(ob, depth=0.012, sigma=0.16):
    """Leve afundamento de uso no topo do assento."""
    zs = [v.co.z for v in ob.data.vertices]
    zt = max(zs)
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
    for v in ob.data.vertices:
        if v.co.z > zt - 0.05:
            d2 = (v.co.x - cx) ** 2 + (v.co.y - cy) ** 2
            v.co.z -= depth * math.exp(-d2 / (2 * sigma * sigma)) * (v.co.z - (zt - 0.05)) / 0.05


def piping(name, ob, z_rel, inset=0.004, radius=0.0045, mat='linen_piping'):
    """Vivo (cordão de costura) contornando a almofada na altura z_rel (0 = base, 1 = topo)."""
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    zmin, zmax = min(v.z for v in vs), max(v.z for v in vs)
    z = zmin + (zmax - zmin) * z_rel
    band = [v for v in vs if abs(v.z - z) < 0.012] or vs
    x0, x1 = min(v.x for v in band) + inset, max(v.x for v in band) - inset
    y0, y1 = min(v.y for v in band) + inset, max(v.y for v in band) - inset
    r = min(0.035, (x1 - x0) / 4, (y1 - y0) / 4)
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = radius
    cu.bevel_resolution = 3
    sp = cu.splines.new('POLY')
    pts = []
    for (cx, cy, a0) in ((x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180), (x1 - r, y0 + r, 270)):
        for k in range(7):
            a = math.radians(a0 + 90 * k / 6)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a), z))
    sp.points.add(len(pts) - 1)
    for p_, c in zip(sp.points, pts):
        p_.co = (*c, 1)
    sp.use_cyclic_u = True
    o = bpy.data.objects.new(name, cu)
    B.coll('FURN').objects.link(o)
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.view_layer.objects:
        x.select_set(x == o)
    bpy.ops.object.convert(target='MESH')
    o.data.materials.clear()
    o.data.materials.append(B.MATS[mat])
    return o


def bolster(name, length=0.44, radius=0.1, mat='linen_grey'):
    """Rolo com corpo levemente abaulado e pontas franzidas com botão (eixo X)."""
    bm = bmesh.new()
    nseg, nl = 48, 24
    rings = []
    for j in range(nl + 1):
        t = j / nl
        x = -length / 2 + length * t
        rr = radius * (1 + 0.035 * math.sin(math.pi * t))
        rings.append([bm.verts.new((x, rr * math.cos(2 * math.pi * i / nseg), rr * math.sin(2 * math.pi * i / nseg))) for i in range(nseg)])
    for j in range(nl):
        for i in range(nseg):
            bm.faces.new([rings[j][i], rings[j][(i + 1) % nseg], rings[j + 1][(i + 1) % nseg], rings[j + 1][i]])
    for end, sign in ((rings[0], -1), (rings[-1], 1)):
        prev = end
        nr = 7
        for k in range(1, nr + 1):
            f = 1 - k / (nr + 0.6)
            x0 = sign * (length / 2 + 0.012 * math.sin(math.pi * k / (nr + 1)) - 0.004 * k)
            ring = []
            for i in range(nseg):
                a = 2 * math.pi * i / nseg
                pleat = 1 + 0.12 * (k / nr) * math.sin(14 * a)
                rr = radius * f * pleat
                ring.append(bm.verts.new((x0, rr * math.cos(a), rr * math.sin(a))))
            for i in range(nseg):
                q = [prev[i], prev[(i + 1) % nseg], ring[(i + 1) % nseg], ring[i]]
                bm.faces.new(q if sign > 0 else q[::-1])
            prev = ring
        c = bm.verts.new((sign * (length / 2 - 0.02), 0, 0))
        for i in range(nseg):
            tri = [prev[i], prev[(i + 1) % nseg], c]
            bm.faces.new(tri if sign > 0 else tri[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    B.world_uv(bm, B.TILE[mat])
    o = B.mesh_obj(name, bm, mat, 'FURN')
    m = o.modifiers.new('sub', 'SUBSURF')
    m.levels = m.render_levels = 1
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.view_layer.objects:
        x.select_set(x == o)
    bpy.ops.object.modifier_apply(modifier=m.name)
    for p_ in o.data.polygons:
        p_.use_smooth = True
    for sign in (-1, 1):  # botões
        bmb = bmesh.new()
        bmesh.ops.create_uvsphere(bmb, u_segments=16, v_segments=8, radius=0.014)
        bmesh.ops.scale(bmb, vec=(0.5, 1, 1), verts=bmb.verts)
        bmesh.ops.translate(bmb, vec=(sign * (length / 2 - 0.012), 0, 0), verts=bmb.verts)
        B.world_uv(bmb, 0.1)
        btn = B.mesh_obj(name + '_botao', bmb, mat, 'FURN')
        for p_ in btn.data.polygons:
            p_.use_smooth = True
        o = B.join([o, btn], name)
    return o


def sofa_pro():
    it = B.item('sofa')
    x0, y0, x1, y1 = it['rect']
    W, D = abs(y1 - y0), abs(x1 - x0)
    arm, seat_h = 0.16, 0.43
    parts = []
    # Estrutura: base com saia e encosto estofados (inflados = superfícies macias, sem arestas duras).
    # Estrutura estofada firme (cantos arredondados, sem simulação) + vivo no topo dos braços.
    parts.append(smooth_box('sofa_base', 'linen_grey', (D - 0.03, W - 2 * arm + 0.04, 0.2), (0.0, 0, 0.13 + 0.1), bevel=0.035))
    parts.append(smooth_box('sofa_costas', 'linen_grey', (0.16, W - 2 * arm + 0.04, 0.46), (-D / 2 + 0.085, 0, 0.25 + 0.23), bevel=0.05))
    for s in (-1, 1):
        a = smooth_box('sofa_braco', 'linen_grey', (D, arm, 0.5), (0, s * (W / 2 - arm / 2), 0.11 + 0.25), bevel=0.055)
        parts.append(a)
        parts.append(piping('vivo_braco', a, 0.94, inset=0.02))
    cw = (W - 2 * arm) / 2
    for s in (-0.5, 0.5):
        seat = cushion('sofa_assento', 'linen_grey', (D - 0.19, cw - 0.012, 0.16), (0.07, s * cw, seat_h - 0.06), cuts=18, pressure=2.0)
        seat_dip(seat)
        parts += [seat, piping('vivo_assento', seat, 0.92), piping('vivo_assento', seat, 0.1)]
        back = cushion('sofa_encosto', 'linen_grey', (0.18, cw - 0.02, 0.44), (-D / 2 + 0.23, s * cw, seat_h + 0.21), cuts=24, pressure=1.5,
                       bevel=0.045,
                       rot=(0, -0.22, 0))
        parts.append(back)
    # Rolos laterais (book) com pontas franzidas e botão, apoiados nos braços/encosto.
    for s in (-1, 1):
        b_ = bolster('rolo', length=0.46, radius=0.095)
        b_.location = (0.04, s * (W / 2 - arm - 0.095), seat_h + 0.15)
        parts.append(b_)
    # Almofadas decorativas (tecido inflado com cantos "orelha"), levemente amassadas.
    for s, mt, rz, tilt in ((-0.17, 'pillow_sage', 0.18, -0.32), (0.15, 'pillow_ochre', -0.1, -0.28)):
        parts.append(cushion('almofada', mt, (0.45, 0.45, 0.06), (-D / 2 + 0.33, s, seat_h + 0.27), cuts=21, pressure=3.5, bevel=0.005,
                             rot=(math.pi / 2 + rz * 0.2, tilt, math.pi / 2 + rz)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(tapered_leg('sofa_pe', 'oak_warm', 0.022, 0.014, 0.13, (sx * (D / 2 - 0.07), sy * (W / 2 - 0.07), 0.0)))
    # Manta dobrada sobre o assento (decoração discreta).
    parts.append(cushion('manta', 'throw_knit', (0.34, 0.42, 0.05), (0.1, cw - 0.2, seat_h + 0.07), cuts=15, pressure=1.2, bevel=0.012,
                         rot=(0, 0, 0.12)))
    return place(parts, 'MOV_sofa', it['facing'], ((x0 + x1) / 2, (y0 + y1) / 2))


def shell_chair(name):
    """Cadeira estofada de encosto curvo (como no layout do book), frente para +X local."""
    parts = []
    parts.append(cushion('cad_assento', 'chair_fabric', (0.44, 0.45, 0.07), (0.01, 0, 0.455), cuts=12, pressure=3.0))
    # Encosto: faixa curva (arco ~150°) estofada.
    bm = bmesh.new()
    R, h0, h1, thick = 0.24, 0.5, 0.8, 0.045
    ring_in, ring_out = [], []
    nseg = 28
    for i in range(nseg + 1):
        a = math.radians(105 + 150 * i / nseg)
        for rr, ring in ((R - thick / 2, ring_in), (R + thick / 2, ring_out)):
            x, y = rr * math.cos(a) + 0.06, rr * math.sin(a)
            ring.append((bm.verts.new((x, y, h0)), bm.verts.new((x, y, h1))))
    for i in range(nseg):
        for ring in (ring_in, ring_out):
            a0, a1 = ring[i], ring[i + 1]
            bm.faces.new([a0[0], a1[0], a1[1], a0[1]])
        bm.faces.new([ring_in[i][1], ring_in[i + 1][1], ring_out[i + 1][1], ring_out[i][1]])
        bm.faces.new([ring_in[i][0], ring_out[i][0], ring_out[i + 1][0], ring_in[i + 1][0]])
    for ring_end in (0, nseg):
        bm.faces.new([ring_in[ring_end][0], ring_in[ring_end][1], ring_out[ring_end][1], ring_out[ring_end][0]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    B.world_uv(bm, B.TILE['chair_fabric'])
    back = B.mesh_obj('cad_encosto', bm, 'chair_fabric', 'FURN')
    m = back.modifiers.new('sub', 'SUBSURF')
    m.levels = m.render_levels = 2
    bpy.context.view_layer.objects.active = back
    for o in bpy.context.view_layer.objects:
        o.select_set(o == back)
    bpy.ops.object.modifier_apply(modifier=m.name)
    for p in back.data.polygons:
        p.use_smooth = True
    parts.append(back)
    # Montantes do encosto e pés em madeira, levemente abertos.
    for sy in (-1, 1):
        parts.append(tapered_leg('cad_montante', 'oak_warm', 0.012, 0.012, 0.09, (-0.15, sy * 0.15, 0.42)))
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(tapered_leg('cad_pe', 'oak_warm', 0.016, 0.011, 0.42, (sx * 0.17, sy * 0.17, 0.0), splay=(sx * 0.06, -sy * 0.06)))
    parts.append(smooth_box('cad_quadro', 'oak_warm', (0.4, 0.4, 0.025), (0.0, 0, 0.405), bevel=0.008, sub=1))
    return B.join(parts, name)


def veneer_uv(ob, tile):
    """UV de tampo folheado, refeita depois do arredondamento (o subdivision distorcia a UV do bm_box
    e ondulava o veio). Projeção pela normal dominante; veio sempre ao longo do comprimento (y da planta),
    inclusive nas bordas (fita de borda com veio horizontal)."""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.normal_update()
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            co = ob.matrix_world @ lp.vert.co
            if ax == 2:
                u, v = co.x, co.y
            elif ax == 0:
                u, v = co.z, co.y
            else:
                u, v = co.z, co.x
            lp[uv].uv = (u / tile, v / tile)
    bm.to_mesh(ob.data)
    bm.free()


def dining_pro():
    it = B.item('mesa')
    x0, y0, x1, y1 = it['rect']
    hz = it['z'][1]
    parts = [smooth_box('mesa_tampo', 'oak_table', (abs(x1 - x0), abs(y1 - y0) - 0.01, 0.032), V((x0 + x1) / 2, (y0 + y1) / 2 - 0.005, hz - 0.016),
                        bevel=0.006, sub=1)]
    veneer_uv(parts[0], OAK_TILE)
    for lx in (x0 + 0.07, x1 - 0.07):
        for ly in (y0 + 0.07, y1 - 0.08):
            p = V(lx, ly, 0)
            leg = tapered_leg('mesa_pe', 'oak_table', 0.024, 0.017, hz - 0.032, (p.x, p.y, 0))
            cylinder_uv(leg, B.TILE['oak_table'])
            parts.append(leg)
    parts.append(B.plan_box('mesa_saia', 'oak_table', x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.07, hz - 0.1, hz - 0.032, bevel=0.003))
    t = B.join(parts, 'MOV_mesa')
    t['lightmap'] = 'furn'
    for cid in ('cadeira-1', 'cadeira-2', 'cadeira-3', 'cadeira-4'):
        c = B.item(cid)
        ob = chair_model(f'MOV_{cid}')
        ob.rotation_mode = 'XYZ'
        ob.rotation_euler = (0, 0, B.FACING[c['facing']])
        cx = c['at'][0]
        if CHAIRS_TUCKED:
            # Recolhida: frente do assento TUCK sob o tampo, encosto para fora (posição de "mesa posta").
            half = ob['dims'][0] / 2
            cx = (x0 + TUCK - half) if c['facing'] == '+x' else (x1 - TUCK + half)
        ob.location = V(cx, c['at'][1], 0)
        ob['lightmap'] = 'furn'


def rug_pro():
    """Tapete redondo com espessura, relevo real da trama (deslocamento) e debrum na borda."""
    it = B.item('tapete')
    r = it['scale'] / 2
    cx, cy = it['at']
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=220, y_segments=220, size=r)
    dead = [v for v in bm.verts if v.co.x ** 2 + v.co.y ** 2 > (r - 0.005) ** 2]
    bmesh.ops.delete(bm, geom=dead, context='VERTS')
    bmesh.ops.translate(bm, vec=V(cx, cy, 0.018), verts=bm.verts)
    B.world_uv(bm, B.TILE['rug'])
    o = B.mesh_obj('MOV_tapete', bm, 'rug', 'FURN')
    tex = bpy.data.textures.new('rug_disp', 'IMAGE')
    tex.image = bpy.data.images.load(B.tex_path('acg', 'Carpet014', 'Displacement'), check_existing=True)
    d = o.modifiers.new('relevo', 'DISPLACE')
    d.texture = tex
    d.texture_coords = 'UV'
    d.strength = 0.006
    d.mid_level = 0.5
    sol = o.modifiers.new('espessura', 'SOLIDIFY')
    sol.thickness = 0.016
    sol.offset = -1
    bpy.context.view_layer.objects.active = o
    for x in bpy.context.view_layer.objects:
        x.select_set(x == o)
    for m in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    for p_ in o.data.polygons:
        p_.use_smooth = True
    # debrum (acabamento de borda)
    cu = bpy.data.curves.new('debrum', 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 0.011
    cu.bevel_resolution = 4
    sp = cu.splines.new('POLY')
    n = 180
    sp.points.add(n - 1)
    for i, p_ in enumerate(sp.points):
        a = 2 * math.pi * i / n
        q = V(cx + (r - 0.006) * math.cos(a), cy + (r - 0.006) * math.sin(a), 0.011)
        p_.co = (q.x, q.y, q.z, 1)
    sp.use_cyclic_u = True
    b = bpy.data.objects.new('MOV_tapete_debrum', cu)
    B.coll('FURN').objects.link(b)
    bpy.context.view_layer.objects.active = b
    for x in bpy.context.view_layer.objects:
        x.select_set(x == b)
    bpy.ops.object.convert(target='MESH')
    b.data.materials.clear()
    b.data.materials.append(B.MATS['rug_binding'])
    o = B.join([o, b], 'MOV_tapete')
    o['lightmap'] = 'furn'


def curtains():
    """Cortinas de voil (decoração) junto à porta da varanda: luz difusa e vista neutra."""
    w = next(x for x in B.L['walls'] if x['id'] == 'varanda-porta-vidro')
    y_face = w['from'][1] + w['thickness'] / 2
    yc = y_face + 0.09
    xa, xb = w['from'][0] + 0.02, w['to'][0] - 0.02
    # trilho
    B.box('trilho', 'alu', (xb - xa + 0.06, 0.02, 0.018), V((xa + xb) / 2, yc, H - 0.03), bevel=0.004)
    for side, (s0, s1) in (('esq', (xa, xa + 0.62)), ('dir', (xb - 0.62, xb))):
        bm = bmesh.new()
        nx, nz = 90, 40
        top, bottom = H - 0.04, 0.012
        rows = []
        for j in range(nz + 1):
            z = top - (top - bottom) * j / nz
            row = []
            for i in range(nx + 1):
                t = i / nx
                x = s0 + (s1 - s0) * t
                amp = 0.035 + 0.01 * math.sin(j * 0.7 + i * 0.05)
                yy = yc + amp * math.sin(t * math.pi * 2 * 9) + 0.015 * (j / nz) * math.sin(t * 7 + j * 0.3)
                row.append(bm.verts.new(V(x, yy, z)))
            rows.append(row)
        for j in range(nz):
            for i in range(nx):
                bm.faces.new([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        B.world_uv(bm, 0.5)
        o = B.mesh_obj(f'DEC_cortina_{side}', bm, 'voile', 'FURN')
        for p in o.data.polygons:
            p.use_smooth = True
        sol = o.modifiers.new('esp', 'SOLIDIFY')
        sol.thickness = 0.002


def books_stack(at, z, n=4, rot=0.0, name='livros'):
    parts = []
    zz = z
    for i in range(n):
        w, d, t = random.uniform(0.17, 0.24), random.uniform(0.24, 0.31), random.uniform(0.022, 0.04)
        mat = f'book_{random.randrange(8)}'
        cover = B.box('capa', mat, (d, w, t), (0, 0, zz + t / 2), bevel=0.002, segments=1)
        pages = B.box('miolo', 'paper', (d - 0.012, w - 0.006, t - 0.006), (0.004, 0, zz + t / 2), bevel=0.001, segments=1)
        for ob in (cover, pages):
            ob.rotation_euler = (0, 0, random.uniform(-0.12, 0.12))
        parts += [cover, pages]
        zz += t
    o = B.join(parts, name)
    o.rotation_mode = 'XYZ'
    o.rotation_euler = (0, 0, rot)
    o.location = V(at[0], at[1], 0)
    return o


# =============================================================================
# Rodada 3: modelos profissionais de terceiros (licenças em pipeline/models.py)
# =============================================================================

def _image_of(mat, socket='Base Color'):
    b = mat.node_tree.nodes.get('Principled BSDF')
    for lk in mat.node_tree.links:
        if b and lk.to_socket == b.inputs[socket] and lk.from_node.type == 'TEX_IMAGE':
            return lk.from_node
    return None


def recolor_fabric(mat, target_hex, lo=0.04, hi=0.42, sat_max=0.14):
    """Clareia só o tecido liso (pixels neutros escuros) para o tom alvo, mantendo a trama."""
    import numpy as np
    node = _image_of(mat)
    if not node:
        return
    img = node.image
    w, h = img.size
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    rgb = a[..., :3]
    l = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    sat = rgb.max(-1) - rgb.min(-1)
    mask = (l > lo) & (l < hi) & (sat < sat_max)
    med = float(np.median(l[mask])) if mask.any() else 0.2
    tgt = np.array(B.srgb(target_hex), dtype=np.float32)
    rel = np.clip(l / med, 0.4, 1.8) ** 0.7
    rgb[mask] = (tgt[None, :] * rel[mask][:, None])
    a[..., :3] = np.clip(rgb, 0, 1)
    new = bpy.data.images.new(img.name + '_linho', w, h, alpha=True)
    new.pixels[:] = a.ravel()
    path = os.path.join(B.TEX, f'{mat.name.split(".")[0]}_linho_{target_hex.lstrip("#")}.png')
    new.filepath_raw = path
    new.file_format = 'PNG'
    new.save()
    bpy.data.images.remove(new)
    node.image = bpy.data.images.load(path, check_existing=True)
    node.image.colorspace_settings.name = img.colorspace_settings.name


def fiber_sheen(mat, w=0.6):
    b = mat.node_tree.nodes.get('Principled BSDF')
    if b:
        # Tecido não é metal: alguns modelos trazem o canal metálico do glTF trocado/alto.
        for lk in list(mat.node_tree.links):
            if lk.to_socket == b.inputs['Metallic']:
                mat.node_tree.links.remove(lk)
        b.inputs['Metallic'].default_value = 0.0
        b.inputs['Sheen Weight'].default_value = w
        b.inputs['Sheen Roughness'].default_value = 0.6


def appliance_steel():
    """Inox escovado procedural (sem depender das UVs do modelo): escovação vertical sutil."""
    if 'steel_appliance' in B.MATS:
        return B.MATS['steel_appliance']
    m = B.make_mat('steel_appliance', base=(0.56, 0.56, 0.57), roughness=0.22, metallic=1.0)
    nt = m.node_tree
    b = nt.nodes['Principled BSDF']
    b.inputs['Anisotropic'].default_value = 0.5
    tc = nt.nodes.new('ShaderNodeTexCoord')
    mp = nt.nodes.new('ShaderNodeMapping')
    mp.inputs['Scale'].default_value = (1400, 1400, 12)
    nz = nt.nodes.new('ShaderNodeTexNoise')
    nz.inputs['Scale'].default_value = 1.0
    nz.inputs['Detail'].default_value = 2.0
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['To Min'].default_value = 0.19
    mr.inputs['To Max'].default_value = 0.25
    big = nt.nodes.new('ShaderNodeTexNoise')
    big.inputs['Scale'].default_value = 4.0
    mix = nt.nodes.new('ShaderNodeMath')
    mix.operation = 'MULTIPLY_ADD'
    mix.inputs[1].default_value = 0.04
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
    nt.links.new(nz.outputs['Fac'], mr.inputs['Value'])
    nt.links.new(tc.outputs['Object'], big.inputs['Vector'])
    nt.links.new(big.outputs['Fac'], mix.inputs[0])
    nt.links.new(mr.outputs['Result'], mix.inputs[2])
    nt.links.new(mix.outputs['Value'], b.inputs['Roughness'])
    return m


def sofa_model():
    it = B.item('sofa')
    x0, y0, x1, y1 = it['rect']
    W, D = abs(y1 - y0), abs(x1 - x0)
    ob = M.import_model('sofa', height=1.0, coll=B.coll('FURN'))
    s = W / ob['dims'][1]  # escala uniforme pela largura da vaga (1,44 m)
    ob.data.transform(Matrix.Diagonal((s, s, s, 1)))
    ob['dims'] = [round(d * s, 3) for d in ob['dims']]
    for mat in ob.data.materials:
        recolor_fabric(mat, '#aaa69e')
        fiber_sheen(mat)
    ob.rotation_mode = 'XYZ'
    ob.rotation_euler = (0, 0, B.FACING[it['facing']])
    ob.location = V((x0 + x1) / 2, (y0 + y1) / 2, 0)
    ob['lightmap'] = 'furn'
    print('[modelo] sofá', ob['dims'], 'vaga', round(D, 3), round(W, 3), flush=True)
    return ob


def fridge_model():
    """Geladeira própria, desenho contemporâneo (duas portas, freezer em cima, inox escovado).
    Referência: refrigeradores frost-free de 2 portas do mercado (≈ 0,66 × 0,64 × 1,82 m), sem
    logotipo, painel ou dispenser. Ocupa a vaga da planta (0,66 × 0,68 m) com folga de
    ventilação atrás e nas laterais."""
    old = bpy.data.objects.get('MOV_geladeira')
    if old:
        bpy.data.objects.remove(old)
    fr = B.item('geladeira')
    X0, Y0, X1, Y1 = fr['rect']
    H_ = 1.82
    st = appliance_steel()
    if 'rubber' not in B.MATS:
        B.make_mat('rubber', base=B.lin('#202124'), roughness=0.7)
        B.make_mat('grille', base=B.lin('#2a2b2d'), roughness=0.55)
    bx0, front = X0 + 0.02, X1          # 2 cm de ventilação atrás; frente das portas no limite da vaga
    door_t = 0.06
    bx1 = front - door_t - 0.004       # face frontal do gabinete
    y0, y1 = Y0 + 0.01, Y1 - 0.01      # 66 cm de largura, 1 cm de folga de cada lado
    P = []
    # Gabinete (laterais e topo em inox, arestas levemente arredondadas).
    P.append(B.plan_box('gel_gabinete', 'steel_appliance', bx0, y0, bx1, y1, 0.0, H_, bevel=0.006, segments=3))
    # Vedação de borracha visível entre gabinete e portas.
    P.append(B.plan_box('gel_vedacao', 'rubber', bx1 - 0.002, y0 + 0.008, bx1 + 0.006, y1 - 0.008, 0.09, H_ - 0.008))
    # Portas retas: refrigerador embaixo, freezer em cima, fresta de 6 mm.
    split = 1.30
    doors = [('gel_porta_refrig', 0.085, split - 0.003), ('gel_porta_freezer', split + 0.003, H_ - 0.004)]
    for n, z0, z1 in doors:
        P.append(B.plan_box(n, 'steel_appliance', front - door_t, y0 + 0.002, front, y1 - 0.002, z0, z1, bevel=0.009, segments=4))
    # Rodapé com grade de ventilação (recuado 1,5 cm).
    P.append(B.plan_box('gel_rodape', 'grille', bx1 - 0.03, y0 + 0.02, bx1 + 0.045, y1 - 0.02, 0.012, 0.08, bevel=0.003))
    for k in range(7):
        z = 0.02 + k * 0.0085
        P.append(B.plan_box('gel_grade', 'rubber', bx1 + 0.045, y0 + 0.05, bx1 + 0.047, y1 - 0.05, z, z + 0.004))
    # Puxadores em barra (perfil 25 × 20 mm, afastados 3 cm da porta), do lado oposto às dobradiças.
    hy = y1 - 0.055
    for z0, z1 in ((split + 0.04, split + 0.34), (split - 0.46, split - 0.06)):
        P.append(B.plan_box('gel_puxador', 'steel_appliance', front + 0.03, hy - 0.0125, front + 0.05, hy + 0.0125, z0, z1, bevel=0.007, segments=4))
        for zz in (z0 + 0.025, z1 - 0.025):
            P.append(B.plan_box('gel_puxador_base', 'steel_appliance', front - 0.002, hy - 0.009, front + 0.032, hy + 0.009, zz - 0.012, zz + 0.012,
                                bevel=0.004, segments=3))
    # Capa da dobradiça superior (lado oposto ao puxador).
    P.append(B.plan_box('gel_dobradica', 'grille', front - door_t + 0.004, y0 + 0.004, front - 0.006, y0 + 0.05, H_ - 0.004, H_ + 0.008, bevel=0.003))
    for o in P:
        for poly in o.data.polygons:
            poly.use_smooth = False
    ob = B.join(P, 'MOV_geladeira')
    ob['lightmap'] = 'furn'
    print('[modelo] geladeira própria', round(front - bx0, 3), round(y1 - y0, 3), H_, flush=True)
    return ob


def chair_model(name):
    ob = M.import_model('cadeira', height=0.84, coll=B.coll('FURN'))
    ob.name = name
    for mat in ob.data.materials:
        if 'fabric' in mat.name:
            fiber_sheen(mat, 0.5)
    return ob


def cylinder_uv(ob, tile):
    """UV cilíndrica (veio ao longo do comprimento) para pés torneados."""
    me = ob.data
    uv = me.uv_layers.active or me.uv_layers.new()
    cx = sum(v.co.x for v in me.vertices) / len(me.vertices)
    cy = sum(v.co.y for v in me.vertices) / len(me.vertices)
    for poly in me.polygons:
        angs = []
        for li in poly.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            angs.append(math.atan2(co.y - cy, co.x - cx))
        ref = angs[0]
        for li, a in zip(poly.loop_indices, angs):
            if a - ref > math.pi:
                a -= 2 * math.pi
            elif ref - a > math.pi:
                a += 2 * math.pi
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (a * 0.03 / tile, co.z / tile)


def decor_pro():
    # Livros sobre o rack, junto aos vasos (book: rack com objetos).
    books_stack(((281 + 316) / 2 / B.PX - 42 / B.PX, (455 - 318) / B.PX), 0.52, n=3, rot=0.05, name='DEC_livros_rack')
    # Vasos de vidro próprios com flores sobre a mesa de jantar (rodada 4).
    # O asset de amostra da Khronos (CC0) traz dois vasos de TESTE: um em vidro "alpha" (transparência
    # rasterizada, sem refração — a borda escura vista nos renders) e outro em transmissão com parede de
    # espessura irregular. Aqui só os ramos de flores (Flowers1/2) são aproveitados; os vasos são modelados.
    path = os.path.join(B.ASSETS, 'khronos', 'GlassVaseFlowers.glb')
    mesa = B.item('mesa')
    x0, y0, x1, y1 = mesa['rect']
    top = mesa['z'][1]
    base = Vector(V((x0 + x1) / 2 + 0.12, (y0 + y1) / 2 - 0.22, top))
    S = 1.4  # mesma escala do arranjo anterior (vasos ≈ 10 × 20 cm)
    # Perfis externos (raio, altura) em m já na escala final: cilíndrico e de bojo suave.
    profiles = [
        [(0.050, 0.0), (0.051, 0.03), (0.050, 0.12), (0.047, 0.17), (0.046, 0.197)],
        [(0.044, 0.0), (0.052, 0.04), (0.053, 0.08), (0.046, 0.15), (0.040, 0.197)],
    ]
    vases = []
    flowers = []
    if os.path.exists(path):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=path)
        new_obs = [o for o in bpy.data.objects if o not in before]
        for o in new_obs:
            if o.type == 'MESH' and o.name.startswith('Flowers'):
                flowers.append(o)
            else:
                bpy.data.objects.remove(o)
        flowers.sort(key=lambda o: o.name)
    for k, prof in enumerate(profiles):
        # Centros dos vasos no asset original: x = 0,001 e 0,121 (escala 1) → espaçamento preservado.
        c = base + Vector(((k - 0.5) * 0.12 * S, 0, 0))
        v = glass_vase(f'DEC_vaso_vidro_{k + 1}', prof)
        v.location = c
        vases.append(v)
        if k < len(flowers):
            f = flowers[k]
            for col in f.users_collection:
                col.objects.unlink(f)
            B.coll('FURN').objects.link(f)
            f.parent = None
            bpy.context.view_layer.update()
            mw = f.matrix_world.copy()
            f.matrix_world = Matrix.Identity(4)
            f.data.transform(mw)
            # Centraliza o ramo no vaso, mantendo a altura relativa do asset (hastes até perto do fundo).
            xs = [vv.co.x for vv in f.data.vertices]
            ys = [vv.co.y for vv in f.data.vertices]
            f.data.transform(Matrix.Translation(Vector((-(min(xs) + max(xs)) / 2, -(min(ys) + max(ys)) / 2, 0))))
            f.data.transform(Matrix.Diagonal((S, S, S, 1)))
            f.location = c
            f.name = f'DEC_flores_{k + 1}'


def glass_vase(name, outer, wall=0.0028, bottom=0.009, segs=72):
    """Vaso de vidro por revolução com espessura real: parede de 2,8 mm, fundo de 9 mm, borda
    arredondada. Sólido fechado (normais consistentes) para a refração correta no Cycles e no
    KHR_materials_transmission/volume do glTF."""
    if 'vidro_vaso' not in B.MATS:
        m = B.make_mat('vidro_vaso', base=(0.97, 0.99, 0.985), roughness=0.0, transmission=1.0, ior=1.5)
        b = m.node_tree.nodes['Principled BSDF']
        b.inputs['Transmission Weight'].default_value = 1.0
        b.inputs['IOR'].default_value = 1.5
        b.inputs['Roughness'].default_value = 0.0
    H_ = outer[-1][1]
    r_rim = outer[-1][0]
    # Perfil fechado: eixo → fundo externo → parede externa → borda (meia-cana) → parede interna → fundo interno → eixo.
    pts = [(0.0, 0.0), (outer[0][0] - 0.004, 0.0), (outer[0][0] - 0.001, 0.0012)] + [(r, z) for r, z in outer[1:-1]]
    pts += [(r_rim, H_ - 0.0014)]
    for t in (0.2, 0.4, 0.5, 0.6, 0.8):  # borda em meia-cana
        a = math.pi * t
        pts.append((r_rim - wall / 2 + wall / 2 * math.cos(a), H_ - 0.0014 + wall / 2 * math.sin(a)))
    pts += [(r_rim - wall, H_ - 0.0014)]
    for r, z in reversed(outer[1:-1]):
        if z > bottom + 0.004:
            pts.append((r - wall, z))
    pts += [(outer[0][0] - wall - 0.004, bottom + 0.002), (outer[0][0] - wall - 0.008, bottom), (0.0, bottom)]
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        ang = 2 * math.pi * i / segs
        ring = []
        for j, (r, z) in enumerate(pts):
            if r == 0.0:
                ring.append(None)
            else:
                ring.append(bm.verts.new((r * math.cos(ang), r * math.sin(ang), z)))
        rings.append(ring)
    axis = {j: bm.verts.new((0, 0, z)) for j, (r, z) in enumerate(pts) if r == 0.0}
    n = len(pts)
    for i in range(segs):
        ra, rb = rings[i], rings[(i + 1) % segs]
        for j in range(n - 1):
            a0, a1, b0, b1 = ra[j], ra[j + 1], rb[j], rb[j + 1]
            if a0 is None:
                bm.faces.new((axis[j], b1, a1))
            elif a1 is None:
                bm.faces.new((a0, b0, axis[j + 1]))
            else:
                bm.faces.new((a0, b0, b1, a1))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(B.MATS['vidro_vaso'])
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    B.coll('FURN').objects.link(ob)
    # Bordas de fundo e borda superior com normais divididas (evita sombreamento "borrachudo").
    try:
        me.set_sharp_from_angle(angle=math.radians(40))
    except Exception:
        pass
    return ob


# =============================================================================
# Luz de interiores, câmera de fotografia de arquitetura e render
# =============================================================================

def entrance_hall():
    """Hall neutro do lado de fora da porta de entrada (aberta como no book).
    Sem ele, o vão da porta mostrava o céu do mundo (área estourada nas vistas para o oeste) e
    injetava luz de céu pela entrada, que num apartamento real dá para o corredor do prédio.
    Volume genérico (piso, teto e paredes lisas, sem luz própria), totalmente FORA do apartamento:
    não altera a geometria auditada nem as colisões, e não representa o corredor real do prédio
    (desconhecido). A luz natural continua vindo só da varanda."""
    w = next(x for x in B.L['walls'] if x['id'] == 'ext-oeste')
    o = next(x for x in w['openings'] if x['id'] == 'porta-entrada')
    xo = w['from'][0] - w['thickness'] / 2          # face externa da parede oeste
    ya, yb = o['offset'] - 0.6, o['offset'] + o['width'] + 0.6
    X0 = xo - 1.6                                   # profundidade genérica de corredor
    parts = [
        B.plan_box('hall_piso', 'granite_dark', X0, ya, xo, yb, -0.05, 0.0),
        B.plan_box('hall_teto', 'ceiling', X0, ya, xo, yb, 2.5, 2.55),
        B.plan_box('hall_fundo', 'paint', X0 - 0.05, ya, X0, yb, 0.0, 2.5),
        B.plan_box('hall_lado_a', 'paint', X0, ya - 0.05, xo, ya, 0.0, 2.5),
        B.plan_box('hall_lado_b', 'paint', X0, yb, xo, yb + 0.05, 0.0, 2.5),
    ]
    B.join(parts, 'ENTORNO_hall_entrada')


def interior_lighting():
    sky = B.build_lighting()
    sc = bpy.context.scene
    # Sem sol direto (orientação desconhecida): só céu físico difuso, mais intenso.
    sun = bpy.data.objects.get('LUZ_sol')
    if sun:
        bpy.data.objects.remove(sun)
    sky.sun_elevation = math.radians(55)
    nt = sc.world.node_tree
    bg = nt.nodes['Background']
    # Controle de "janela estourada": o céu VISTO PELA CÂMERA é atenuado, a luz que entra no
    # ambiente não muda (equivalente ao bracketing/HDR de fotografia de interiores).
    lp = nt.nodes.new('ShaderNodeLightPath')
    k = nt.nodes.new('ShaderNodeMath')
    k.operation = 'MULTIPLY_ADD'
    k.inputs[1].default_value = -(1 - WINDOW_SKY)
    k.inputs[2].default_value = 1.0
    nt.links.new(lp.outputs['Is Camera Ray'], k.inputs[0])
    nt.links.new(k.outputs[0], bg.inputs['Strength'])
    # LED da cozinha e pendente acesos (como nas perspectivas do book), discretos.
    B.MATS['led'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 12.0
    pl = bpy.data.lights.get('pendente')
    if pl:
        pl.energy = 25


CAMERAS = {
    # Sala + parte da cozinha (vista da entrada/jantar para a varanda).
    'sala-cozinha': dict(eye=(3.3, 4.4, 1.3), target=(0.3, 2.35, 1.3), lens=19, shift_y=-0.06),
    # Cozinha no ponto de vista aproximado da perspectiva oficial do book.
    'cozinha-book': dict(eye=(1.5, 5.62, 1.42), target=(0.42, 1.8, 1.3), lens=21, shift_y=-0.04),
    # Cozinha vista de dentro (da área de serviço para o jantar): bancada em primeiro plano, geladeira ao fundo.
    'cozinha': dict(eye=(3.35, 4.55, 1.4), target=(0.3, 2.9, 1.25), lens=22, shift_y=-0.08),
    # Detalhes para conferência rápida (sofá + tapete).
    'sofa-detalhe': dict(eye=(2.95, 3.25, 1.05), target=(1.9, 1.85, 0.45), lens=32, shift_y=0.0, pitch=True),
    'jantar-detalhe': dict(eye=(3.2, 4.25, 1.45), target=(2.2, 5.25, 0.55), lens=28, shift_y=0.0, pitch=True),
    # Câmeras de conferência para a navegação livre (ângulos não favoráveis / de perto).
    'conf-sofa-lateral': dict(eye=(1.75, 3.1, 0.9), target=(1.95, 1.8, 0.45), lens=30, shift_y=0.0, pitch=True),
    'conf-cozinha-perto': dict(eye=(1.25, 3.5, 1.6), target=(0.35, 2.6, 0.95), lens=28, shift_y=0.0, pitch=True),
    # Rodada 3: conferência dos modelos substituídos e dos detalhes corrigidos.
    'conf-geladeira': dict(eye=(2.45, 5.1, 1.5), target=(0.45, 3.9, 1.0), lens=26, shift_y=0.0, pitch=True),
    'conf-cuba': dict(eye=(0.95, 2.45, 1.5), target=(0.36, 2.25, 0.8), lens=30, shift_y=0.0, pitch=True),
    'conf-cadeira': dict(eye=(1.85, 4.2, 1.15), target=(2.85, 4.95, 0.5), lens=30, shift_y=0.0, pitch=True),
    # Rodada 4: tampo da mesa e vasos de perto.
    'conf-mesa': dict(eye=(2.15, 4.5, 1.1), target=(2.65, 5.1, 0.76), lens=35, shift_y=0.0, pitch=True),
    'conf-sofa-frente': dict(eye=(3.05, 2.8, 1.2), target=(1.95, 2.2, 0.5), lens=22, shift_y=0.0, pitch=True),
}


def camera(name):
    c = CAMERAS[name]
    sc = bpy.context.scene
    cam = bpy.data.objects.get('CAM_' + name)
    if not cam:
        cam = bpy.data.objects.new('CAM_' + name, bpy.data.cameras.new('CAM_' + name))
        sc.collection.objects.link(cam)
    cam.data.lens = c['lens']
    cam.data.sensor_width = 36
    cam.data.shift_y = c['shift_y']
    eye, tgt = V(*c['eye']), V(*c['target'])
    # Câmera nivelada (verticais retas, como em fotografia de arquitetura): sem inclinação.
    d = tgt - eye
    yaw = math.atan2(d.y, d.x)
    cam.location = eye
    pitch = math.atan2(d.z, math.hypot(d.x, d.y)) if c.get('pitch') else 0.0
    cam.rotation_euler = (math.pi / 2 + pitch, 0, yaw - math.pi / 2)
    sc.camera = cam
    return cam


def render(name):
    sc = bpy.context.scene
    camera(name)
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_adaptive_sampling = True
    sc.cycles.adaptive_threshold = 0.01
    sc.cycles.use_denoising = True
    sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    sc.cycles.max_bounces = 16
    sc.cycles.diffuse_bounces = 6
    sc.cycles.glossy_bounces = 8
    sc.cycles.transmission_bounces = 16
    sc.cycles.transparent_max_bounces = 16
    sc.cycles.blur_glossy = 0.5
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Base Contrast'
    sc.view_settings.exposure = EXPOSURE
    # Balanço de branco "de fotógrafo": neutraliza o azul da luz de céu.
    if hasattr(sc.view_settings, 'use_white_balance'):
        sc.view_settings.use_white_balance = True
        sc.view_settings.white_balance_temperature = 8000
        sc.view_settings.white_balance_tint = 4
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 92
    sc.render.filepath = os.path.join(OUT, f'render-{name}{"-previa" if PREVIEW else ""}.jpg')
    bpy.ops.render.render(write_still=True)
    print(f'[render] {sc.render.filepath}', flush=True)


def shift_dining(dx):
    """Desloca o conjunto de jantar (mesa, cadeiras, pendente e objetos da mesa) em x, só
    na cena ilustrativa — o layout auditado (sala-cozinha.ts) e a arquitetura não mudam."""
    if not dx:
        return
    for it in B.L['zoneItems']:
        if it['id'] == 'mesa':
            r = it['rect']
            it['rect'] = [r[0] + dx, r[1], r[2] + dx, r[3]]
        elif it['id'] in ('cadeira-1', 'cadeira-2', 'cadeira-3', 'cadeira-4', 'pendente', 'bowl-mesa'):
            it['at'] = [it['at'][0] + dx, it['at'][1]]
    print(f'[jantar] conjunto deslocado {dx:+.2f} m em x; cadeiras recolhidas={CHAIRS_TUCKED}', flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    shift_dining(MESA_DX)
    B.build_materials()
    B.make_mat('chair_fabric', color=B.processed('chair_fabric_grey', B.tex_path('acg', 'Fabric045', 'Color'),
                                                  B.recolor(B.srgb('#a9a49c'), 0.7)),
               normal=B.tex_path('acg', 'Fabric045', 'NormalGL'), nstrength=0.8, roughness=0.95, tile=0.18)
    B.TILE['granite'] = 0.35  # UV do tampo gerada no build_kitchen com esta escala
    refine_materials()
    bsdf('chair_fabric').inputs['Sheen Weight'].default_value = 0.6
    B.build_architecture()
    B.build_rack_tv_art()
    B.build_kitchen()
    B.build_service()
    fridge_model()
    sofa_model()
    rug_pro()
    dining_pro()
    curtains()
    decor_pro()
    entrance_hall()
    # Acessórios CC0 (Poly Haven): plantas, vasos, pendente, bowl, tábua… (sem as cadeiras antigas).
    B.L['zoneItems'] = [i for i in B.L['zoneItems'] if i.get('asset') != 'dining_chair_02']
    B.place_assets()
    interior_lighting()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, BLEND_NAME))
    if '--no-render' in ARGS:
        return
    which = [a for a in ARGS if a in CAMERAS] or ['sala-cozinha']
    for name in which:
        render(name)


main()
