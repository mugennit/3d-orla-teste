"""
Verificação de circulação e colisões da cena-mestra (sala/cozinha), a partir da
geometria real do .blend (paredes, portas, móveis importados), não das caixas do layout.

  PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/circulation_check.py -- [arquivo.blend] [saida_dir]

Método:
  1. Corta a cena na faixa de altura 0,05–1,50 m (o que bloqueia o corpo; tapete e piso
     ficam de fora) e rasteriza a projeção em planta a 1 cm.
  2. Transformada de distância (OpenCV): para cada rota entre dois pontos de uso, procura
     o maior diâmetro de "pessoa" (disco) que passa — é a largura útil do gargalo.
  3. Colisões: casco convexo de cada móvel na faixa 0,05–0,65 m (abaixo do tampo da mesa:
     pernas, assentos, pés) e interseção par a par.
Referências: NBR 9050 (0,90 m para circulação com uma pessoa; 0,80 m pontual em portas) e
prática de projeto de interiores (≥ 0,60–0,75 m livres atrás da cadeira para sentar).
"""
import json
import math
import os
import sys

import bpy
import cv2
import numpy as np
from shapely.geometry import MultiPoint

args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BLEND = args[0] if args else os.path.join(REPO, '.cache', 'master', 'sala-cozinha.blend')
OUT = args[1] if len(args) > 1 else os.path.join(REPO, 'docs', 'm1', 'rodada3')
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=BLEND)

RES = 0.01  # m por pixel
X0, Y0, X1, Y1 = 0.0, 0.0, 3.6, 5.9  # sala, cozinha, jantar, varanda (planta, m)
Z_LO, Z_HI = 0.05, 1.50
W_, H_ = int((X1 - X0) / RES), int((Y1 - Y0) / RES)
SKIP = ('tapete', 'rug', 'piso', 'floor', 'teto', 'ceiling', 'LUZ', 'sky', 'CEU', 'Plane', 'VIDROS', 'cortina', 'ENTORNO_')


def to_px(x, y):
    return (x - X0) / RES, (y - Y0) / RES


occ = np.zeros((H_, W_), np.uint8)
occ_nochair = np.zeros((H_, W_), np.uint8)   # para medir o uso: sem as cadeiras
masks = {}                                    # máscara de cada móvel na faixa 0,05–0,65 m
bounds = {}
dg = bpy.context.evaluated_depsgraph_get()
furn_hulls = {}
for ob in bpy.context.scene.objects:
    if ob.type != 'MESH' or ob.hide_render or any(k.lower() in ob.name.lower() for k in SKIP):
        continue
    ev = ob.evaluated_get(dg)
    me = ev.to_mesh()
    mw = ob.matrix_world
    co = np.array([mw @ v.co for v in me.vertices]) if len(me.vertices) else np.zeros((0, 3))
    if not len(co):
        ev.to_mesh_clear()
        continue
    px = co[:, 0]
    py = -co[:, 1]  # Blender y = −planta y
    pz = co[:, 2]
    polys = []
    band_idx = set()
    for p in me.polygons:
        idx = list(p.vertices)
        zs = pz[idx]
        if zs.max() < Z_LO or zs.min() > Z_HI:
            continue
        polys.append(np.array([to_px(px[i], py[i]) for i in idx], np.float32))
        if zs.max() >= Z_LO and zs.min() <= 0.65:
            band_idx.update(idx)
    if polys:
        pts = [np.round(pp).astype(np.int32) for pp in polys]
        cv2.fillPoly(occ, pts, 255)
        cv2.polylines(occ, pts, True, 255, 1)
        if not ob.name.startswith('MOV_cadeira'):
            cv2.fillPoly(occ_nochair, pts, 255)
            cv2.polylines(occ_nochair, pts, True, 255, 1)
    if ob.name.startswith(('MOV_', 'AST_', 'DEC_')):
        bpolys = [np.round(np.array([to_px(px[i], py[i]) for i in list(p.vertices)], np.float32)).astype(np.int32)
                  for p in me.polygons if pz[list(p.vertices)].max() >= Z_LO and pz[list(p.vertices)].min() <= 0.65]
        if bpolys:
            mk = np.zeros((H_, W_), np.uint8)
            cv2.fillPoly(mk, bpolys, 1)
            masks[ob.name] = mk
        bounds[ob.name] = tuple(float(v) for v in (px.min(), py.min(), px.max(), py.max()))
    if ob.name.startswith('MOV_') or ob.name.startswith('AST_'):
        bi = sorted(band_idx)
        if len(bi) >= 3:
            furn_hulls[ob.name] = MultiPoint(list(zip(px[bi], py[bi]))).convex_hull
    ev.to_mesh_clear()

# Porta de correr da varanda (2 folhas de 0,90 m): considerada ABERTA, com a folha móvel
# recolhida sobre a fixa do lado do sofá (x 1,60–2,50 m); o vão livre é x 2,50–3,40 m.
# Os perfis da esquadria nesse vão (trilho de piso) não bloqueiam a passagem.
ox0, ox1 = to_px(2.50, 0)[0], to_px(3.40, 0)[0]
oy0, oy1 = to_px(0, 0.93)[1], to_px(0, 1.07)[1]
occ[int(oy0):int(oy1), int(ox0):int(ox1)] = 0
free = (occ == 0).astype(np.uint8)
dist = cv2.distanceTransform(free, cv2.DIST_L2, 5) * RES  # m até o obstáculo mais próximo

ROUTES = {
    'porta de entrada → bancada da cozinha': ((0.45, 5.35), (1.05, 2.6)),
    'porta de entrada → sofá (frente)': ((0.45, 5.35), (2.62, 1.9)),
    'porta de entrada → corredor dos quartos': ((0.45, 5.35), (3.47, 4.05)),
    'sala → varanda (porta de correr)': ((2.62, 1.9), (2.62, 0.6)),
    'cozinha → geladeira (frente)': ((1.05, 2.6), (1.05, 3.97)),
    'cozinha → mesa de jantar': ((1.05, 3.97), (2.23, 4.45)),
}


def bottleneck(a, b, reach=0.45):
    """Maior diâmetro (m) de um disco que vai da região de a até a de b (raio `reach`)
    sem tocar obstáculos — a largura útil do trecho mais estreito do caminho."""
    yy, xx = np.mgrid[0:H_, 0:W_]
    def region(p):
        cx, cy = to_px(*p)
        return (xx - cx) ** 2 + (yy - cy) ** 2 <= (reach / RES) ** 2
    ra, rb = region(a), region(b)
    lo, hi = 0.0, 1.5
    best = 0.0
    for _ in range(14):
        r = (lo + hi) / 2
        ok = (dist > r).astype(np.uint8)
        n, lab = cv2.connectedComponents(ok, connectivity=8)
        la = set(np.unique(lab[ra & (ok > 0)])) - {0}
        lb = set(np.unique(lab[rb & (ok > 0)])) - {0}
        if la & lb:
            best, lo, comp = r, r, np.isin(lab, list(la & lb))
        else:
            hi = r
    # Onde está o gargalo: pontos do caminho viável com folga mínima (≈ best).
    pinch = None
    if best > 0:
        cand = comp & (dist < best + 0.015)
        ys_, xs_ = np.nonzero(cand)
        if len(xs_):
            pinch = (round(float(xs_.mean() * RES + X0), 2), round(float(ys_.mean() * RES + Y0), 2))
    return round(2 * best, 2), pinch


report = {'faixa_altura_m': [Z_LO, Z_HI], 'rotas': {}, 'colisoes': [], 'folgas': {}}
vis = cv2.cvtColor(255 - occ, cv2.COLOR_GRAY2BGR)
for name, (a, b) in ROUTES.items():
    w, pinch = bottleneck(a, b)
    status = 'adequada' if w >= 0.90 else ('aceitável (pontual)' if w >= 0.75 else 'estreita')
    report['rotas'][name] = dict(largura_util_m=w, situacao=status)
    for p_, c in ((a, (0, 140, 0)), (b, (0, 0, 200))):
        cv2.circle(vis, tuple(int(v) for v in to_px(*p_)), 6, c, -1)
    cv2.line(vis, tuple(int(v) for v in to_px(*a)), tuple(int(v) for v in to_px(*b)), (200, 120, 0), 1)

names = sorted(furn_hulls)
mnames = sorted(masks)
for i, n1 in enumerate(mnames):
    for n2 in mnames[i + 1:]:
        if {n1, n2} == {'MOV_cozinha', 'MOV_cozinha_metais'}:
            continue  # forno/cooktop embutidos no gabinete (intencional)
        inter = int((masks[n1] & masks[n2]).sum())
        if inter >= 4:  # ≥ 4 cm² de sobreposição real (pés, assentos, pernas)
            report['colisoes'].append(dict(a=n1, b=n2, area_cm2=inter))

# Folgas específicas (casco a casco / casco a obstáculo).
def gap(n1, n2):
    return round(furn_hulls[n1].distance(furn_hulls[n2]), 3) if n1 in furn_hulls and n2 in furn_hulls else None


report['folgas']['sofá ↔ rack (passagem para a varanda)'] = gap('MOV_sofa', 'MOV_rack') if 'MOV_rack' in furn_hulls else None
for c in ('MOV_cadeira-1', 'MOV_cadeira-2', 'MOV_cadeira-3', 'MOV_cadeira-4'):
    if c in furn_hulls:
        h = furn_hulls[c]
        # espaço livre atrás da cadeira (afastá-la para sentar): distância do casco ao obstáculo mais próximo no lado oposto à mesa
        cx, cy = h.centroid.x, h.centroid.y
        side = -1 if cx < 2.23 else 1
        xs = [x for x, _ in h.exterior.coords]
        back = min(xs) if side < 0 else max(xs)
        free_m = 0.0
        x = back
        for _ in range(25):  # sai do próprio contorno da cadeira (o encosto inclinado passa do casco dos pés)
            ix, iy = int(to_px(x, cy)[0]), int(to_px(x, cy)[1])
            if not occ[iy, ix]:
                break
            x += side * RES
        while 0 < x < X1:
            x += side * RES
            ix, iy = int(to_px(x, cy)[0]), int(to_px(x, cy)[1])
            if not (0 <= ix < W_) or occ[iy, ix]:
                break
            free_m += RES
        report['folgas'][f'{c[4:]}: livre atrás do encosto'] = round(free_m, 2)
# USO REAL DA MESA: distância livre da borda do tampo até o obstáculo atrás de cada lugar
# (sem as cadeiras). Referências de projeto: ≥ 0,75 m para afastar a cadeira e sentar;
# ≥ 0,90 m para sentar com conforto e alguém passar atrás com dificuldade; ≥ 1,10 m para
# passar atrás de quem está sentado.
if 'MOV_mesa' in bounds:
    tx0, ty0, tx1, ty1 = bounds['MOV_mesa']
    report['uso_mesa'] = {'tampo_x_m': [round(tx0, 3), round(tx1, 3)]}
    for c in ('MOV_cadeira-1', 'MOV_cadeira-2', 'MOV_cadeira-3', 'MOV_cadeira-4'):
        if c not in bounds:
            continue
        cy = (bounds[c][1] + bounds[c][3]) / 2
        cx = (bounds[c][0] + bounds[c][2]) / 2
        side = -1 if cx < (tx0 + tx1) / 2 else 1
        edge = tx0 if side < 0 else tx1
        clear = []
        for dy in np.arange(-0.2, 0.21, 0.05):
            x, d = edge + side * 0.02, 0.02
            while 0 < x < X1 - RES:
                ix, iy = int(to_px(x, cy + dy)[0]), int(to_px(x, cy + dy)[1])
                if occ_nochair[iy, ix]:
                    break
                x += side * RES
                d += RES
            clear.append(float(d))
        m = round(min(clear), 2)
        sit = 'confortável' if m >= 0.90 else ('funcional (mínimo)' if m >= 0.75 else 'INSUFICIENTE para sentar')
        report['uso_mesa'][c[4:]] = dict(borda_ate_obstaculo_m=m, situacao=sit)
    # Porta de entrada: giro da folha (0,85 m) não modelado; pior caso = faixa x ≤ 0,10 + 0,85 m.
    report['uso_mesa']['nota_porta_entrada'] = (
        'lugares a oeste: borda da mesa a {:.2f} m da linha de giro da porta (x = 0,95 m)'.format(tx0 - 0.95))
for n in names:
    b = furn_hulls[n].bounds
    report.setdefault('dimensoes_planta_m', {})[n] = [round(b[2] - b[0], 3), round(b[3] - b[1], 3)]

for n, h in furn_hulls.items():
    pts = np.array([to_px(x, y) for x, y in h.exterior.coords], np.int32)
    cv2.polylines(vis, [pts], True, (40, 40, 220) if any(n in (c['a'], c['b']) for c in report['colisoes']) else (60, 160, 60), 2)
vis = cv2.flip(vis, 0) if False else vis
cv2.imwrite(os.path.join(OUT, 'circulacao.png'), vis)
if os.environ.get('CIRC_DEBUG'):
    r = float(os.environ['CIRC_DEBUG']) / 2
    ok = ((dist > r) * 255).astype(np.uint8)
    dbg = cv2.cvtColor(255 - occ, cv2.COLOR_GRAY2BGR)
    dbg[ok == 0] = (dbg[ok == 0] * 0.5 + np.array([0, 0, 120])).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'circulacao-debug.png'), dbg)
json.dump(report, open(os.path.join(OUT, 'circulacao.json'), 'w'), indent=1, ensure_ascii=False)
print(json.dumps(report, indent=1, ensure_ascii=False))
