# M3 · Plano técnico de integração da cena-mestra ao tour Three.js

> **Status: plano, não executado.** A integração só começa depois da aprovação das imagens
> corrigidas do M1 (rodada 4) e da autorização expressa do início do M3.

## 0. Ponto de partida

| Hoje no tour (`main` e branch) | Cena-mestra M1 (`pipeline/master_scene.py`) |
|---|---|
| `build_scene.py` → `apto.glb` + 2 lightmaps (arch/furn) por perfil (desktop/mobile) | Mesma base de arquitetura e cozinha, mais materiais refinados, modelos licenciados (sofá, cadeiras), geladeira, cuba, vasos e mesa próprios, cortinas |
| `PhotoApartment.tsx`: lightmap em UV2 + reflexo de cubemap capturado em 1 ponto | Iluminação: céu físico difuso, LEDs e pendente; AgX; balanço de branco 8000 K |
| Navegação em 1ª pessoa, colisões por layout (`engine/collision.ts`), planta ortográfica, botão de balões, testes vitest + `smoke.cjs` | Não tem navegação: é a fonte de geometria, materiais e luz |

A integração **não troca o motor**: é a opção A do `docs/PLANO-FOTORREALISMO.md`,
com a cena-mestra como fonte única. O app, os controles e as colisões continuam os mesmos.

## 1. Fluxo de produção

```
master_scene.py --no-render --export        (novo modo: monta a cena, não renderiza)
  ├─ limpa para tempo real (seção 5)
  ├─ UV2 por ambiente + bake de luz (seção 2)
  ├─ exporta .cache/build/apto.glb (extensões PBR da seção 3) + lm_*.{exr→rgbm}
  └─ grava bake_meta.json, credits_used.json
optimize.mjs  (perfis desktop/mobile — já existe, ganha KTX2 e lightmaps RGBM)
  └─► public/cenas/orla-45m2/{desktop,mobile}/
```

- `build_scene.py` continua sendo a biblioteca (arquitetura, cozinha, bake, export). O
  `master_scene.py` passa a chamar `bake_group`/export em vez de manter um caminho paralelo.
- A geometria auditada não é tocada: arquitetura e posições vêm do mesmo `layout.json`.
- Os créditos (CC0 Poly Haven/ambientCG/Khronos; CC-BY 4.0 dos modelos do Sketchfab) vão
  para `creditos.json`, e o tour ganha um link "Créditos dos modelos 3D" no painel de ajuda
  (exigência da CC-BY).

## 2. Iluminação

**Princípio:** a luz difusa (direta + indireta, sombras suaves, sangramento de cor) é
**cozida**. O tempo real só acrescenta o que depende do ponto de vista (reflexos, brilho).

1. **Bake a partir da cena-mestra**, com as mesmas fontes do render: céu físico pela
   varanda (com portal), LEDs da cozinha, pendente. O hall neutro da entrada (rodada 4)
   entra no bake para a porta não "vazar" céu.
2. **Lightmaps por ambiente**, não um atlas único: sala+jantar, cozinha, móveis grandes
   (sofá, mesa, cadeiras, rack), objetos pequenos. Densidade-alvo de 4–8 mm/texel nas
   superfícies próximas do olho (bancada, mesa, sofá) e 10–15 mm em paredes e teto.
3. **Faixa dinâmica:** bake em ponto flutuante, denoise OIDN (RTLightmap, já em uso) e
   codificação **RGBM** em PNG 8 bits (ou KTX2 UASTC HDR, se o suporte nos aparelhos-alvo
   for confirmado). Fim do fator `k` com corte no percentil 99,7, que hoje achata os LEDs
   e a janela.
4. **Objetos pequenos e flores:** sem lightmap próprio; recebem **sondas de irradiância**
   (grade de light probes, harmônicos esféricos L2, ~30 cm) cozidas da mesma cena.
5. **Tom e exposição:** `AgXToneMapping` com a exposição calibrada contra o render de
   referência (hoje o tour usa 2,35 com o fator `k`; será recalculada com RGBM). O balanço
   de branco do render (8000 K/tint 4) passa a ser aplicado **no bake**, não por shader.
6. **Sem luzes dinâmicas nem sombras em tempo real** na cena fotorrealista, como hoje
   (`shadows={false}`): é o que mantém 60 fps no computador e 30+ no celular.

## 3. Materiais (glTF ↔ Three.js r170)

| Material da cena | Recurso do Cycles | Exportação glTF | Three.js |
|---|---|---|---|
| Linho do sofá, estofado das cadeiras | Sheen | `KHR_materials_sheen` | `MeshPhysicalMaterial.sheen` |
| Granito, revestimento, laca, carvalho envernizado | Coat | `KHR_materials_clearcoat` | `clearcoat`, `clearcoatRoughness` |
| Inox escovado (geladeira, cuba, forno) | Anisotropia | `KHR_materials_anisotropy` | `anisotropy` |
| Vasos de vidro (rodada 4) e vidros das esquadrias | Transmissão + IOR | `KHR_materials_transmission`, `_ior`, `_volume` | `transmission`, `ior`, `thickness` |
| Demais | Principled básico | PBR metal/rough | `MeshStandardMaterial` |

- Texturas processadas no pipeline (granito com menos contraste, carvalho da mesa em 2k e
  escala de 0,95 m, tecido do sofá clareado) já saem como imagens; nada é recalculado no shader.
- `MATERIAL_TUNING` em `PhotoApartment.tsx` (ajustes manuais de inox e tinta) deixa de ser
  necessário e é removido quando os materiais vierem calibrados do Blender.
- O vidro com transmissão custa uma passada extra de render no Three.js. Restrito aos vasos
  e ao vidro da varanda; no perfil mobile, o vaso usa vidro "fino" (`thickness = 0`).

## 4. Reflexos

1. **Sondas de reflexo por ambiente com correção de paralaxe** (caixa do ambiente), no
   lugar do cubemap único capturado hoje em um ponto. Previsão de 3 sondas: sala, jantar e
   cozinha, com transição suave por volume.
2. **Origem:** cubemaps renderizados no próprio Cycles (cena cozida, 256–512 px por face,
   pré-filtrados PMREM no carregamento). Assim os reflexos mostram a mesma luz do bake.
3. **Granito e piso:** reflexo da sonda modulado pelo coat; o reflexo forte dos LEDs (que
   gerou a faixa da rodada 3) fica naturalmente suave, já que a sonda é pré-filtrada pela
   rugosidade de 0,14 adotada na rodada 4.
4. **Opcional, só no computador:** SSR (reflexo em tela) de baixa intensidade no piso,
   avaliado pelo custo no M3. Não entra no mobile.

## 5. Otimização

| Item | Computador | Celular |
|---|---|---|
| Tamanho total (meta) | 30–60 MB | 15–25 MB |
| Texturas PBR | KTX2 (ETC1S/UASTC), 2048 px nas peças "hero" | KTX2, 1024 px |
| Lightmaps | RGBM 4096 px | RGBM 2048 px |
| Malhas | Meshopt; decimação dos modelos do Sketchfab (sofá/cadeiras), sem perda de silhueta | idem + LOD mais baixo |
| Draw calls (meta) | < 250 | < 150 |
| FPS (meta) | 60 | 30+ |

- **Limpeza para tempo real:** faces escondidas removidas (`drop_hidden_faces`, já existe),
  peças coplanares unidas por material, instâncias para as 4 cadeiras.
- **Carregamento:** a cena da sala/cozinha carrega primeiro; outros ambientes, quando
  existirem, sob demanda. A tela de carregamento atual permanece.
- **Medição:** `scripts/metrics.cjs` passa a registrar tamanho por arquivo, draw calls,
  triângulos e FPS (desktop e celular emulado), e o resultado vai para `docs/m3/`.

## 6. Preservação da navegação e dos recursos existentes

O que **não muda** (regra do projeto):

- `FirstPersonController`, joystick virtual, toque e teclado, alturas de olho e velocidades.
- Colisões calculadas **pelo layout** (`engine/collision.ts` + `buildColliders`), não pela
  malha. Os novos móveis entram como colisores retangulares do layout (sofá, mesa, cadeiras
  recolhidas na posição da rodada 3c), conferidos com `circulation_check.py`.
- Planta ortográfica (`PlanView`), corte a 1,50 m, sobreposição da planta original e botão
  de balões.
- Indicador de ambiente, tela inicial, ajuda, `?fps=1`, `?q=low`, `PerformanceMonitor`.
- Testes: `vitest` (colisão, layout, validação), `smoke.cjs` (desktop + celular),
  `npm run check` limpo antes de cada commit.

Novos testes no M3:

1. Os colisores do mobiliário conferem com as caixas reais dos modelos (tolerância de 2 cm).
2. Teste de caminhada: entrada → bancada → frente do sofá → varanda → jantar, sem travar,
   nas passagens de 0,66–0,72 m documentadas.
3. Teste visual: as mesmas câmeras do render (`CAMERAS` de `master_scene.py`) reproduzidas
   no navegador, com captura lado a lado e diferença medida.

## 7. Etapas e critérios de aceite

| Etapa | Entrega | Critério |
|---|---|---|
| M3.1 Export | `master_scene.py --export` gerando glb + lightmaps; tour abre com a cena nova | navegação, colisões e testes intactos |
| M3.2 Luz | lightmaps RGBM por ambiente + sondas de irradiância | comparação lado a lado com o render: luz e sombras equivalentes |
| M3.3 Materiais e reflexos | extensões PBR + sondas de reflexo com paralaxe | inox, granito, vidro e tecido convincentes de perto |
| M3.4 Otimização | perfis desktop/mobile, KTX2, métricas | metas da seção 5 |
| M3.5 Validação | relatório com capturas lado a lado, tamanhos e FPS | aprovação do cliente |

**Limite conhecido:** em tempo real, reflexos e transmissão são aproximações. O que não
alcançar o render (estimativa: 80–90 % nos ambientes difusos) fica medido no relatório do
M3.5; se for inaceitável, a alternativa de aparência fotográfica é a opção B (Gaussian
splatting), que exige GPU e aprovação própria.
