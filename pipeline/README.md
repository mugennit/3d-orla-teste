# Pipeline fotorrealista (Blender sem interface)

Gera a cena da sala integrada à cozinha a partir do **layout aprovado** (Etapa 1),
com materiais PBR, mobiliário detalhado e **iluminação global pré-calculada**
(lightmaps), e a otimiza para a web em dois perfis (computador e celular).

```
layout aprovado (src/layout/orla-guanabara/*.ts)
   └─ export_layout.ts ─► .cache/build/layout.json
assets CC0 (Poly Haven, ambientCG)
   └─ fetch_assets.py  ─► .cache/assets/ (+ credits.json)
build_scene.py (Blender 5.3 / Cycles)
   ├─ arquitetura: paredes, porcelanato 60×60 em placas com junta, rodapés,
   │  batentes/guarnições/folhas/maçanetas, esquadrias, soleiras, forro
   ├─ sala/cozinha: sofá, tapete, rack, TV, quadro, mesa, cadeiras, pendente,
   │  marcenaria da cozinha (aéreos em carvalho, módulo ripado, prateleira com LED,
   │  revestimento verde-azulado vertical, granito, cuba, torneira, cooktop,
   │  forno, geladeira), decoração
   ├─ luz: céu físico + sol, portal de luz na varanda, pendente e LEDs
   ├─ bake difuso (direta + indireta) em UV2 por grupo (arch / furn)
   └─ denoise Intel Open Image Denoise (RTLightmap) ─► .cache/build/
optimize.mjs (gltf-transform + Meshopt + WebP)
   └─► public/cenas/orla-45m2/{desktop,mobile}/ + ceu.jpg + meta.json + creditos.json
```

## Preparação do ambiente

```bash
pip install bpy==5.3.0 --target /opt/bpy      # Blender como módulo Python (Cycles em CPU)
pip install pyoidn --target /opt/pydeps        # Intel Open Image Denoise
npm install                                    # gltf-transform, meshoptimizer, sharp
```

Acesso de rede necessário: `api.polyhaven.com`, `dl.polyhaven.org`, `ambientcg.com`,
`acg-download.struffelproductions.com`.

## Execução

```bash
python3 pipeline/fetch_assets.py ph-model dining_chair_02 2k   # (ver lista em sala-cozinha.ts)
npx vite-node pipeline/export_layout.ts
PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/build_scene.py -- --quality final [--views]
node pipeline/optimize.mjs
```

`--quality preview` (lightmaps 1K, 48 amostras) serve para iterar; `final` usa
lightmaps de 2K e 160 amostras. `--views` renderiza vistas de conferência com
path tracing (`.cache/build/view_*.jpg`).

## Regras

- **Não alterar a geometria aprovada:** paredes, vãos e ambientes vêm só do layout.
- Pontos em aberto da conferência continuam sem solução inventada (ex.: folhas da
  porta de correr da varanda não são modeladas; sem rebaixo de forro).
- Somente assets **CC0**; os usados ficam listados em `public/cenas/orla-45m2/creditos.json`.
