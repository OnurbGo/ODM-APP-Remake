import type { IncomingMessage, Server } from "node:http";
import { isIP } from "node:net";
import type { Duplex } from "node:stream";
import { CAMINHO_WS, MensagemCliente, type MensagemServidor } from "@odm/protocolo";
import { WebSocket, WebSocketServer } from "ws";
import type { Canal, Mesa } from "./mesa/mesa";

const INTERVALO_PULSO_MS = 30_000;
const TAMANHO_MAXIMO_MENSAGEM = 64 * 1024;
const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

function nomeDoHost(host: string) {
  try {
    return new URL(`http://${host}`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return null;
  }
}

/* Só IP ou localhost: um domínio de fora apontando para cá (DNS rebinding) não passa.
   Um site de fora aberto no navegador do mestre tem Origin diferente e também não passa. */
export function conexaoPermitida(host: string | undefined, origem: string | undefined) {
  const nome = host ? nomeDoHost(host) : null;
  if (!nome || (nome !== "localhost" && !isIP(nome))) return false;
  if (origem === undefined) return true;
  try {
    return new URL(origem).host === host;
  } catch {
    return false;
  }
}

type Vivo = WebSocket & { respondeu?: boolean };

export function ligarWebSocket(http: Server, mesa: Mesa) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: TAMANHO_MAXIMO_MENSAGEM });

  const aoAtualizar = (pedido: IncomingMessage, socket: Duplex, cabeca: Buffer) => {
    const caminho = pedido.url?.split("?")[0];
    if (caminho !== CAMINHO_WS || !conexaoPermitida(pedido.headers.host, pedido.headers.origin)) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    wss.handleUpgrade(pedido, socket, cabeca, (ws) => wss.emit("connection", ws, pedido));
  };
  http.on("upgrade", aoAtualizar);

  wss.on("connection", (ws: Vivo, pedido: IncomingMessage) => {
    const ip = pedido.socket.remoteAddress ?? "desconhecido";
    const enviar = (mensagem: MensagemServidor) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(mensagem));
    };
    const canal: Canal = { ip, local: LOOPBACK.has(ip), enviar, fechar: (codigo, motivo) => ws.close(codigo, motivo) };
    const conexao = mesa.conectar(canal);
    ws.respondeu = true;

    ws.on("pong", () => {
      ws.respondeu = true;
    });
    ws.on("message", (bruto) => {
      let json: unknown;
      try {
        json = JSON.parse(bruto.toString());
      } catch {
        json = null;
      }
      const lida = MensagemCliente.safeParse(json);
      if (!lida.success) {
        enviar({ t: "erro", codigo: "mensagem_invalida", mensagem: "Mensagem inválida." });
        return;
      }
      mesa.receber(conexao, lida.data);
    });
    ws.on("close", () => mesa.desconectar(conexao));
    ws.on("error", () => ws.terminate());
  });

  /* Celular com a tela bloqueada some sem avisar: sem pulso, ele cairia como "online" para sempre. */
  const pulso = setInterval(() => {
    for (const cliente of wss.clients as Set<Vivo>) {
      if (cliente.respondeu === false) {
        cliente.terminate();
        continue;
      }
      cliente.respondeu = false;
      cliente.ping();
    }
    mesa.limparVencidos();
  }, INTERVALO_PULSO_MS);
  pulso.unref();

  return () =>
    new Promise<void>((resolver) => {
      clearInterval(pulso);
      http.off("upgrade", aoAtualizar);
      for (const cliente of wss.clients) cliente.terminate();
      wss.close(() => resolver());
    });
}
