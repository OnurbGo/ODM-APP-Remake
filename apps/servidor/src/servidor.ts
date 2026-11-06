import { mkdirSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
import type { PacoteConteudo } from "@odm/conteudo";
import { PORTA_PADRAO, VERSAO_PROTOCOLO } from "@odm/protocolo";
import type { Aleatorio } from "@odm/regras";
import Fastify from "fastify";
import { Repositorio } from "./banco/repositorio";
import { Mesa } from "./mesa/mesa";
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
  "img-src 'self' data:",
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
    rede: () => ({ porta: portaAberta, enderecos: listarEnderecos() }),
  });

  const app = Fastify({ logger: false });

  app.addHook("onSend", async (_pedido, resposta) => {
    resposta.header("Content-Security-Policy", CSP);
    resposta.header("X-Content-Type-Options", "nosniff");
    resposta.header("Referrer-Policy", "no-referrer");
  });

  app.get("/api/saude", async () => ({ ok: true, protocolo: VERSAO_PROTOCOLO }));

  /* Só a parte de ficha, e só para quem está na mesa: criaturas e encontros ficam aqui (especificação, 3.1). */
  app.get("/api/conteudo-ficha", async (pedido, resposta) => {
    const token = pedido.headers.authorization?.replace(/^Bearer /, "") ?? "";
    const local = pedido.ip === "127.0.0.1" || pedido.ip === "::1" || pedido.ip === "::ffff:127.0.0.1";
    const conteudo = mesa.conteudoPara(token, local);
    if (conteudo === undefined) return resposta.code(401).send({ erro: "nao_autorizado" });
    if (conteudo === null) return resposta.code(404).send({ erro: "sem_conteudo" });
    return conteudo;
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
