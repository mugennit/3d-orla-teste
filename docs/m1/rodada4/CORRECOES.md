# M1 · Rodada 4 · Correções finais

Pedido do cliente: corrigir a faixa clara do granito, o vaso com borda escura e o veio ondulado
da mesa; verificar a luz estourada na entrada; manter a câmera e a geometria do book; renderizar
só as vistas afetadas. Geometria auditada **não alterada**.

Método: diagnóstico por prévias rápidas sobre a cena salva (800×450, 48–64 amostras), depois
prévias da cena completa (960×540, 48) e por fim só as vistas que comprovam as correções
(1280×720, 192 amostras, ~11 min cada).

| Problema | Causa encontrada | Correção | Comprovação |
|---|---|---|---|
| Faixa clara no granito | Reflexo **espelhado** da fita de LED do aéreo no verniz do granito (coat roughness 0,05). Confirmado desligando só o reflexo do LED: a faixa some — mas a cuba perde o brilho, por isso essa saída foi descartada | Coat roughness **0,18** (polido real). Testados 0,12 (faixa ainda visível, mais larga) e 0,18 | `final-conf-cuba.jpg` |
| Borda escura no vaso | O asset Khronos é uma **amostra de teste**: um vaso em transparência "alpha" (sem refração) e outro em transmissão com parede irregular | Dois vasos **próprios** por revolução: parede de 2,8 mm, fundo de 9 mm, borda em meia-cana, sólido fechado, vidro com transmissão e IOR 1,5. Do asset só restam as flores (CC0). Vasos afastados 11 cm da fruteira e hastes apoiadas no fundo | `final-conf-mesa.jpg`, `final-conf-cadeira.jpg`, `final-jantar-detalhe.jpg` |
| Veio ondulado da mesa | (1) repetição a cada 0,45 m comprimia as "catedrais" da lâmina; (2) a UV era gerada **antes** do arredondamento (subdivision), que a distorcia; textura 1k | Textura **2k**, repetição de **0,95 m** (escala de uma folha de lâmina), UV refeita depois do arredondamento com veio sempre no comprimento, inclusive na fita de borda; variação de cor mais suave | `final-conf-mesa.jpg`, `final-conf-cadeira.jpg` |
| Luz estourada na entrada | A porta de entrada está aberta (como no book) e **não havia nada do lado de fora**: a câmera via o céu do mundo pelo vão, e esse céu iluminava o canto da entrada | **Hall neutro provisório** fora do apartamento (`ENTORNO_hall_entrada`, coleção `ENTORNO_provisorio`): piso, teto e paredes lisas, sem luz própria. A luz natural continua vindo só da varanda | `final-conf-geladeira.jpg`, `final-jantar-detalhe.jpg` (fundo à direita) |
| Perspectiva do book | — | Mantida (decisão do cliente) | — |

## Hall provisório: separação da geometria oficial

- Fica inteiramente do lado de fora da parede oeste (x < 0), não toca paredes, vãos nem medidas.
- Coleção própria `ENTORNO_provisorio`, marcado `oficial = False`, sem grupo de lightmap.
- Não participa das colisões: as do tour vêm do layout auditado (`engine/collision.ts`), não
  das malhas; `circulation_check.py` ignora objetos `ENTORNO_`.
- Não representa o corredor real do prédio (desconhecido). Substituir ou remover quando houver
  informação do hall real.

## Defeitos que ainda restam (avaliação objetiva)

1. **Hall visto pela porta é genérico e um pouco frio:** o piso escuro do hall puxa para o
   azul-acinzentado em `final-conf-geladeira.jpg` e no fundo de `final-jantar-detalhe.jpg`.
   Lê como corredor, sem estourar, mas é claramente neutro. Aceitável como provisório.
2. **Folhas das flores de muito perto** (`final-conf-mesa.jpg`): textura do asset com bordas
   amareladas e resolução limitada a ~30 cm. A distância normal de visita não aparece.
3. **Vasos sem água:** decisão deliberada. Água encostada no vidro exige interface exata entre
   os volumes; uma folga cria anéis escuros de reflexão interna, o mesmo tipo de artefato que
   estava sendo eliminado.
4. **Arredondamento da borda do tampo:** na quina mais próxima de `final-conf-cadeira.jpg` o veio
   da fita de borda curva levemente sobre o arredondamento. Discreto.
5. **Vistas antigas não refeitas** (por decisão): `rodada3/final-sala-cozinha.jpg`, `final-cozinha.jpg`
   e `final-cozinha-book.jpg` ainda mostram o granito antigo e o céu pela porta de entrada.
   A cena atual já gera as versões corrigidas se forem necessárias.

Nenhum desses itens exige mudança na geometria auditada.
