# Circulação e colisões: sala, cozinha e jantar (rodada 3)

Script: `pipeline/circulation_check.py` (roda sobre `.cache/master/sala-cozinha.blend`).
Usa a **geometria real** da cena-mestra (paredes, esquadrias, sofá e cadeiras importados,
geladeira própria), cortada entre 0,05 m e 1,50 m e rasterizada a 1 cm. As larguras são a
**passagem útil mais estreita** de cada rota (maior "disco" que passa). A porta de correr
da varanda foi considerada aberta (folha móvel recolhida sobre a fixa) e as cortinas
recolhidas. Resultados: `circulacao.json` e `circulacao.png`.

## Colisões
**Nenhuma** entre móveis (cascos na faixa 0,05–0,65 m: pés, assentos, pernas da mesa).
O forno e o cooktop embutidos no gabinete foram desconsiderados por serem intencionais.
Sofá 1,44 × 0,70 m dentro da vaga do book; cadeiras 0,48 × 0,49 m; geladeira 0,64 × 0,66 m.

## Rotas
| Rota | Largura útil | Onde aperta | Avaliação |
|---|---|---|---|
| Cozinha: bancada → geladeira | 0,90 m | corredor da cozinha | adequada (NBR 9050: 0,90 m) |
| Cozinha → mesa de jantar | 1,32 m | | adequada |
| Entrada → cozinha / sala / corredor dos quartos | **0,72 m** | entre a quina da geladeira (com puxador) e o encosto da cadeira 1 | estreita para uso contínuo; passa uma pessoa |
| Entrada → frente do sofá | **0,70–0,71 m** | entre o sofá e o rack | idem |
| Sala → varanda | **0,66 m** | entre o braço do sofá, o rack e o vão da porta | estreita |
| Cadeiras 3 e 4: espaço atrás do encosto | **0,25 m** | parede do banheiro social | apertado para afastar a cadeira e sentar (o usual é 0,60–0,75 m) |
| Cadeiras 1 e 2: espaço atrás do encosto | 1,19–1,32 m | | folgado |

## Leitura
- As restrições vêm das **posições do book** (mesa encostada na parede sul, cadeiras dos
  dois lados, sofá e rack ladeando a porta da varanda), não dos novos modelos. O sofá
  novo ocupa exatamente a vaga anterior.
- Nada foi alterado na geometria nem nas posições. Ajustes possíveis, **para decisão do
  cliente**: cadeiras recolhidas sob a mesa quando não usadas (o trecho entrada→sala passa
  para cerca de 0,84 m, estimado); mesa deslocada cerca de 0,15 m para oeste (dá 0,40 m atrás
  das cadeiras 3 e 4); puxadores da geladeira do lado da bancada (+5 cm na quina).
