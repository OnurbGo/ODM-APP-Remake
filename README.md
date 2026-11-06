# ODM App Remake

App de mesa para o RPG **Olho da Morte**: fichas, combate e ferramentas do mestre para jogar em LAN (ou Hamachi/Radmin).

- O app do mestre é o servidor; os jogadores entram pelo navegador ou pelo app.
- O conteúdo do sistema vem de pacotes gerados a partir dos livros, distribuídos à parte.

Especificação: [`docs/especificacao.md`](docs/especificacao.md). Decisões visuais: [`docs/decisoes-visuais.md`](docs/decisoes-visuais.md).

Em desenvolvimento.

## Estrutura

| Pasta | O que é |
|---|---|
| `apps/desktop` | Electron: tela inicial, janela do mestre e servidor em `utilityProcess` |
| `apps/servidor` | HTTP + WebSocket + SQLite (`node:sqlite`, sem módulo nativo) |
| `apps/web` | Interface do mestre e do jogador |
| `pacotes/regras` | Motor de regras, sem I/O |
| `pacotes/protocolo` | Mensagens e eventos (Zod) |
| `pacotes/conteudo` | Formato dos pacotes de conteúdo |
| `pacotes/estilo` | Tokens, temas, componentes e animações |
| `prototipos` | Referência da fase 1; cada tela sai quando a real a substituir |

## Comandos

Instalar as dependências e o Electron (o binário não vem no `npm install`):

```bash
npm install
```

```bash
npm run instalar-electron --workspace @odm/desktop
```

Desenvolver no navegador (servidor + web). O terminal mostra o endereço com o token do mestre:

```bash
npm run dev
```

Abrir o app do Electron:

```bash
npm run desktop
```

Conferir tudo:

```bash
npm run testar
```

```bash
npm run tipos
```

```bash
npm run build
```

```bash
npm run orcamento
```

Empacotar em pasta, fora do OneDrive, em `%LOCALAPPDATA%\ODM-build\remake`:

```bash
npm run empacotar
```

O banco de desenvolvimento fica em `%LOCALAPPDATA%\ODM-dev`, nunca dentro do repositório.
