# Tour Virtual 3D — Orla Guanabara

Plataforma de tours virtuais 3D para apresentações de lançamentos imobiliários.
Primeiro projeto: apartamento de 2 quartos com suíte e varanda (45,66 m²) do
empreendimento **Orla Guanabara**, Niterói/RJ.

> 🟡 **Status — Etapa 2:** sala integrada à cozinha com acabamento fotorrealista
> (PBR, iluminação pré-calculada) para avaliação — ver [`docs/etapa2/AVALIACAO.md`](docs/etapa2/AVALIACAO.md).
> Pipeline em [`pipeline/README.md`](pipeline/README.md). `?cena=geometria` mostra a geometria da Etapa 1.
>
> ⚠️ **Etapa 1:** geometria do apartamento construída a partir da planta
> da p. 17 do book (sem cotas — **medidas estimadas**, identificadas no código) e
> **em conferência**: ver [`docs/etapa1/CONFERENCIA.md`](docs/etapa1/CONFERENCIA.md).
> O visual atual é provisório; o fotorrealismo é a próxima etapa.
>
> 🎯 **Meta visual:** fotorrealismo de apartamento decorado (PBR, modelos
> detalhados, iluminação global pré-calculada) com bom desempenho em
> smartphones — ver [`docs/FOTORREALISMO.md`](docs/FOTORREALISMO.md). Os
> materiais procedurais atuais são provisórios e não atendem a esse requisito.

## Stack

React 18 · Vite 5 · TypeScript (strict) · Three.js · React Three Fiber · Drei.
Sem backend — build estático pronto para Vercel.

## Comandos

```bash
npm install
npm run dev        # servidor local (acessível na rede para testar no celular)
npm run check      # typecheck + lint + testes + build
npm run build      # gera dist/
npm run preview    # serve o build
```

Relatório de conferência da planta (Etapa 1):

```bash
npx vite-node scripts/plan-report.ts && python3 scripts/annotate-plan.py
```

Teste de ponta a ponta (desktop + celular emulado, requer Playwright/Chromium):

```bash
npm run build && npx vite preview --port 4173 &
node scripts/smoke.cjs capturas/
```

## Navegação

| | Computador | Celular |
|---|---|---|
| Mover | `W A S D` / setas · `Shift` corre | Joystick no canto inferior esquerdo (borda = corre) |
| Olhar | Mouse (pointer lock; `Esc` libera) · `Q`/`E` giram | Arrastar o dedo no lado direito |
| Planta 3D | Botão ou `Tab` · clique no piso para entrar ali | Botão · toque no piso |

Parâmetros de sensibilidade, velocidade, altura dos olhos, FOV etc. ficam em
`src/config/controls.ts`. Em aparelhos fracos a qualidade cai sozinha
(sem sombras, DPR 1); `?q=low` força o modo leve.

## Arquitetura

```
src/
  layout/            dados da unidade (fonte única da geometria)
    types.ts           modelo: paredes, vãos, ambientes, móveis, proveniência
    orla-guanabara/    apto 45,66 m² (coordenadas em px da planta + calibração)
    provisional/       cena de teste técnica (não usada no tour)
    validate.ts        conferência automática do layout
  engine/            lógica pura, testada (Vitest)
    geometry.ts        paredes → trechos 3D e colisores; áreas
    collision.ts       colisão círculo × paredes/móveis com deslizamento
    planEvidence.ts    conferência pixel a pixel do modelo contra a planta
  input/             teclado, estado do visitante, detecção de toque
  components/scene/  Three.js: arquitetura, móveis, luz, câmera 1ª pessoa, planta 3D
  components/ui/     joystick, área de olhar, telas e painéis
```

## Publicação (Vercel)

`vercel.json` já define framework Vite, `npm run build` e saída `dist/`.
Nenhuma variável de ambiente é necessária.

1. Em [vercel.com/new](https://vercel.com/new), importe `mugennit/3d-orla-teste`
   (conceda acesso ao repositório pelo GitHub, se solicitado).
2. Confirme: *Framework Preset* **Vite**, *Root Directory* `./` — os demais
   campos já vêm do `vercel.json`. Clique em **Deploy**.
3. Cada push gera um *Preview Deployment* com URL própria; a branch de
   produção (`main`) publica na URL principal.

Para testar no celular, abra a URL do deploy (HTTPS é necessário para tela
cheia e captura de toque em alguns navegadores). `?q=low` força o modo leve.
