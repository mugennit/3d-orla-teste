# M1: cena-mestra da sala/cozinha e render de referência

**Arquivos:** `referencia-sala-cozinha.jpg` (1920×1080, Cycles, 512 amostras adaptativas +
denoise OIDN), `detalhe-cozinha.jpg`, `detalhe-sofa.jpg` e `referencia-cozinha-book.jpg`
(quando concluído).
**Cena:** `pipeline/master_scene.py` → `.cache/master/sala-cozinha.blend` (não versionado:
~53 MB; regenerável pelo script).

## O que mudou em relação à abordagem anterior

| Aspecto | Antes (Etapa 2) | Cena-mestra (M1) |
|---|---|---|
| Sofá | caixas suavizadas | estrutura estofada com cantos macios; almofadas de assento e encosto **infladas por simulação de tecido** (volume e rugas); almofadas decorativas com cantos "orelha"; pés cônicos em madeira |
| Cadeiras de jantar | modelo capitonê retingido, orientação errada | cadeira de **encosto curvo** (como no layout do book), estofada, pés em madeira levemente abertos, orientação correta por construção |
| Mesa | tampo + pés quadrados | tampo com bordas suavizadas, pés torneados cônicos, saia recuada |
| Tecidos | difuso simples | *sheen* de fibra (resposta de tecido à luz), cor calibrada (linho cinza-claro, não branco) |
| Metais | inox "pintado" | inox **escovado anisotrópico** |
| Vidros | transparência com alfa | **vidro físico** (transmissão, IOR 1,5) |
| Porcelanato | fosco | acetinado, com reflexo suave |
| Madeira, laca, granito, revestimento | difusos | vernizes (coat) com rugosidade própria |
| Janela da varanda | vista com horizonte neutro | **cortinas de voil** (decoração, não arquitetura) difundindo a luz, vista neutra sem paisagem inventada |
| Luz | sol em direção arbitrária | **céu físico difuso, sem sol direto** (orientação desconhecida), portal de luz na varanda, LED da cozinha e pendente acesos discretamente |
| Câmera | perspectiva livre | **câmera de arquitetura**: nivelada (verticais retas), 19 mm, deslocamento óptico vertical, exposição e **balanço de branco** de fotógrafo |

A geometria auditada (paredes, vãos, posições) não foi alterada. A arquitetura e a
cozinha vêm do mesmo pipeline, com as correções da Fase B (paredes sem sobreposição,
folgas, orientação verificada).

## Avaliação franca do render atual

**Já funciona:** luz de dia difusa e crível; cozinha (marcenaria em carvalho, ripado,
revestimento vitrificado verde-azulado com reflexos, LED, granito, forno, cooktop) muito
próxima do espírito da perspectiva do book; cortinas; profundidade de cena (mesa em
primeiro plano).

**Ainda abaixo do padrão de fotografia profissional:**
1. **Sofá:** os rolos laterais parecem cilindros rígidos; faltam costuras, vivos e
   deformação de uso nas almofadas.
2. **Tapete:** borda fina e superfície sem pelo/trama em relevo.
3. **Paredes e teto** lisos demais: faltam micro-variação de pintura e transições de luz
   mais ricas; teto sem luminárias (não confirmadas no book, então não foram inventadas).
4. **Pendente** cortado no canto superior esquerdo, chamando atenção. Ajustar o
   enquadramento ou a altura.
5. **Lado direito:** batente e corredor visíveis. Pode-se recortar ou reenquadrar.
6. **Mesa:** veio da madeira em escala um pouco grande.
7. **Acessórios:** poucos objetos de uso (sem manta, livros na mesa, frutas, utensílios),
   o que deixa o ambiente "de catálogo".

Próximas iterações de qualidade (sem mudar a geometria): sofá com costuras e rolos
franzidos de verdade; tapete com relevo (displacement); manta sobre o sofá (tecido
simulado com colisão); variação de pintura; mais acessórios; reenquadramento; render
final em 2560×1440.

## O que falta para reproduzir essa qualidade no Three.js (M3)

1. **Bake em alta densidade a partir desta cena-mestra** (não da cena antiga): lightmaps
   HDR (RGBM ou meia precisão, sem compressão com perdas) **por ambiente**, ~4–8 mm por
   texel na sala/cozinha, incluindo **todos os objetos** (também os pequenos e as cortinas).
2. **Materiais no glTF equivalentes aos do Cycles:** sheen (KHR_materials_sheen), coat
   (KHR_materials_clearcoat), anisotropia (KHR_materials_anisotropy), transmissão do vidro
   (KHR_materials_transmission). O Three.js r170 suporta todos.
3. **Reflexos:** sondas de reflexo por ambiente com correção de paralaxe, geradas a partir
   da própria cena cozida.
4. **Imagem:** mesma exposição, balanço de branco e curva de tom (AgX) calibrados contra o
   render, com oclusão de ambiente em tela e suavização de bordas no computador.
5. **Validação:** mesma câmera no navegador × este render, lado a lado, com diferença
   medida, tamanho dos arquivos e FPS no aparelho do cliente.
6. **Limite conhecido:** reflexos e luz são aproximados no tempo real. Se a diferença
   ficar inaceitável, a alternativa de aparência fotográfica é o Gaussian splatting
   (ver `docs/PLANO-FOTORREALISMO.md`), que exige GPU para ser gerado.

## Tempo de produção (CPU, sem GPU)
Prévia 960×540 (48 amostras): ~40 s por vista. Render final 1920×1080 (512 amostras):
~45–60 min por vista.
