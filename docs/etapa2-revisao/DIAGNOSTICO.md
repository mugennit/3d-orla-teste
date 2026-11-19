# Revisão da Etapa 2 — Fase A: diagnóstico técnico e auditoria da planta

Estado avaliado: commit `c91215b` (prévia da Etapa 2). Esta versão fica preservada e
recuperável no histórico da branch `claude/orla-45m2-fotorrealista`.
**Nenhuma alteração estrutural, novo bake ou substituição de modelos foi feita nesta fase.**

---

## 1. Auditoria da planta (sobreposição em escala)

Imagens (mesma escala e mesmo enquadramento, alinhadas pelo contorno externo):

1. `1-planta-oficial.jpg` — planta da p. 17 do book.
2. `2-modelo-ortogonal.jpg` — cena atual renderizada no Blender com câmera **ortográfica
   verdadeira**, perpendicular ao piso, sem forro.
3. `3-sobreposicao-50.jpg` — sobreposição 50 %.
4. `4-jantar-detalhe.jpg` — ampliação do jantar (planta / modelo / sobreposição).
5. `5-planta-3d-navegador-atual.jpg` — planta 3D atual do tour (perspectiva e "topo").

### 1.1 Arquitetura

| Item | Resultado | Evidência |
|---|---|---|
| Contorno externo | Coincide | sobreposição; teste automático (área do contorno = 45,66 m² na escala adotada) |
| Paredes (posição) | Coincidem (desvio ≤ 1–2 px ≈ 2 cm) | 16 de 17 paredes com 96–100 % de coincidência pixel a pixel; parede sul 87 % |
| Espessuras | Concreto 0,10 m **medido**; drywall 0,08 m **adotado** (traço amarelo de 5 px + contorno) | `docs/etapa1/medidas.md` |
| Portas | Posição e lado de abertura coincidem (6/6) | vãos livres na planta; folhas desenhadas |
| Janelas e porta da varanda | Posição e largura coincidem | sobreposição |
| Circulação e acessos | Coincidem | sobreposição |

**Conclusão:** não há divergência estrutural comprovada em relação ao desenho. Os ambientes
estão no lugar e com as proporções do desenho. A dúvida sobre ambientes "menores" é de
**escala global**, tratada no item 1.3.

### 1.2 Mobiliário e elementos fixos — divergências

| # | Divergência | Comprovação | Causa | Correção proposta (Fase B) |
|---|---|---|---|---|
| D1 | **Cadeiras giradas 90°**: encosto voltado para o lado, não para fora da mesa | `4-jantar-detalhe.jpg`; medição na cena: encosto e assento na mesma coordenada perpendicular à mesa | rotação fixa no script, aplicada a partir de uma suposição sobre o eixo frontal do modelo, **sem verificação**; nenhum teste conferia a orientação | rotação calculada **por cadeira** a partir da geometria (vetor encosto→assento apontando para a mesa) + teste automático de orientação e de interseções |
| D2 | **Estilo das cadeiras** diferente do book (o book mostra encosto curvo/vazado; o modelo usado é estofado capitonê com rolo no topo) | `4-jantar-detalhe.jpg` | o único modelo CC0 disponível no Poly Haven foi retingido | substituir por modelo profissional de encosto curvo compatível com o book |
| D3 | **Mesa**: posição, dimensão e orientação **coincidem** com a planta | `4-jantar-detalhe.jpg` (desvio < 2 cm) | a impressão de orientação diferente vem das cadeiras de lado e do pendente que encobre o tampo visto de cima | manter posição; substituir o modelo (mais detalhado, com o tampo e os pés do book) |
| D4 | **"Piso preto" na cozinha** (planta 3D) | `5-planta-3d-navegador-atual.jpg` | não é o piso: é o **topo dos armários aéreos** (2,46 m), visível sem o forro e quase preto no bake (fica a 4 cm do forro, sem luz) | planta 3D com **plano de corte a 1,50 m**, como numa planta humanizada: aéreos, prateleira, pendente e TV não aparecem; topo das paredes em cor de corte |
| D5 | **Varanda/serviço sem máquina de lavar, tanque e vaso** (há só o shaft "X") | sobreposição | ficaram fora do escopo da sala/cozinha | modelar **máquina e tanque** (elementos da planta) e o vaso; a interpretação da varanda continua provisória |
| D6 | Quartos e banheiros sem mobiliário e louças | sobreposição | fora do escopo até aprovação | sem mudança agora |
| D7 | **Manchas de sol** atravessando quartos e varanda na vista de cima | `2-modelo-ortogonal.jpg` | o sol do bake usa uma direção **arbitrária** (orientação real desconhecida) | trocar por luz natural difusa de céu, sem sol direto, documentada como condição genérica até haver a implantação |

### 1.3 Auditoria dimensional e escala

A planta **não tem cotas**. A escala foi calibrada fazendo a área do **contorno externo**
(faces externas de todas as paredes) igual a 45,66 m². Isso assume que a área oficial é
medida pelas faces externas.

Pela prática da NBR 12721, a **área privativa** costuma contar as paredes de fachada
inteiras e as **paredes divisórias com outras unidades ou com a área comum até o eixo**
(metade da espessura). Se as paredes oeste (circulação do andar), sul e leste forem
divisórias, a escala correta fica **1,24 % maior**:

| Cenário | px/m | Cama de solteiro (padrão 0,88) | Queen, largura (padrão 1,58) | Folha da porta de entrada |
|---|---|---|---|---|
| A — atual: faces externas | 79,88 | 0,876 m | 1,590 m | 0,839 m |
| B — divisas pelo eixo (NBR 12721) | 78,90 | 0,887 m | 1,610 m | 0,849 m |

Os dois cenários são compatíveis com os móveis de referência (precisão de ±1 px ≈ ±1,5 %).
**Não é possível decidir só pela imagem.** A diferença é de 3 a 6 cm por ambiente.

| Ambiente | Cenário A (m) | Área A (m²) | Cenário B (m) | Área B (m²) | Situação |
|---|---|---|---|---|---|
| Estar/Jantar (L) | 3,33 × 4,72 | 10,91 | 3,37 × 4,78 | 11,18 | estimado |
| Cozinha | 1,41 × 2,65 | 3,75 | 1,43 × 2,68 | 3,84 | estimado (limite pela linha cinza) |
| Circulação | 1,09 × 0,91 | 1,00 | 1,10 × 0,92 | 1,02 | estimado |
| Varanda/Serviço (L) | 3,33 × 1,53 | 3,89 | 3,37 × 1,55 | 3,99 | estimado; interpretação provisória |
| Quarto 2 | 2,20 × 3,41 | 7,46 | 2,23 × 3,45 | 7,65 | estimado |
| Suíte (L) | 3,62 × 2,95 | 8,36 | 3,66 × 2,99 | 8,57 | estimado |
| Banho social | 2,34 × 1,18 | 2,75 | 2,37 × 1,19 | 2,82 | estimado |
| Banho suíte | 2,30 × 1,18 | 2,71 | 2,33 × 1,19 | 2,78 | estimado |
| **Soma interna** | | **40,84** | | **41,86** | |
| Área privativa | | 45,66 | | 45,66 | **confirmada (book)** |

A soma interna **não foi forçada** a 45,66 m². A diferença (4,8 m² em A; 3,8 m² em B)
corresponde às paredes contabilizadas em cada critério.

**Proposta:** manter o cenário A até haver uma cota oficial (planta de contrato, memorial
ou quadro de áreas por ambiente). Se o cenário B for confirmado, a correção é **uma
constante** no arquivo do layout. Proporções, alinhamentos e testes se mantêm, e todas as
medidas crescem 1,24 %.

### 1.4 Vista superior do tour

A "vista de cima" atual usa câmera em **perspectiva** com campo de visão estreito (12°),
por isso aparecem as laterais das paredes. **Correção:** câmera **ortográfica**
perpendicular ao piso, centralizada, com a orientação e a escala da planta oficial,
sobreposição com transparência ajustável e botão para ocultar ou exibir os balões
(estado preservado entre Visita e Planta 3D).

---

## 2. Diagnóstico do fotorrealismo

Evidência: `evidencia-lightmaps.jpg` (à esquerda, render final; à direita, só o lightmap,
`?lm=1`).

### 2.1 Iluminação
| Problema observado | Causa identificada | Evidência |
|---|---|---|
| Ambiente acinzentado, sem profundidade | lightmap **8 bits normalizado pelos texels mais claros** (varanda): a faixa dinâmica do bake vai de 0,088 (mediana) a 3,38 (máx.), 38×; o interior ocupa só os níveis baixos (mediana 52/255) | medição em `lm_arch` |
| Manchas nas paredes | quantização em poucos níveis + compressão **WebP com perdas** do lightmap + 160 amostras | `?lm=1` |
| Pouca sombra de contato e oclusão | **um só atlas de 2048 px para o apartamento inteiro** (texel ≈ 1–2 cm); objetos pequenos **fora do bake** (sem sombra própria); metais sem oclusão especular (o bake difuso de um metal é preto por definição) | `?lm=1`: rodapés e objetos sem sombra |
| Luz "de videogame" | único ponto de captura de reflexos (256 px, desfocado) para toda a sala; sem reflexo correto por paralaxe no piso e nos metais | código `PhotoEnvironment` |
| Cores lavadas | tone mapping **AgX** com exposição alta dessatura; correção de "balanço de branco" feita com multiplicador fixo | código |
| Sol arbitrário | direção do sol escolhida sem dados de orientação | `2-modelo-ortogonal.jpg` |

### 2.2 Artefatos geométricos (faixas verticais e marcas no piso)
- **Causa principal:** as paredes são caixas que se **sobrepõem nos encontros**, e os
  rodapés e as placas encostam nas faces das paredes. Os texels do lightmap que caem
  **dentro** de outra geometria saem pretos e, pela filtragem, **vazam** nas bordas visíveis:
  faixas verticais nos cantos e linhas escuras junto ao piso. A faixa vertical junto ao
  drywall da sala aparece no próprio lightmap.
- O empacotamento automático (smart project) fragmenta as superfícies em muitas ilhas
  pequenas, multiplicando costuras.

### 2.3 Materiais
- **Estofados "de concreto":** a textura da cadeira é um **couro capitonê marrom retingido**
  para cinza; as manchas do couro viraram manchas de cimento.
- **Sofá:** almofadas de caixa suavizada, sem costuras, vivos ou deformação. Parece sintético.
- O detalhe do normal map se perde contra um lightmap de baixa densidade; rugosidades
  calibradas "a olho", sem referência.
- Inox ajustado no tour com multiplicador de cor (paliativo).

### 2.4 Mobiliário
Feito com primitivas (sofá, mesa, rack, armários) ou com o pouco que existe em CC0 no
Poly Haven, em estilo diferente do book (cadeiras). O nível de detalhe é insuficiente para
observação próxima.

---

## 3. O pipeline atual consegue chegar lá?

**Sim, com mudanças no pipeline, não na tecnologia.** Visualizadores imobiliários em WebGL
que chegam perto de fotografia (Shapespark, exportações do 3DVista/Unreal) usam o mesmo
princípio: luz pré-calculada + PBR + reflexos locais. O que falta aqui:

1. **Lightmaps HDR** (RGBM ou meia precisão) por ambiente, com densidade alta na zona
   (≈ 4–5 mm/texel na sala e cozinha), sem compressão com perdas.
2. **Arquitetura gerada como malha limpa** (união das paredes, sem faces internas nem
   sobreposições) e desdobramento UV próprio para lightmap, com margens corretas.
3. **Todos os objetos visíveis no bake**, incluindo os pequenos, e oclusão especular para
   metais e vidros.
4. **Sondas de reflexo locais** (cubemaps com correção de paralaxe por ambiente) em vez de
   uma captura única.
5. **Tone mapping neutro** (Khronos PBR Neutral ou ACES calibrado), exposição calibrada
   contra um render de referência do Cycles, e pós-processamento leve no computador
   (oclusão de ambiente em tela para detalhe fino e brilho suave nas janelas).
6. **Modelos profissionais** compatíveis com o book.
7. **Validação lado a lado:** mesmas câmeras renderizadas no Cycles (referência) e no
   navegador, a cada iteração, até a diferença ser pequena.

Alternativas avaliadas, **não recomendadas agora**:
- **Unreal + pixel streaming:** visual excelente, mas exige uma GPU de servidor por visitante
  simultâneo (custo contínuo), depende de latência e escala mal para campanhas.
- **Gaussian splatting** gerado a partir de renders do Cycles: aparência realmente
  fotográfica, mas exige treinamento em GPU (indisponível neste ambiente), arquivos de
  50–200 MB e iluminação fixa. É uma linha de pesquisa futura.

**Limitação deste ambiente:** não há GPU. O Cycles roda em CPU: bakes de alta densidade
levam de 1 a 3 h e as iterações ficam lentas. Uma máquina com GPU (o seu computador com o
Blender, ou um runner em nuvem) acelera de 10 a 20×.

---

## 4. Plano de correção priorizado

**Reaproveitar:** layout e geometria aprovados, navegação, colisões, testes, planta 3D,
estrutura do pipeline (export/fetch/otimização), Three.js/R3F, mapeamento do book.

**Substituir:** cadeiras e mesa; sofá e almofadas; pendente e tapete (se houver modelo
melhor); plantas e objetos; codificação dos lightmaps; tone mapping.

**Refazer:** geração da malha arquitetônica (sem sobreposições); estratégia de UV e de
densidade dos lightmaps; iluminação natural sem sol arbitrário; calibração dos materiais;
reflexos locais; marcenaria da cozinha com mais detalhe (portas com espessura, chanfros,
puxadores cava, frentes com veio contínuo); esquadrias com perfis reais.

### Fase B — geometria, mobiliário e interface (com imagens de conferência)
1. Cadeiras com rotação calculada por peça + teste automático de orientação, apoio no piso
   e ausência de interseções.
2. Novos modelos de jantar e sala, apresentados **de cima, de lado e na altura dos olhos**
   antes da integração.
3. Malha arquitetônica limpa (elimina as faixas e as marcas no piso); máquina, tanque e
   vaso na área de serviço.
4. Planta 3D: câmera ortográfica verdadeira, plano de corte a 1,50 m, poché das paredes,
   sobreposição ajustável, **botão para ocultar ou exibir balões** (estado preservado).

### Fase C — qualidade visual (sem integração ainda)
1. Uma câmera da sala e uma da cozinha. A cozinha reproduz o enquadramento da
   **perspectiva oficial**. Para a sala, **preciso da perspectiva oficial do book**, se existir.
2. Render de referência no Cycles **e a mesma câmera no navegador**, lado a lado.

### Fase D — integração e otimização (após aprovação visual)
Versão de referência com a melhor qualidade viável; derivadas para computador e celular
(compressão, níveis de detalhe, carregamento progressivo); testes e métricas (inclusive
`?fps=1`); nova prévia.

---

## 5. Decisões necessárias

1. **Modelos profissionais gratuitos com licença adequada** exigem conta e chave de API:
   - **Sketchfab**, filtrando CC0 e CC-BY (atribuição registrada nos créditos): preciso de um token da sua conta;
   - **BlenderKit**, licença Royalty Free: a redistribuição dentro de um aplicativo web precisa ser conferida no texto da licença antes do uso.

   Se nada compatível com o book for encontrado, um orçamento pequeno para 2 ou 3 peças
   pagas (jantar e sofá) resolve com segurança jurídica.
2. **Perspectiva oficial da sala** (e outras páginas do book com o estar), para a Fase C.
3. **Critério da área privativa** (cenário A ou B), ou alguma cota oficial.
4. **Ambiente com GPU** para os bakes finais (opcional, encurta muito as iterações).
5. **Vista externa provisória:** proponho remover a linha de horizonte e usar um brilho
   claro difuso de janela (como numa foto exposta para o interior), sem paisagem. Se
   desejar, cortinas de voil na porta da varanda como item de decoração.
