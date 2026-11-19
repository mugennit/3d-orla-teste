"""
Auditoria dimensional independente: mede as FACES das paredes diretamente na imagem
da planta (perfis perpendiculares a cada parede) e compara com o modelo.

  python3 pipeline/dimension_audit.py   (requer .cache/build/layout.json)
Saídas: docs/etapa2-revisao/auditoria-dimensional.md e .json
"""
import json
import math
import os

import numpy as np
from PIL import Image

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
L = json.load(open(os.path.join(REPO, '.cache/build/layout.json')))
PPM = L['pxPerMeter']
ORIGIN = (42, 318)  # px da página = (0, 0) da planta
CROP = (20, 280)    # recorte salvo em public/referencias
img = np.asarray(Image.open(os.path.join(REPO, 'public/referencias/orla-45m2-planta-p17.png')).convert('RGB')).astype(int)


def wall_px(x, y):
    """Pixel de parede: concreto (escuro) ou drywall (amarelo). Coordenadas em px da página."""
    cx, cy = int(round(x - CROP[0])), int(round(y - CROP[1]))
    if not (0 <= cx < img.shape[1] and 0 <= cy < img.shape[0]):
        return False
    r, g, b = img[cy, cx]
    return max(r, g, b) < 85 or (r > 190 and g > 180 and b < 110)


def to_px(p):
    return (p[0] * PPM + ORIGIN[0], p[1] * PPM + ORIGIN[1])


def measure_wall(w, samples=7):
    """Retorna deslocamentos médios (px) das duas faces medidas em relação ao eixo do modelo."""
    (fx, fy), (tx, ty) = to_px(w['from']), to_px(w['to'])
    ln = math.hypot(tx - fx, ty - fy)
    ux, uy = (tx - fx) / ln, (ty - fy) / ln
    nx, ny = -uy, ux
    # trechos sólidos de altura total (sem vãos), recuados 12 px das pontas
    spans = [(p['center'], p['length']) for p in w['pieces'] if p['bottom'] == 0 and p['top'] >= 2.4]
    res = []
    for (c, length) in spans:
        cpx = to_px(c)
        half = length * PPM / 2 - 12
        if half <= 2:
            continue
        for k in range(samples):
            t = -half + 2 * half * k / max(samples - 1, 1)
            ox, oy = cpx[0] + ux * t, cpx[1] + uy * t
            prof = [wall_px(ox + nx * d, oy + ny * d) for d in np.arange(-15, 15.25, 0.25)]
            ds = np.arange(-15, 15.25, 0.25)
            on = np.array(prof)
            if not on.any():
                continue
            # corrida contínua de parede mais próxima do eixo
            idx = np.where(on)[0]
            centre = idx[np.argmin(np.abs(ds[idx]))]
            a = b = centre
            while a > 0 and on[a - 1]:
                a -= 1
            while b < len(on) - 1 and on[b + 1]:
                b += 1
            res.append((ds[a] - 0.125, ds[b] + 0.125))
    if not res:
        return None
    arr = np.array(res)
    return {'face_neg_px': float(np.median(arr[:, 0])), 'face_pos_px': float(np.median(arr[:, 1])), 'n': len(res)}


rows = []
faces = {}
for w in L['walls']:
    if w['structure'] in ('railing',):
        continue
    m = measure_wall(w)
    tpx = w['thickness'] * PPM
    if not m:
        rows.append({'parede': w['id'], 'medido': None})
        continue
    meas_t = m['face_pos_px'] - m['face_neg_px']
    centre_off = (m['face_pos_px'] + m['face_neg_px']) / 2
    rows.append({
        'parede': w['id'], 'sistema': w['structure'], 'amostras': m['n'],
        'esp_modelo_cm': round(w['thickness'] * 100, 1), 'esp_planta_cm': round(meas_t / PPM * 100, 1),
        'desvio_eixo_cm': round(centre_off / PPM * 100, 1),
    })
    faces[w['id']] = (m, w)


def face_coord(wid, side, axis):
    """Coordenada (m) da face medida na planta ('+'/'-' em relação à normal do eixo) no eixo 'x' ou 'y'."""
    m, w = faces[wid]
    (fx, fy), (tx, ty) = to_px(w['from']), to_px(w['to'])
    ln = math.hypot(tx - fx, ty - fy)
    nx, ny = -(ty - fy) / ln, (tx - fx) / ln
    d = m['face_pos_px'] if side == '+' else m['face_neg_px']
    base = fx if axis == 'x' else fy
    nn = nx if axis == 'x' else ny
    org = ORIGIN[0] if axis == 'x' else ORIGIN[1]
    return (base + nn * d - org) / PPM


def model_face(wid, side, axis):
    w = next(x for x in L['walls'] if x['id'] == wid)
    (fx, fy), (tx, ty) = w['from'], w['to']
    ln = math.hypot(tx - fx, ty - fy)
    nx, ny = -(ty - fy) / ln, (tx - fx) / ln
    s = 1 if side == '+' else -1
    return (fx if axis == 'x' else fy) + (nx if axis == 'x' else ny) * s * w['thickness'] / 2


def span(a, b, axis):
    """Distância entre duas faces: a=(parede, lado), b=(parede, lado)."""
    pm = abs(face_coord(*b, axis) - face_coord(*a, axis))
    mm = abs(model_face(*b, axis) - model_face(*a, axis))
    return pm, mm


# Dimensões internas entre faces (parede, lado da normal n=(−dy,dx) do eixo from→to)
ROOMS = [
    ('Estar/Jantar — largura (oeste→banho social)', ('ext-oeste', '-'), ('banho-social-sala', '+'), 'x'),
    ('Estar/Jantar — profundidade (porta varanda→parede sul)', ('varanda-porta-vidro', '+'), ('ext-sul', '-'), 'y'),
    ('Estar — largura (drywall sofá→parede da TV)', ('servico-sala-drywall', '-'), ('sala-q2', '+'), 'x'),
    ('Cozinha — comprimento (drywall serviço→parede sul)', ('servico-cozinha-drywall', '+'), ('ext-sul', '-'), 'y'),
    ('Quarto 2 — largura', ('sala-q2', '-'), ('q2-suite', '+'), 'x'),
    ('Quarto 2 — profundidade', ('ext-norte-q2', '+'), ('q2-sul-drywall', '-'), 'y'),
    ('Suíte — largura (drywall Q2→parede leste)', ('q2-suite-drywall', '-'), ('ext-leste', '+'), 'x'),
    ('Suíte — profundidade', ('ext-norte-suite', '+'), ('banhos-norte-drywall', '-'), 'y'),
    ('Circulação — largura', ('sala-q2-drywall', '-'), ('circulacao-suite', '+'), 'x'),
    ('Circulação — profundidade', ('q2-sul-drywall', '+'), ('banhos-norte-drywall', '-'), 'y'),
    ('Banho social — comprimento', ('banho-social-sala', '-'), ('banhos-divisa-drywall', '+'), 'x'),
    ('Banho social — largura', ('banhos-norte-drywall', '+'), ('ext-sul', '-'), 'y'),
    ('Banho suíte — comprimento', ('banhos-divisa-drywall', '-'), ('ext-leste', '+'), 'x'),
    ('Varanda/serviço — largura', ('ext-oeste', '-'), ('sala-q2', '+'), 'x'),
    ('Varanda — profundidade (parapeito→porta)', ('varanda-parapeito', '+'), ('varanda-porta-vidro', '-'), 'y'),
]
dims = []
for name, a, b, axis in ROOMS:
    try:
        pm, mm = span(a, b, axis)
        dims.append({'medida': name, 'planta_m': round(pm, 3), 'modelo_m': round(mm, 3), 'dif_cm': round((mm - pm) * 100, 1)})
    except KeyError as e:
        dims.append({'medida': name, 'erro': f'parede sem medição: {e}'})

out = os.path.join(REPO, 'docs/etapa2-revisao')
json.dump({'pxPerMeter': PPM, 'paredes': rows, 'dimensoes': dims}, open(os.path.join(out, 'auditoria-dimensional.json'), 'w'),
          indent=1, ensure_ascii=False)
lines = ['# Auditoria dimensional (gerada por pipeline/dimension_audit.py)', '',
         f'Escala adotada (cenário A): {PPM:.2f} px/m · 1 px ≈ {100 / PPM:.2f} cm · medição com subamostragem de ¼ px.', '',
         '## Faces das paredes medidas na planta × modelo', '',
         '| Parede | Sistema | Amostras | Espessura modelo (cm) | Espessura na planta (cm) | Desvio do eixo (cm) |', '|---|---|---|---|---|---|']
for r in rows:
    if r.get('medido', 1) is None:
        lines.append(f"| {r['parede']} | — | 0 | — | — | sem trecho mensurável |")
    else:
        lines.append(f"| {r['parede']} | {r['sistema']} | {r['amostras']} | {r['esp_modelo_cm']} | {r['esp_planta_cm']} | {r['desvio_eixo_cm']:+} |")
lines += ['', '## Dimensões internas entre faces', '', '| Medida | Planta (m) | Modelo (m) | Diferença (cm) |', '|---|---|---|---|']
for d in dims:
    if 'erro' in d:
        lines.append(f"| {d['medida']} | — | — | {d['erro']} |")
    else:
        lines.append(f"| {d['medida']} | {d['planta_m']:.2f} | {d['modelo_m']:.2f} | {d['dif_cm']:+} |")
open(os.path.join(out, 'auditoria-dimensional.md'), 'w').write('\n'.join(lines) + '\n')
print('\n'.join(lines))
