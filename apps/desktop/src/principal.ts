import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { app, BrowserWindow, ipcMain, protocol, session, utilityProcess, type IpcMainInvokeEvent, type UtilityProcess } from "electron";
import { lerConfiguracoes, salvarConfiguracoes } from "./configuracoes";
import { origemDaMesa, origemDe, portaValida } from "./endereco";
import { consultarFirewall, liberarFirewall } from "@odm/servidor/firewall";
import type { MensagemFilho } from "./servidorFilho";

/* Pasta própria: "ODM" é a do app antigo, que continua instalado como histórico. */
const empacotado = app.isPackaged;
app.setPath("userData", join(app.getPath("appData"), empacotado ? "OlhoDaMorte" : "OlhoDaMorte-dev"));

const ORIGEM_INICIO = "odm://app";
const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};
const MAX_REINICIOS = 3;
const ESPERA_ENCERRAR_MS = 3000;

const pastaUsuario = app.getPath("userData");
const pastaRecursos = empacotado ? process.resourcesPath : join(__dirname, "..", "..");
const pastaWeb = empacotado ? join(pastaRecursos, "web") : join(pastaRecursos, "web", "dist");
const pastaMigracoes = empacotado ? join(pastaRecursos, "migracoes") : join(pastaRecursos, "servidor", "migracoes");

/* Vale só enquanto o app está aberto, e nunca passa pela rede nem vai para o disco. */
const tokenMestre = randomBytes(32).toString("base64url");

type Resultado = { ok: true } | { ok: false; motivo: "porta_ocupada"; porta: number } | { ok: false; motivo: "falha"; mensagem: string };

let janelaInicio: BrowserWindow | null = null;
let janelaMestre: BrowserWindow | null = null;
let filho: UtilityProcess | null = null;
let portaAberta: number | null = null;
let reinicios = 0;
let encerrando = false;

protocol.registerSchemesAsPrivileged([{ scheme: "odm", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);

const PREFERENCIAS = { contextIsolation: true, sandbox: true, nodeIntegration: false, webviewTag: false } as const;
/* O .ico fica ao lado do código; no empacotado, o executável já traz o mesmo ícone. */
const ICONE = join(__dirname, "icone.ico");

/* Cada janela fica na própria origem: link externo, redirecionamento e pop-up não saem dela. */
function prenderNaOrigem(janela: BrowserWindow, origem: string) {
  const conteudo = janela.webContents;
  conteudo.on("will-navigate", (e, url) => {
    if (origemDe(url) !== origem) e.preventDefault();
  });
  conteudo.on("will-redirect", (e, url) => {
    if (origemDe(url) !== origem) e.preventDefault();
  });
  conteudo.setWindowOpenHandler(() => ({ action: "deny" }));
}

function exigirOrigem(evento: IpcMainInvokeEvent, origem: string) {
  return origemDe(evento.senderFrame?.url ?? "") === origem;
}

function origemMestre() {
  return portaAberta === null ? null : `http://127.0.0.1:${portaAberta}`;
}

function aoSairFilho(processo: UtilityProcess, porta: number) {
  processo.once("exit", () => {
    if (filho !== processo) return;
    filho = null;
    if (encerrando || portaAberta === null) return;
    /* Queda em plena sessão: reinicia, e as telas abertas reconectam sozinhas. */
    reinicios += 1;
    if (reinicios > MAX_REINICIOS) {
      console.error("O servidor caiu repetidas vezes; não será reiniciado de novo.");
      return;
    }
    void subirServidor(porta, true);
  });
}

/* Retomar só depois de uma queda: abrir o app sempre começa pela lista de campanhas. */
function subirServidor(porta: number, retomar = false) {
  return new Promise<Resultado>((resolver) => {
    const processo = utilityProcess.fork(join(__dirname, "servidorFilho.cjs"), [], {
      serviceName: "ODM Servidor",
      stdio: "inherit",
      env: {
        ...process.env,
        ODM_PORTA: String(porta),
        ODM_PASTA_DADOS: join(pastaUsuario, "dados"),
        ODM_PASTA_WEB: pastaWeb,
        ODM_PASTA_MIGRACOES: pastaMigracoes,
        ODM_TOKEN_MESTRE: tokenMestre,
        ODM_RETOMAR: retomar ? "1" : "0",
      },
    });
    filho = processo;
    aoSairFilho(processo, porta);

    processo.once("message", (mensagem: MensagemFilho) => {
      if (mensagem.tipo === "pronto") {
        portaAberta = mensagem.porta;
        resolver({ ok: true });
      } else if (mensagem.tipo === "porta_ocupada") {
        portaAberta = null;
        resolver({ ok: false, motivo: "porta_ocupada", porta: mensagem.porta });
      } else {
        portaAberta = null;
        resolver({ ok: false, motivo: "falha", mensagem: `A mesa não abriu: ${mensagem.mensagem}` });
      }
    });
  });
}

function abrirJanelaMestre() {
  const origem = origemMestre();
  if (!origem) return;
  if (janelaMestre) {
    janelaMestre.focus();
    return;
  }
  const janela = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: "#0f0c09",
    autoHideMenuBar: true,
    title: "Olho da Morte",
    icon: ICONE,
    webPreferences: { ...PREFERENCIAS, preload: join(__dirname, "preloadMestre.cjs") },
  });
  prenderNaOrigem(janela, origem);
  janela.on("closed", () => {
    janelaMestre = null;
    app.quit();
  });
  janelaMestre = janela;
  void janela.loadURL(`${origem}/`);
}

async function abrirMesa(porta: number): Promise<Resultado> {
  if (portaAberta !== null) {
    abrirJanelaMestre();
    return { ok: true };
  }
  const resultado = await subirServidor(porta);
  if (resultado.ok) {
    salvarConfiguracoes(pastaUsuario, { porta });
    abrirJanelaMestre();
    janelaInicio?.close();
  }
  return resultado;
}

function abrirJanelaJogador(origem: string) {
  /* Sessão própria e sem preload: a página remota é de outra máquina e não recebe nenhuma ponte. */
  const sessao = session.fromPartition("persist:mesa-remota");
  const janela = new BrowserWindow({
    width: 420,
    height: 800,
    backgroundColor: "#0f0c09",
    autoHideMenuBar: true,
    title: "Olho da Morte",
    icon: ICONE,
    webPreferences: { ...PREFERENCIAS, session: sessao },
  });
  prenderNaOrigem(janela, origem);
  void janela.loadURL(`${origem}/`);
  janelaInicio?.close();
}

function abrirJanelaInicio() {
  const janela = new BrowserWindow({
    width: 860,
    height: 640,
    minWidth: 400,
    minHeight: 560,
    backgroundColor: "#0f0c09",
    autoHideMenuBar: true,
    title: "Olho da Morte",
    icon: ICONE,
    webPreferences: { ...PREFERENCIAS, preload: join(__dirname, "preloadInicio.cjs") },
  });
  prenderNaOrigem(janela, ORIGEM_INICIO);
  janela.on("closed", () => {
    janelaInicio = null;
  });
  janelaInicio = janela;
  void janela.loadURL(`${ORIGEM_INICIO}/inicio.html`);
}

function servirTelaInicial() {
  protocol.handle("odm", (pedido) => {
    const caminho = decodeURIComponent(new URL(pedido.url).pathname);
    const alvo = normalize(join(pastaWeb, caminho));
    if (!alvo.startsWith(pastaWeb + sep)) return new Response("Proibido", { status: 403 });
    return readFile(alvo).then(
      (dados) => new Response(dados, { headers: { "content-type": TIPOS[extname(alvo)] ?? "application/octet-stream" } }),
      () => new Response("Não encontrado", { status: 404 }),
    );
  });
}

function registrarIpc() {
  ipcMain.handle("inicio:abrir-mesa", (e) => {
    if (!exigirOrigem(e, ORIGEM_INICIO)) throw new Error("Origem não autorizada");
    return abrirMesa(lerConfiguracoes(pastaUsuario).porta);
  });
  ipcMain.handle("inicio:trocar-porta", (e, porta: unknown) => {
    if (!exigirOrigem(e, ORIGEM_INICIO)) throw new Error("Origem não autorizada");
    if (!portaValida(porta)) return { ok: false, motivo: "falha", mensagem: "Porta inválida." } satisfies Resultado;
    return abrirMesa(porta);
  });
  ipcMain.handle("inicio:entrar", (e, endereco: unknown) => {
    if (!exigirOrigem(e, ORIGEM_INICIO)) throw new Error("Origem não autorizada");
    const origem = typeof endereco === "string" ? origemDaMesa(endereco) : null;
    if (!origem) return { ok: false, mensagem: "Endereço inválido. Use algo como 192.168.0.10:47821." };
    abrirJanelaJogador(origem);
    return { ok: true };
  });
  ipcMain.handle("mestre:token", (e) => {
    const origem = origemMestre();
    if (!origem || !exigirOrigem(e, origem)) throw new Error("Origem não autorizada");
    return tokenMestre;
  });

  /* O caminho do programa vem daqui, nunca da página: a ponte só diz "libere este app". */
  const exigirMestre = (e: IpcMainInvokeEvent) => {
    const origem = origemMestre();
    if (!origem || !exigirOrigem(e, origem)) throw new Error("Origem não autorizada");
  };
  ipcMain.handle("mestre:firewall-estado", (e) => {
    exigirMestre(e);
    return consultarFirewall(process.execPath);
  });
  ipcMain.handle("mestre:firewall-liberar", (e) => {
    exigirMestre(e);
    return liberarFirewall(process.execPath);
  });
}

function configurarPermissoes() {
  /* Só copiar para a área de transferência, e só na janela do mestre. */
  const permitida = (permissao: string, origem: string) =>
    permissao === "clipboard-sanitized-write" && origem === `${origemMestre()}/`;
  session.defaultSession.setPermissionRequestHandler((conteudo, permissao, responder) => {
    responder(permitida(permissao, `${origemDe(conteudo.getURL())}/`));
  });
  session.defaultSession.setPermissionCheckHandler((_conteudo, permissao, origem) => permitida(permissao, origem));
  session.fromPartition("persist:mesa-remota").setPermissionRequestHandler((_c, _p, responder) => responder(false));
}

if (!app.requestSingleInstanceLock()) {
  /* Sem isto, abrir o app duas vezes daria um falso aviso de porta ocupada. */
  app.quit();
} else {
  app.on("second-instance", () => {
    const janela = janelaMestre ?? janelaInicio;
    if (janela) {
      if (janela.isMinimized()) janela.restore();
      janela.focus();
    }
  });

  app.on("window-all-closed", () => {
    app.quit();
  });

  app.on("will-quit", (e) => {
    if (encerrando || !filho) return;
    /* Espera o servidor fechar o banco antes de sair. */
    e.preventDefault();
    encerrando = true;
    const processo = filho;
    const sair = () => app.quit();
    processo.once("exit", sair);
    processo.postMessage({ tipo: "encerrar" });
    setTimeout(() => {
      processo.kill();
      sair();
    }, ESPERA_ENCERRAR_MS).unref();
  });

  void app.whenReady().then(() => {
    servirTelaInicial();
    registrarIpc();
    configurarPermissoes();
    abrirJanelaInicio();
  });
}
