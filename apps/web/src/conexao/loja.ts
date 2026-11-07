import { CAMINHO_WS, VERSAO_PROTOCOLO } from "@odm/protocolo/constantes";
import type {
  Credencial,
  EstadoCombate,
  EventoVisto,
  FichaRascunho,
  JogadorConhecido,
  Kit,
  MensagemCliente,
  MensagemServidor,
  OpcoesCampanha,
  Operacao,
  PacoteDisponivel,
  Participante,
  PedidoEntrada,
  Alvo,
  AlvoDoTeste,
  FonteDeAtaque,
  ModoRolagem,
  OpcoesDeAtaque,
  Reacao,
  OpcaoDeTeste,
  PedidoTeste,
  Personagem,
  RedeMestre,
  RespostaTeste,
  RolagemDeCombate,
  ResumoCampanha,
} from "@odm/protocolo";
import { create } from "zustand";
import { salvos } from "./armazenamento";

export type Fase =
  | "conectando"
  | "visitante"
  | "aguardando"
  | "recusado"
  | "revogado"
  | "campanhas"
  | "dentro"
  | "versao"
  | "negado";

export type EventoRolagem = Extract<EventoVisto, { tipo: "rolagem" }>;
export type EventoResultadoTeste = Extract<EventoVisto, { tipo: "teste_resultado" }>;

type EstadoMestre = { codigo: string; pedidos: PedidoEntrada[]; jogadores: JogadorConhecido[]; rede: RedeMestre; kits: Kit[] };

type Estado = {
  fase: Fase;
  /* A conexão caiu, mas a tela continua onde estava enquanto tenta voltar. */
  reconectando: boolean;
  mesaAberta: boolean;
  /* Este aparelho tem lugar em outra campanha, que não é a aberta agora. */
  deOutraCampanha: boolean;
  /* Só o mestre, enquanto nenhuma campanha está aberta. */
  campanhas: { lista: ResumoCampanha[]; pacotes: PacoteDisponivel[] } | null;
  erro: string | null;
  aviso: string | null;
  eu: Participante | null;
  mesa: { id: string; nome: string; opcoes: OpcoesCampanha; conteudo: boolean } | null;
  participantes: Participante[];
  eventos: EventoVisto[];
  mestre: EstadoMestre | null;
  rolagem: EventoRolagem | null;
  personagens: Personagem[];
  /* O combate como este aparelho pode ver (o jogador não recebe PV de criatura nem o baralho). */
  combate: EstadoCombate | null;
  /* Rolagens até esta posição saem da tela. O histórico fica: o desfazer depende dele. */
  rolagensLimpasAte: number;
  /* O resultado de um teste do personagem deste aparelho, para a animação do d20. */
  resultadoTeste: EventoResultadoTeste | null;
  /* O ataque deste aparelho, para a mesma animação do d20 (sem a Defesa da criatura). */
  rolagemCombate: { id: string; rolagem: RolagemDeCombate } | null;
  rolagemRapida: boolean;
};

/* Sem a rolagem rápida: é do aparelho e sobrevive a trocar de mesa ou recomeçar. */
const INICIAL: Omit<Estado, "rolagemRapida"> = {
  fase: "conectando",
  reconectando: false,
  mesaAberta: false,
  deOutraCampanha: false,
  campanhas: null,
  erro: null,
  aviso: null,
  eu: null,
  mesa: null,
  participantes: [],
  eventos: [],
  mestre: null,
  rolagem: null,
  personagens: [],
  combate: null,
  rolagensLimpasAte: 0,
  resultadoTeste: null,
  rolagemCombate: null,
};

/* O que é da campanha: ao trocar, nada dela fica na tela nem na contagem do registro. */
const SEM_MESA = {
  eu: null,
  mesa: null,
  participantes: [],
  eventos: [],
  mestre: null,
  rolagem: null,
  personagens: [],
  combate: null,
  rolagensLimpasAte: 0,
  resultadoTeste: null,
  rolagemCombate: null,
  deOutraCampanha: false,
  campanhas: null,
  erro: null,
} satisfies Partial<Estado>;

export const useLoja = create<Estado>(() => ({ ...INICIAL, rolagemRapida: salvos.rolagemRapida() }));

const definir = useLoja.setState;
const ler = useLoja.getState;

const ESPERAS_MS = [500, 1000, 2000, 4000, 8000];
const FECHOU_DE_VEZ = new Set([4001, 4002, 4003]);

let socket: WebSocket | null = null;
let credencial: Credencial = { tipo: "visitante" };
/* O token que entrou na campanha aberta, para os pedidos HTTP e para esquecer se o mestre tirar da mesa. */
let tokenAtual: string | null = null;
let tentativas = 0;
let pedidoEmEspera: { segredo: string; pedidoId: string } | null = null;
/* Só este dispositivo mostra a animação: o mesmo jogador pode estar em dois. */
let rolagensPedidas = 0;

function enviar(mensagem: MensagemCliente) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(mensagem));
}

function dizerOla() {
  const vistos = credencial.tipo === "mestre" || credencial.tipo === "jogador" ? (ler().eventos.at(-1)?.n ?? 0) : 0;
  enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial, vistos, vistosDe: ler().eu?.id });
}

/* Quem já foi aprovado em alguma campanha continua se apresentando como jogador. */
function credencialDoAparelho(): Credencial {
  const tokens = salvos.tokens();
  return tokens.length ? { tipo: "jogador", tokens } : { tipo: "visitante" };
}

function identificar(nova: Credencial) {
  credencial = nova;
  dizerOla();
}

/* Para os pedidos HTTP: o conteúdo da ficha pede o mesmo token da mesa. */
export const tokenDaSessao = () => (credencial.tipo === "mestre" ? credencial.token : tokenAtual);

/* Junta o que chegou com o que já estava: ao reconectar, vem só o que faltava. */
function juntarEventos(atuais: EventoVisto[], novos: EventoVisto[]) {
  if (!novos.length) return atuais;
  const ultimo = atuais.at(-1)?.n ?? 0;
  return [...atuais, ...novos.filter((e) => e.n > ultimo)];
}

function tratar(mensagem: MensagemServidor) {
  switch (mensagem.t) {
    case "visitante":
      definir((e) => ({ mesaAberta: mensagem.mesaAberta, deOutraCampanha: mensagem.deOutraCampanha, fase: e.fase === "recusado" ? e.fase : "visitante" }));
      return;
    case "campanhas":
      definir({ fase: "campanhas", campanhas: { lista: mensagem.lista, pacotes: mensagem.pacotes } });
      return;
    case "mesa_mudou":
      tokenAtual = null;
      definir({ ...SEM_MESA, fase: "conectando" });
      dizerOla();
      return;
    case "bem_vindo":
      tokenAtual = credencial.tipo === "jogador" && mensagem.tokenIndice !== null ? (credencial.tokens[mensagem.tokenIndice] ?? null) : null;
      definir((e) => ({
        fase: "dentro",
        erro: null,
        aviso: null,
        campanhas: null,
        deOutraCampanha: false,
        eu: mensagem.eu,
        mesa: mensagem.mesa,
        participantes: mensagem.participantes,
        personagens: mensagem.personagens,
        eventos: juntarEventos(e.eu?.id === mensagem.eu.id ? e.eventos : [], mensagem.eventos),
      }));
      return;
    case "personagem":
      definir((e) => ({
        personagens: e.personagens.some((p) => p.id === mensagem.personagem.id)
          ? e.personagens.map((p) => (p.id === mensagem.personagem.id ? mensagem.personagem : p))
          : [...e.personagens, mensagem.personagem],
      }));
      return;
    case "personagem_removido":
      definir((e) => ({ personagens: e.personagens.filter((p) => p.id !== mensagem.personagemId) }));
      return;
    case "combate":
      definir({ combate: mensagem.combate });
      return;
    case "opcoes_campanha":
      definir((e) => ({ mesa: e.mesa ? { ...e.mesa, opcoes: mensagem.opcoes } : null }));
      return;
    case "estado_mestre":
      definir({
        mestre: { codigo: mensagem.codigo, pedidos: mensagem.pedidos, jogadores: mensagem.jogadores, rede: mensagem.rede, kits: mensagem.kits },
      });
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
      identificar(credencialDoAparelho());
      return;
    case "entrada_recusada":
      salvos.guardarPedido(null);
      pedidoEmEspera = null;
      credencial = credencialDoAparelho();
      definir({ fase: "recusado" });
      return;
    case "acesso_revogado":
      if (tokenAtual) salvos.esquecerToken(tokenAtual);
      tokenAtual = null;
      credencial = credencialDoAparelho();
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
      /* O mestre vê o resultado na hora, no cartão; só o jogador do personagem vê o d20 rolar (8.5). */
      const eu = ler().eu;
      if (evento.tipo === "teste_resultado" && eu?.papel !== "mestre" && evento.dados.donoId === eu?.id && evento.dados.estado === "rolado") {
        definir({ resultadoTeste: evento });
      }
      if (evento.tipo === "combate_visto" && evento.dados.rolagem && eu && evento.dados.rolagem.para.includes(eu.id)) {
        definir({ rolagemCombate: { id: evento.id, rolagem: evento.dados.rolagem } });
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
      salvos.esquecerTokens();
      tokenAtual = null;
      definir({ aviso: mensagem.mensagem });
      identificar({ tipo: "visitante" });
      return;
    case "pedido_inexistente":
      if (credencial.tipo === "pedido") {
        salvos.guardarPedido(null);
        pedidoEmEspera = null;
        definir({ aviso: mensagem.mensagem });
        identificar(credencialDoAparelho());
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
  return credencialDoAparelho();
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
    identificar(credencialDoAparelho());
  },
  /* Revogado: o servidor fechou a conexão, então recomeça do zero. */
  recomecar() {
    definir({ ...INICIAL, fase: "conectando" });
    credencial = credencialDoAparelho();
    abrir();
  },
  criarCampanha(nome: string, pacotes: string[], opcoes: OpcoesCampanha) {
    definir({ erro: null });
    enviar({ t: "criar_campanha", nome, pacotes, opcoes });
  },
  abrirCampanha(campanhaId: string) {
    definir({ erro: null });
    enviar({ t: "abrir_campanha", campanhaId });
  },
  fecharCampanha: () => enviar({ t: "fechar_campanha" }),
  rolar(bonus: number) {
    rolagensPedidas += 1;
    enviar({ t: "rolar", bonus });
  },
  fecharRolagem: () => definir({ rolagem: null }),
  fecharResultadoTeste: () => definir({ resultadoTeste: null }),
  fecharRolagemCombate: () => definir({ rolagemCombate: null }),
  definirRolagemRapida(ligada: boolean) {
    salvos.guardarRolagemRapida(ligada);
    definir({ rolagemRapida: ligada });
  },

  /* Testes (especificação 8): o servidor monta a conta e rola. */
  pedirTeste: (pedido: PedidoTeste) => enviar({ t: "pedir_teste", pedido }),
  responderTeste: (resposta: RespostaTeste) => enviar({ t: "responder_teste", resposta }),
  recusarTeste: (pedidoId: string, personagemId: string) => enviar({ t: "recusar_teste", pedidoId, personagemId }),
  decidirTeste: (pedidoId: string, personagemId: string, acao: "sucesso" | "falha" | "rolar" | "cancelar") => enviar({ t: "decidir_teste", pedidoId, personagemId, acao }),
  forcarRolagem: (resultadoId: string) => enviar({ t: "forcar_rolagem", resultadoId }),
  rolarDeNovo: (resultadoId: string, habilidadeId: string) => enviar({ t: "rolar_de_novo", resultadoId, habilidadeId }),
  testeRapido: (teste: { personagemId: string; tipo: "habilidade" | "resistencia"; teste: AlvoDoTeste; bonus: number; modo: ModoRolagem; opcao: OpcaoDeTeste; usarCartaDoDestino: boolean }) =>
    enviar({ t: "teste_rapido", ...teste }),
  definirAutomatico: (personagemId: string, ligado: boolean) => enviar({ t: "automatico", personagemId, ligado }),
  darCartaDoDestino: (personagemId: string, tem: boolean) => enviar({ t: "carta_do_destino", personagemId, tem }),
  limparErro: () => definir({ erro: null }),
  aprovar: (pedidoId: string, vincularA?: string) => enviar({ t: "aprovar_entrada", pedidoId, vincularA }),
  recusar: (pedidoId: string) => enviar({ t: "recusar_entrada", pedidoId }),
  revogar: (participanteId: string) => enviar({ t: "revogar_acesso", participanteId }),
  trocarCodigo: () => enviar({ t: "trocar_codigo" }),
  limparRolagens: () => definir((e) => ({ rolagensLimpasAte: e.eventos.at(-1)?.n ?? 0 })),
  criarPersonagem: () => enviar({ t: "personagem_criar" }),
  salvarRascunho: (personagemId: string, ficha: FichaRascunho) => enviar({ t: "personagem_salvar", personagemId, ficha }),
  concluirPersonagem: (personagemId: string) => enviar({ t: "personagem_concluir", personagemId }),
  apagarPersonagem: (personagemId: string) => enviar({ t: "personagem_apagar", personagemId }),
  operar: (personagemId: string, operacao: Operacao) => enviar({ t: "ficha_operar", personagemId, operacao }),
  desfazerFicha: (eventoId: string) => enviar({ t: "ficha_desfazer", eventoId }),
  ligarPersonagem: (personagemId: string, participanteId: string | null) => enviar({ t: "ligar_personagem", personagemId, participanteId }),
  definirOpcoes: (opcoes: OpcoesCampanha) => enviar({ t: "opcoes_campanha", opcoes }),
  salvarKit: (kit: Kit) => enviar({ t: "kit_salvar", kit }),
  apagarKit: (kitId: string) => enviar({ t: "kit_apagar", kitId }),
  entregarKit: (personagemId: string, kitId: string) => enviar({ t: "kit_entregar", personagemId, kitId }),

  /* Combate: o servidor decide; a tela só pede e espera a resposta chegar. */
  criarCombate: (personagens: string[], criaturas: { ref: string; quantidade: number; elite: boolean }[]) => enviar({ t: "combate_criar", personagens, criaturas }),
  comprarIniciativa: (combatenteId?: string) => enviar({ t: "iniciativa_comprar", combatenteId }),
  escolherCarta: (combatenteId: string, cartaId: string) => enviar({ t: "iniciativa_escolher_carta", combatenteId, cartaId }),
  decidirEfeito: (combatenteId: string, usar: boolean, alvos: string[] = []) => enviar({ t: "iniciativa_efeito", combatenteId, usar, alvos }),
  desempatar: () => enviar({ t: "iniciativa_desempatar" }),
  comecarCombate: () => enviar({ t: "combate_comecar" }),
  encerrarTurno: () => enviar({ t: "turno_encerrar" }),
  novaRodada: () => enviar({ t: "rodada_nova" }),
  gastarPa: (combatenteId: string, tipo: "acao" | "deslocamento" | "reacao", quantos = 1) => enviar({ t: "pa_gastar", combatenteId, quantos, tipo }),
  encerrarCombate: () => enviar({ t: "combate_encerrar" }),
  desfazerCombate: (eventoId: string) => enviar({ t: "combate_desfazer", eventoId }),
  atacar: (atacanteId: string, fonte: FonteDeAtaque, alvos: string[], opcoes: OpcoesDeAtaque) => enviar({ t: "atacar", atacanteId, fonte, alvos, opcoes }),
  reagir: (combatenteId: string, reacao: Reacao) => enviar({ t: "reagir", combatenteId, reacao }),
  seguirAtaque: () => enviar({ t: "ataque_seguir" }),
  cancelarAtaque: () => enviar({ t: "ataque_cancelar" }),
  aplicarDano: (combatenteId: string, valor: number, tipo: string | null, espacos = 0) => enviar({ t: "dano_aplicar", combatenteId, valor, tipo, espacos }),
  formarHorda: (integrantes: string[]) => enviar({ t: "horda_formar", integrantes }),
  marcarAreaDaHorda: (hordaId: string, marcados: string[]) => enviar({ t: "horda_area", hordaId, marcados }),
  usarRecarga: (combatenteId: string, acaoId: string, gasta: boolean) => enviar({ t: "recarga_usar", combatenteId, acaoId, gasta }),
  testeDeMorte: (personagemId: string, usarCartaDoDestino: boolean) => enviar({ t: "teste_de_morte", personagemId, usarCartaDoDestino }),
  estabilizar: (personagemId: string) => enviar({ t: "estabilizar", personagemId }),
  atitudeImprudente: (combatenteId: string, opcao: "precisao" | "potencia" | "violencia" | "impeto") => enviar({ t: "atitude_imprudente", combatenteId, opcao }),
  ajustarEstresse: (personagemId: string, delta: number) => enviar({ t: "estresse_ajustar", personagemId, delta }),
  ajustarFichaDeClasse: (personagemId: string, recursoId: string, delta: number) => enviar({ t: "ficha_classe_ajustar", personagemId, recursoId, delta }),
  usarHabilidade: (personagemId: string, habilidadeId: string) => enviar({ t: "habilidade_usar", personagemId, habilidadeId }),
  descansar: (tipo: "curto" | "longo", personagens: { personagemId: string; dadosDeVida: number }[], alimentado: boolean, cuidadosMedicos: boolean) =>
    enviar({ t: "descanso", tipo, personagens, alimentado, cuidadosMedicos }),
  ajustarPv: (alvo: Alvo, delta: number, temporarios: boolean) => enviar({ t: "pv_ajustar", alvo, delta, temporarios }),
  aplicarEfeito: (alvo: Alvo, efeitoId: string, acumulos?: number, turnos?: number) => enviar({ t: "efeito_aplicar", alvo, efeitoId, acumulos, turnos }),
  editarEfeito: (alvo: Alvo, efeitoAtivoId: string, acumulos: number, turnos: number | null) => enviar({ t: "efeito_editar", alvo, efeitoAtivoId, acumulos, turnos }),
  encerrarEfeito: (alvo: Alvo, efeitoAtivoId: string) => enviar({ t: "efeito_encerrar", alvo, efeitoAtivoId }),
  acaoDeEfeito: (alvo: Alvo, efeitoAtivoId: string, indice: number) => enviar({ t: "efeito_acao", alvo, efeitoAtivoId, indice }),
  rolarLivre: (rotulo: string, formula: string, oculta: boolean) => enviar({ t: "rolar_livre", rotulo, formula, oculta }),
};
