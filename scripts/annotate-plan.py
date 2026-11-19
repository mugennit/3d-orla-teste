"""Gera docs/etapa1/conferencia-anotada.jpg: planta original + modelo + pontos a conferir.
Uso: npx vite-node scripts/plan-report.ts && python3 scripts/annotate-plan.py
"""
import json, math
from PIL import Image, ImageDraw, ImageFont

K = 2  # ampliação
base = Image.open('public/referencias/orla-45m2-planta-p17.png').convert('RGB')
base = base.resize((base.width * K, base.height * K), Image.LANCZOS)
img = base.convert('RGBA')
ov = Image.new('RGBA', img.size, (0, 0, 0, 0))
d = ImageDraw.Draw(ov)
L = json.load(open('docs/etapa1/layout.json'))

def rect(cx, cy, length, thick, ang):
    ux, uy = math.cos(ang), math.sin(ang)
    nx, ny = -uy, ux
    pts = []
    for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        pts.append(((cx + ux * a * length / 2 + nx * b * thick / 2) * K, (cy + uy * a * length / 2 + ny * b * thick / 2) * K))
    return pts

COL = {'concrete': (220, 30, 60), 'drywall': (255, 140, 0), 'railing': (0, 150, 255), 'parapet': (150, 0, 200)}
for p in L['pieces']:
    c = COL.get(p['structure'], (220, 30, 60))
    full = p['top'] >= 2.4
    d.polygon(rect(*p['center'], p['length'], p['thickness'], p['angle']), fill=c + ((150,) if full else (70,)), outline=c + (255,))
for s in L['shafts']:
    (cx, cy), (w, h) = s['center'], s['size']
    d.rectangle([(cx - w / 2) * K, (cy - h / 2) * K, (cx + w / 2) * K, (cy + h / 2) * K], outline=(200, 0, 200, 255), width=3)
for lf in L['leaves']:
    hx, hy = lf['hinge']; cx, cy = lf['center']
    ex, ey = hx + (cx - hx) * 2, hy + (cy - hy) * 2
    d.line([hx * K, hy * K, ex * K, ey * K], fill=(0, 90, 255, 255), width=4)
img = Image.alpha_composite(img, ov)
d = ImageDraw.Draw(img)

try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 17)
except OSError:
    font = small = ImageFont.load_default()

# Pontos a conferir (px da página do book) — ver docs/etapa1/CONFERENCIA.md
marks = [
    (1, 110, 365), (2, 150, 312), (3, 242, 405), (4, 175, 600), (5, 425, 642),
    (6, 475, 760), (6, 667, 760), (6, 80, 418), (7, 296, 340), (8, 433, 695), (9, 380, 735),
]
for n, x, y in marks:
    x, y = (x - 20) * K, (y - 280) * K
    r = 17
    d.ellipse([x - r, y - r, x + r, y + r], fill=(15, 26, 36), outline=(201, 169, 110), width=3)
    d.text((x, y), str(n), font=font, fill=(255, 255, 255), anchor='mm')

# Legenda de cores
lx, ly = img.width - 440, 18
d.rounded_rectangle([lx - 8, ly - 10, lx + 420, ly + 120], 10, fill=(255, 255, 255, 235))
for i, (lbl, c) in enumerate([('Concreto (modelo)', COL['concrete']), ('Drywall (modelo)', COL['drywall']),
                              ('Guarda-corpo / parapeito (modelo)', COL['railing']), ('Folha de porta aberta (modelo)', (0, 90, 255)),
                              ('Shaft (interpretação)', (200, 0, 200))]):
    d.rectangle([lx, ly + i * 23, lx + 26, ly + i * 23 + 14], fill=c)
    d.text((lx + 36, ly + i * 23 - 2), lbl, font=small, fill=(20, 20, 20))
img.convert('RGB').save('docs/etapa1/conferencia-anotada.jpg', quality=88)
print(img.size)
