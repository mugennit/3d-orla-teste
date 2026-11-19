# Tour Virtual 3D — Orla Guanabara

Plataforma de tours virtuais 3D para apresentações de lançamentos imobiliários.
Primeiro projeto: apartamento de 2 quartos com varanda (40,54 m²) do
empreendimento **Orla Guanabara**, Niterói/RJ.

> ⚠️ **Status:** estrutura técnica e controles prontos. A cena exibida é uma
> **cena de teste provisória** e não representa o imóvel. A geometria real será
> construída a partir da planta oficial — ver [`docs/PLANTA-REAL.md`](docs/PLANTA-REAL.md).

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
    types.ts           modelo: paredes, vãos, ambientes, móveis
    provisional/       cena de teste PROVISÓRIA
    validate.ts        conferência automática do layout
  engine/            lógica pura, testada (Vitest)
    geometry.ts        paredes → trechos 3D e colisores; áreas
    collision.ts       colisão círculo × paredes/móveis com deslizamento
  input/             teclado, estado do visitante, detecção de toque
  components/scene/  Three.js: arquitetura, móveis, luz, câmera 1ª pessoa, planta 3D
  components/ui/     joystick, área de olhar, telas e painéis
```

## Publicação (Vercel)

Importe o repositório no Vercel — `vercel.json` já define framework Vite,
`npm run build` e saída `dist/`. Nenhuma variável de ambiente é necessária.
