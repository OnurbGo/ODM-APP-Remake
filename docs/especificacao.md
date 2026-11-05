# ODM App Remake — Especificação

Versão de 05/11/2026. Substitui o ODM-App antigo (OnurbGo/ODM-App), que fica só como histórico.

## Como ler este documento

- **Decidido:** o que você já aprovou na conversa.
- **Proposta:** o que eu sugiro e ainda pode mudar nos protótipos.
- **Pendente:** o que precisa de decisão sua antes da fase indicada.
- Regras do jogo vêm sempre dos livros. Quando o texto do livro não basta para o app automatizar, o ponto vai para a seção 14, e nada é inventado.

---

## 1. Resumo das decisões

| Tema | Decisão |
|---|---|
| Estratégia | Reescrever do zero no repositório OnurbGo/ODM-APP-Remake |
| Host | O app do mestre roda o servidor e o banco; ele é a fonte da verdade |
| Jogadores | Entram pelo navegador (`http://IP:porta`); o app instalado também funciona |
| Rede | LAN, Hamachi ou Radmin, com IP manual como caminho principal |
| Contas | Sem senha; o jogador entra com nome + código da mesa, e o mestre aprova |
| Personagem | Fica na campanha do mestre, com exportar e importar |
| Conteúdo | Gerado a partir do repositório dos livros (Olho-Da-Morte-RPG); fim do importador por planilha |
| Complementos | Pacote base (Jogador + Mestre) + um pacote por complemento, abertos a conteúdo novo |
| Automação | O app aplica as regras do livro sozinho, e o usuário pode desfazer, editar ou encerrar antes |
| Desfazer | O mestre desfaz qualquer coisa; o jogador desfaz só as próprias ações, até o fim do turno dele |
| DT dos testes | O mestre escolhe por teste; por padrão fica invisível para o jogador |
| Vida das criaturas | O jogador não vê nada |
| Telas | Celular e desktop com layouts próprios (o desktop não é o celular esticado) |
| Dados mecânicos | Eu escrevo a 1ª versão a partir dos livros e marco as lacunas; você revisa antes de entrar |
| Visual | Padrão de estilização próprio, com temas: o padrão e um tema por complemento |
| Animações | Abertura, transições no tema velho oeste, carregamento e rolagem de dados no estilo Baldur's Gate 3, com opção de pular |

---

## 2. Princípios

1. **Uma fonte só para o conteúdo:** o livro. Corrigiu o livro, o app recebe a correção.
2. **Automático, mas reversível.** Toda ação automática aparece no registro da sessão com **desfazer**.
3. **Fiel aos termos do livro.** PA (sem "Ações Bônus"), DT, Brutalidade/Agilidade/Fibra/Intelecto/Astúcia/Presença, dano profano e dano psicológico, "uma vez por descanso curto" em vez de "recarga".
4. **Leve.** Sem dependência pesada sem motivo; cada tela carrega só o próprio código.
5. **Pequeno.** Meta de 15 a 25 mil linhas no núcleo (o antigo tinha cerca de 136 mil).

---

## 3. Arquitetura

### 3.1 Visão geral

```
App do mestre (Electron)
 ├─ Servidor embutido (HTTP + WebSocket) ─┬─ Navegador do jogador (celular ou PC)
 ├─ SQLite (campanhas, fichas, registro)   ├─ App instalado do jogador (opcional)
 ├─ Pacotes de conteúdo (base + complementos)
 └─ Interface do mestre (a mesma aplicação web)
```

- O servidor do mestre serve a própria página: o jogador abre `http://IP:porta` e entra.
- **Tempo real:** WebSocket. O servidor valida cada ação, grava no registro e manda só a mudança para quem precisa.
- **Visibilidade:** o servidor filtra o que cada um recebe. O jogador nunca recebe PV de criatura, DT oculta nem notas do mestre. Esconder só na tela não basta.

### 3.2 Rede

- **IP manual em primeiro lugar.** A descoberta automática (mDNS) quase nunca funciona em Hamachi e Radmin. Ela fica como atalho na LAN.
- A tela do mestre mostra os endereços disponíveis (LAN, Hamachi, Radmin), cada um com botão de copiar e um QR code para o celular.
- O app não cria regra de firewall. Ele explica como liberar e avisa quando a rede está marcada como "pública" no Windows.
- HTTP sem TLS (rede local ou virtual). O código da mesa e a aprovação do mestre evitam entradas indesejadas.

### 3.3 Entrada na mesa

1. O jogador abre o endereço e digita nome + código da mesa.
2. O mestre aprova; o jogador recebe um token salvo no dispositivo.
3. Na próxima vez, ele entra direto. O mestre pode revogar o acesso.

### 3.4 Stack (proposta)

| Parte | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript em tudo | Tipos e regras compartilhados |
| Front | React + Vite | Você já domina; o build é rápido |
| Estado no front | Store leve (Zustand) alimentada pelo WebSocket | Sem polling e sem camada de cache pesada |
| Servidor | Fastify + `ws` | Leve e rápido |
| Banco | SQLite com better-sqlite3 + Drizzle | Substitui Sequelize + Umzug; síncrono e simples |
| Desktop | Electron | Reaproveita o que já foi resolvido no instalador NSIS |
| Validação | Zod | Mensagens do WebSocket e pacotes de conteúdo |
| Testes | Vitest (regras) + Playwright (fluxos principais) | Foco no motor de regras |

### 3.5 Estrutura do repositório

```
ODM-APP-Remake/
├─ apps/
│  ├─ desktop/        Electron (janela do mestre, servidor embutido, instalador)
│  ├─ servidor/       HTTP + WebSocket + SQLite
│  └─ web/            Interface (mestre e jogador; telas de celular e desktop separadas)
├─ pacotes/
│  ├─ regras/         Motor de regras e efeitos (puro, sem I/O, 100% testado)
│  ├─ protocolo/      Tipos e schemas das mensagens e eventos
│  ├─ conteudo/       Schemas dos pacotes de conteúdo + leitor
│  └─ estilo/         Padrão de estilização: tokens, temas, animações, componentes base
└─ docs/
```

---

## 4. Conteúdo

### 4.1 De onde vem

O repositório Olho-Da-Morte-RPG ganha um script de exportação (`tools/exportar-app.mjs`) que gera:

```
odm-base-1.0.json             Livro do Jogador + Livro do Mestre
odm-ordem-no-caos-1.0.json    A Ordem no Caos
odm-arte-da-guerra-1.0.json   A Arte da Guerra
```

Cada pacote tem: identificador, versão, dependências (os complementos dependem da base), conteúdo e o tema visual do complemento (seção 9).

### 4.2 Identificadores fixos

Todo item do conteúdo tem um id que não muda (ex.: `classe.cacador`, `efeito.hemorragia`, `criatura.zumbi`). A ficha guarda o id. Quando o livro muda o texto ou um complemento ganha conteúdo novo, as fichas existentes continuam válidas. Se algo for removido do livro, a ficha mantém uma cópia e mostra o aviso "não está mais no livro".

### 4.3 O que já está estruturado e o que falta

| Conteúdo | Situação no repositório dos livros |
|---|---|
| Criaturas | `criaturas.yml` (estruturado; as ações ainda são texto) |
| Ameaças / NPCs | `ameacas.yml` (idem) |
| Condições (nomes) | `condicoes.yml` |
| Efeitos (texto) | `21-efeitos.md` (texto corrido) |
| Classes | Markdown com blocos (`classe-tabela`, `caracteristicas`) — dá para extrair |
| Especializações, habilidades, talentos | Markdown — precisam de marcação mínima |
| Armas e equipamentos | Tabelas dos catálogos — dá para extrair |
| Tabelas de encontro e XP por ND | `23-recompensas.md` (HTML dentro do Markdown) — dá para extrair |
| Magias (A Ordem no Caos) | Markdown — precisam de marcação mínima |

### 4.4 Camada mecânica

O texto do livro não muda. Ao lado dele vai um bloco mecânico, em arquivos próprios no repositório dos livros (ex.: `livros/jogador/dados/efeitos-mecanica.yml`), que o build dos livros ignora e o exportador usa.

Exemplo — Hemorragia (tudo tirado do texto atual):

```yaml
efeito.hemorragia:
  acumulos: { max: 3 }
  gatilhos:
    - quando: inicio_do_turno
      faz: { dano: "1d4", por_acumulo: true, tipo: indefinido }
    - quando: fim_do_turno
      oferece: { teste: { atributo: fibra, dt: 15 }, sucesso: { remover_acumulo: 1 } }
  acoes:
    - nome: "Bandagem"
      custo: { pa: 1, item: trapos_ou_bandagem }
      alvo: si_mesmo_ou_adjacente
      faz: { remover_acumulo: 1 }
```

Exemplo — ataque de criatura (gerado do texto padronizado da ficha e conferido à mão):

```yaml
criatura.zumbi.pancada:
  custo: { pa: 1 }
  tipo: corpo_a_corpo
  acerto: 3
  alcance_m: 1
  dano: { formula: "1d6+1", tipo: contundente }
```

Nível de automação por tipo de conteúdo:

| Tipo | O app faz |
|---|---|
| Efeitos | Gatilhos de turno, modificadores, acúmulos, duração, formas de encerrar |
| Ataques de criatura | Rolar acerto e dano; pedir teste de resistência; aplicar efeito na falha |
| Habilidades | Gastar PA, fichas e usos ("uma vez por descanso curto/cena"); aplicar o que estiver estruturado; o resto fica como texto |
| Itens | Botão **Usar**: gasta o item e aplica o efeito (cura, remover acúmulo…) |
| Efeitos que dependem do mestre (Alucinado, Enfeitiçado…) | Só texto + lembrete; nada automático |

Habilidades também recebem **marcações de situação** (ex.: `reage_a: teste_resistencia.agilidade`), para o app sugerir a habilidade certa no momento certo (seção 8).

### 4.5 Conteúdo do mestre

O mestre pode criar criaturas, NPCs, itens e efeitos próprios por formulários simples dentro do app, no mesmo formato dos pacotes. Eles ficam na campanha e podem ser exportados para outra mesa.

---

## 5. Motor de regras e registro da sessão

### 5.1 Motor de regras (`pacotes/regras`)

Funções puras que recebem ficha + conteúdo + estado e devolvem valores calculados:

- Defesa, PV máximo, deslocamento, RD;
- bônus de proficiência (tabela de "Bônus de Proficiência", Jogador, Progressão);
- carga e Sobrecarregado (seção de Carga do Jogador);
- Exaustão (tabela de 6 níveis), Morrendo progressivo;
- Estresse máximo por Intelecto (só se a campanha ativar);
- penalidades e vantagens de condições nos testes.

Cada valor calculado guarda a **conta** (ex.: "Defesa 14 = 10 + 2 Agilidade + 2 armadura"), que aparece ao tocar no número. O jogador pode pôr um **ajuste manual** em qualquer campo calculado; ele aparece marcado.

### 5.2 Registro da sessão e desfazer

Toda mudança é um evento: rolagem, dano, cura, efeito aplicado, PA gasto, item usado, uso de habilidade, turno.

- Cada evento sabe se desfazer. Desfazer cria um evento novo ("desfeito por…"); nada é apagado.
- **Permissões:** o mestre desfaz qualquer evento; o jogador desfaz só os próprios, até o fim do turno dele.
- O registro aparece para todos, filtrado pelo que cada um pode ver.
- Efeitos podem ser encerrados antes, ter acúmulos e duração editados ou ser adicionados à mão.

---

## 6. Jogador

### 6.1 Criação de personagem

Assistente em passos, seguindo a ordem de "Criando um personagem" do Livro do Jogador, com as escolhas filtradas pelos pacotes ativos na campanha. A ficha pode ser salva a qualquer momento como rascunho.

### 6.2 Ficha

Abas propostas: **Combate**, Personagem (atributos, perícias, Honra, Redenção), Habilidades e talentos, Inventário (carga e dinheiro), Notas.

### 6.2.1 Progressão

Regras de "A Evolução do Personagem" (Jogador, Progressão) e "Sistema de Prestígio: Polivalência" (A Ordem no Caos).

**Quem mexe em quê**

- O jogador **não edita XP**. O XP vem do app (criaturas derrotadas, missão concluída) ou do mestre.
- O mestre pode dar ou tirar XP, Pontos de Prestígio, habilidades e itens de qualquer jogador. Tudo fica no registro, com desfazer.

**Escalada (níveis 1 a 10)**

- Quando o XP passa do limite da tabela, o app avisa "Subiu de nível" e aplica sozinho o que a tabela da classe dá naquele nível (características e PV).
- **Escolhas continuam manuais:** a especialização (quando a tabela indica "Especialização") e os talentos (quando a tabela indica "Talento"). Escolhida a especialização, as habilidades dela entram sozinhas nos níveis indicados.
- **Origem:** as habilidades da origem entram sozinhas na criação do personagem.

**Consagração (depois do nível 10)**

- O XP acima do nível 10 vira Pontos de Prestígio: 1 ponto a cada nível da tabela de XP alcançado entre 11 e 20.
- O jogador gasta os pontos numa loja de prestígio que só libera o que ele pode pagar e o que cumpre os requisitos:

| Opção | Custo | Trava no app |
|---|---|---|
| Técnica Avançada | 1 | — |
| Técnica Lendária | 2 | Exige pelo menos uma Técnica Avançada já comprada |
| Talento ou proficiência | 1 | Inclui Treinamento Pesado (+1 atributo, máximo 5; em Fibra, +1 PV máx. por nível de classe) |
| Vitalidade Aprimorada (+5 PV máx.) | 1 | Pode repetir |
| Nível em classe secundária (Polivalência) | 2 | Só com o módulo Polivalência ativo (seção abaixo) |

- **Sem pontos suficientes, o botão fica bloqueado** e mostra o motivo (ex.: "Custa 2, você tem 1").

**Polivalência (regra opcional, pacote A Ordem no Caos)**

- O mestre liga ou desliga na campanha.
- Com ela ligada, ao gastar Prestígio o jogador escolhe entre aprofundar a classe principal ou subir a classe secundária.
- Requisitos que o app confere sozinho: nível 10 na classe principal e os pré-requisitos da nova classe (atributos e proficiências da tabela). A "justificativa narrativa" fica com o mestre, que aprova o pedido.
- Ao entrar na classe secundária, o app aplica os limites do livro: sem PV, sem Dado de Vida, sem equipamento inicial e com só 1 proficiência à escolha (arma, armadura ou perícia da lista da nova classe).
- Recursos da classe secundária usam o nível dela. A especialização segue o nível da classe secundária.
- **Não acumulam:** efeitos iguais, PA extra no mesmo momento, Defesa sem Armadura e Evasão. O app avisa quando houver conflito.
- Os pré-requisitos de cada classe vêm do pacote em que ela está: os das classes da base e do Conjurador em A Ordem no Caos; os do Esgrimista em A Arte da Guerra.

### 6.3 Aba Combate

| Bloco | Conteúdo |
|---|---|
| Turno | Ordem de iniciativa, "Seu turno" em destaque, quem vem depois |
| Vida | PV, PV temporários, Exaustão, Estresse (se ativo), Morrendo |
| PA | Marcadores que se gastam ao usar ações + PA guardado para reação |
| Fichas de classe | Olho da Morte, Franco Atirador, Combatente, Mana etc., com + e − |
| Efeitos ativos | Acúmulos e turnos restantes; tocar mostra o texto do livro e as ações (ex.: Bandagem) |
| Testes rápidos | Atributos, perícias, resistências, ataque com a arma equipada |
| Habilidades | Disponíveis e usadas ("Usada — volta no descanso curto") |
| Opção | "Rolar resistências automaticamente" |

- **Celular:** uma coluna, com a aba Combate como tela principal e navegação embaixo.
- **Desktop:** ficha e combate lado a lado, com o registro da sessão visível.

---

## 7. Mestre

### 7.1 Escudo do Mestre — combate

- Iniciativa e turnos (jogadores, criaturas, NPCs), com avanço de turno disparando os gatilhos dos efeitos.
- Criaturas do bestiário com PV, efeitos e ações clicáveis (rola acerto e dano; pede teste de resistência).
- **Horda** (regra do Zumbi): formar, somar PV, remover integrante a cada 10 de dano, recalcular o bônus.
- Pedido de teste para vários jogadores (seção 8).
- Fichas dos jogadores ao vivo, em resumo.

### 7.2 Encontros

- Montador seguindo "Montando encontros" (Mestre): soma o XP, ajusta pelo tamanho do grupo (×0,75 / ×1,25 / ×1,5), sobe um grau se houver mais inimigos que personagens e usa o ND da versão Elite quando a ficha indicar.
- Criaturas lendárias ficam fora do cálculo; o app mostra o contador de pistas (mínimo 3).
- Ao fim do encontro: XP das criaturas derrotadas, dividido igualmente entre os participantes.

### 7.3 Missões (substitui o gerador de missão)

Modelo que segue o "Fluxo das missões" (Mestre):

1. Início
2. Investigação e caçada (a trilha)
3. Conflito (o preço)
4. Desfecho (recompensas e consequências)

Cada missão tem texto para os jogadores, notas do mestre, dificuldade e criaturas, NPCs e recompensas ligados. Ao concluir, o app calcula o XP de missão (metade da coluna de dificuldade) e sugere o dinheiro pela Tabela de Valor Gerado.

**Linha do tempo:** marcos por missão, visíveis ou ocultos para os jogadores, marcados quando acontecem. Era a melhor parte do app antigo e continua.

### 7.4 Outras ferramentas

- **Modificadores de mundo** (Lua de Sangue, Chuva, Neblina, Surto de Podridão Sangrenta, Enxame Migratório, Vendaval, Geada): cartas que o mestre ativa e todos veem, com o texto do livro e a parte mecânica quando houver.
- **Jogo do 21** (busca de espólios): minijogo para mestre e jogador, seguindo a tabela de resultados do livro.
- **Comércio:** lojas por cidade com itens dos catálogos e preços; o jogador compra e o dinheiro sai da ficha.
- **NPCs**, **notas** e **diário de sessão**.
- **Mostrar para os jogadores:** imagem ou texto que abre na tela de todos ou de alguns.

---

## 8. Teste de resistência

### 8.1 Origens

- ataque de criatura cadastrada (atributo, DT e efeito já preenchidos);
- pedido manual do mestre;
- efeito (ex.: Hemorragia no fim do turno).

### 8.2 Mestre

1. Seleciona um ou vários jogadores.
2. Escolhe atributo e DT (ou já vêm do ataque).
3. Ajusta por jogador: outra DT, bônus ou penalidade, vantagem ou desvantagem.
4. Escolhe se a DT fica visível neste teste (padrão: invisível).
5. Envia e recebe a lista de sucesso e falha por jogador. O efeito é aplicado em quem falhou, com desfazer.

### 8.3 Jogador

- **Automático ligado:** o app rola, aplica e registra. Se houver uma habilidade disponível marcada para aquela situação, ele **pausa e pergunta** antes de rolar.
- **Automático desligado:** abre um pop-up com o teste, a DT (se visível), um campo de bônus ou penalidade, vantagem ou desvantagem, as habilidades que servem para a situação (disponíveis e usadas) e o botão **Rolar**.
- **Nos dois modos**, o app aplica o que o livro manda e mostra a conta: Envenenado (desvantagem), Exaustão (−2 a −6), Impedido (desvantagem em Agilidade), Atordoado e Inconsciente (falha automática em Brutalidade e Agilidade).

### 8.4 Animação da rolagem

No estilo Baldur's Gate 3: o d20 rola no centro, os modificadores entram um a um e o resultado aparece contra a DT (ou "?" se oculta), com **SUCESSO** ou **FALHA**.

- Pular com clique, Espaço ou Esc.
- Opção "rolagem rápida" nas configurações.
- O mestre vê o resultado na hora, sem esperar a animação do jogador.

---

## 9. Visual, temas e animações

### 9.1 Padrão de estilização (`pacotes/estilo`)

Um arquivo de tokens que define o sistema inteiro, montado junto com você:

- cores (base, texto, destaque, perigo, sucesso, raridades);
- tipografia;
- espaçamentos e raios;
- texturas e ornamentos (SVG);
- sombras;
- durações e curvas de animação;
- sons (opcional, desligável).

Os componentes base (botão, cartão, aba, marcador de PA, ficha de classe, pop-up) só usam tokens. Trocar o tema troca tudo.

### 9.2 Temas

| Tema | Base |
|---|---|
| Olho da Morte (padrão) | Paleta dos livros: tinta, pergaminho, sangue, ferrugem, ouro velho; fontes EB Garamond, IM Fell English e Grenze Gotisch |
| A Ordem no Caos | Violeta da capa, moldura lunar, círculo arcano |
| A Arte da Guerra | A definir junto com a capa do complemento |

- Cada tema vem no pacote do complemento, com tokens, ornamentos e as próprias animações de abertura e transição.
- O tema é escolhido por pessoa, no dispositivo dela. O mestre pode definir um tema sugerido para a campanha.
- A tela precisa de mais contraste que o papel: os tokens de tela partem da paleta dos livros, mas são ajustados para leitura (especialmente no celular e em ambiente escuro).

### 9.3 Animações (propostas para os protótipos)

| Momento | Ideias para testar |
|---|---|
| Abertura do app | Olho se abrindo sobre o pergaminho e título em Grenze Gotisch; poeira e vento; cerca de 2 s, pulável |
| Troca de tela | Portas de saloon; poeira varrendo; página de jornal virando; cartaz de "Procurado" sendo pregado |
| Carregando | Tambor de revólver girando; ferradura balançando; ampulheta de areia |
| Botões | Pressão com efeito de carimbo ou couro; brilho de ouro velho no foco |
| Seu turno | Estrela de xerife ou sino tocando, com destaque na aba Combate |
| Dano e cura | Número saltando, com tremor leve no dano |

**Regras técnicas:**
- Só `transform` e `opacity`, para manter 60 quadros por segundo.
- View Transitions API nas trocas de tela.
- O d20 em 3D só carrega quando for rolar.
- Opção "reduzir animações", que também segue a configuração do sistema operacional.

---

## 10. Desempenho

| Meta | Valor |
|---|---|
| Abrir o app do mestre | < 2 s |
| Primeira tela no navegador do jogador (LAN) | < 1,5 s |
| Ação aparecer para todos | < 100 ms na LAN |
| Pacote JS inicial do jogador | < 250 kB comprimido |
| Memória do app do mestre em sessão | < 300 MB |

---

## 11. O que sai do app antigo

Contas e senhas (bcrypt, JWT, refresh token), painel admin, comunidade e publicação, suporte a vários sistemas (D&D 5e), tradução para inglês, Swagger, MySQL/Docker/Nginx/Loki, importador por planilha, gerador de missão, gerador de caos, sugestão automática de estoque de mercador, tabelas de idempotência, conteúdo versionado genérico com assets e referências, polling.

**Reaproveitar como conhecimento:** instalador NSIS, empacotamento Electron, Host Mode e mDNS, backup, e as lições de interface (o que ficou confuso).

## 12. Dados a salvar do app antigo

Antes de abandonar o ODM-App, exportar da campanha de playtest o que não existe em outro lugar. O rascunho da aventura de Boa Esperança (revisão M22) depende disto:

- missões "Primeiros passos" e "Isso é Pampas do Sul" (descrições, objetivos, recompensas);
- linha do tempo e marcos;
- NPCs e notas do mestre.

**Feito em 05/11/2026:** `mds/exportacao-odm-app-antigo.md` (leitura) e `mds/exportacao-odm-app-antigo.json` (dados brutos para importar no app novo), também no projeto. Inclui as missões, a linha do tempo, os NPCs da campanha e os pré-cadastrados de Boa Esperança com fichas, as três lojas com estoque e serviços, os modelos do gerador de missão e os recursos de classe.

---

## 13. Ordem de implementação

| Fase | Entrega | Pronto quando |
|---|---|---|
| 0. Dados antigos ✔ | Exportação da seção 12 | Feito em 05/11/2026 |
| 1. Protótipos | Combate do jogador (celular e desktop), Escudo do Mestre, Ficha, abertura, transições, rolagem | Você aprova o visual e o fluxo |
| 2. Fundação | Monorepo, `estilo` com o tema padrão, Electron + servidor + WebSocket, entrada na mesa | Dois dispositivos na mesma mesa vendo uma rolagem ao vivo |
| 3. Conteúdo base | Exportador no repositório dos livros + camada mecânica dos efeitos e dos ataques de criatura (para sua revisão) | `odm-base-1.0.json` validado |
| 4. Ficha | Criação, ficha, motor de regras com a conta de cada valor | Personagem completo de qualquer classe da base |
| 5. Combate | Iniciativa, turnos, PA, efeitos automáticos, registro e desfazer, aba Combate, testes, pedido de teste | Um combate com zumbis (incluindo Horda) jogado do início ao fim |
| 6. Mestre | Encontros, missões e linha do tempo, modificadores de mundo, Jogo do 21, comércio, NPCs, notas, mostrar para os jogadores | Uma sessão inteira de playtest só com o app |
| 7. Acabamento | Animações finais, backup, instalador, testes nos fluxos principais | Instalador para os apoiadores |
| 8. Complementos | Pacote e tema de A Ordem no Caos (magia), depois A Arte da Guerra | Campanha com o complemento ativo |

---

## 14. Pendências

### Decididas depois da 1ª versão

- **Complementos:** cada pacote de complemento é um arquivo à parte, entregue só a quem tem o complemento. O app base vem só com a base.
- **Dados do app antigo:** exportar antes de abandonar o ODM-App (seção 12).
- **Progressão:** seção 6.2.1.

- **Mestre no celular:** só PC na 1.0. O Escudo do Mestre é desenhado para desktop.
- **Sons:** entram (dados rolando, sino de "seu turno", tiro em ataque com arma de fogo), curtos, com volume próprio e opção de desligar. Ligados por padrão.

### Suas decisões

1. **Cor e identidade do tema de A Arte da Guerra:** decidir junto com a capa do complemento (antes da fase 8).

### Lacunas de regra (para resolver ao escrever a camada mecânica)

Vou levantar cada caso com a citação do livro durante a fase 3. Já encontrei:

- **Termo "recarga":** o livro não usa. O app mostra "uma vez por descanso curto/longo/cena", conforme cada habilidade.
- **Alucinado e Enfeitiçado:** dependem do mestre; ficam só como texto.
- **Bêbado:** a regra de doses vale "para personagens comuns". Falta definir quem não é comum (raça, habilidade).
- **XP → Prestígio (decidido em 05/11/2026):** 1 Ponto de Prestígio a cada nível da tabela de XP alcançado entre 11 e 20 (10 pontos no total). É o que indicam as tabelas de classe ("Ponto de prestígio" nos níveis 11 a 20) e o exemplo da Polivalência (Brutamonte 10 / Bélico 5).
- **Comprar atributo com Prestígio (decidido em 05/11/2026):** é o talento **Treinamento Pesado** (Jogador, Talentos): 1 ponto de atributo à escolha, repetível, mínimo −1 e máximo 5. Comprado como "Talento" (1 Ponto de Prestígio). Se o ponto for em Fibra depois do nível 10, o app aplica a "Nota Especial sobre a Fibra": +1 PV máximo por nível de classe (até 10). Sugestão para a 1.1 do livro, sem aplicar agora: citar o Treinamento Pesado na própria nota da Fibra.

### Do app antigo

As fórmulas provisórias que estavam em `pending-odm.md` (carga e bônus por nível) passam a vir das tabelas do Livro do Jogador (Carga, Bônus de Proficiência). Nada provisório no motor novo.
