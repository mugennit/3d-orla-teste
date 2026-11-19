# Construção do apartamento real — Orla Guanabara (2 quartos, 40,54 m²)

A cena atual (`src/layout/provisional/testScene.ts`) é **provisória** e não
representa o imóvel. A geometria definitiva será digitalizada a partir da planta
humanizada do book oficial, sem inventar medidas.

## O que precisamos receber

**Obrigatório**

1. **Planta humanizada da unidade** em alta resolução (PDF vetorial do book é o
   ideal; PNG/JPG com no mínimo ~3000 px no lado maior).
2. **Escala confiável**: cotas escritas na planta ou ao menos uma medida de
   referência conhecida (ex.: largura total da unidade). Sem isso, a escala é
   calibrada pelas áreas por ambiente declaradas no book.
3. **Quadro de áreas** por ambiente (sala/cozinha, quartos, banheiro, varanda),
   se existir no book — usado na conferência automática (`declaredArea`).
4. **Pé-direito** (altura de piso a teto) e se há rebaixo de gesso.

**Desejável (melhora a fidelidade)**

5. Planta de **esquadrias** (larguras/alturas de portas e janelas, peitoris,
   tipo de abertura — correr, giro, maxim-ar) e sentido de abertura das portas.
6. **Memorial descritivo / acabamentos**: pisos, revestimentos, bancadas,
   metais — para substituir os materiais procedurais por texturas fiéis.
7. **Implantação / orientação solar** (norte) e o andar/posição da unidade,
   para posicionar o sol e a vista (Baía de Guanabara) corretamente.
8. Imagens humanizadas / perspectivas internas do book como referência de
   mobiliário e iluminação.

## Como os dados entram no código

Toda a cena é gerada a partir de um único arquivo de dados
(`ApartmentLayout`, ver `src/layout/types.ts`):

| Elemento     | Campo            | Observação |
|--------------|------------------|------------|
| Paredes      | `walls[]`        | eixo central (`from`→`to`), espessura, altura |
| Portas/janelas | `walls[].openings[]` | posição ao longo da parede, largura, peitoril, verga |
| Ambientes    | `rooms[]`        | polígono do piso, material, área declarada |
| Mobiliário   | `furniture[]`    | centro, dimensões, rotação |
| Início       | `spawn`          | onde o visitante começa |

Coordenadas em metros, origem no canto superior esquerdo da planta, Y para
baixo — o mesmo sistema da imagem, para digitalizar diretamente sobre ela.

Passos:

1. Criar `src/layout/orla-guanabara/apto-2q.ts` com `status: 'draft'` e
   `source` apontando a página do book.
2. Trocar `activeLayout` em `src/layout/index.ts`.
3. `npm run check` — o validador (`src/layout/validate.ts`) acusa vãos fora da
   parede, sobreposições e áreas que divergem mais de 5 % do declarado.
4. Conferência visual lado a lado com a planta; aprovado → `status: 'approved'`
   (a faixa "provisória" some automaticamente quando o status deixa de ser
   `provisional`).
