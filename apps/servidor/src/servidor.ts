import { mkdirSync } from "node:fs";
import { join } from "node:path";
import fastifyStatic from "@fastify/static";
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
    rede: () => ({ porta: portaAberta, enderecos: listarEnderecos() }),
  });

  const app = Fastify({ logger: false });

  app.addHook("onSend", async (_pedido, resposta) => {
    resposta.header("Content-Security-Policy", CSP);
    resposta.header("X-Content-Type-Options", "nosniff");
    resposta.header("Referrer-Policy", "no-referrer");
  });

  app.get("/api/saude", async () => ({ ok: true, protocolo: VERSAO_PROTOCOLO }));

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
