# Requisito: fotorrealismo de apartamento decorado

**Exigência do cliente (fundamental):** o resultado final deve ser altamente
fotorrealista, semelhante a uma visita presencial a um apartamento decorado.
**Não** deve parecer planta 3D, maquete ou videogame estilizado. A planta do
book serve apenas como referência para a geometria.

> Os materiais procedurais e o mobiliário de primitivas da cena de teste atual
> **não atendem** a este requisito — são apenas andaimes técnicos para validar
> controles, colisões e desempenho.

## Critérios de aceite

- Materiais **PBR** completos (cor, normal, rugosidade, metalicidade, AO) com
  escala física correta — piso, paredes, rodapés, bancadas, metais, tecidos, vidro.
- **Modelos 3D detalhados** de mobiliário e decoração (sofá, camas, mesas,
  luminárias, cortinas, eletrodomésticos, louças e metais), com chanfros e
  proporções reais — nada de caixas.
- **Iluminação natural convincente**: luz do dia entrando pelas esquadrias,
  sombras de contato, luz rebatida (iluminação global), céu/vista real ao fundo.
- Comparação lado a lado com as perspectivas do book como referência de padrão.
- **Desempenho em smartphones**: meta ≥ 30 fps em aparelho intermediário
  (ex.: iPhone 12 / Galaxy A54) e carregamento inicial ≲ 15–20 MB.

## Estratégia técnica

Fotorrealismo em tempo real no celular só é viável com iluminação
**pré-calculada**. A abordagem planejada:

1. **Modelagem e iluminação no Blender** a partir da planta digitalizada
   (o arquivo de layout do projeto continua sendo a fonte das medidas e das
   colisões).
2. **Bake de iluminação global** (Cycles) em lightmaps: luz do sol e do céu,
   rebatimentos e oclusão ficam "gravados" — custo zero em tempo real.
3. **Materiais PBR** de bibliotecas com licença livre (CC0: Poly Haven,
   ambientCG) ou fornecidos pela construtora/decoração, conforme o memorial.
4. **Mobiliário**: modelos de alta qualidade (biblioteca CC0 / comprados /
   modelados sob medida), otimizados com LODs.
5. **Exportação glTF/GLB** com compressão **Meshopt/Draco** (geometria) e
   **KTX2/Basis** (texturas), carregamento progressivo.
6. **Tempo real (Three.js)**: lightmaps + mapa de ambiente (HDRI) para
   reflexos, *reflection probes* por ambiente, tone mapping filmico (AgX/ACES),
   pós-processamento leve no desktop (SSAO/bloom sutil) e perfil reduzido no
   celular.
7. **Vista externa**: panorama/HDRI coerente com a orientação e o andar
   (Baía de Guanabara), sem inventar o entorno.

## Insumos adicionais necessários

Além do listado em `PLANTA-REAL.md`: perspectivas internas do decorado (se
houver), memorial de acabamentos com referências de produtos, e definição do
estilo de decoração desejado.
