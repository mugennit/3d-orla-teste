# Mudança de abordagem: do "modelo gerado por código" ao apartamento virtual fotorrealista

## 1. Diagnóstico

O processo até aqui foi organizado para **fidelidade geométrica e verificabilidade**: a
cena é gerada por código a partir do layout (caixas, primitivas, poucos assets CC0),
iluminada por um bake único e exibida com lightmap de baixa faixa dinâmica. Isso cumpriu
bem o papel de base técnica (planta fiel, navegação, colisões, testes), mas produz por
construção uma **maquete**:

| Camada | Como está | Por que parece maquete/jogo antigo |
|---|---|---|
| Arquitetura | caixas extrudadas da planta | sem as imperfeições e os detalhes que o olho reconhece como reais (perfis de guarnição, rodapé com perfil, reboco, frestas de sombra, encontros, espessuras de acabamento) |
| Mobiliário | primitivas suavizadas + poucos CC0 retingidos | proporções corretas, mas superfícies, costuras, caimento e micro-detalhes ausentes |
| Materiais | texturas genéricas, rugosidade "a olho" | sem calibração de albedo, rugosidade e escala, sem variação |
| Luz | sol arbitrário, 1 atlas de 2K em 8 bits para o apartamento inteiro | pouca faixa dinâmica, sem sombra de contato, cinza, manchas |
| Navegador | lightmap + 1 sonda de reflexo + AgX | sem reflexos locais nem oclusão fina; tons lavados |

**Conclusão:** o problema não é só de ajuste fino. A produção visual precisa ser
**conduzida no Blender como uma visualização de interiores profissional (cena-mestra)**,
e o tour precisa ser **derivado dessa cena** por um processo de transferência
mensurável. A planta continua sendo a fonte das medidas e um recurso de navegação.

### O que se preserva
Layout e auditoria da planta; navegação em primeira pessoa, colisões e controles de
computador e celular; planta ortográfica com botão de nomes; testes automatizados;
infraestrutura do pipeline (download e registro de licenças, exportação, bake, otimização,
métricas); correções da Fase B (orientação dos objetos com verificação, paredes sem
sobreposição, área de serviço).

### O que deixa de ser caminho final
Móveis construídos com primitivas, materiais e iluminação atuais, lightmap 8 bits
normalizado e a etapa visual gerada só por script.

---

## 2. Nova forma de produção

**Cena-mestra no Blender (por ambiente):**
1. **Arquitetura de interiores:** paredes com espessura de acabamento, cantos e encontros
   reais, rodapé e guarnições com perfil, portas com folha, batente, dobradiças e maçaneta
   de catálogo, esquadrias com perfis de alumínio reais, soleiras e peitoris, forro e
   frestas de sombra **somente se confirmados**. Nada é inventado: elementos não
   confirmados ficam neutros.
2. **Mobiliário de qualidade profissional**, compatível com o book e com licença comercial
   registrada (seção 4). Marcenaria da cozinha modelada no nível de projeto executivo:
   portas de 18 mm com bordas, frestas de 3 mm, puxador cava, ripado com espessura real,
   bancada com frontão, cuba e metais de catálogo.
3. **Materiais calibrados:** albedo em faixas físicas (tinta branca ≈ 0,75–0,8, madeira
   ≈ 0,3–0,5), rugosidade e relevo conferidos com referências, escala real das texturas,
   variação por peça para evitar repetição.
4. **Luz arquitetônica:** céu físico de dia claro **sem sol direto** (orientação ainda
   desconhecida, então não se simula insolação), câmera com exposição física, luz
   artificial apenas como apoio. Quando houver implantação, o sol real entra como variante.
5. **Render de referência (Cycles):** o padrão visual a ser aprovado.

**Transferência para o tour:** a mesma cena é cozida (bake) e exportada; o tour é
calibrado até a mesma câmera, no navegador, ficar visualmente próxima do render de
referência. A validação é sempre **lado a lado, mesma câmera**, com diferença medida.

---

## 3. Alternativas tecnológicas para o navegador

| Opção | Qualidade atingível | Navegação | Desempenho / arquivos | Complexidade | Observações |
|---|---|---|---|---|---|
| **A. Three.js com luz pré-calculada de alta qualidade** (evolução do atual) | Alta em ambientes difusos (~80–90 % do render); reflexos aproximados | Livre (1ª pessoa) | Computador 30–60 MB; celular 15–25 MB; 60 fps no computador, 30+ no celular | Média | lightmaps HDR por ambiente (4–8 mm/texel), todos os objetos no bake, sondas de reflexo com paralaxe por ambiente, oclusão em tela e tom neutro calibrado. Mantém todo o app atual |
| **B. Gaussian splatting** treinado com centenas de renders do Cycles | **Muito alta, praticamente fotográfica**, inclusive reflexos | Livre na região capturada (artefatos fora dela) | 20–80 MB comprimido; celular atual ≈ 30 fps com 1–2 M splats | Alta | **exige GPU para treinar** (indisponível aqui: computador com GPU ou nuvem); iluminação e mobília fixas (mudar = renderizar e treinar de novo); colisões continuam pelo layout; visualizadores existentes integram com Three.js |
| **C. Panoramas 360° renderizados no Cycles** em pontos de parada | **Idêntica ao render** | Saltos entre pontos (estilo Matterport), não caminhada livre | 1–3 MB por ponto; ótimo no celular | Baixa | pode **complementar** A ou B como "modo foto" |
| **D. Streaming de vídeo** (Unreal / renderização em servidor) | Muito alta, em tempo real | Livre | Leve no aparelho, mas uma GPU de servidor por visitante simultâneo | Alta, com custo contínuo | latência, custo e escala ruins para campanhas |

**Recomendação:** demonstrar primeiro a **opção A**, que não exige migração, e medir a
diferença para o render de referência. Se a diferença for inaceitável, a **opção B** é o
caminho para caminhada livre com aparência fotográfica. Ela exige um ambiente com GPU e
deve ser aprovada antes. A opção C pode ser acrescentada como complemento de baixo custo.

---

## 4. Modelos com licença comercial gratuita (pesquisa feita)

- **Poly Haven (CC0):** baixado e avaliado. Pouco mobiliário contemporâneo; serve para
  acessórios, plantas e texturas.
- **Khronos/Wayfair (CC0 e CC-BY 4.0):** baixado e medido. Qualidade de produto, mas os
  sofás têm 2,19 m e 2,73 m (vaga do book: 1,44 m) e a "Sheen Chair" é poltrona, não
  cadeira de jantar. Bons para calibrar materiais (tecidos).
- **Sketchfab (CC0 e CC-BY):** busca feita, sem conta. Candidatos visuais nas folhas
  `docs/etapa2-revisao/faseB/candidatos-sketchfab-*.jpg`, por exemplo: "Dining Table Set"
  (cadeiras estofadas cinza de encosto curvo, 478 mil faces), "Dining Set Scandinavian",
  "Denver Sofa 2 Seat" (826 mil faces), "Modern Sofa", pendentes da fabricante Lightstar,
  "Monstera Deliciosa Potted". **Para baixar, medir e renderizar** os candidatos, o
  Sketchfab exige uma conta gratuita (token de API sem custo). Sem isso, só as miniaturas
  podem ser avaliadas.

Nenhum modelo foi integrado. Os candidatos serão apresentados com imagens próprias,
dimensões, licença e comparação com o book antes da escolha.

---

## 5. Plano de produção com validação visual

| Marco | Entrega | Critério de aprovação |
|---|---|---|
| **M1. Cena-mestra da sala/cozinha** | arquitetura de interiores, mobiliário escolhido, materiais calibrados, luz de dia | revisão de modelos (topo, lateral, olhos) e de materiais |
| **M2. Render de referência** | 1 enquadramento da sala com a cozinha + 1 da cozinha no ponto de vista da perspectiva oficial (Cycles, 2K, denoise) | "parece foto de apartamento decorado" |
| **M3. Prova no navegador** (opção A) | mesmas câmeras no tour, lado a lado com M2, diferença medida, tamanho dos arquivos, FPS no seu aparelho (`?fps=1`) | qualidade próxima do render, fluidez |
| **M4. Decisão tecnológica** | se M3 ficar aquém: proposta detalhada da opção B (e/ou C), com custo e prazo | sua aprovação |
| **M5. Produção do apartamento** | demais ambientes no processo aprovado | por ambiente |

**Limites deste ambiente:** sem GPU, o Cycles roda em CPU. Um render de referência em 2K
leva cerca de 1–2 h, e um bake de alta densidade por ambiente de 1–3 h. É viável, mas
lento. Com o seu computador (Blender com GPU) ou um runner com GPU, de 10 a 20× mais
rápido. Não autorizado por enquanto: o plano funciona sem isso, com mais tempo.

## 6. Decisões necessárias para começar o M1
1. **Modelos:** autorizar uma **conta gratuita do Sketchfab** (sem custo) para baixar
   candidatos CC0/CC-BY; ou seguir só com Poly Haven/Khronos, aceitando modelar à mão
   as peças que faltarem (sofá de 2 lugares, jantar).
2. **Referências do book:** só temos a **perspectiva da cozinha (p. 17)**. Falta,
   se existir no book, a **perspectiva da sala/estar** e quaisquer imagens com acabamentos
   (piso, paredes, iluminação). Sem ela, o M2 da sala segue o estilo da cozinha e o
   layout da planta.
3. **Opção tecnológica a demonstrar no M3:** recomendo A, mantendo B em avaliação.
