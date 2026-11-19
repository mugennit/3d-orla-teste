"""
Renders de conferência a partir de .cache/build/scene.blend (Cycles, CPU).

  PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/conference_renders.py -- <pasta_saida> [topo] [jantar]

- topo   : planta em projeção ORTOGRÁFICA verdadeira, mesma escala/enquadramento do recorte
           public/referencias/orla-45m2-planta-p17.png (para sobreposição), corte a 1,50 m.
- jantar : conjunto de jantar visto de cima, de lado e na altura dos olhos.
"""
import bpy  # noqa: I001
import math
import os
import sys

from mathutils import Vector

ARGS = sys.argv[sys.argv.index('--') + 1:]
OUT = ARGS[0]
WHAT = set(ARGS[1:]) or {'topo', 'jantar'}
os.makedirs(OUT, exist_ok=True)
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
bpy.ops.wm.open_mainfile(filepath=os.path.join(REPO, '.cache', 'build', 'scene.blend'))
sc = bpy.context.scene
PPM = 79.88  # px/m da calibração (apto-45m2.ts)
sc.cycles.use_denoising = True
sc.view_settings.view_transform = 'AgX'
sc.view_settings.exposure = 1.0
sc.render.image_settings.file_format = 'JPEG'


def cam(name, ortho=False, scale=1.0, lens=35):
    c = bpy.data.objects.new(name, bpy.data.cameras.new(name))
    sc.collection.objects.link(c)
    c.data.type = 'ORTHO' if ortho else 'PERSP'
    c.data.ortho_scale = scale
    c.data.lens = lens
    c.data.clip_end = 100
    sc.camera = c
    return c


def look(c, eye, target):
    c.location = Vector(eye)
    c.rotation_euler = (Vector(target) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()


def render(path, res, samples=48):
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.cycles.samples = samples
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def hide_above(z):
    """Corte horizontal: oculta objetos cujo ponto mais baixo está acima de z (aéreos, pendente, forro)."""
    hidden = []
    for o in sc.objects:
        if o.type != 'MESH' or o.hide_render:
            continue
        zmin = min((o.matrix_world @ Vector(b)).z for b in o.bound_box)
        if zmin > z or o.name in ('ARQ_forro', 'VIDROS'):
            o.hide_render = True
            hidden.append(o)
    return hidden


if 'topo' in WHAT:
    hidden = hide_above(1.5)
    c = cam('topo', ortho=True, scale=720 / PPM)
    cx, cy = (380 - 42) / PPM, (540 - 318) / PPM  # centro do recorte (720×520 px a partir de (20, 280))
    c.location = (cx, -cy, 30)
    c.rotation_euler = (0, 0, 0)
    render(os.path.join(OUT, 'topo-ortogonal.jpg'), (1440, 1040))
    for o in hidden:
        o.hide_render = False

if 'jantar' in WHAT:
    mesa = bpy.data.objects['MOV_mesa']
    bb = [mesa.matrix_world @ Vector(b) for b in mesa.bound_box]
    m = sum(bb, Vector()) / 8
    m.z = 0.45
    hid = [o for o in sc.objects if o.name in ('ARQ_forro', 'DEC_pendente')]
    for o in hid:
        o.hide_render = True
    c = cam('jantar_topo', ortho=True, scale=2.2)
    c.location = (m.x, m.y, 10)
    c.rotation_euler = (0, 0, 0)
    render(os.path.join(OUT, 'jantar-topo.jpg'), (1000, 1000))
    c = cam('jantar_lado', ortho=True, scale=2.4)
    look(c, (m.x, m.y + 4.0, 0.6), (m.x, m.y, 0.6))  # elevação a partir do norte (planta)
    render(os.path.join(OUT, 'jantar-lateral.jpg'), (1200, 800))
    for o in hid:
        o.hide_render = False
    c = cam('jantar_olho', lens=24)
    look(c, (m.x + 0.2, m.y + 2.3, 1.6), (m.x, m.y - 0.1, 0.55))
    render(os.path.join(OUT, 'jantar-altura-olhos.jpg'), (1200, 800), samples=64)
print('[renders] ok', flush=True)
