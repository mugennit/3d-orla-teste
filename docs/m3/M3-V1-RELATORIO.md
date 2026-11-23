# M3 · Primeira versão navegável — relatório

**Prévia:** https://claude.ai/artifact/7vQzM4TXDWpfW2v9ZP6Yat (privada; compartilhar pelo menu Share).
**Escopo:** sala integrada à cozinha. Demais cômodos sem alteração. Geometria auditada, colisões,
navegação, planta ortográfica e botão de balões preservados.

## O que foi feito

| Etapa | Implementação |
|---|---|
| Fonte única | `master_scene.py --export` monta a **mesma cena-mestra** do Cycles (modelos licenciados, texturas, vasos, mesa, geladeira) e chama `pipeline/master_export.py` |
| Materiais | cadeias procedurais do Blender "achatadas" para glTF (relatório em `.cache/build/materials_flatten.json`); sheen, verniz (clearcoat), anisotropia, transmissão e IOR exportados como extensões KHR e lidos pelo Three.js |
| Luz | bake difuso (direto + indireto) do Cycles em **2048 px / 320 amostras** por grupo (arquitetura, móveis), denoise OIDN, **RGBM linear** (faixa dinâmica 0–8, sem o corte do pipeline antigo); sem cáusticas no bake; decoração miúda fora do atlas (luz do ambiente) |
| Reflexos | cubemap capturado na sala com **projeção em caixa** no volume da sala/cozinha (reflexos no lugar certo em piso, inox, laca e vidro) |
| Imagem | AgX com a exposição e o **balanço de branco do render** aplicados à imagem inteira; calibração em `pipeline/tour_calibration.json` (exposição 2,8; WB 1,07/1,00/0,89) |
| Comparação | `?cam=<câmera do Blender>` reproduz posição, lente e deslocamento óptico; `?pose=` para ângulos livres; `scripts/compare.cjs`, `closeups.cjs`, `walk.cjs` |
| Navegação | colisores das cadeiras na posição recolhida (mesma da análise de circulação); o pacote (computador/celular) é escolhido uma vez — a queda de FPS só reduz a resolução, sem recarregar a cena no meio da visita |

## Comparação com o Cycles (mesmas câmeras, 1280×720)

Capturas lado a lado em `docs/m3/v1/cmp-*.jpg`; números em `docs/m3/v1/compare.json`
(diferença média de luminância, 0–255; razão Cycles/navegador por canal R, G, B).

| Vista | Dif. lum. | Leitura |
|---|---|---|
| sofa-detalhe | 13 | muito próximo; tecido levemente mais escuro |
| conf-cozinha-perto | 13 | muito próximo |
| jantar-detalhe | 14 | próximo; navegador ~5 % mais claro |
| conf-cuba | 17 | granito e cuba corretos; inox um pouco mais frio |
| conf-geladeira | 18 | navegador ~10 % mais claro |
| sala-cozinha / cozinha | 21 | navegador ~8–10 % mais escuro; laca menos cremosa |
| conf-mesa | 22 | vidro mais claro, sem a refração forte da borda |
| cozinha-book | 32 | parede do corredor mais quente/rosada; vidro da varanda leitoso |

Referências: `docs/m1/rodada4` quando existe, senão `rodada3` (que ainda tem granito antigo e céu
pela porta — parte da diferença das vistas abertas vem daí).

## Desempenho (`scripts/metrics.cjs`)

| Perfil | Transferido | Cena pronta | Por quadro |
|---|---|---|---|
| Computador, 50 Mbit/s | 43,0 MB (modelo 34,2 + lightmaps 8,3) | 28 s | 100 chamadas · 698 mil triângulos |
| Celular 4G, 12 Mbit/s | 18,7 MB (modelo 9,9 + lightmaps 8,3) | 29 s | 94 chamadas · 587 mil triângulos |
| Celular 4G fraco, 5 Mbit/s | 18,7 MB | 54 s | idem |

O ambiente de testes não tem GPU (renderização por software, ~1 quadro/s): os tempos de "cena
pronta" incluem decodificação lenta e **o FPS real precisa ser medido no aparelho** (`?fps=1`).

## Testes

- `npm run check` (tipos, lint, 19 testes unitários, build): **passa**.
- `scripts/smoke.cjs` (computador + celular emulado: WASD, mouse, colisões na janela e na bancada,
  planta 3D, joystick, arraste, console sem erros): **todas as verificações passaram**. Os tempos
  de espera foram aumentados para a renderização por software; nenhum critério foi afrouxado.
- `scripts/walk.cjs`: caminhada com teclado entrada → jantar → sala → bancada, capturas em
  movimento (`docs/m3/v1/caminhada.jpg`), colisão com a bancada confirmada.
- Conferência de perto/ângulos desfavoráveis: `docs/m3/v1/perto-angulos-desfavoraveis.jpg`.

## Limitações conhecidas (honestas)

1. **Vidro dos vasos:** mais claro que no Cycles; o tempo real não reproduz a refração forte da
   borda e do fundo grosso.
2. **Laca dos armários e porta de entrada:** levemente acinzentadas, com reflexos mais presentes
   que no render (uma única sonda de reflexo).
3. **Emendas do lightmap nas cadeiras e no sofá:** pequenas manchas claras nas costas das cadeiras
   e no braço do sofá (atlas de móveis compartilhado; os modelos licenciados geram muitas ilhas).
4. **Vista do book:** parede do corredor mais quente; vidro da porta da varanda leitoso junto à
   cortina (folhas da porta de correr seguem não modeladas, como na conferência da planta).
5. **Celular:** o modelo do celular ainda tem ~587 mil triângulos e lightmaps de 2048 px
   (8,3 MB) — pesado para aparelhos de entrada. Próximo passo: simplificação de malha só no perfil
   celular e lightmaps de 1024 px.
6. **Texturas:** WebP (não KTX2): menor download, mas mais memória de GPU.
7. **Hall da entrada:** volume neutro provisório (fora do apartamento, sem colisão), agora com luz
   cozida; segue substituível quando houver informação do corredor real.

## Como reproduzir

```bash
PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/master_scene.py -- --export --lm 2048 --lm-samples 320   # ~70 min (CPU)
node pipeline/optimize.mjs            # (OUT_DIR=public/cenas/m3-teste para testes não versionados)
npm run build && npx vite preview --port 4173 &
node scripts/compare.cjs saida        # lado a lado com o Cycles
node scripts/closeups.cjs saida; node scripts/walk.cjs saida; node scripts/smoke.cjs saida
```
Testes rápidos antes de bakes longos: `--lm 1024 --lm-samples 64` (~6 min) para validar
configurações; `--no-bake` (~15 s) para checar materiais e extensões.
