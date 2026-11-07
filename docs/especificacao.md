# ODM App Remake — Especificação

Versão de 06/11/2026. Substitui o ODM-App antigo (OnurbGo/ODM-App), que fica só como histórico.

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
| Personagem | Pertence à campanha do mestre, com exportar e importar; o mestre liga e troca quem controla cada um |
| Celular | Android com app Capacitor (APK); iPhone pelo navegador (seção 3.6) |
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
3. **Fiel aos termos do livro.** PA (sem "Ações Bônus"), DT, Brutalidade/Agilidade/Fibra/Intelecto/Astúcia/Presença, dano profano e dano psicológico, e, nas habilidades de personagem, "uma vez por descanso curto/longo/cena". "Recarga X–Y" só existe em habilidade de criatura (seção 14).
4. **Leve.** Sem dependência pesada sem motivo; cada tela carrega só o próprio código.
5. **Pequeno.** Meta de 15 a 25 mil linhas no núcleo (o antigo tinha cerca de 136 mil).

---

## 3. Arquitetura

### 3.1 Visão geral

```
App do mestre (Electron)
 ├─ Servidor embutido (HTTP + WebSocket) ─┬─ Navegador do jogador (celular ou PC)
 ├─ SQLite (campanhas, fichas, registro)   ├─ App instalado do jogador (opcional; Android na seção 3.6)
 ├─ Pacotes de conteúdo (base + complementos)
 └─ Interface do mestre (a mesma aplicação web)
```

- O servidor do mestre serve a própria página: o jogador abre `http://IP:porta` e entra.
- **Tempo real:** WebSocket. O servidor valida cada ação, grava no registro e manda só a mudança para quem precisa.
- **Visibilidade:** o servidor filtra o que cada um recebe. O jogador nunca recebe PV de criatura, DT oculta nem notas do mestre. Esconder só na tela não basta.

### 3.2 Rede

- **IP manual em primeiro lugar.** A descoberta automática (mDNS) quase nunca funciona em Hamachi e Radmin. Ela fica como atalho na LAN.
- A tela do mestre mostra os endereços disponíveis (LAN, Hamachi, Radmin), cada um com botão de copiar e um QR code para o celular.
- **Firewall (decidido em 06/11/2026):** o mestre não mexe em configuração do Windows nem usa terminal. O instalador cria uma regra de entrada só para o executável do app, só TCP, e a remove ao desinstalar. Se o Windows bloquear mesmo assim, o painel do mestre detecta e mostra o botão **Liberar acesso**: um clique e a confirmação do Windows.
- A regra vale em redes privadas e públicas, porque rede nova costuma entrar como pública no Windows. O servidor só fica ligado com a mesa aberta, e entrar exige o código e a aprovação do mestre.
- Redes que isolam os dispositivos (Wi-Fi de escritório ou de visitantes) bloqueiam fora do computador, e nenhum app resolve. O painel explica e indica Hamachi, Radmin ou o roteador do celular.
- **Ninguém conseguiu entrar? (decidido em 06/11/2026):** bloco no cartão de convite do painel, em linguagem simples, com o que conferir: mesma rede Wi-Fi; rede de convidados ou isolamento de clientes no roteador; rede do Windows como Pública (não precisa mudar: a liberação vale para ela); firewall, com a situação e o botão Liberar acesso; endereço certo pelo QR code. Nada pede para o usuário mexer no Windows.
- **Página de teste:** `http://IP:porta/teste`, texto puro, sem o app e sem nada da campanha, com um teste mínimo da conexão ao vivo. Se abre, a rede está boa e o problema é do app; se não abre, o problema é de rede. O painel mostra o endereço com copiar e QR code.
- **Mesa sem resposta:** se a página abriu mas a mesa não responde em 8 segundos, o jogador vê o erro com o que conferir, e o app segue tentando sozinho.
- **Em desenvolvimento (`npm run dev`):** quem recebe os jogadores é o `node.exe`. O terminal e o painel mostram a situação do firewall dele e avisam que o botão Liberar acesso só existe no app; `npm run firewall:liberar` abre a confirmação do Windows.
- **Porta:** 47821, a mesma do app antigo. Se estiver ocupada, a tela do mestre avisa e deixa escolher outra, e a escolha fica salva. O app não troca de porta sozinho, porque a porta faz parte do endereço que os jogadores usam.
- HTTP sem TLS (rede local ou virtual). O código da mesa e a aprovação do mestre evitam entradas indesejadas.

### 3.3 Entrada na mesa

1. O jogador abre o endereço e digita nome + código da mesa.
2. O pedido chega ao mestre com três botões fixos: **Aceitar** (pessoa nova), **Associar** e **Recusar**. Aceito ou associado, o jogador recebe um token salvo no dispositivo.
3. Na próxima vez, ele entra direto. O mestre pode revogar o acesso.
4. **Associar (celular novo):** o botão abre a lista dos jogadores que já passaram pela mesa, com quem tem o mesmo nome no topo, já sugerido. O novo dispositivo volta como o jogador escolhido, com o mesmo nome ou não. Sem ninguém para associar, o botão fica desativado e a tela explica por quê. Tirar o jogador da mesa invalida todos os aparelhos dele, inclusive um celular perdido.
5. **Personagem é da campanha (decidido em 06/11/2026):** o personagem pertence à campanha, não ao jogador nem ao aparelho. O mestre liga e troca a qualquer momento qual jogador controla qual personagem, inclusive de quem já foi aceito. Um personagem tem no máximo um jogador e pode ficar sem nenhum; um jogador pode ter mais de um, como ao cobrir quem faltou. A interface entra na fase 4, quando houver fichas; o protocolo já prevê a mensagem `ligar_personagem` (seção 6).
6. **Campanhas (decidido em 06/11/2026):** "Abrir minha mesa" mostra a lista de campanhas do mestre, com nome, última sessão, personagens e **Continuar**, além de **Nova campanha** (nome, pacotes ativos e opções da campanha).
   - **Uma campanha aberta por vez.** "Trocar de campanha" fecha a aberta, com confirmação, e volta à lista. Se o servidor reiniciar em plena sessão, a campanha aberta continua aberta; abrir o app de novo sempre começa pela lista.
   - **Jogadores aprovados valem só na campanha deles.** O aparelho guarda um token por campanha. Com outra campanha aberta, o jogador vê "Mesa fechada", não perde o token e entra sozinho quando a dele abrir; se quiser, pode pedir entrada na campanha aberta, com o código e a aprovação do mestre.
   - **Exportar e importar campanha** fica para o backup da fase 7.

### 3.4 Stack (proposta)

| Parte | Escolha | Por quê |
|---|---|---|
| Linguagem | TypeScript em tudo | Tipos e regras compartilhados |
| Front | React + Vite | Você já domina; o build é rápido |
| Estado no front | Store leve (Zustand) alimentada pelo WebSocket | Sem polling e sem camada de cache pesada |
| Servidor | Fastify + `ws` | Leve e rápido |
| Banco | SQLite com `node:sqlite` (do próprio Electron) + Drizzle 1.0 RC, em versões exatas | Substitui Sequelize + Umzug; síncrono e sem módulo nativo, que quebrou o build do app antigo no caminho com acento. Testado no Electron 44.10.2 (Node 24.22.2), no processo principal e no utilityProcess. O acesso fica numa camada fina, porque o módulo ainda é release candidate no Node 24 |
| Desktop | Electron 44.10.2 | Reaproveita o que já foi resolvido no instalador NSIS. O 45.2.3 derruba o renderer nesta máquina, mesmo com uma página vazia |
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

### 3.6 App de celular (decidido em 06/11/2026)

- **Android:** um app Capacitor que embrulha a mesma interface web. Traz ícone, tela cheia, entrada por QR code, tela sempre acesa e vibração no "seu turno". É distribuído como APK.
- **iPhone:** continua pelo navegador.
- **HTTP em texto claro:** liberado só para a LAN e para Hamachi/Radmin.
- **Sem resposta da mesa (decidido em 06/11/2026):** o app traz a interface dentro dele, então funciona mesmo quando não alcança o servidor. Em vez de carregar sem fim, mostra o erro com as instruções de "Ninguém conseguiu entrar?" (seção 3.2), na linguagem do jogador, e segue tentando.
- **Por que não PWA:** um PWA instalável exige HTTPS, e a mesa roda em `http://IP`.
- **Construção:** fase 7, junto do instalador. O ícone adaptativo sai do SVG-mestre em `pacotes/estilo/src/icone/`.

**A confirmar na fase 7:** a configuração de rede do Android trabalha com nomes de domínio e, segundo fontes de fórum, não aceita faixas de IP. Se isso se confirmar na documentação oficial, o app libera texto claro e ele mesmo recusa endereços fora das faixas privadas, de Hamachi (`25.x`) e de Radmin (`26.x`).

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

A lista de pacotes fica em `tools/exportar/pacotes.yml`, no repositório dos livros. Só a base é gerada por enquanto; os outros ficam reservados e desligados.

**Onde o app lê o pacote:** em desenvolvimento, em `%LOCALAPPDATA%\ODM-dev\conteudo`, fora dos dois repositórios, ou na pasta da variável `ODM_CONTEUDO`. Quem carrega o pacote é o servidor, e ele não vai para a pasta da interface: o jogador recebe só o que pode ver (seção 3.1). Como o pacote entra no instalador fica para a fase 7. O app confere o arquivo com `npm run conteudo:validar`.

### 4.2 Identificadores fixos

Todo item do conteúdo tem um id que não muda (ex.: `classe.cacador`, `efeito.hemorragia`, `criatura.zumbi`). A ficha guarda o id. Quando o livro muda o texto ou um complemento ganha conteúdo novo, as fichas existentes continuam válidas. Se algo for removido do livro, a ficha mantém uma cópia e mostra o aviso "não está mais no livro".

**Como o id sobrevive à troca de nome:** o id nunca é calculado a partir do nome. Ele fica num registro (`livros/<livro>/dados/app/ids.yml`) que liga o id ao lugar atual do item no livro.

- **Item novo:** o exportador propõe um id, que só vale depois de entrar no registro.
- **Nome mudou:** um id fica sem item e surge um item sem id. O exportador para e sugere o par, comparando com o texto da exportação anterior. Confirmado, muda-se uma linha do registro, e o id continua o mesmo.
- **Item removido:** a linha fica marcada com `removido: true`, e o id nunca é reaproveitado.

Nada é marcado no Markdown dos livros.

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

O texto do livro não muda. Ao lado dele vai um bloco mecânico, em arquivos próprios no repositório dos livros (`livros/*/dados/app/*-mecanica.yml`), que o build dos livros ignora e o exportador usa. São: efeitos e ataques de criatura (fase 3) e regras, classes, fichas de classe, habilidades, origens, talentos e itens (fase 4).

**Revisão:** cada item desses arquivos tem o campo `situacao` (`proposta`, `aprovado` ou `lacuna`), e esses YAML são a fonte. O relatório em `revisao/` é gerado a partir deles, e aprovação nunca fica em arquivo regenerado. Só item `aprovado` leva mecânica ao pacote; os outros vão só como texto.

Exemplo — Hemorragia (tudo tirado do texto atual):

```yaml
efeito.hemorragia:
  acumulos: { max: 3 }
  gatilhos:
    - quando: inicio_do_turno
      faz: { perde_pv: "1d4", por_acumulo: true }  # perda direta: ignora RD, PV temporários absorvem
    - quando: fim_do_turno
      oferece: { teste: { atributo: fibra, dt: 15 }, sucesso: { remover_acumulo: 1 } }
  acoes:
    - nome: "Tratar com bandagens ou Trapos"
      custo: { pa: 1, item: trapos, ou: improviso_aceito_pelo_mestre }
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
| Usos limitados | "x vezes por dia" volta no descanso longo; "por combate" volta ao fim do combate; sessão, semana e 7 dias o mestre marca à mão |

Habilidades também recebem **marcações de situação** (`reage_a`, em `livros/jogador/dados/app/situacoes-mecanica.yml`), para o app sugerir a habilidade certa no momento certo (seção 8).

**Combate (lote 8 e 9, fase 5):** as regras de combate ficam em `combate-mecanica.yml`, as armas em `armas-mecanica.yml` e os ataques padrão das criaturas em `ataques-mecanica.yml`. Um item pode ter mecânica em mais de um arquivo (o peso e o ataque de uma arma); cada parte é aprovada sozinha, e as partes se somam no pacote.

### 4.5 Conteúdo do mestre

O mestre pode criar criaturas, NPCs, itens e efeitos próprios por formulários simples dentro do app, no mesmo formato dos pacotes. Eles ficam na campanha e podem ser exportados para outra mesa.

---

## 5. Motor de regras e registro da sessão

### 5.1 Motor de regras (`pacotes/regras`)

Funções puras que recebem ficha + conteúdo + estado e devolvem valores calculados:

- Defesa, PV máximo, deslocamento, RD. Sem armadura, a Defesa é 10 + Agilidade; habilidades como Armadura Muscular (Brutamonte: 10 + Brutalidade + Fibra, e escudo não anula) substituem essa conta. Deslocamento base: 6 m para todos (decidido em 06/11/2026; o Livro do Jogador não traz os dois valores);
- bônus de proficiência (tabela de "Bônus de Proficiência", Jogador, Progressão);
- carga e Sobrecarregado (seção de Carga do Jogador);
- Exaustão (tabela de 6 níveis), Morrendo progressivo (entram na fase 5, com o estado do combate);
- Estresse máximo por Intelecto (só se a campanha ativar);
- penalidades e vantagens de condições nos testes;
- dano na ordem decidida em 06/11/2026: Imunidade, Vulnerabilidade ou Resistência, RD, PV temporários e PV; metade arredonda para baixo, mínimo 1.

Cada valor calculado guarda a **conta** (ex.: "Defesa 14 = 10 + 2 Agilidade + 2 armadura"), que aparece ao tocar no número. O jogador pode pôr um **ajuste manual** em qualquer campo calculado; ele aparece marcado.

### 5.2 Registro da sessão e desfazer

Toda mudança é um evento: rolagem, dano, cura, efeito aplicado, PA gasto, item usado, uso de habilidade, turno.

- Cada evento sabe se desfazer. Desfazer cria um evento novo ("desfeito por…"); nada é apagado.
- **Permissões:** o mestre desfaz qualquer evento; o jogador desfaz só os próprios, até o fim do turno dele.
- O registro aparece para todos, filtrado pelo que cada um pode ver.
- Efeitos podem ser encerrados antes, ter acúmulos e duração editados ou ser adicionados à mão.
- **Limpar a tela:** um botão tira as rolagens da tela sem apagar o histórico, porque o desfazer depende dele.

---

## 6. Jogador

### 6.0 De quem é o personagem

O personagem pertence à campanha. O mestre liga e troca a qualquer momento qual jogador o controla, inclusive de quem já foi aceito (seção 3.3). A interface entra na fase 4.

### 6.1 Criação de personagem

Assistente em passos, com as escolhas filtradas pelos pacotes ativos na campanha. A ficha pode ser salva a qualquer momento como rascunho.

- **Passos (proposta):** Conceito, Origem, Classe, Atributos, Perícias e proficiências, Redenção, Revisão. "Criando um personagem" dá só Origem e Classe como pilares, sem ordem numerada.
- **Equipamento inicial (decidido em 06/11/2026):** os livros não têm lista por classe nem dinheiro inicial. A criação não tem esse passo, e o mestre entrega os itens pelo app. O pacote já prevê o campo: se o livro ganhar a lista, o passo aparece.
- **Kits:** para ajudar o mestre, um clique entrega um conjunto de itens. Os sugeridos vêm do equipamento dos personagens do Fast Play, após revisão; o mestre também monta e salva os próprios na campanha.

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

Na fase 4 a opção aparece na loja, bloqueada com o motivo. A regra entra na fase 8, junto com o pacote.

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
| Regras opcionais | Atitude Imprudente (falhas pendentes) e Carta do Destino, se a campanha usar (decidido em 06/11/2026) |

- **Celular:** uma coluna, com a aba Combate como tela principal e navegação embaixo.
- **Desktop:** ficha e combate lado a lado, com o registro da sessão visível.

---

## 7. Mestre

### 7.1 Escudo do Mestre — combate

- Iniciativa por baralho, seguindo "Iniciativa" (Jogador, Combate): cada criatura engajada compra uma carta, e o app ordena, desempata e registra quem usou o efeito de uma carta especial.
- **Empates da iniciativa:** o último desempate é opção da campanha (naipe ou nova compra), como no livro. Dois Coringas: nova compra mantendo o Coringa, e a segunda carta maior vai primeiro. A troca do Coringa acontece antes de ir para o fim.
- Turnos (jogadores, criaturas, NPCs), com avanço de turno disparando os gatilhos dos efeitos.
- Criaturas do bestiário com PV, efeitos e ações clicáveis (rola acerto e dano; pede teste de resistência). Ação sem mecânica aprovada mostra o texto do livro e uma rolagem manual (acerto, dano e tipo).
- **Reações (decidido em 06/11/2026):** ataque de criatura contra quem tem PA guardado pergunta antes da rolagem: Esquiva, Bloqueio, as habilidades marcadas para a situação ou Não reagir. O mestre vê "aguardando reação" e tem "Seguir sem reação". Sem PA guardado, rola e aplica na hora.
- **Horda** (regra do Zumbi): formar, somar PV, remover integrante a cada 10 de dano, recalcular o bônus. Decidido em 06/11/2026:
  - cada integrante entra com os PV atuais (Elite com o bônus dele); com 2 integrantes ou menos, a Horda se desfaz, e os PV restantes são divididos igualmente entre quem sobra (para baixo), que age na carta da Horda;
  - ataque à escolha (Pancada ou Mordida), com Bônus de Horda no acerto e no dano; uma jogada contra a Defesa de cada alvo, dano rolado por alvo;
  - Pressão de Massa é dano indefensável;
  - Ameaça de Massa: −1 em todas as reações, inclusive Bloqueio; sem Combo;
  - uma carta de iniciativa, descartando as dos Zumbis.
- **Recarga X–Y (Mestre, "Como criar uma criatura?"):** no início de cada turno da criatura, rolar 1d6; se cair na faixa, a habilidade volta.
- Pedido de teste por tipo (habilidade, resistência, passivo ou contestado), para um ou vários jogadores, com ajuste por jogador (seção 8).
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

## 8. Testes pedidos pelo mestre

### 8.1 Tipos

Conforme "Testes de Habilidade" e "Testes Passivos" (Jogador, Progressão) e "Esconder-se" (Jogador, Ações):

| Tipo | O mestre escolhe | Como resolve | O jogador vê |
|---|---|---|---|
| **Habilidade** | Atributo ou perícia, e a DT | 1d20 + modificador contra a DT | Pop-up e rolagem |
| **Resistência** | Atributo e DT | 1d20 + modificador contra a DT | Pop-up, ou rola sozinho se o automático estiver ligado (8.4) |
| **Passivo** | Atributo ou perícia, e a DT | Sem rolagem: 10 + modificadores aplicáveis; vantagem no máximo +5, desvantagem −5; as duas se anulam | **Nada.** O livro usa o passivo para "não entregar que há algo escondido"; o jogador não é avisado, e só o mestre vê os valores contra a DT |
| **Contestado** | O teste do personagem e o teste da criatura ou NPC, como Furtividade contra Percepção ativa, e quem age (por padrão, o personagem) | Rolagem do personagem contra a rolagem do oponente; no empate, vence quem age. Contra grupo, o oponente rola uma vez. Percepção ativa de criatura = passiva − 10 | A própria rolagem. O resultado do oponente segue a mesma regra de visibilidade da DT |

**Em todos:** um ou vários jogadores de uma vez e ajuste por jogador (DT, bônus ou penalidade, vantagem ou desvantagem).

**DT:** a escala do livro entra como atalho (Muito fácil 5, Fácil 10, Moderada 15, Difícil 20, Muito difícil 25, Quase impossível 30), com campo livre ao lado, porque o livro também usa valores fora dela, como Fibra DT 13.

### 8.2 Origens

- ataque de criatura cadastrada (atributo, DT e efeito já preenchidos);
- pedido manual do mestre;
- efeito (ex.: Hemorragia no fim do turno).

### 8.3 Mestre

1. Escolhe o tipo do teste e seleciona um ou vários jogadores.
2. Escolhe atributo ou perícia e a DT (ou já vêm do ataque). No contestado, escolhe o oponente e o teste dele.
3. Ajusta por jogador: outra DT, bônus ou penalidade, vantagem ou desvantagem.
4. Escolhe se a DT fica visível neste teste (padrão: invisível). No passivo essa escolha não existe, porque o jogador não recebe nada.
5. Envia e recebe a lista de sucesso e falha por jogador. Quando houver efeito, ele é aplicado em quem falhou, com desfazer.

**Visibilidade:** o servidor não envia ao jogador nada sobre um teste passivo: nem pedido, nem linha no registro, nem aviso. Não basta esconder na tela (seção 3.1).

### 8.4 Jogador

- **Automático ligado (só teste de resistência):** o app rola, aplica e registra. Se houver uma habilidade disponível marcada para aquela situação, ele **pausa e pergunta** antes de rolar.
- **Automático desligado, e sempre nos testes de habilidade e contestado:** abre um pop-up com o teste, a DT (se visível), um campo de bônus ou penalidade, vantagem ou desvantagem, as habilidades que servem para a situação (disponíveis e usadas) e o botão **Rolar**.
- **Por que o automático não vale para habilidade:** esses testes têm decisões do jogador que o livro prevê, como Fazer com Calma, Tentar até Conseguir e Forçar a Rolagem. A resistência é uma reação, que costuma vir em série no combate, com o mestre esperando.
- **Recusar rolagem:** o pop-up não fecha sem resposta, mas tem o botão **Recusar rolagem**, e o mestre é avisado. O teste fica como "Recusado" no cartão dele, com Sucesso, Falha, Rolar por ele e Cancelar teste. Nada é aplicado até ele escolher.
- **Forçar a Rolagem** vale só em teste de habilidade.
- **Nos dois modos**, o app aplica o que o livro manda e mostra a conta: Envenenado (desvantagem), Exaustão (−2 a −6), Impedido (desvantagem em Agilidade), Atordoado e Inconsciente (falha automática em Brutalidade e Agilidade). Inconsciente e Caído de perto são duas fontes de vantagem: 3d20 nos Dados Extras; nas Cartas, 2 cartas usando o maior, como está no livro. Vantagem e desvantagem se anulam também nas Cartas.
- **Modelo de vantagem:** o mestre escolhe na campanha entre Dados Extras e Cartas, como em "Vantagem e Desvantagem" (Jogador, Progressão). O app segue o modelo escolhido na rolagem e no pop-up.

### 8.5 Animação da rolagem

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
| A Ordem no Caos | Fundo roxo muito escuro, quase preto, com roxo forte como cor predominante (as cores da introdução do livro); moldura lunar, círculo arcano |
| A Arte da Guerra | As cores da capa, já pronta no repositório dos livros (`livros/guerra`). O tema é feito na fase 8 |

- Cada tema vem no pacote do complemento, com tokens, ornamentos e as próprias animações de abertura e transição.
- O tema é escolhido por pessoa, no dispositivo dela. O mestre pode definir um tema sugerido para a campanha.
- A tela precisa de mais contraste que o papel: os tokens de tela partem da paleta dos livros, mas são ajustados para leitura (especialmente no celular e em ambiente escuro).

### 9.3 Animações (propostas para os protótipos)

| Momento | Ideias para testar |
|---|---|
| Abertura do app | Olho se abrindo sobre o pergaminho e título em Grenze Gotisch; poeira e vento; cerca de 2 s, pulável. Toca uma vez por abertura do app |
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
| 1. Protótipos ✔ | Combate do jogador (celular e desktop), Escudo do Mestre, Ficha, abertura, transições, rolagem, cartas | Feito em 05/11/2026; o aprovado está em `docs/decisoes-visuais.md` |
| 2. Fundação ✔ | Monorepo, `estilo` com o tema padrão, Electron + servidor + WebSocket, entrada na mesa | Feito em 06/11/2026: computador e celular na mesma mesa vendo uma rolagem ao vivo |
| 3. Conteúdo base ✔ | Exportador no repositório dos livros + camada mecânica dos efeitos e dos ataques de criatura (para sua revisão) | Feito em 06/11/2026: `odm-base-1.0.json` validado, com 690 itens |
| 4. Ficha ✔ | Camada mecânica de ficha no exportador, criação, ficha, progressão, loja de prestígio, motor de regras com a conta de cada valor | Feito em 06/11/2026: um personagem completo de cada uma das 6 classes da base no nível 1, e um personagem no nível 11 ou mais usando a loja de prestígio |
| 5. Combate ✔ | Iniciativa, turnos, PA, efeitos automáticos, registro e desfazer, aba Combate, testes, pedido de teste | Feito em 07/11/2026: combate com zumbis e Horda do início ao fim, com o mestre no PC e o jogador num celular de verdade (`docs/teste-fase5-celular.md`), e `npm run combate:aceite -- --previa`. As regras de combate ainda estão como proposta nos lotes 8 e 9 dos livros, para revisão |
| 6. Mestre | Encontros, missões e linha do tempo, modificadores de mundo, Jogo do 21, comércio, NPCs, notas, mostrar para os jogadores | Uma sessão inteira de playtest só com o app |
| 7. Acabamento | Animações finais, backup, instalador com a regra de firewall (seção 3.2), APK do Android (seção 3.6), testes nos fluxos principais | Instalador e APK para os apoiadores |
| 8. Complementos | Pacote e tema de A Ordem no Caos (magia), depois A Arte da Guerra | Campanha com o complemento ativo |

---

## 14. Pendências

### Decididas depois da 1ª versão

- **Complementos:** cada pacote de complemento é um arquivo à parte, entregue só a quem tem o complemento. O app base vem só com a base.
- **Dados do app antigo:** exportar antes de abandonar o ODM-App (seção 12).
- **Progressão:** seção 6.2.1.

- **Mestre no celular:** só PC na 1.0. O Escudo do Mestre é desenhado para desktop.
- **Sons:** entram (dados rolando, sino de "seu turno", tiro em ataque com arma de fogo), curtos, com volume próprio e opção de desligar. Ligados por padrão.

### Decididas em 06/11/2026

- **Cartas do Destino:** opção da campanha, ligada por padrão.
- **"x vezes por dia":** recupera no descanso longo.
- **Pop-up de teste:** seção 8.4.
- **Abertura:** uma vez por abertura do app.
- **Teste contestado:** contra grupo, o oponente rola uma vez. Percepção ativa de criatura = passiva − 10.
- **Teste passivo:** vantagem no máximo +5; vantagem e desvantagem se anulam.
- **Forçar a Rolagem:** só em teste de habilidade.
- **Recarga X–Y de criatura:** no início de cada turno da criatura, rolar 1d6; na faixa, a habilidade volta. Está no Mestre, em "Como criar uma criatura?". O campo "Recarga:" de armas e ataques especiais é outra coisa e fica como está.
- **Alucinado e Enfeitiçado:** dependem do mestre; ficam só como texto.
- **Bêbado:** a regra de doses vale para todos.
- **Iniciativa:** seção 7.1.
- **"Força":** é tipo de dano (energia genérica, não elemental). Montarias têm atributos próprios, incluindo Força.
- **Efeitos:**
  - Hemorragia é perda direta: ignora RD, mas PV temporários absorvem. Remove acúmulo com bandagens, Trapos (componente de `16-criacao.md`) ou um improviso aceito pelo mestre.
  - Queimadura causa dano só no início do turno da própria criatura; os testes de Fibra e de Agilidade são de habilidade; quem ajuda precisa estar adjacente, salvo meio à distância (balde de água); rolar no chão custa 1 PA, deixa Caído e apaga sem teste.
  - Amedrontado dá desvantagem e −1 PA enquanto o efeito durar, sem marcador de "vê a fonte".
  - Incapacitado pode gastar PA só para se mover.
  - Exposto não acumula com Vulnerabilidade; imunidade prevalece.
  - Fragilidade: −2 no ataque com arma de fogo, no turno de quem sofre.
  - Loucura Frenética usa o nível do personagem; criatura usa ND.
  - Exaustão Glacial: botão "Me aqueci" para o próprio jogador encerrar.
- **Defesa e deslocamento base:** seção 5.1.
- **Equipamento inicial:** seção 6.1.
- **Usos por combate, sessão, semana e 7 dias:** "por combate" volta ao fim do combate; os outros três o mestre marca à mão.
- **Fichas de Olho da Morte:** voltam todas no descanso longo, além do que o livro já dá em combate. Muitos Olhares soma +2 ao máximo.
- **Fichas que se acumulam:** Franco Atirador, Atirador Afiado, Notória, Agarrão, Caixão e Vela Preta e Eficiência Medicinal ficam até serem gastas. Pragmático também começa sem fichas.
- **Ficha de Combatente:** máximo 3.
- **Fichas de Sentença:** valem só dentro de Juiz, Júri e executor; não são ficha de classe.
- **Loucura Frenética:** quem tem mais de um tipo de ficha escolhe qual perde.
- **Corpo Incansável (Caçador):** entra no nível 9, embora o título no livro diga "(NV1)".

### Suas decisões

1. **Assinatura do app (antes da fase 7):** sem certificado pago. O commit "chore - preparar code signing Windows" do ODM-App antigo não assina nada: deixa a assinatura opcional, ligada só se houver certificado, e o documento dele termina com o certificado pendente e diz que certificado próprio não passa pelo Smart App Control. Na fase 7, avaliar a SignPath Foundation, já que este repositório é público. O Smart App Control pode barrar um executável sem assinatura, como aconteceu nesta máquina em 06/11/2026.
2. **Fast Play como pacote grátis (futuro, aprovado em 06/11/2026):** reservado em `tools/exportar/pacotes.yml` como `odm-fastplay`, sem geração por enquanto. O livro já traz seis personagens prontos e a missão *Cheiro de Fuligem*, então o pacote depende da ficha (fase 4). Os efeitos dele repetem o texto do Livro do Jogador e usariam os mesmos ids da base, para quem passar de um para o outro não perder a ficha.
### Decididas para a fase 5 (06 e 07/11/2026)

- **Carta especial "uma vez por combate" (07/11/2026):** vale por pessoa. Dois jogadores com Ás podem usar o efeito; a mesma pessoa não usa o mesmo efeito duas vezes no combate.
- **Empate no teste contestado:** vence quem age, como no "igual ou maior" do passivo e da DT. Está no Livro do Jogador, em Esconder-se (livros e7cb2b1). Seção 8.1.
- **Horda ao se desfazer:** os PV restantes são divididos igualmente entre os Zumbis que sobram, arredondando para baixo, e eles agem na carta da Horda. O mestre pode editar, com desfazer. Seção 7.1.
- **Ordem do dano:** Imunidade, Vulnerabilidade ou Resistência, RD, PV temporários e PV. Metade arredonda para baixo, mínimo 1. Seção 5.1.
- **Reações a ataque de criatura:** se o alvo tem PA guardado, recebe a pergunta antes da rolagem; o mestre vê "aguardando reação" e tem "Seguir sem reação". Sem PA guardado, o ataque rola e aplica na hora, como na parada 4. Seção 7.1.
- **Bestiário:** os ataques no formato padrão das fichas viram proposta de mecânica (lote 9); o resto fica como texto, com rolagem manual no Escudo. Seção 4.4.
- **Atitude Imprudente e Cartas do Destino:** entram na fase 5. Seção 6.3.
- **Suposições da fase 5 aprovadas:** Dados de Vida no descanso longo arredondam para baixo, mínimo 1 (o livro cita uma "regra geral de arredondamento" que não define); o descanso longo também devolve usos "por descanso curto"; criatura a 0 PV vira "Derrotada" e sai da ordem, com desfazer; duração em turnos desconta no fim do turno da criatura afetada; um baralho por combate para a iniciativa e um baralho completo a cada teste com vantagem por cartas; ataque = d20 + atributo da arma + proficiência; Sequela Permanente com as penalidades como lembrete; o jogador desfaz uma reação fora do turno até o fim do próximo turno dele.

### Decididas nas etapas 6 a 9 da fase 5 (aprovadas em 07/11/2026)

- **Testes:**
  - O resultado aparece no registro de todos, sem a DT oculta, sem o oponente oculto e sem nada do passivo; o pedido vai só a quem responde.
  - Bônus e vantagem do mestre somam com os do jogador.
  - A falha que é desfeita por Forçar ou Rolar de novo tira o efeito da falha, como um desfazer do mestre.
  - A habilidade usada no pop-up gasta o custo e fica anotada; o efeito dela é combinado com o mestre.
  - 20 e 1 naturais em teste de habilidade só têm destaque; o crítico com efeito de regra é o do ataque.
- **Ataques:**
  - O jogador não vê a animação nem o bônus de acerto de criatura, só o resultado no registro, com o nome da ação.
  - Contra vários alvos, uma rolagem só, com os efeitos do primeiro alvo; cada alvo sofre o próprio dano.
  - Criatura não abre janela de reação.
  - Ações de efeito: o jogador usa nos próprios efeitos; as que pedem aprovação do mestre ficam com o mestre; as que custam PA valem só no turno, ou no fim da rodada com PA guardado. Usar Trapos tira 1 do inventário.
- **Horda:**
  - O Bônus de Horda soma em qualquer ataque da Horda.
  - A Ameaça de Massa tira 1 do que a Esquiva e o Bloqueio somam na Defesa, porque aqui a reação não é rolagem.
  - Formada no meio do combate, a Horda entra na ordem pela carta dela; não se forma na vez de um integrante.
  - Sai primeiro o integrante com menos PV. Efeitos e habilidades gastas dos Zumbis não passam para a Horda nem voltam quando ela se desfaz.
  - A Pressão de Massa vale uma vez por rodada por criatura, no início ou no fim do turno, o que vier primeiro.
- **Morrendo, Estresse e descansos:**
  - Violência rola o dano duas vezes e fica com o maior.
  - A Atitude Imprudente vale só no próprio turno; Precisão, Potência e Violência valem no próximo ataque.
  - Estabilizar é botão do mestre, que pede o teste à parte quando um aliado estabiliza.
  - A cura do descanso curto a partir de 0 PV encerra o Morrendo.
  - A aflição da Crise não derruba abaixo de 1 PV, e com 0 PV não causa dano.
  - Com Exaustão 6, o registro diz "morreu"; o app não tira o personagem da mesa.
- **PA de quem está inconsciente (07/11/2026, depois do teste no celular):** quem começa o turno Inconsciente perde todos os PA daquele turno; não há o que guardar, e a cura no meio da rodada não traz reação. O livro diz que PA não gasto fica guardado (Guardando Ações) e que Inconsciente bloqueia ações e reações, mas não diz o que vale depois da cura.
- **Lote 8 (proposta para revisão):** o custo de 1 PA do ataque com arma ("Ação Padrão", Jogador, Combate, Seu Turno) entrou em `combate-mecanica.yml`, em `regra.seu-turno`.

### Regras já definidas antes da fase 3

- **Críticos (decidido em 05/11/2026):** 20 natural no d20 de ataque acerta automaticamente e o dano rola o dobro dos dados; "falha crítica" é 1 natural. Em teste de resistência, 20 e 1 têm só destaque visual, e o resultado é sempre o total contra a DT.
- **XP → Prestígio (decidido em 05/11/2026):** 1 Ponto de Prestígio a cada nível da tabela de XP alcançado entre 11 e 20 (10 pontos no total). É o que indicam as tabelas de classe ("Ponto de prestígio" nos níveis 11 a 20) e o exemplo da Polivalência (Brutamonte 10 / Bélico 5).
- **Comprar atributo com Prestígio (decidido em 05/11/2026):** é o talento **Treinamento Pesado** (Jogador, Talentos): 1 ponto de atributo à escolha, repetível, mínimo −1 e máximo 5. Comprado como "Talento" (1 Ponto de Prestígio). Se o ponto for em Fibra depois do nível 10, o app aplica a "Nota Especial sobre a Fibra": +1 PV máximo por nível de classe (até 10). Sugestão para a 1.1 do livro, sem aplicar agora: citar o Treinamento Pesado na própria nota da Fibra.

### Do app antigo

As fórmulas provisórias que estavam em `pending-odm.md` (carga e bônus por nível) passam a vir das tabelas do Livro do Jogador (Carga, Bônus de Proficiência). Nada provisório no motor novo.
