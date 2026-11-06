# Decisões visuais da fase 1

O que foi aprovado em cada parada dos protótipos. As fases seguintes reescrevem as telas a partir daqui; a pasta `prototipos/` é descartável.

## Geral

- **Tokens:** só cores e fontes vêm de `shared/estilo/tokens.css` dos livros. Medidas em mm/pt e dimensões de página são de impressão.
- **Fontes:** EB Garamond (texto), IM Fell English SC (títulos), IM Fell English (epígrafes), Grenze Gotisch (destaques), League Gothic (rótulos e números). Rye e Ultra ficam só no catálogo dos livros.
- **Números:** alinhados e tabulares na tela, ao contrário do estilo antigo usado nos livros.
- **Temas:** um componente nunca usa cor primitiva, só tokens semânticos.

## Parada 1 — Aba Combate, celular (aprovada em 05/11/2026)

- Coluna única, com navegação embaixo: Combate, Personagem, Habilidades, Inventário, Notas.
- Ordem dos blocos: Turno, Vida, PA, Fichas de classe, Efeitos ativos, Testes rápidos, Habilidades, opção de rolar resistências.
- Marcador de PA em forma de cápsula de bala: disponível, gasto, guardado e perdido por efeito.
- Criatura em losango na iniciativa, jogador em círculo.
- Acréscimos à seção 6.3 da especificação, aprovados junto:
  - Defesa e Deslocamento no bloco de Vida;
  - botão "Encerrar turno";
  - registro aberto pelo ícone no topo, com desfazer;
  - em Morrendo, os blocos de PA e Testes rápidos saem da tela.

- **Superfície padrão:** tinta, com pergaminho como opção.
- **League Gothic:** adotada em rótulos e números.
- **Posição do Ataque no celular:** segue a ordem da especificação, abaixo da dobra.

## Parada 2 — Aba Combate, desktop (aprovada em 05/11/2026)

- Três colunas de altura fixa, cada uma rolando sozinha: ficha, mesa e registro. A iniciativa fica em faixa no topo, com os nomes inteiros.
- A ficha tem abas próprias: a mesa nunca sai da tela.
- Atributo, Teste e Resistência numa tabela só, com Perícias embaixo e Ataque no topo da coluna.
- O texto de efeitos e habilidades abre na própria lista, sem pop-up.
- A conta dos valores aparece em balão ao passar o mouse ou focar pelo teclado.
- Desfazer risca a linha e cria um evento novo. A versão real terá o botão em cada ação própria, até o fim do turno; o protótipo oferece só na última.
- **Larguras:** 1280 px ou mais, três colunas; de 900 a 1279 px, ficha na lateral e registro embaixo dela; abaixo de 900 px, layout de celular.
- **Morrendo:** no desktop os testes ficam visíveis e desligados; no celular saem da tela.
- A lista da mesa traz o que se usa em combate, e a aba Habilidades da ficha traz tudo, por origem.

## Parada 3 — Teste de resistência e rolagem (aprovada em 05/11/2026)

- Pop-up com DT oculta por padrão, bônus ou penalidade, vantagem ou desvantagem e habilidades da situação, disponíveis e usadas. Folha no celular, central no desktop.
- Automático ligado: rola direto e fecha sozinho; com habilidade disponível, pausa e pergunta antes de rolar.
- Rolagem em tela cheia, no mesmo desenho para celular e desktop: d20 em 3D, modificadores um a um, total contra a DT ou "?" e carimbo na base do dado, sem cobrir o número.
- Duração de cerca de 2,6 s com dois modificadores; rolagem rápida de cerca de 0,6 s.
- Clique, Espaço ou Esc pulam para o resultado; a segunda vez fecha.
- Sem WebGL, d20 plano em SVG, que é também o que aparece enquanto o 3D carrega.
- Em teste de resistência, 20 e 1 têm destaque visual, mas quem decide é o total contra a DT. Em ataque, 20 natural mostra o Acerto crítico com o dobro dos dados; 1 natural mostra Falha crítica e o total ainda vai contra a Defesa.
- O d20 3D fica num pacote separado, baixado só quando um teste é pedido.


## Parada 4 — Escudo do Mestre (aprovada em 05/11/2026)

- Só desktop. Três colunas: iniciativa, ficha do selecionado, jogadores ao vivo e registro. Testado até 1100 px de largura.
- Na iniciativa e nas fichas, círculo é jogador, losango é criatura e quadrado é NPC.
- PV de criatura marcado com "Só o mestre vê".
- Pedir teste é uma tela só, com ajuste por jogador: DT própria, bônus ou penalidade, vantagem ou desvantagem. A DT começa invisível.
- Ação de criatura com teste abre o pedido já preenchido, com todos os jogadores marcados.
- Resultados chegam num cartão fixado no centro, sem bloquear a mesa. Jogador no modo manual aparece como aguardando resposta.
- O efeito vai só para quem falhou, com desfazer.
- O ataque do mestre rola e aplica o dano na hora, com desfazer e sem animação.
- O mestre desfaz qualquer evento, em qualquer ordem. A linha fica riscada e nada é apagado.
- Cartão de Horda só visual nesta fase: integrantes, Bônus de Horda e PA.

## Parada 5 — Ficha e loja de prestígio (aprovada em 05/11/2026)

- **Celular:** Personagem, Habilidades, Inventário e Notas nas abas de baixo. A loja abre como tela própria, com voltar.
- **Desktop:** página inteira em colunas, com Prestígio como aba só na Consagração. No combate, a coluna da ficha mostra as mesmas abas e leva à ficha completa.
- A lista da mesa traz o que se usa em combate; a aba Habilidades traz tudo, por origem.
- Valores mostram a conta ao tocar e aceitam ajuste manual, que fica marcado.
- Honra em escala de 0 a 20, com cinco faixas, ajustada só pelo mestre.
- Redenção em 6 passos, com o último travado até os demais estarem feitos.
- Carga com dois limites: Sobrecarregado e Imobilizado. Dinheiro em R$.
- XP só para leitura. O que a tabela dá entra sozinho; especialização e talento pedem escolha, que pode ficar para depois.
- Na loja, o motivo do bloqueio aparece no próprio botão. Toda compra pode ser desfeita.

## Parada 6 — Abertura (aprovada em 05/11/2026)

- Olho em SVG próprio, fechado em tinta sobre o pergaminho. As pálpebras abrem e a íris é o tambor de um revólver, que gira e trava com um coice.
- Raios de gravura, poeira e rajadas de vento. Título em Grenze Gotisch, carimbado letra por letra, com filete embaixo.
- Cerca de 2,3 s no total. Clique, Espaço ou Esc pulam. Com animações reduzidas, 0,9 s sem movimento.
- Sempre sobre o pergaminho, mesmo com a superfície em tinta. Cada tema define a própria abertura pelos tokens `--abertura-*`.

## Parada 7 — Transições, carregamento e botões (aprovada em 05/11/2026)

- **Trocas de área:** página de jornal, com a View Transitions API (0,68 s).
- **Entrar na mesa ou no combate:** portas de saloon (0,76 s).
- **Momentos raros, como subir de nível:** cartaz de procurado (0,98 s).
- **Abas da ficha:** sem transição. Em uso constante, 0,7 s a cada toque cansa.
- **Carregamento:** tambor de revólver, que gira uma câmara de cada vez.
- **Botões:** pressão de carimbo e brilho de ouro velho no foco.
- Com animações reduzidas, a tela troca na hora. Com a janela oculta, a transição é ignorada para a tela nunca ficar presa.
- Poeira varrendo, ferradura, ampulheta e pressão de couro foram avaliadas e saíram do `estilo`.

## Parada 8 — Cartas (aprovada em 05/11/2026)

- **Carta de baralho:** virada só com `transform`, com verso e papel definidos por tokens `--carta-*`. Versão pequena para linhas de texto.
- **Iniciativa, mestre:** "Nova iniciativa" compra para todos, revela uma a uma e recalcula a ordem a cada escolha, marcando desempate por Agilidade ou naipe. "Começar combate" só libera sem escolhas pendentes e pode ser desfeito.
- **Iniciativa, jogador:** compra, vira e escolhe entre usar o efeito e ir para o fim ou manter a prioridade. Com a Redenção completa, escolhe uma entre duas cartas. A carta fica visível na faixa de turno.
- **Vantagem por cartas:** um d20, com a carta entrando como modificador. Com duas cartas, a que valeu fica em destaque e a outra, apagada.
- Tabelas e textos de carta vêm do pacote de conteúdo. O protótipo só tem cartas de exemplo e resumos próprios.

## Fase 2 — Entrada na mesa (aprovada em 05/11/2026)

Telas sem protótipo, aprovadas direto no código real.

- **Tela inicial do app:** "Sou o mestre" e "Sou jogador", lado a lado, com o endereço da mesa digitado à mão.
- **Porta ocupada:** o aviso aparece na tela inicial, no lugar do botão de abrir, com o campo de outra porta já preenchido.
- **Entrada do jogador:** título em Grenze Gotisch, nome e código da mesa. O erro aparece abaixo do campo do código, e o QR code já preenche o código.
- **Aguardando aprovação:** tambor de revólver e uma frase, sem botões.
- **Painel do mestre:** três colunas: convidar jogadores, pessoas na mesa e pedidos de entrada, rolar e registro. O código da mesa fica em destaque, e cada endereço tem copiar e QR code.
- **Pedido de entrada (06/11/2026):** três botões fixos, na mesma ordem: Aceitar, Associar e Recusar. Associar abre a lista de jogadores, com quem tem o mesmo nome no topo e a etiqueta "Sugerido". Sem jogadores, o botão fica desativado, com o motivo escrito abaixo dele.
- **Tirar da mesa:** sempre pede confirmação.
- **Firewall (06/11/2026):** com a entrada bloqueada pelo Windows, o painel mostra um alerta com o botão **Liberar acesso**. Com a entrada liberada, nada aparece.
- **Mesa do jogador:** provisória, com rolar, quem está na mesa e registro. A fase 5 a substitui pela aba Combate.
- O registro mostra o mais recente no topo.
- Quem rola vê a animação; os outros veem a linha no registro.

## Ícone do app (aprovado em 06/11/2026)

- **Desenho:** olho no selo. Selo de tinta, olho de pergaminho e íris de sangue com 6 sulcos na borda, que fazem dela o tambor de revólver da abertura. Desenho próprio, sem arte dos livros.
- **Dois desenhos:** até 24 px, um olho simples (`icone-16.svg`), porque os sulcos viram borrão. A partir de 32 px, o desenho completo (`icone-mestre.svg`).
- **Android:** `icone-mestre.svg` já está na grade do ícone adaptativo, com as camadas `fundo` e `figura` e a figura dentro da zona segura.
- **Gerar de novo:** `npm run icones`, só quando o desenho mudar.

## Temas de complemento

- **A Ordem no Caos:** fundo roxo muito escuro, quase preto, com roxo forte como cor predominante. As cores vêm da introdução do livro (`#22093d` a `#12041f` e `#b05cff`). O rascunho está em `prototipos/`; o tema real vem no pacote do complemento, na fase 8.
