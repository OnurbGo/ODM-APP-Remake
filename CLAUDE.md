# ODM App Remake — instruções para o Claude Code

App de mesa para o RPG autoral **Olho da Morte**, do Bruno (OnurbGo). Substitui o ODM-App antigo (OnurbGo/ODM-App), que fica só como histórico e referência de empacotamento.

## Leia antes de qualquer trabalho

1. `docs/especificacao.md` — a especificação aprovada. Ela manda em arquitetura, escopo, telas e ordem das fases.
2. Repositório dos livros (privado): https://github.com/OnurbGo/Olho-Da-Morte-RPG
   - É a **única fonte das regras e do conteúdo**. O app não tem conteúdo próprio do sistema.
   - Livros em Markdown + YAML: `livros/jogador`, `livros/mestre`, `livros/ordem` (A Ordem no Caos). Dados já estruturados em `livros/*/dados/` (criaturas, ameaças, condições).
   - Se não houver um clone local, pergunte ao Bruno onde fica; se ele não tiver, clone ao lado deste repositório.
3. Dados do app antigo (missões, linha do tempo, NPCs e lojas de Boa Esperança): `C:\Users\bruno\OneDrive\Área de Trabalho\RPG\Livro Olho Da Morte\mds\exportacao-odm-app-antigo.md` e `.json`. **Não copie esses arquivos para este repositório** (ver "Repositório público").

## Regras de trabalho

- **Não invente regra.** Toda mecânica automatizada vem de um trecho dos livros. Se o texto não basta (valor, atributo, DT ou duração faltando), pare e pergunte ao Bruno, citando o livro e a seção. As lacunas conhecidas estão na seção 14 da especificação.
- **Diferencie** o que está nos livros, o que está na especificação e o que ainda falta decidir.
- **Erros de digitação nos livros:** sempre pergunte antes de corrigir. Nunca corrija por conta própria.
- **Termos do sistema** (usar exatamente assim na interface):
  - PA (pontos de ação); não existe "Ação Bônus".
  - DT (não CD).
  - Atributos: Brutalidade, Agilidade, Fibra, Intelecto, Astúcia, Presença, nesta ordem.
  - Dano **profano** (não necrótico) e dano **psicológico** (não psíquico), inclusive em nomes.
  - Habilidade de personagem: "uma vez por descanso curto/longo/cena", conforme a habilidade.
  - Habilidade de criatura: "Recarga X–Y" existe nas fichas, mas a regra não está definida no livro. É lacuna do Bruno a decidir: não suponha a regra.
  - O campo "Recarga:" de armas e ataques especiais é outra coisa e fica como está.
  - Fichas de classe: Ficha de Olho da Morte, Ficha de Mana, Ficha de Adrenalina etc.
- **Interface e textos em português do Brasil.**
- **Fases em ordem** (seção 13 da especificação). A fase 1 é de protótipos: nada de implementar telas antes de o Bruno aprovar o visual e o fluxo.
- O Bruno gosta de decidir aos poucos: proponha e discuta antes de gerar algo grande.

## Git

- Commits saem **pela conta do Bruno (OnurbGo)**. Sem `Co-Authored-By`, sem menção a Claude ou IA na mensagem, sem trailers de sessão.
- Mensagens de commit em português, curtas, no formato `tipo: descrição` (ex.: `feat: aba Combate do jogador`).
- Só faça commit ou push quando o Bruno pedir.

## Repositório público

Este repositório é **público** e o dos livros é **privado**. Nunca suba aqui:
- pacotes de conteúdo gerados a partir dos livros (`odm-*.json`);
- textos, fichas ou tabelas copiados dos livros;
- a exportação do app antigo (tem segredos da campanha e spoilers);
- imagens dos livros.

Esses arquivos ficam fora do controle de versão (ver `.gitignore`). Os testes usam dados de exemplo fictícios.

## Ambiente

- Windows. O repositório fica em `C:\Users\bruno\OneDrive\Área de Trabalho\Projetos\ODM-APP-Remake`.
- O caminho tem acento ("Área") e está no OneDrive. No app antigo isso quebrou o build nativo e o electron-builder. Gere a saída do instalador fora do OneDrive, em `%LOCALAPPDATA%\ODM-build`, e evite dependências nativas que não compilem nesse caminho.
- A referência de empacotamento (Electron + NSIS, Host Mode, firewall) está no ODM-App antigo: `desktop/` e `Docs/ops/`.
