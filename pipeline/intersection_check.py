"""
Verificação de interseções entre móveis, decoração e arquitetura (M3).

  PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/intersection_check.py -- [cena.blend] [saida.json]

Para cada par de objetos cujas caixas se sobrepõem, conta os vértices de um que estão DENTRO do
outro a mais de TOL (teste do ponto mais próximo + normal, malhas fechadas ou quase). Contatos
de apoio (objeto sobre o tampo, móvel encostado na parede) ficam abaixo da tolerância e não
contam. Pares arquitetura×arquitetura (paredes que se encontram) são ignorados.
Sai com código 1 se houver interseção não justificada.
"""
import json
import os
import sys

import bpy  # noqa: I001 (bpy antes de bmesh)
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ARGS = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BLEND = ARGS[0] if ARGS else os.path.join(REPO, '.cache', 'master', 'export.blend')
OUT = ARGS[1] if len(ARGS) > 1 else os.path.join(REPO, '.cache', 'master', 'intersecoes.json')
TOL = 0.006          # penetração mínima considerada (m)
MIN_VERTS = 3        # vértices penetrando para contar como interseção
# Encostos/encaixes intencionais (documentados): cadeira recolhida sob o tampo, vasos/flores, etc.
ALLOWED = {
    frozenset(('DEC_flores_1', 'DEC_vaso_vidro_1')), frozenset(('DEC_flores_2', 'DEC_vaso_vidro_2')),
}

bpy.ops.wm.open_mainfile(filepath=BLEND)
dg = bpy.context.evaluated_depsgraph_get()


def kind(o):
    n = o.name
    if n.startswith(('ARQ_', 'ESQ_', 'PORTA', 'VIDROS')) or o.get('lightmap') == 'arch' and not n.startswith(('MOV_', 'DEC_', 'ENTORNO_')):
        return 'arq'
    return 'mov'


objs = []
for o in bpy.data.objects:
    if o.type != 'MESH' or o.hide_render or not o.data.polygons:
        continue
    bm = bmesh.new()
    bm.from_object(o, dg)
    bm.transform(o.matrix_world)
    bm.normal_update()
    verts = [v.co.copy() for v in bm.verts]
    if not verts:
        bm.free()
        continue
    lo = Vector((min(v.x for v in verts), min(v.y for v in verts), min(v.z for v in verts)))
    hi = Vector((max(v.x for v in verts), max(v.y for v in verts), max(v.z for v in verts)))
    tree = BVHTree.FromBMesh(bm)
    objs.append(dict(name=o.name, kind=kind(o), lo=lo, hi=hi, tree=tree, verts=verts[:: max(1, len(verts) // 4000)]))
    bm.free()


def inside_count(a, b):
    n, deepest = 0, 0.0
    for p in a['verts']:
        if not all(b['lo'][i] - 0.001 <= p[i] <= b['hi'][i] + 0.001 for i in range(3)):
            continue
        hit = b['tree'].find_nearest(p)
        if hit[0] is None:
            continue
        loc, nor, _, dist = hit
        if (p - loc).dot(nor) < 0 and dist > TOL:
            n += 1
            deepest = max(deepest, dist)
    return n, deepest


report = []
for i, a in enumerate(objs):
    for b in objs[i + 1:]:
        if a['kind'] == 'arq' and b['kind'] == 'arq':
            continue
        if any(a['hi'][k] < b['lo'][k] or b['hi'][k] < a['lo'][k] for k in range(3)):
            continue
        if not a['tree'].overlap(b['tree']):
            continue
        n1, d1 = inside_count(a, b)
        n2, d2 = inside_count(b, a)
        if max(n1, n2) >= MIN_VERTS:
            ok = frozenset((a['name'], b['name'])) in ALLOWED
            report.append(dict(a=a['name'], b=b['name'], vertices=[n1, n2], penetracao_m=round(max(d1, d2), 3), permitido=ok))

report.sort(key=lambda r: -r['penetracao_m'])
json.dump(report, open(OUT, 'w'), indent=1, ensure_ascii=False)
bad = [r for r in report if not r['permitido']]
for r in report:
    print(('  ok ' if r['permitido'] else '[X] ') + f"{r['a']} × {r['b']}: {r['penetracao_m'] * 100:.1f} cm, vértices {r['vertices']}")
print(f'[intersecoes] {len(bad)} não justificadas de {len(report)} encontradas ({len(objs)} objetos)')
sys.exit(1 if bad else 0)
