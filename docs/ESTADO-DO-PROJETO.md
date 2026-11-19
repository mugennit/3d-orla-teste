# Estado do projeto: ponto de retomada

Branch: `claude/orla-45m2-fotorrealista` (a `main` não foi alterada).
Leitura recomendada, nesta ordem: este arquivo → `docs/PLANO-FOTORREALISMO.md` →
`docs/etapa2-revisao/DIAGNOSTICO.md` → `pipeline/README.md`.

**Situação:** execução **pausada** a pedido do cliente (limite de uso). Nenhuma nova
modelagem, render, instalação ou alteração de código até nova autorização.

---

## 1. Objetivo (redefinido)
Apartamento virtual **fotorrealista**, explorável em primeira pessoa no navegador
(computador e celular). A planta oficial (book Emccamp, p. 17, 45,66 m², 2 quartos com
suíte e varanda) serve **só como referência** de medidas e distribuição e como
visualização auxiliar. **O produto principal é o apartamento virtual, não a planta 3D.**

## 2. O que está pronto e aprovado/preservado

| Área | Estado | Onde |
|---|---|---|
| App React + Vite + TS + Three.js/R3F, pronto para Vercel | ✔ | `src/`, `vercel.json` |
| Navegação 1ª pessoa (WASD + mouse; joystick + arraste no celular), colisões | ✔ aprovado | `src/components/scene/FirstPersonController.tsx`, `src/engine/collision.ts` |
| Geometria da planta (aprovada na Etapa 1) com proveniência das medidas | ✔ aprovado | `src/layout/orla-guanabara/apto-45m2.ts` |
| Auditoria dimensional independente (faces das paredes medidas na imagem; diferenças −2,2 a +2,9 cm, dentro da precisão) | ✔ | `docs/etapa2-revisao/auditoria-dimensional.md`, `pipeline/dimension_audit.py` |
| Planta: modo **Topo ortográfico** (perpendicular, referência no pé das paredes, corte a 1,50 m), modo 3D, sobreposição da planta oficial com transparência, **botão ocultar/mostrar nomes** (estado preservado) | ✔ implementado | `src/components/scene/PlanView.tsx`, `src/App.tsx` |
| Pipeline Blender sem interface (export → build → bake → OIDN → otimização web) | ✔ funcional, **visual não aprovado** | `pipeline/` |
| Correções da Fase B no pipeline: rotação de objetos importados (causa raiz das cadeiras), verificação automática de orientação/apoio/interseção, paredes por união 2D (sem sobreposição), folgas anti faces coincidentes, máquina/tanque/vaso | ✔ no código; **não publicado no tour** | `pipeline/build_scene.py` |
| Testes: 19 unitários + ponta a ponta (11 verificações) | ✔ (última execução completa antes da Fase B) | `src/**/*.test.ts`, `scripts/smoke.cjs`, `scripts/metrics.cjs` |
| Prévia publicada (Etapa 2, visual **reprovado**) | artifact privado | https://claude.ai/artifact/7vQzM4TXDWpfW2v9ZP6Yat |

Commits de referência: `c91215b` (prévia da Etapa 2 reprovada, recuperável) ·
`80d3d44` (diagnóstico Fase A) · `02ed5a6` (correções Fase B) · `3c9bec2` (plano).

**Atenção:** `public/cenas/orla-45m2/` ainda contém a cena da Etapa 2 reprovada (é o que o
tour carrega hoje). As correções da Fase B foram testadas só em bake de prévia
(`.cache/`, não versionado).

## 3. Problemas identificados (resumo; detalhes em `docs/etapa2-revisao/DIAGNOSTICO.md`)
1. **Abordagem:** cena gerada por código (primitivas) → aparência de maquete. A causa é
   estrutural, não de ajuste fino.
2. **Iluminação:** lightmap 8 bits normalizado pela área mais clara (interior espremido,
   mediana 52/255), compressão com perdas (manchas), atlas único 2K para o apartamento
   inteiro (pouca sombra de contato), sol em direção arbitrária, AgX lavando as cores,
   uma só sonda de reflexo.
3. **Artefatos:** faixas escuras por geometria sobreposta (**corrigido no código, ainda
   não verificado no tour**: a comparação de lightmaps antes/depois ficou pendente).
4. **Materiais:** sem calibração; estofado da cadeira era couro retingido ("concreto").
5. **Mobiliário:** primitivas ou CC0 de estilo diferente do book.
6. **Infraestrutura:** sem GPU no ambiente (Cycles em CPU: render de referência 2K
   ≈ 1–2 h; bake de alta densidade ≈ 1–3 h por ambiente).

## 4. Plano aprovado em princípio (ver `docs/PLANO-FOTORREALISMO.md`)
- **Cena-mestra no Blender** (visualização de interiores profissional) → **render de
  referência** → **reprodução no navegador** validada lado a lado, com a mesma câmera.
- Marcos: **M1** cena-mestra sala/cozinha · **M2** render de referência (sala+cozinha;
  cozinha no ponto de vista da perspectiva oficial) · **M3** prova no navegador
  (opção A) com métricas e FPS real · **M4** decisão tecnológica · **M5** demais ambientes.
- Tecnologia: **A** Three.js com luz pré-calculada de alta qualidade (recomendada para
  provar primeiro) · **B** Gaussian splatting (fotográfico, exige GPU para gerar) ·
  **C** panoramas 360° (complemento) · **D** streaming (descartado por custo).

## 5. Decisões pendentes do cliente
1. **Modelos:** autorizar **conta gratuita do Sketchfab** (token sem custo) para baixar e
   avaliar candidatos CC0/CC-BY; ou seguir só com Poly Haven/Khronos e modelar à mão o
   sofá de 2 lugares e o jantar. (Gastos com modelos pagos: **não autorizados** por ora.)
2. **Referência da sala:** enviar a **perspectiva da sala/estar do book** e imagens de
   acabamentos, se existirem (hoje só temos a perspectiva da cozinha, p. 17).
3. **Opção tecnológica a demonstrar no M3** (recomendação: A, com B em avaliação).
4. **Critério da área privativa** (faces externas × divisas pelo eixo, NBR 12721;
   diferença de 1,24 % nas medidas). Mantido o critério atual até uma cota oficial.
5. **Ambiente com GPU** (opcional; acelera 10–20×): não autorizado por ora.
6. **Vista externa provisória:** sem paisagem inventada; proposta de brilho claro difuso
   nas janelas e, opcionalmente, cortinas de voil como decoração.
7. **Pontos de conferência da planta** que seguem provisórios (9 itens em
   `docs/etapa1/CONFERENCIA.md`, incluindo a interpretação da varanda/serviço).

## 6. Próximos passos ao retomar (após autorização)
1. Verificar no tour a eliminação das faixas escuras (comparação `?lm=1` antes/depois,
   já preparada em `.cache/cenas-faseB` e pode ser regenerada).
2. Conforme a decisão 1, baixar os candidatos e apresentar cada modelo (topo, lateral,
   altura dos olhos, dimensões, licença, comparação com o book) **antes** de integrar.
3. Iniciar o **M1** (cena-mestra da sala/cozinha) e o **M2** (render de referência).
4. **M3:** reproduzir as mesmas câmeras no navegador (lightmaps HDR por ambiente, todos os
   objetos no bake, sondas de reflexo locais, tom neutro calibrado) e medir.

## 7. Como retomar tecnicamente
O contêiner é efêmero: dependências fora do repositório precisam ser reinstaladas.
```bash
npm ci
pip install bpy==5.3.0 --target /opt/bpy
pip install pyoidn shapely --target /opt/pydeps
# assets CC0/CC-BY (cache não versionado): ver pipeline/README.md e sala-cozinha.ts
npx vite-node pipeline/export_layout.ts
PYTHONPATH=/opt/bpy:/opt/pydeps python3 pipeline/build_scene.py -- --quality preview
OUT_DIR=.cache/cenas-teste node pipeline/optimize.mjs
npm run check && npm run build && npx vite preview --port 4173 & node scripts/smoke.cjs
```
Rede do ambiente "3d-orla-teste": Poly Haven, ambientCG, `api.sketchfab.com`,
`media.sketchfab.com` liberados. `raw.githubusercontent.com` acessível (modelos Khronos).
Créditos/licenças: `.cache/assets/credits.json` → `public/cenas/orla-45m2/creditos.json`.
