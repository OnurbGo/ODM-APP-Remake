import { mkdirSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { PacoteConteudo } from "@odm/conteudo";
import { PORTA_PADRAO, VERSAO_PROTOCOLO, type RedeMestre } from "@odm/protocolo";
import type { Aleatorio } from "@odm/regras";
import Fastify from "fastify";
import { Repositorio } from "./banco/repositorio";
import { Mesa } from "./mesa/mesa";
import { PAGINA_TESTE, SCRIPT_TESTE } from "./paginaTeste";
import { listarEnderecos } from "./rede";
import { ligarWebSocket } from "./transporte";

export type OpcoesServidor = {
  porta?: number;
  host?: string;
  pastaDados: string;
  pastaMigracoes: string;
  /* Pasta da web já construída. Sem ela, só a API e o WebSocket sobem. */
  pastaWeb?: string;
  tokenMestre: string;
  /* Pacotes válidos da pasta de conteúdo. Sem eles, a mesa abre, mas não há ficha. */
  pacotes?: readonly PacoteConteudo[];
  aleatorio?: Aleatorio;
  agora?: () => number;
  /* Reinício em plena sessão: a campanha que estava aberta continua aberta. */
  retomar?: boolean;
  /* Só em desenvolvimento, em que o Vite serve a página aos jogadores em outra porta. */
  portaWeb?: number;
  firewallDev?: () => RedeMestre["firewallDev"];
};

export class PortaOcupada extends Error {
  readonly codigo = "PORTA_OCUPADA";

  constructor(readonly porta: number) {
    super(`A porta ${porta} já está em uso.`);
  }
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' ws:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

export async function iniciarServidor(opcoes: OpcoesServidor) {
  const porta = opcoes.porta ?? PORTA_PADRAO;
  mkdirSync(opcoes.pastaDados, { recursive: true });
  const repo = new Repositorio(join(opcoes.pastaDados, "odm.sqlite"), opcoes.pastaMigracoes);
  let portaAberta = porta;
  const mesa = new Mesa(repo, {
    tokenMestre: opcoes.tokenMestre,
    aleatorio: opcoes.aleatorio,
    agora: opcoes.agora,
    pacotes: opcoes.pacotes,
    retomar: opcoes.retomar,
    rede: () => ({ porta: opcoes.portaWeb ?? portaAberta, enderecos: listarEnderecos(), firewallDev: opcoes.firewallDev?.() ?? null }),
  });

  const app = Fastify({ logger: false });

  app.addHook("onSend", async (_pedido, resposta) => {
    resposta.header("Content-Security-Policy", CSP);
    resposta.header("X-Content-Type-Options", "nosniff");
    resposta.header("Referrer-Policy", "no-referrer");
  });

  app.get("/api/saude", async () => ({ ok: true, protocolo: VERSAO_PROTOCOLO }));

  app.get("/teste", async (_pedido, resposta) => {
    return resposta.header("Cache-Control", "no-store").type("text/html; charset=utf-8").send(PAGINA_TESTE);
  });
  app.get("/teste.js", async (_pedido, resposta) => {
    return resposta.header("Cache-Control", "no-store").type("text/javascript; charset=utf-8").send(SCRIPT_TESTE);
  });

  /* Bestiário e efeitos: só o mestre, só da máquina dele. O jogador nunca recebe a ficha de criatura. */
  app.get("/api/conteudo-mestre", async (pedido, resposta) => {
    const token = pedido.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const local = pedido.ip === "127.0.0.1" || pedido.ip === "::1" || pedido.ip === "::ffff:127.0.0.1";
    const conteudo = mesa.conteudoDoMestre(token, local);
    if (conteudo === undefined) return resposta.code(401).send({ erro: "nao_autorizado" });
    if (conteudo === null) return resposta.code(404).send({ erro: "sem_conteudo" });
    return conteudo;
  });

  /* Só a parte de ficha, e só para quem está na mesa: criaturas e encontros ficam aqui (especificação, 3.1). */
  app.get("/api/conteudo-ficha", async (pedido, resposta) => {
    const token = pedido.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const local = pedido.ip === "127.0.0.1" || pedido.ip === "::1" || pedido.ip === "::ffff:127.0.0.1";
    const conteudo = mesa.conteudoPara(token, local);
    if (conteudo === undefined) return resposta.code(401).send({ erro: "nao_autorizado" });
    if (conteudo === null) return resposta.code(404).send({ erro: "sem_conteudo" });
    return conteudo;
  });

  /* Arte dos livros (corpo ou rosto em WebP): o token vai no cabeçalho, e a tela monta a imagem por blob. */
  /* Imagem enviada pelo mestre (NPC, "Mostrar", retrato): já vem reduzida pelo navegador, até 600 kB. */
  const TIPOS_DE_IMAGEM = new Set(["image/webp", "image/png", "image/jpeg"]);
  app.post<{ Body: { tipo?: unknown; dados?: unknown } }>("/api/arquivo", { bodyLimit: 1_000_000 }, async (pedido, resposta) => {
    const token = pedido.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const local = pedido.ip === "127.0.0.1" || pedido.ip === "::1" || pedido.ip === "::ffff:127.0.0.1";
    const { tipo, dados } = pedido.body ?? {};
    if (typeof tipo !== "string" || !TIPOS_DE_IMAGEM.has(tipo) || typeof dados !== "string") return resposta.code(400).send({ erro: "arquivo_invalido" });
    const buffer = Buffer.from(dados, "base64");
    if (!buffer.length || buffer.length > 600_000) return resposta.code(413).send({ erro: "arquivo_grande" });
    const id = mesa.salvarArquivo(token, local, tipo, buffer);
    if (id === undefined) return resposta.code(401).send({ erro: "nao_autorizado" });
    if (id === null) return resposta.code(409).send({ erro: "sem_campanha" });
    return { id };
  });

  app.get<{ Params: { tipo: string; id: string } }>("/api/imagem/:tipo/:id", async (pedido, resposta) => {
    const { tipo, id } = pedido.params;
    if (tipo === "arquivo") {
      if (!/^[0-9a-f-]{36}$/.test(id)) return resposta.code(404).send({ erro: "nao_encontrado" });
      const token = pedido.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const local = pedido.ip === "127.0.0.1" || pedido.ip === "::1" || pedido.ip === "::ffff:127.0.0.1";
      const arquivo = mesa.arquivoPara(token, local, id);
      if (arquivo === undefined) return resposta.code(401).send({ erro: "nao_autorizado" });
      if (arquivo === null) return resposta.code(404).send({ erro: "sem_imagem" });
      return resposta.header("Cache-Control", "private, max-age=86400").type(arquivo.tipo).send(arquivo.dados);
    }
    if ((tipo !== "corpo" && tipo !== "rosto") || !/^[a-z0-9.-]{1,120}$/.test(id)) return resposta.code(404).send({ erro: "nao_encontrado" });
    const token = pedido.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const local = pedido.ip === "127.0.0.1" || pedido.ip === "::1" || pedido.ip === "::ffff:127.0.0.1";
    const imagem = mesa.imagemPara(token, local, id, tipo);
    if (imagem === undefined) return resposta.code(401).send({ erro: "nao_autorizado" });
    if (imagem === null) return resposta.code(404).send({ erro: "sem_imagem" });
    return resposta.header("Cache-Control", "private, max-age=86400").type("image/webp").send(imagem);
  });

  if (opcoes.pastaWeb) {
    await app.register(fastifyStatic, { root: opcoes.pastaWeb, wildcard: false });
    app.setNotFoundHandler((pedido, resposta) => {
      if (pedido.method === "GET" && !pedido.url.startsWith("/api/")) return resposta.sendFile("index.html");
      return resposta.code(404).send({ erro: "nao_encontrado" });
    });
  }

  const pararWs = ligarWebSocket(app.server, mesa);

  try {
    await app.listen({ port: porta, host: opcoes.host ?? "0.0.0.0" });
  } catch (erro) {
    await pararWs();
    repo.fechar();
    if ((erro as NodeJS.ErrnoException).code === "EADDRINUSE") throw new PortaOcupada(porta);
    throw erro;
  }

  const endereco = app.server.address();
  if (typeof endereco === "object" && endereco) portaAberta = endereco.port;

  return {
    porta: portaAberta,
    mesa,
    encerrar: async () => {
      await pararWs();
      await app.close();
      repo.fechar();
    },
  };
}

export type ServidorOdm = Awaited<ReturnType<typeof iniciarServidor>>;
