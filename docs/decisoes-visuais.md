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
- **Recusar rolagem (06/11/2026):** o pop-up não fecha sem resposta, mas tem o botão Recusar rolagem. O teste fica como "Recusado" no cartão do mestre, com Sucesso, Falha, Rolar por ele e Cancelar teste. A tela entra na fase 5.


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
- **Limpar rolagens (06/11/2026):** um botão tira as rolagens da tela sem apagar o histórico, porque o desfazer depende dele.
- Quem rola vê a animação; os outros veem a linha no registro.

## Fase 4 — Criação e personagens (aprovada em 06/11/2026)

Telas sem protótipo, aprovadas direto no código real. A ficha e a loja seguem a parada 5.

- **Assistente de criação:** sete passos em faixa no topo: Conceito, Origem, Classe, Atributos, Perícias, Redenção e Revisão. Salva sozinho, e "Concluir personagem" só libera sem erros. Os erros aparecem na Revisão.
- **Origem e classe:** lista que abre o texto do livro, com o botão Escolher dentro de cada item.
- **Atributos:** um seletor por atributo, que só oferece os números ainda livres.
- **Subir de nível:** cartaz de procurado e um aviso com o que já foi aplicado. O que pede escolha fica como pendência na ficha, uma de cada vez.
- **Área de personagens do mestre:** cartão no painel, com lista de personagens, nível e jogador. Tocar abre uma janela com quem controla, XP, Prestígio, Honra, dar item, dar habilidade, entregar kit e abrir a ficha.
- **Kits e Opções da campanha:** botões no topo do cartão de personagens.
- **Mesa do jogador:** ganhou o cartão Personagens, e a ficha abre por cima da mesa.

## Campanhas (aprovada em 06/11/2026)

Telas sem protótipo, para aprovar direto no código real.

- **Lista de campanhas:** coluna central, da sessão mais recente para a mais antiga, com nome, última sessão, personagens e Continuar. Nova campanha fica no topo do cartão.
- **Nova campanha:** nome, pacotes ativos e as mesmas opções da campanha aberta. A base fica marcada e travada. Sem nenhuma campanha, o formulário abre direto.
- **Trocar de campanha:** botão no topo do painel do mestre, com confirmação.
- **Jogador de outra campanha:** "Mesa fechada", com a explicação e o botão Pedir para entrar nesta campanha. Quem leu o QR code vai direto ao formulário.

## Conexão (aprovada em 07/11/2026)

- **Ninguém conseguiu entrar?:** bloco que abre e fecha no fim do cartão Convidar jogadores, no lugar do parágrafo antigo. Cinco itens numerados e, embaixo, o teste rápido com o endereço `/teste` de cada rede, copiar e QR code.
- **Página de teste:** texto puro em fundo escuro, sem o tema do app, porque precisa abrir mesmo quando o app não abre.
- **Não achamos a mesa:** depois de 8 segundos sem resposta, o tambor dá lugar a um cartão com três itens para conferir, e o tambor segue girando embaixo.

## Fase 5, etapa 5: iniciativa, turnos e PA (aprovada em 07/11/2026)

Telas reais a partir das paradas 1, 2, 4 e 8, com os estilos dos protótipos.

- **Painel do mestre:** duas áreas no topo, Mesa e Escudo. A aba Escudo ganha o aviso quando há combate e o mestre está na Mesa.
- **Escudo sem combate:** cartão Novo combate, com os personagens prontos já marcados, busca no bestiário, quantidade e Elite.
- **Iniciativa do mestre:** as cartas em grade, a decisão de cada carta especial no próprio cartão (alvos do Coringa, de quem recebe o Rei ou a Rainha) e a ordem resultante ao lado, já com a troca do Coringa. Os botões são Comprar para quem falta, Desempatar por nova compra, Começar combate e Cancelar combate.
- **Combate em curso no Escudo:** três colunas da parada 4. A ficha do selecionado mostra PV ("Só o mestre vê" na criatura), PA tocável, efeitos e a ficha do bestiário em texto. No topo ficam Encerrar turno de quem age, Nova rodada no fim da rodada e Encerrar combate.
- **Jogador:** com personagem pronto, a mesa abre direto na aba Combate. A navegação de baixo tem Combate, Personagem, Habilidades, Inventário e Notas, e "Mesa e personagens" leva à lista antiga, para criar ou trocar de personagem.
- **Aba Combate (celular e desktop):** faixa de turno, Vida (PV, temporários, Defesa, deslocamento, Exaustão e Estresse, com a conta ao tocar), PA com cápsulas tocáveis, Deslocar e Encerrar turno, fichas de classe e efeitos ativos com o texto do livro. A iniciativa do jogador abre em folha.
- **Registro:** linhas de combate com Desfazer. O mestre desfaz qualquer uma; o jogador, as próprias, até o fim do turno dele.

## Fase 5, etapa 6: testes (aprovada em 07/11/2026)

Telas reais a partir dos protótipos PedidoTeste, CamadaTeste e TesteEmAndamento (paradas 3 e 4).

- **Pedir teste (mestre):** botão no topo do Escudo, com ou sem combate, e na ficha de cada personagem do combate (já marcado). O formulário tem os quatro tipos, atributo ou perícia, a escala da DT com campo livre, Mostrar a DT, efeito em quem falhar, "Depende de" (visão ou audição) e a lista de personagens com DT, bônus e vantagem de cada um. No contestado: nome do oponente (com os nomes do combate), o teste dele, bônus, rolagem, quem age e Mostrar o oponente.
- **Cartão de resultados (mestre):** um por pedido, o mais novo em cima, fechado no X. Cada linha mostra a conta e Sucesso ou Falha assim que o servidor rola. Quem não respondeu ou recusou tem Sucesso, Falha, Rolar por ele e Cancelar teste. A rolagem forçada leva "Forçada: aplique uma consequência".
- **Pop-up do jogador:** não fecha sem resposta. Mostra o valor do teste, a DT ou "?", os efeitos ativos, o ajuste do mestre, bônus, vantagem, Como fazer (Rolar o dado, Fazer com Calma, Tentar até Conseguir, só fora de combate), as habilidades marcadas para a situação, a Carta do Destino e os botões Rolar e Recusar rolagem.
- **Depois da falha:** pop-up com Forçar a Rolagem (teste de habilidade, uma vez) e Rolar de novo com a habilidade de "depois de falhar". Sem nada a oferecer, não abre.
- **Rolagem:** o d20 da parada 3 com o que o servidor rolou. Pula com clique, Espaço ou Esc. A rolagem automática fecha sozinha. "Rolagem rápida" é escolha do aparelho.
- **Aba Combate:** cartão Testes rápidos (Atributos, Perícias, Resistências) com bônus e vantagem para o próximo toque, e os interruptores Rolar resistências automaticamente e Rolagem rápida.
- **Registro:** "Mestre pediu…", e cada resultado com a conta e Sucesso ou Falha. O jogador não vê nada do passivo, e a DT oculta aparece como "?".
- **Carta do Destino:** o mestre dá ou tira na ficha do personagem, no Escudo.

## Fase 5, etapa 7: ataques, dano e efeitos (aprovada em 07/11/2026)

A partir do protótipo EscudoMestre (ControleVida, ListaEfeitos, FichaCriatura) e da aba Combate da parada 2.

- **Ações da criatura (Escudo):** cada ação da ficha do bestiário abre ao tocar. Com mecânica revisada, mostra PA, acerto, dano, Início ou Combo e os botões de alvo, com "Além do alcance efetivo". Sem mecânica, abre a rolagem manual com a fórmula e "Só eu vejo".
- **Ataque esperando reação:** cartão no topo do centro do Escudo, com quem ataca, quem falta reagir, Seguir sem reação e Cancelar ataque.
- **Vida no Escudo:** valor, tipo do dano (com sugestões), Dano, Cura e PV temporários, na ficha de qualquer combatente. Derrotado aparece como etiqueta.
- **Efeitos no Escudo:** cada efeito com acúmulos, nível e turnos, os botões que o próprio efeito oferece, Ajustar (acúmulos e duração) e Encerrar. Embaixo, Aplicar efeito com acúmulos e turnos.
- **Rolagem manual:** cartão no fim do centro do Escudo, com o que é, fórmula e "Só eu vejo".
- **Atacar (jogador):** cartão no topo da aba Combate com as armas equipadas que têm dados de ataque, o alvo, o bônus de acerto e o dano. O d20 mostra "Defesa ?" contra criatura.
- **Reação (jogador):** pop-up que não fecha sem resposta, com Esquiva e Bloqueio (com o atributo que somam) e Não reagir.
- **Efeitos (jogador):** o texto do efeito ganha os botões que ele oferece, como Levantar (1 PA).
- **Registro:** o mestre vê a conta inteira do ataque e do dano; o jogador, o total e acertou ou errou, e o dano rolado. Contra criatura, nada de Defesa nem PV.

## Fase 5, etapa 8: Horda e Recarga (aprovada em 07/11/2026)

A partir do cartão Horda do protótipo EscudoMestre (parada 4).

- **Formar Horda:** bloco que abre e fecha, na iniciativa (ao lado da ordem) e no combate (no fim do centro do Escudo). Lista as criaturas de cada ficha que tem Horda, com caixas para marcar e o botão "Formar com N". Quem está na vez não pode ser marcado.
- **Cartão da Horda:** losangos dos integrantes (com nome e PV ao passar o mouse), Integrantes, Bônus de Horda e PA. Embaixo, o dano acumulado, quando sai o próximo, quantos alvos o Ataque de Horda alcança, e "Na área ou adjacentes" com caixas e Salvar área.
- **Dano na Horda:** a Vida da Horda ganha "Espaços da Horda na área" para o Dano em Área.
- **Ataque de Horda:** escolhe a Pancada ou a Mordida e marca até o número de alvos permitido.
- **Recarga:** a ação mostra "Recarga 5–6" e "gasta"; ao abrir, "Marcar como usada" ou "Devolver a habilidade". A rolagem do 1d6 aparece no registro do mestre no início do turno da criatura.
- **Reação do jogador na área:** o pop-up avisa que a Ameaça de Massa tira da reação.

## Fase 5, etapa 9: Morrendo, Estresse, fichas e descansos (aprovada em 07/11/2026)

Telas sem protótipo próprio, no estilo dos cartões da aba Combate e do Escudo.

- **Morrendo (jogador):** o cartão da parada 2 ganha "Fazer o Teste de Morte" no início do turno (com "Usar a Carta do Destino" quando há carta) e, feito o teste, "Encerrar turno".
- **Atitude Imprudente (jogador):** cartão na aba Combate, no turno, com Precisão, Potência, Violência e Ímpeto, cada um com o que faz, e "X de 3 falhas pendentes" no topo.
- **Fichas de classe (jogador):** o controle com − e + do protótipo da ficha (FichaClasse).
- **Habilidades com uso (jogador):** cartão com as habilidades que têm usos ou custo em fichas, o que resta e Usar.
- **Morrendo e Estresse (mestre):** cartão na ficha do personagem no Escudo, com sucessos e falhas, Rolar o Teste de Morte, Estabilizar, falhas pendentes, sequelas, Estresse com −1, +1 e +2 (rolagem forçada) e as aflições e virtudes.
- **Descanso (mestre):** botão no topo do Escudo quando não há combate. Pop-up com Curto ou Longo, os personagens (PV e curtos desde o longo), Dados de Vida no curto e, no longo, Alimentados e Com cuidados médicos.

## Ícone do app (aprovado em 06/11/2026)

- **Desenho:** olho no selo. Selo de tinta, olho de pergaminho e íris de sangue com 6 sulcos na borda, que fazem dela o tambor de revólver da abertura. Desenho próprio, sem arte dos livros.
- **Dois desenhos:** até 24 px, um olho simples (`icone-16.svg`), porque os sulcos viram borrão. A partir de 32 px, o desenho completo (`icone-mestre.svg`).
- **Android:** `icone-mestre.svg` já está na grade do ícone adaptativo, com as camadas `fundo` e `figura` e a figura dentro da zona segura.
- **Gerar de novo:** `npm run icones`, só quando o desenho mudar.

## Temas de complemento

- **A Arte da Guerra:** as cores da capa, já pronta em `livros/guerra`. O tema é feito na fase 8.
- **A Ordem no Caos:** fundo roxo muito escuro, quase preto, com roxo forte como cor predominante. As cores vêm da introdução do livro (`#22093d` a `#12041f` e `#b05cff`). O rascunho está em `prototipos/`; o tema real vem no pacote do complemento, na fase 8.
