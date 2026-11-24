# M3 · Versão 2 — investigação e correção dos problemas da prévia reprovada

Prévia: https://claude.ai/artifact/7vQzM4TXDWpfW2v9ZP6Yat (mesmo endereço; privada).
Capturas antes × depois: `docs/m3/v2/antes-depois-*.jpg`. Inspeção de todos os cômodos:
`docs/m3/v2/comodos.jpg` (+ `comodos.json` com o indicador de manchas por captura).

Princípio seguido: diagnosticar a causa com testes rápidos (bake 1024 px / 64 amostras, ~6 min),
corrigir na origem e só então fazer o bake longo. Foram 8 testes rápidos antes do bake final.

## 1. Qualidade visual geral — causas encontradas (não era exposição)

| Causa | Evidência | Correção |
|---|---|---|
| **Forro único sobre as paredes**: o forro era o contorno inteiro do apartamento passando por cima de todas as paredes; os texels sobre a espessura das paredes ficavam pretos no bake e vazavam nas junções | manchas escuras em todos os encontros parede/teto | forro = contorno menos as paredes de altura total, encostando exatamente nas faces |
| **Frestas entre ambientes e paredes** (4 mm a 7 cm): os polígonos dos ambientes não encostavam nas faces das paredes; ali não havia piso nem forro | linha clara no teto do quarto 2; verificação automática: 0,73 m² de frestas | piso de cada ambiente cresce até as paredes (sem pular paredes finas, sem sobreposição); 0 frestas |
| **Lightmap único e grosso** para a arquitetura do apartamento inteiro (2048 px, ~3 cm/texel), com cada placa de porcelanato e cada faixa de parede como ilha separada | faixas e tons diferentes entre placas; faixa manchada na altura das vergas | 5 lightmaps: **paredes** (mapeadas por plano, 0,82 cm/texel), **piso** (planar contínuo, ~4 mm/texel), **forro** (planar), **esquadrias/rodapés/portas**, **móveis** |
| **Faces externas da fachada** ocupando ~1/4 do atlas | — | removidas antes do mapeamento (nunca vistas de dentro) |
| **Cáusticas no bake** (luz rebatida em inox/verniz) | estrias que pareciam reflexos na laca e no piso | desligadas no bake |
| **Banheiros sem luz** (sem janela) | caixas cinza-escuras | plafon com luz quente acesa em cada banheiro |
| **Céu entrando pelo interior das paredes** | linhas claras | laje superior oclusora (não exportada) |
| **Margem do bake** nos mapas planares | encontro serrilhado após o denoise | 32 px só nos mapas planares (nos atlas empacotados invadia ilhas vizinhas — testado e revertido) |

Testado e **descartado com números**: aumentar o contraste do AgX ("look"). A distribuição de tons do
navegador já coincide com a do Cycles (desvio padrão de luminância 45,0 × 45,8; percentis 5/95
72/225 × 73/221); o contraste extra afastava. A aparência de "jogo" vinha da iluminação pré-calculada,
não do tratamento de imagem.

## 2. Persiana da sala atravessando rack e sofá

**Causa:** não era a exportação — a cena-mestra posicionava as cortinas de canto a canto da parede da
varanda. O vão da porta de correr ocupa quase toda a parede; a ponta do sofá fica a 5 cm do vidro e o
rack encosta na parede (layout do book): não há espaço para cortina até o piso.
**Correção:** persiana rolô (tela translúcida) dentro do vão, recolhida com a barra a 1,95 m — acima de
qualquer móvel. Arquitetura inalterada.

**Verificação de interseções** (`pipeline/intersection_check.py`, todos os objetos, penetração por
vértice > 6 mm) encontrou e corrigiu também, na origem:

| Interseção | Causa | Correção |
|---|---|---|
| tapete × parede (4 cm) | raio do book passava da parede do sofá | centro deslocado o mínimo para 2 cm das faces reais |
| rack × parede (2,3 cm) e TV × parede (1,3 cm) | parede leste muda de alvenaria (face 3,430) para drywall (face 3,415) em y = 2,03 | limites calculados pelas peças reais de parede |
| geladeira × aéreo (1,8 cm) | corpo do aéreo descia até a altura dos demais também sobre a geladeira | aéreo sobre a geladeira começa em 1,88 m |
| folhas de porta × guarnições (1 cm, todas as portas) | folha aberta a 90° começava na face da parede | afastada 1,7 cm, como a dobradiça real (ponto cego antigo: folhas e guarnições eram o mesmo objeto) |
| hall provisório × parede externa | faixa em y larga demais | limitada à fachada |

Resultado final: **0 interseções não justificadas** (3 justificadas: flores dentro dos vasos; pés do sofá
sobre o tapete) e **0 frestas** de piso ou forro.

## 3. Quartos — manchas nos encontros parede/teto

Causas: forro sobre as paredes, frestas, faixas de parede como ilhas separadas, céu pelo interior das
paredes e resolução (ver item 1). Ver `antes-depois-quartos-encontro-parede-teto.jpg`.

## 4. Piso e soleiras

Causas: placas de porcelanato como ilhas separadas do lightmap (tons diferentes entre placas vizinhas),
placas passando por baixo das paredes e, num teste intermediário, o rejunte sobrescrevendo as placas na
projeção planar (corrigido: o rejunte reutiliza o lightmap das placas). Materiais de cada ambiente
preservados (porcelanato na zona social e banheiros, laminado nos quartos, granito nas soleiras).
Ver `antes-depois-piso-e-soleiras.jpg`.

## 5. Banheiro e porta

Paredes, batentes, guarnições, folha e soleira inspecionados (`antes-depois-banheiro-e-porta.jpg`):
folha da porta afastada das guarnições, banheiro com luz própria, emendas de lightmap da folha
eliminadas (lightmap de esquadrias/portas próprio). Os banheiros seguem **sem acabamento final**
(sem louças e revestimentos), como os demais ambientes fora da sala/cozinha.

## 6. Teletransporte pela planta

`src/engine/teleport.ts`: destino aceito só dentro de um ambiente da geometria auditada, fora de
paredes e móveis, com folga explícita para o visitante (raio 25 cm). Clique encostado em obstáculo é
ajustado em até 30 cm; mais que isso é recusado. Recusa não move a câmera e mostra o motivo no ponto
clicado ("Fora do apartamento", "Sobre uma parede", "Sobre um móvel", "Sem espaço…").
Testes: `src/engine/teleport.test.ts` (6 testes, incluindo varredura de 8.400 pontos da planta) e
`scripts/smoke.cjs` (clique fora do apartamento no navegador: recusado, posição inalterada, aviso visível).
Durante os testes foi encontrado e corrigido um caso real: num canto apertado da área de serviço a
colisão oscilava entre o shaft e a parede e aceitava um ponto dentro do obstáculo.

## 7. Campo de visão

Padrão **90° na horizontal** (≈ lente 0,6×), perspectiva retilínea (sem alterar a geometria), vertical
limitado a 100° em telas em retrato. Ajuste de 70° a 110° no painel de ajuda (?), lembrado entre
visitas; `?fov=` na URL. Ver `docs/m3/v2/fov-80.png` × `fov-90.png`.

## 8. Validação ampliada

| Verificação | Ferramenta | Resultado |
|---|---|---|
| Interseções entre todos os objetos | `pipeline/intersection_check.py` | 0 não justificadas |
| Integridade dos ambientes (piso/forro sem frestas) | idem | 0 frestas |
| Destinos de teletransporte | `teleport.test.ts` + `smoke.cjs` | ver relatório final abaixo |
| Inspeção visual de todos os cômodos (18 poses) + indicador de manchas | `scripts/rooms.cjs` | `docs/m3/v2/comodos.jpg` |
| Comparação com o Cycles | `scripts/compare.cjs` | `docs/m3/v2/compare.json` |
| Caminhada real com capturas em movimento | `scripts/walk.cjs` | colisões ok |
| Testes de ponta a ponta (computador + celular) | `scripts/smoke.cjs` | ver abaixo |
