# Etapa 1 — Medidas do modelo (geradas automaticamente)

> Gerado por `scripts/plan-report.ts` a partir de `src/layout/orla-guanabara/apto-45m2.ts`.
> **Nenhuma medida abaixo é oficial**, exceto a área privativa (45,66 m²). A planta do book não tem cotas.

## Calibração

- Escala: **79,88 px/m** (1 px ≈ 1,3 cm na imagem do book)
- Método: Área do contorno externo = 45,66 m² (área privativa do book); conferida com camas e portas padrão.
- Área do contorno modelado: 45,66 m² (declarada: 45,66 m² — **confirmada**)
- Pé-direito: 2,50 m (**adotada**)

## Ambientes (área interna modelada)

| Ambiente | Dimensões aprox. (m) | Área modelada (m²) | Origem | Observação |
|---|---|---|---|---|
| Varanda / Serviço | 3,33 × 1,53 | 3,89 | medida na imagem | Interpretação PROVISÓRIA: varanda com área de serviço integrada (máquina e tanque). |
| Cozinha | 1,41 × 2,65 | 3,75 | medida na imagem | Limite inferior pela linha cinza fina da planta (não é parede). |
| Estar / Jantar | 3,33 × 4,72 | 10,91 | medida na imagem |  |
| Circulação | 1,09 × 0,91 | 1,00 | medida na imagem |  |
| Quarto 2 | 2,20 × 3,41 | 7,46 | medida na imagem |  |
| Suíte | 3,62 × 2,95 | 8,36 | medida na imagem |  |
| Banho social | 2,34 × 1,18 | 2,75 | medida na imagem |  |
| Banho suíte | 2,30 × 1,18 | 2,71 | medida na imagem |  |
| **Soma das áreas internas** | | **40,84** | | Diferença para 45,66 m² = paredes (4,82 m², 10,6 %) |

## Vãos

| Vão | Tipo | Largura (m) | Peitoril (m) | Altura/verga (m) | Largura | Alturas | Observação |
|---|---|---|---|---|---|---|---|
| porta-entrada | door | 0,85 | 0,00 | 2,10 | medida na imagem | adotadas | Folha desenhada aberta junto à parede inferior; seta de acesso no book. |
| janela-suite | window | 1,36 | 1,00 | 2,10 | medida na imagem | adotadas | Largura medida; peitoril/altura adotados. |
| janela-q2 | window | 1,40 | 1,00 | 2,10 | medida na imagem | adotadas | Largura medida; peitoril/altura adotados. |
| porta-correr-varanda | sliding-door | 1,80 | 0,00 | 2,10 | medida na imagem | adotadas | Tratada como totalmente atravessável até definição da folha móvel. |
| porta-q2 | door | 0,80 | 0,00 | 2,10 | medida na imagem | adotadas |  |
| porta-suite | door | 0,88 | 0,00 | 2,10 | medida na imagem | adotadas |  |
| porta-banho-social | door | 0,75 | 0,00 | 2,10 | medida na imagem | adotadas |  |
| porta-banho-suite | door | 0,75 | 0,00 | 2,10 | medida na imagem | adotadas |  |

## Paredes

| Parede | Sistema | Comprimento (m) | Espessura (m) | Coincidência com a planta | Observação |
|---|---|---|---|---|---|
| ext-oeste | concrete | 5,86 | 0,10 | 100 % | Parede do lado da entrada (provável circulação do pavimento). |
| ext-sul | concrete | 8,40 | 0,09 | 87 % |  |
| ext-leste | concrete | 4,43 | 0,11 | 100 % |  |
| ext-norte-suite | concrete | 2,64 | 0,10 | 96 % |  |
| ext-norte-q2 | concrete | 2,53 | 0,10 | 97 % |  |
| varanda-guarda-corpo | railing | 2,48 | 0,04 | 100 % | Faixa cinza contínua na borda da varanda: interpretada como guarda-corpo de vidro. Tipo e altura A CONFIRMAR. |
| varanda-parapeito | parapet | 0,80 | 0,06 | 100 % | Trecho escuro estreito atrás da máquina de lavar: interpretado como parapeito. Pode ser parede inteira — A CONFIRMAR. |
| varanda-porta-vidro | concrete | 1,94 | 0,09 | — | Esquadria de vidro entre sala e varanda. Divisão de folhas (montante em ~242 px) visível; folha móvel não identificável. |
| sala-q2 | concrete | 2,03 | 0,10 | 100 % |  |
| sala-q2-drywall | drywall | 1,55 | 0,08 | 100 % |  |
| q2-suite | concrete | 2,03 | 0,10 | 100 % |  |
| q2-suite-drywall | drywall | 1,55 | 0,08 | 100 % |  |
| q2-sul-drywall | drywall | 2,39 | 0,08 | 100 % |  |
| circulacao-suite | drywall | 0,97 | 0,08 | — | Vão quase todo ocupado pela porta da suíte; existência de trecho fixo A CONFIRMAR. |
| banhos-norte-drywall | drywall | 4,81 | 0,08 | 100 % |  |
| banho-social-sala | concrete | 1,26 | 0,10 | 100 % |  |
| banhos-divisa-drywall | drywall | 1,26 | 0,10 | 100 % | Linha amarela + contorno escuro (511–524 px): espessura adotada 0,10 m. |
| servico-cozinha-drywall | drywall | 1,49 | 0,08 | 100 % |  |
| servico-sala-drywall | drywall | 1,70 | 0,08 | 100 % | Drywall atrás do sofá; separa cozinha e área de serviço do estar. |

_Coincidência: menor fração, entre os trechos sólidos da parede, de amostras do eixo modelado que caem sobre traço de parede na imagem (faixa de ±3 px ≈ ±4 cm)._

