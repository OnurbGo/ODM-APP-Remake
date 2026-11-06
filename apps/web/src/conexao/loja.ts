import { CAMINHO_WS, VERSAO_PROTOCOLO } from "@odm/protocolo/constantes";
import type {
  Credencial,
  EventoVisto,
  MensagemCliente,
  MensagemServidor,
  Participante,
  PedidoEntrada,
  RedeMestre,
} from "@odm/protocolo";
import { create } from "zustand";
import { salvos } from "./armazenamento";

export type Fase =
  | "conectando"
  | "visitante"
  | "aguardando"
  | "recusado"
  | "revogado"
  | "criar_mesa"
  | "dentro"
  | "versao"
  | "negado";

export type EventoRolagem = Extract<EventoVisto, { tipo: "rolagem" }>;

type EstadoMestre = { codigo: string; pedidos: PedidoEntrada[]; rede: RedeMestre };

type Estado = {
  fase: Fase;
  /* A conexão caiu, mas a tela continua onde estava enquanto tenta voltar. */
  reconectando: boolean;
  mesaAberta: boolean;
  erro: string | null;
  aviso: string | null;
  eu: Participante | null;
  mesa: { nome: string } | null;
  participantes: Participante[];
  eventos: EventoVisto[];
  mestre: EstadoMestre | null;
  rolagem: EventoRolagem | null;
};

const INICIAL: Estado = {
  fase: "conectando",
  reconectando: false,
  mesaAberta: false,
  erro: null,
  aviso: null,
  eu: null,
  mesa: null,
  participantes: [],
  eventos: [],
  mestre: null,
  rolagem: null,
};

export const useLoja = create<Estado>(() => INICIAL);

const definir = useLoja.setState;
const ler = useLoja.getState;

const ESPERAS_MS = [500, 1000, 2000, 4000, 8000];
const FECHOU_DE_VEZ = new Set([4001, 4002, 4003]);

let socket: WebSocket | null = null;
let credencial: Credencial = { tipo: "visitante" };
let tentativas = 0;
let pedidoEmEspera: { segredo: string; pedidoId: string } | null = null;
/* Só este dispositivo mostra a animação: o mesmo jogador pode estar em dois. */
let rolagensPedidas = 0;

function enviar(mensagem: MensagemCliente) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensagem));
}

function dizerOla() {
  const vistos = credencial.tipo === "mestre" || credencial.tipo === "jogador" ? (ler().eventos.at(-1)?.n ?? 0) : 0;
  enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial, vistos });
}

function identificar(nova: Credencial) {
  credencial = nova;
  dizerOla();
}

/* Junta o que chegou com o que já estava: ao reconectar, vem só o que faltava. */
function juntarEventos(atuais: EventoVisto[], novos: EventoVisto[]) {
  if (!novos.length) return atuais;
  const ultimo = atuais.at(-1)?.n ?? 0;
  return [...atuais, ...novos.filter((e) => e.n > ultimo)];
}

function tratar(mensagem: MensagemServidor) {
  switch (mensagem.t) {
    case "visitante":
      definir((e) => ({ mesaAberta: mensagem.mesaAberta, fase: e.fase === "recusado" ? e.fase : "visitante" }));
      return;
    case "sem_mesa":
      definir({ fase: "criar_mesa" });
      return;
    case "bem_vindo":
      definir((e) => ({
        fase: "dentro",
        erro: null,
        aviso: null,
        eu: mensagem.eu,
        mesa: mensagem.mesa,
        participantes: mensagem.participantes,
        eventos: juntarEventos(e.eu?.id === mensagem.eu.id ? e.eventos : [], mensagem.eventos),
      }));
      return;
    case "estado_mestre":
      definir({ mestre: { codigo: mensagem.codigo, pedidos: mensagem.pedidos, rede: mensagem.rede } });
      return;
    case "entrada_aguardando":
      pedidoEmEspera = { pedidoId: mensagem.pedidoId, segredo: mensagem.segredo };
      salvos.guardarPedido(pedidoEmEspera);
      credencial = { tipo: "pedido", ...pedidoEmEspera };
      definir({ fase: "aguardando", erro: null });
      return;
    case "entrada_aprovada":
      salvos.guardarToken(mensagem.token);
      salvos.guardarPedido(null);
      pedidoEmEspera = null;
      identificar({ tipo: "jogador", token: mensagem.token });
      return;
    case "entrada_recusada":
      salvos.guardarPedido(null);
      pedidoEmEspera = null;
      credencial = { tipo: "visitante" };
      definir({ fase: "recusado" });
      return;
    case "acesso_revogado":
      salvos.guardarToken(null);
      credencial = { tipo: "visitante" };
      definir({ ...INICIAL, fase: "revogado" });
      return;
    case "presenca":
      definir({ participantes: mensagem.participantes });
      return;
    case "evento": {
      const { evento } = mensagem;
      definir((e) => ({ eventos: juntarEventos(e.eventos, [evento]) }));
      if (evento.tipo === "rolagem" && evento.autorId === ler().eu?.id && rolagensPedidas > 0) {
        rolagensPedidas -= 1;
        if (ler().eu?.papel !== "mestre") definir({ rolagem: evento });
      }
      return;
    }
    case "erro":
      tratarErro(mensagem);
      return;
  }
}

function tratarErro(mensagem: Extract<MensagemServidor, { t: "erro" }>) {
  switch (mensagem.codigo) {
    case "versao_incompativel":
      definir({ fase: "versao", erro: mensagem.mensagem });
      return;
    case "nao_autorizado":
      if (credencial.tipo === "mestre") definir({ fase: "negado", erro: mensagem.mensagem });
      else definir({ erro: mensagem.mensagem });
      return;
    case "token_invalido":
      salvos.guardarToken(null);
      definir({ aviso: mensagem.mensagem });
      identificar({ tipo: "visitante" });
      return;
    case "pedido_inexistente":
      if (credencial.tipo === "pedido") {
        salvos.guardarPedido(null);
        pedidoEmEspera = null;
        definir({ aviso: mensagem.mensagem });
        identificar({ tipo: "visitante" });
      } else {
        definir({ erro: mensagem.mensagem });
      }
      return;
    default:
      definir({ erro: mensagem.mensagem });
  }
}

function abrir() {
  const protocolo = location.protocol === "https:" ? "wss" : "ws";
  const novo = new WebSocket(`${protocolo}://${location.host}${CAMINHO_WS}`);
  socket = novo;

  novo.onopen = () => {
    tentativas = 0;
    definir({ reconectando: false });
    dizerOla();
  };
  novo.onmessage = (e) => tratar(JSON.parse(String(e.data)) as MensagemServidor);
  novo.onclose = (e) => {
    if (socket !== novo || FECHOU_DE_VEZ.has(e.code)) return;
    definir({ reconectando: true });
    const espera = ESPERAS_MS[Math.min(tentativas, ESPERAS_MS.length - 1)];
    tentativas += 1;
    window.setTimeout(abrir, espera);
  };
}

async function credencialInicial(): Promise<Credencial> {
  if (window.odmDesktop) return { tipo: "mestre", token: await window.odmDesktop.tokenMestre() };

  /* Só em desenvolvimento, sem o Electron: o servidor imprime este endereço no terminal. */
  if (import.meta.env.DEV) {
    const url = new URL(location.href);
    const noEndereco = url.searchParams.get("tokenMestre");
    if (noEndereco) {
      salvos.guardarTokenMestreDev(noEndereco);
      url.searchParams.delete("tokenMestre");
      history.replaceState(null, "", url);
    }
    const token = salvos.tokenMestreDev();
    if (token) return { tipo: "mestre", token };
  }

  const pedido = salvos.pedido();
  if (pedido) return { tipo: "pedido", ...pedido };
  const token = salvos.token();
  return token ? { tipo: "jogador", token } : { tipo: "visitante" };
}

export async function conectar() {
  credencial = await credencialInicial();
  abrir();
}

export const acoes = {
  pedirEntrada(nome: string, codigo: string) {
    definir({ erro: null, aviso: null });
    enviar({ t: "pedir_entrada", nome, codigo });
  },
  voltarParaEntrada() {
    definir({ ...INICIAL, fase: "conectando" });
    identificar({ tipo: "visitante" });
  },
  /* Revogado: o servidor fechou a conexão, então recomeça do zero. */
  recomecar() {
    definir({ ...INICIAL, fase: "conectando" });
    credencial = { tipo: "visitante" };
    abrir();
  },
  criarMesa: (nome: string) => enviar({ t: "criar_mesa", nome }),
  rolar(bonus: number) {
    rolagensPedidas += 1;
    enviar({ t: "rolar", bonus });
  },
  fecharRolagem: () => definir({ rolagem: null }),
  limparErro: () => definir({ erro: null }),
  aprovar: (pedidoId: string, vincularA?: string) => enviar({ t: "aprovar_entrada", pedidoId, vincularA }),
  recusar: (pedidoId: string) => enviar({ t: "recusar_entrada", pedidoId }),
  revogar: (participanteId: string) => enviar({ t: "revogar_acesso", participanteId }),
  trocarCodigo: () => enviar({ t: "trocar_codigo" }),
};
