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
EXPOSURE = float(ARGS[ARGS.index('--exposure') + 1]) if '--exposure' in ARGS else 1.3
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
    # Granito polido.
    b = bsdf('granite')
    b.inputs['Coat Weight'].default_value = 0.5
    b.inputs['Coat Roughness'].default_value = 0.05
    # Revestimento cerâmico vitrificado.
    bsdf('backsplash').inputs['Coat Weight'].default_value = 0.6
    bsdf('backsplash').inputs['Coat Roughness'].default_value = 0.04

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
    s.tension_stiffness = 12
    s.compression_stiffness = 12
    s.shear_stiffness = 6
    s.bending_stiffness = 0.6
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

def sofa_pro():
    it = B.item('sofa')
    x0, y0, x1, y1 = it['rect']
    W, D = abs(y1 - y0), abs(x1 - x0)
    arm, seat_h = 0.15, 0.42
    parts = []
    # Base estofada e braços (cantos macios, costura implícita pela suavização).
    parts.append(smooth_box('sofa_base', 'linen_grey', (D - 0.02, W - 2 * arm + 0.03, 0.2), (0.0, 0, 0.13 + 0.1), bevel=0.04))
    for s in (-1, 1):
        parts.append(smooth_box('sofa_braco', 'linen_grey', (D, arm, 0.48), (0, s * (W / 2 - arm / 2), 0.11 + 0.24), bevel=0.06))
    parts.append(smooth_box('sofa_costas', 'linen_grey', (0.16, W - 2 * arm + 0.02, 0.44), (-D / 2 + 0.08, 0, 0.23 + 0.22), bevel=0.05))
    cw = (W - 2 * arm) / 2
    for s in (-0.5, 0.5):
        parts.append(cushion('sofa_assento', 'linen_grey', (D - 0.2, cw - 0.012, 0.15), (0.07, s * cw, seat_h - 0.06), pressure=3.5))
        parts.append(cushion('sofa_encosto', 'linen_grey', (0.17, cw - 0.02, 0.42), (-D / 2 + 0.22, s * cw, seat_h + 0.2),
                             pressure=4.5, rot=(0, -0.2, 0)))
    # Rolos laterais (book): cilindros macios com franzido nas pontas.
    for s in (-1, 1):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=0.095, radius2=0.095, depth=0.46)
        bmesh.ops.subdivide_edges(bm, edges=[e for e in bm.edges if abs(e.verts[0].co.z - e.verts[1].co.z) > 0.1], cuts=8)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 2, 3, 'Y'))
        me = bpy.data.meshes.new('rolo')
        bm.to_mesh(me)
        bm.free()
        me.materials.append(B.MATS['linen_grey'])
        ob = bpy.data.objects.new('rolo', me)
        B.coll('FURN').objects.link(ob)
        inflate(ob, pressure=2.5, frames=12)
        sub = ob.modifiers.new('sub', 'SUBSURF')
        sub.levels = sub.render_levels = 1
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=sub.name)
        for p in ob.data.polygons:
            p.use_smooth = True
        ob.location = (0.02, s * (W / 2 - arm - 0.1), seat_h + 0.18)
        parts.append(ob)
    # Almofadas de decoração (tecido infladas: cantos "orelha" e rugas).
    for s, mt, rz, tilt in ((-0.17, 'pillow_sage', 0.18, -0.35), (0.16, 'pillow_ochre', -0.12, -0.3)):
        parts.append(cushion('almofada', mt, (0.45, 0.45, 0.06), (-D / 2 + 0.32, s, seat_h + 0.26), cuts=18, pressure=6.0, bevel=0.005,
                             rot=(math.pi / 2 + rz * 0.2, tilt, math.pi / 2 + rz)))
    # Pés cônicos em madeira.
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(tapered_leg('sofa_pe', 'oak_warm', 0.022, 0.014, 0.13, (sx * (D / 2 - 0.07), sy * (W / 2 - 0.07), 0.0)))
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


def dining_pro():
    it = B.item('mesa')
    x0, y0, x1, y1 = it['rect']
    hz = it['z'][1]
    parts = [smooth_box('mesa_tampo', 'oak_warm', (abs(x1 - x0), abs(y1 - y0) - 0.01, 0.032), V((x0 + x1) / 2, (y0 + y1) / 2 - 0.005, hz - 0.016),
                        bevel=0.006, sub=1)]
    for lx in (x0 + 0.07, x1 - 0.07):
        for ly in (y0 + 0.07, y1 - 0.08):
            p = V(lx, ly, 0)
            parts.append(tapered_leg('mesa_pe', 'oak_warm', 0.024, 0.017, hz - 0.032, (p.x, p.y, 0)))
    parts.append(B.plan_box('mesa_saia', 'oak_warm', x0 + 0.06, y0 + 0.06, x1 - 0.06, y1 - 0.07, hz - 0.1, hz - 0.032, bevel=0.003))
    t = B.join(parts, 'MOV_mesa')
    t['lightmap'] = 'furn'
    for cid in ('cadeira-1', 'cadeira-2', 'cadeira-3', 'cadeira-4'):
        c = B.item(cid)
        ob = shell_chair(f'MOV_{cid}')
        ob.rotation_mode = 'XYZ'
        ob.rotation_euler = (0, 0, B.FACING[c['facing']])
        ob.location = V(c['at'][0], c['at'][1], 0)
        ob['lightmap'] = 'furn'


def rug_pro():
    it = B.item('tapete')
    r = it['scale'] / 2
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=160, radius1=r, radius2=r, depth=0.014)
    bmesh.ops.translate(bm, vec=V(it['at'][0], it['at'][1], 0.0075), verts=bm.verts)
    B.world_uv(bm, B.TILE['rug'])
    o = B.mesh_obj('MOV_tapete', bm, 'rug', 'FURN')
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


def decor_pro():
    # Livros sobre o rack, junto aos vasos (book: rack com objetos).
    books_stack(((281 + 316) / 2 / B.PX - 42 / B.PX, (455 - 318) / B.PX), 0.52, n=3, rot=0.05, name='DEC_livros_rack')
    # Livros + bandeja na mesa? Mantém mesa limpa com bowl. Livros na prateleira da cozinha não (book: vasos).


# =============================================================================
# Luz de interiores, câmera de fotografia de arquitetura e render
# =============================================================================

def interior_lighting():
    sky = B.build_lighting()
    sc = bpy.context.scene
    # Sem sol direto (orientação desconhecida): só céu físico difuso, mais intenso.
    sun = bpy.data.objects.get('LUZ_sol')
    if sun:
        bpy.data.objects.remove(sun)
    sky.sun_elevation = math.radians(55)
    sc.world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.0
    # LED da cozinha e pendente acesos (como nas perspectivas do book), discretos.
    B.MATS['led'].node_tree.nodes['Principled BSDF'].inputs['Emission Strength'].default_value = 12.0
    pl = bpy.data.lights.get('pendente')
    if pl:
        pl.energy = 25


CAMERAS = {
    # Sala + parte da cozinha (vista da entrada/jantar para a varanda).
    'sala-cozinha': dict(eye=(3.05, 5.55, 1.3), target=(1.3, 1.0, 1.3), lens=19, shift_y=-0.07),
    # Cozinha no ponto de vista aproximado da perspectiva oficial do book.
    'cozinha-book': dict(eye=(1.85, 4.95, 1.45), target=(0.45, 1.9, 1.3), lens=22, shift_y=-0.04),
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
    cam.rotation_euler = (math.pi / 2, 0, yaw - math.pi / 2)
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
    sc.cycles.max_bounces = 12
    sc.cycles.diffuse_bounces = 6
    sc.cycles.glossy_bounces = 4
    sc.cycles.transmission_bounces = 8
    sc.cycles.transparent_max_bounces = 16
    sc.cycles.blur_glossy = 0.5
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Base Contrast'
    sc.view_settings.exposure = EXPOSURE
    # Balanço de branco "de fotógrafo": neutraliza o azul da luz de céu.
    if hasattr(sc.view_settings, 'use_white_balance'):
        sc.view_settings.use_white_balance = True
        sc.view_settings.white_balance_temperature = 7400
        sc.view_settings.white_balance_tint = 4
    sc.render.resolution_x, sc.render.resolution_y = RES
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'JPEG'
    sc.render.image_settings.quality = 92
    sc.render.filepath = os.path.join(OUT, f'render-{name}{"-previa" if PREVIEW else ""}.jpg')
    bpy.ops.render.render(write_still=True)
    print(f'[render] {sc.render.filepath}', flush=True)


def main():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = 'METRIC'
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    B.build_materials()
    B.make_mat('chair_fabric', color=B.processed('chair_fabric_grey', B.tex_path('acg', 'Fabric045', 'Color'),
                                                  B.recolor(B.srgb('#a9a49c'), 0.7)),
               normal=B.tex_path('acg', 'Fabric045', 'NormalGL'), nstrength=0.8, roughness=0.95, tile=0.18)
    refine_materials()
    bsdf('chair_fabric').inputs['Sheen Weight'].default_value = 0.6
    B.build_architecture()
    B.build_rack_tv_art()
    B.build_kitchen()
    B.build_service()
    sofa_pro()
    rug_pro()
    dining_pro()
    curtains()
    decor_pro()
    # Acessórios CC0 (Poly Haven): plantas, vasos, pendente, bowl, tábua… (sem as cadeiras antigas).
    B.L['zoneItems'] = [i for i in B.L['zoneItems'] if i.get('asset') != 'dining_chair_02']
    B.place_assets()
    interior_lighting()
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'sala-cozinha.blend'))
    which = [a for a in ARGS if a in CAMERAS] or ['sala-cozinha']
    for name in which:
        render(name)


main()
