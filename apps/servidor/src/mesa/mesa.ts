import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import {
  TAMANHO_CODIGO_MESA,
  VERSAO_PROTOCOLO,
  type CodigoErro,
  type EventoCompleto,
  type EventoVisto,
  type JogadorConhecido,
  type MensagemClienteLida,
  type MensagemServidor,
  type Participante,
  type PedidoEntrada,
  type RedeMestre,
} from "@odm/protocolo";
import { rolarD20, totalDaRolagem, type Aleatorio, type Modificador } from "@odm/regras";
import type { Campanha, ParticipanteBanco, Repositorio } from "../banco/repositorio";
import { LimiteTentativas } from "./limite";
import { projetarEvento, type Espectador } from "./visibilidade";

/* O transporte (WebSocket) fica fora daqui: a mesa só conhece esta interface. */
export type Canal = {
  enviar: (mensagem: MensagemServidor) => void;
  fechar: (codigo: number, motivo: string) => void;
  ip: string;
  local: boolean;
};

type Estado =
  | { fase: "novo" }
  | { fase: "visitante" }
  | { fase: "pedido"; pedidoId: string }
  | { fase: "dentro"; quem: Espectador; visto: number };

type Conexao = { canal: Canal; estado: Estado };

type PedidoPendente = {
  id: string;
  segredoHash: string;
  nome: string;
  criadoEm: string;
  canal: Canal | null;
  /* Depois de decidido, fica guardado um pouco, para o celular que voltar de tela bloqueada. */
  decisao: { tipo: "aprovado"; token: string } | { tipo: "recusado" } | null;
  venceEm: number | null;
};

export type OpcoesMesa = {
  tokenMestre: string;
  aleatorio?: Aleatorio;
  agora?: () => number;
  rede?: () => RedeMestre;
};

const SEM_REDE: RedeMestre = { porta: 0, enderecos: [] };
const NOME_MESTRE = "Mestre";
const ROTULO_ROLAGEM = "Rolagem de d20";
/* Sem 0/O e 1/I/L, que se confundem ao ditar o código na mesa. */
const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const MAX_EVENTOS_NA_CHEGADA = 200;
const MAX_PEDIDOS = 30;
const TENTATIVAS_POR_MINUTO = 5;
const MINUTO = 60_000;
const PRAZO_PEDIDO_MS = 2 * MINUTO;

export const FECHAR_REVOGADO = 4003;
export const FECHAR_NAO_AUTORIZADO = 4001;
export const FECHAR_VERSAO = 4002;

const MENSAGEM: Record<CodigoErro, string> = {
  versao_incompativel: "O app está em outra versão. Recarregue a página.",
  mensagem_invalida: "Mensagem inválida.",
  nao_identificado: "Conexão ainda não identificada.",
  nao_autorizado: "Você não tem permissão para isso.",
  token_invalido: "Este dispositivo não está mais na mesa. Peça para entrar de novo.",
  acesso_revogado: "O mestre removeu seu acesso à mesa.",
  pedido_inexistente: "Esse pedido de entrada não existe mais.",
  sem_mesa: "O mestre ainda não abriu a mesa.",
  mesa_ja_existe: "A mesa já foi criada.",
  codigo_incorreto: "Código da mesa incorreto.",
  muitas_tentativas: "Muitas tentativas. Espere um minuto e tente de novo.",
  indisponivel: "Isso ainda não está disponível nesta versão.",
};

const hash = (valor: string) => createHash("sha256").update(valor).digest("hex");
const segredoNovo = () => randomBytes(32).toString("base64url");

function iguais(a: string, b: string) {
  const x = Buffer.from(hash(a));
  const y = Buffer.from(hash(b));
  return timingSafeEqual(x, y);
}

function gerarCodigo(aleatorio: Aleatorio) {
  let codigo = "";
  for (let i = 0; i < TAMANHO_CODIGO_MESA; i++) codigo += ALFABETO_CODIGO[aleatorio(0, ALFABETO_CODIGO.length - 1)];
  return codigo;
}

const mesmoNome = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

export class Mesa {
  private readonly conexoes = new Set<Conexao>();
  private readonly pedidos = new Map<string, PedidoPendente>();
  private readonly limite = new LimiteTentativas(TENTATIVAS_POR_MINUTO, MINUTO);
  private readonly aleatorio: Aleatorio;
  private readonly agora: () => number;
  private campanha: Campanha | undefined;

  constructor(
    private readonly repo: Repositorio,
    private readonly opcoes: OpcoesMesa,
  ) {
    this.aleatorio = opcoes.aleatorio ?? ((minimo, maximo) => randomInt(minimo, maximo + 1));
    this.agora = opcoes.agora ?? Date.now;
    this.campanha = repo.campanhaAtual();
  }

  conectar(canal: Canal): Conexao {
    const conexao: Conexao = { canal, estado: { fase: "novo" } };
    this.conexoes.add(conexao);
    return conexao;
  }

  desconectar(conexao: Conexao) {
    this.conexoes.delete(conexao);
    if (conexao.estado.fase === "pedido") {
      const pedido = this.pedidos.get(conexao.estado.pedidoId);
      if (pedido && pedido.canal === conexao.canal) {
        pedido.canal = null;
        pedido.venceEm = this.agora() + PRAZO_PEDIDO_MS;
      }
    }
    if (conexao.estado.fase === "dentro") this.avisarPresenca();
  }

  /* Pedidos de quem sumiu saem da lista do mestre depois do prazo. */
  limparVencidos() {
    const agora = this.agora();
    let mudou = false;
    for (const [id, pedido] of this.pedidos) {
      if (pedido.venceEm !== null && pedido.venceEm <= agora) {
        this.pedidos.delete(id);
        if (!pedido.decisao) mudou = true;
      }
    }
    if (mudou) this.avisarMestre();
  }

  receber(conexao: Conexao, mensagem: MensagemClienteLida) {
    if (mensagem.t === "ola") {
      this.ola(conexao, mensagem);
      return;
    }
    if (mensagem.t === "pedir_entrada") {
      this.pedirEntrada(conexao, mensagem.nome, mensagem.codigo);
      return;
    }
    const { estado } = conexao;
    if (estado.fase !== "dentro" && !(mensagem.t === "criar_mesa" && this.ehMestreSemMesa(conexao))) {
      this.erro(conexao.canal, "nao_identificado");
      return;
    }

    switch (mensagem.t) {
      case "criar_mesa":
        this.criarMesa(conexao, mensagem.nome);
        return;
      case "rolar":
        this.rolar(conexao, mensagem.rotulo, mensagem.bonus);
        return;
      case "aprovar_entrada":
        if (this.exigirMestre(conexao)) this.aprovar(conexao, mensagem.pedidoId, mensagem.vincularA);
        return;
      case "recusar_entrada":
        if (this.exigirMestre(conexao)) this.recusar(conexao, mensagem.pedidoId);
        return;
      case "revogar_acesso":
        if (this.exigirMestre(conexao)) this.revogar(conexao, mensagem.participanteId);
        return;
      case "trocar_codigo":
        if (this.exigirMestre(conexao)) this.trocarCodigo();
        return;
      case "ligar_personagem":
      case "pedir_teste":
        if (this.exigirMestre(conexao)) this.erro(conexao.canal, "indisponivel");
        return;
      case "responder_teste":
        this.erro(conexao.canal, "indisponivel");
        return;
    }
  }

  /* Grava e entrega a cada um o que ele pode ver. Quem não pode ver não recebe nenhum byte. */
  registrar(evento: EventoCompleto) {
    if (!this.campanha) throw new Error("Sem mesa aberta");
    this.repo.acrescentarEvento(this.campanha.id, evento);
    for (const conexao of this.conexoes) {
      const { estado } = conexao;
      if (estado.fase !== "dentro") continue;
      const projetado = projetarEvento(evento, estado.quem);
      if (!projetado) continue;
      estado.visto += 1;
      conexao.canal.enviar({ t: "evento", evento: { ...projetado, n: estado.visto } as EventoVisto });
    }
  }

  private ehMestreSemMesa(conexao: Conexao) {
    return conexao.estado.fase === "visitante" && !this.campanha && this.mestreConectado.has(conexao);
  }

  private readonly mestreConectado = new WeakSet<Conexao>();

  private exigirMestre(conexao: Conexao) {
    if (conexao.estado.fase === "dentro" && conexao.estado.quem.papel === "mestre") return true;
    this.erro(conexao.canal, "nao_autorizado");
    return false;
  }

  private ola(conexao: Conexao, mensagem: Extract<MensagemClienteLida, { t: "ola" }>) {
    if (mensagem.versao !== VERSAO_PROTOCOLO) {
      this.erro(conexao.canal, "versao_incompativel");
      conexao.canal.fechar(FECHAR_VERSAO, "versao");
      return;
    }
    const { credencial } = mensagem;
    switch (credencial.tipo) {
      case "visitante":
        conexao.estado = { fase: "visitante" };
        conexao.canal.enviar({ t: "visitante", mesaAberta: !!this.campanha });
        return;
      case "mestre":
        this.olaMestre(conexao, credencial.token, mensagem.vistos);
        return;
      case "jogador":
        this.olaJogador(conexao, credencial.token, mensagem.vistos);
        return;
      case "pedido":
        this.olaPedido(conexao, credencial.pedidoId, credencial.segredo);
        return;
    }
  }

  private olaMestre(conexao: Conexao, token: string, vistos: number) {
    /* O token só vale de dentro da máquina do mestre: nunca passa pela rede. */
    if (!conexao.canal.local || !iguais(token, this.opcoes.tokenMestre)) {
      this.erro(conexao.canal, "nao_autorizado");
      conexao.canal.fechar(FECHAR_NAO_AUTORIZADO, "mestre");
      return;
    }
    this.mestreConectado.add(conexao);
    if (!this.campanha) {
      conexao.estado = { fase: "visitante" };
      conexao.canal.enviar({ t: "sem_mesa" });
      return;
    }
    const mestre = this.repo.mestreDa(this.campanha.id);
    if (mestre) this.entrar(conexao, mestre, vistos);
  }

  private olaJogador(conexao: Conexao, token: string, vistos: number) {
    const participante = this.repo.participantePorToken(hash(token));
    if (!participante || participante.campanhaId !== this.campanha?.id) {
      this.erro(conexao.canal, "token_invalido");
      return;
    }
    this.entrar(conexao, participante, vistos);
  }

  private olaPedido(conexao: Conexao, pedidoId: string, segredo: string) {
    const pedido = this.pedidos.get(pedidoId);
    if (!pedido || pedido.segredoHash !== hash(segredo)) {
      this.erro(conexao.canal, "pedido_inexistente");
      return;
    }
    if (pedido.decisao?.tipo === "aprovado") {
      conexao.canal.enviar({ t: "entrada_aprovada", token: pedido.decisao.token });
      this.pedidos.delete(pedidoId);
      return;
    }
    if (pedido.decisao?.tipo === "recusado") {
      conexao.canal.enviar({ t: "entrada_recusada" });
      this.pedidos.delete(pedidoId);
      return;
    }
    pedido.canal = conexao.canal;
    pedido.venceEm = null;
    conexao.estado = { fase: "pedido", pedidoId };
    conexao.canal.enviar({ t: "entrada_aguardando", pedidoId, segredo });
  }

  private entrar(conexao: Conexao, participante: ParticipanteBanco, vistos: number) {
    const campanha = this.campanha;
    if (!campanha) return;
    const quem: Espectador = { id: participante.id, papel: participante.papel };

    /* Refaz o registro de quem chegou: a posição "n" é própria de cada espectador. */
    const proprios: EventoVisto[] = [];
    for (const evento of this.repo.eventosDa(campanha.id)) {
      const projetado = projetarEvento(evento, quem);
      if (projetado) proprios.push({ ...projetado, n: proprios.length + 1 } as EventoVisto);
    }

    conexao.estado = { fase: "dentro", quem, visto: proprios.length };
    conexao.canal.enviar({
      t: "bem_vindo",
      eu: { id: participante.id, nome: participante.nome, papel: participante.papel, online: true },
      mesa: { nome: campanha.nome },
      participantes: this.listaParticipantes(campanha.id),
      eventos: proprios.filter((e) => e.n > vistos).slice(-MAX_EVENTOS_NA_CHEGADA),
    });
    if (participante.papel === "mestre") this.enviarEstadoMestre(conexao);
    this.avisarPresenca();
  }

  private pedirEntrada(conexao: Conexao, nome: string, codigo: string) {
    const { canal } = conexao;
    if (conexao.estado.fase !== "visitante") {
      this.erro(canal, "nao_identificado");
      return;
    }
    if (!this.campanha) {
      this.erro(canal, "sem_mesa");
      return;
    }
    const agora = this.agora();
    if (this.limite.bloqueado(canal.ip, agora)) {
      this.erro(canal, "muitas_tentativas");
      return;
    }
    if (codigo !== this.campanha.codigo) {
      this.limite.registrarErro(canal.ip, agora);
      this.erro(canal, "codigo_incorreto");
      return;
    }
    this.limite.limpar(canal.ip);
    if (this.pedidos.size >= MAX_PEDIDOS) {
      this.erro(canal, "muitas_tentativas");
      return;
    }

    const segredo = segredoNovo();
    const pedido: PedidoPendente = {
      id: randomUUID(),
      segredoHash: hash(segredo),
      nome,
      criadoEm: new Date(agora).toISOString(),
      canal,
      decisao: null,
      venceEm: null,
    };
    this.pedidos.set(pedido.id, pedido);
    conexao.estado = { fase: "pedido", pedidoId: pedido.id };
    canal.enviar({ t: "entrada_aguardando", pedidoId: pedido.id, segredo });
    this.avisarMestre();
  }

  private aprovar(conexao: Conexao, pedidoId: string, vincularA: string | undefined) {
    const campanha = this.campanha;
    const pedido = this.pedidos.get(pedidoId);
    if (!campanha || !pedido || pedido.decisao) {
      this.erro(conexao.canal, "pedido_inexistente");
      return;
    }
    const agoraIso = new Date(this.agora()).toISOString();
    let participante: ParticipanteBanco | undefined;
    let novoNaMesa = true;

    if (vincularA) {
      participante = this.repo.participante(vincularA);
      if (!participante || participante.campanhaId !== campanha.id || participante.papel !== "jogador") {
        this.erro(conexao.canal, "pedido_inexistente");
        return;
      }
      novoNaMesa = participante.revogadoEm !== null;
      if (novoNaMesa) this.repo.restaurar(participante.id);
    } else {
      participante = this.repo.criarJogador(campanha.id, pedido.nome, agoraIso);
    }

    const token = segredoNovo();
    this.repo.adicionarDispositivo(participante.id, hash(token), agoraIso);

    if (pedido.canal) {
      pedido.canal.enviar({ t: "entrada_aprovada", token });
      this.pedidos.delete(pedido.id);
    } else {
      pedido.decisao = { tipo: "aprovado", token };
      pedido.venceEm = this.agora() + PRAZO_PEDIDO_MS;
    }

    if (novoNaMesa) {
      this.registrar(
        this.novoEvento(conexao, { tipo: "participante_entrou", dados: { participanteId: participante.id, nome: participante.nome } }),
      );
    }
    this.avisarMestre();
    this.avisarPresenca();
  }

  private recusar(conexao: Conexao, pedidoId: string) {
    const pedido = this.pedidos.get(pedidoId);
    if (!pedido || pedido.decisao) {
      this.erro(conexao.canal, "pedido_inexistente");
      return;
    }
    if (pedido.canal) {
      pedido.canal.enviar({ t: "entrada_recusada" });
      this.pedidos.delete(pedidoId);
    } else {
      pedido.decisao = { tipo: "recusado" };
      pedido.venceEm = this.agora() + PRAZO_PEDIDO_MS;
    }
    this.avisarMestre();
  }

  private revogar(conexao: Conexao, participanteId: string) {
    const alvo = this.repo.participante(participanteId);
    if (!alvo || alvo.campanhaId !== this.campanha?.id || alvo.papel !== "jogador" || alvo.revogadoEm) {
      this.erro(conexao.canal, "pedido_inexistente");
      return;
    }
    this.repo.revogar(alvo.id, new Date(this.agora()).toISOString());
    for (const outra of [...this.conexoes]) {
      if (outra.estado.fase === "dentro" && outra.estado.quem.id === alvo.id) {
        outra.canal.enviar({ t: "acesso_revogado" });
        outra.estado = { fase: "novo" };
        outra.canal.fechar(FECHAR_REVOGADO, "revogado");
      }
    }
    this.registrar(this.novoEvento(conexao, { tipo: "participante_revogado", dados: { participanteId: alvo.id, nome: alvo.nome } }));
    this.avisarMestre();
    this.avisarPresenca();
  }

  private trocarCodigo() {
    if (!this.campanha) return;
    const codigo = gerarCodigo(this.aleatorio);
    this.repo.trocarCodigo(this.campanha.id, codigo);
    this.campanha = { ...this.campanha, codigo };
    this.avisarMestre();
  }

  private criarMesa(conexao: Conexao, nome: string) {
    if (this.campanha) {
      this.erro(conexao.canal, "mesa_ja_existe");
      return;
    }
    this.campanha = this.repo.criarCampanha(
      nome,
      gerarCodigo(this.aleatorio),
      NOME_MESTRE,
      new Date(this.agora()).toISOString(),
    );
    const mestre = this.repo.mestreDa(this.campanha.id);
    if (mestre) this.entrar(conexao, mestre, 0);
    for (const outra of this.conexoes) {
      if (outra.estado.fase === "visitante") outra.canal.enviar({ t: "visitante", mesaAberta: true });
    }
  }

  private rolar(conexao: Conexao, rotulo: string | undefined, bonus: number) {
    const natural = rolarD20(this.aleatorio);
    const modificadores: Modificador[] = bonus ? [{ rotulo: "Bônus", valor: bonus }] : [];
    this.registrar(
      this.novoEvento(conexao, {
        tipo: "rolagem",
        dados: { rotulo: rotulo || ROTULO_ROLAGEM, natural, modificadores, total: totalDaRolagem(natural, modificadores) },
      }),
    );
  }

  private novoEvento<T extends Pick<EventoCompleto, "tipo" | "dados">>(conexao: Conexao, corpo: T) {
    const { estado } = conexao;
    const autor = estado.fase === "dentro" ? this.repo.participante(estado.quem.id) : undefined;
    return {
      id: randomUUID(),
      autorId: autor?.id ?? null,
      autorNome: autor?.nome ?? null,
      criadoEm: new Date(this.agora()).toISOString(),
      ...corpo,
    } as EventoCompleto;
  }

  private listaParticipantes(campanhaId: string): Participante[] {
    const online = new Set<string>();
    for (const c of this.conexoes) if (c.estado.fase === "dentro") online.add(c.estado.quem.id);
    return this.repo
      .participantesDa(campanhaId)
      .filter((p) => !p.revogadoEm)
      .map((p) => ({ id: p.id, nome: p.nome, papel: p.papel, online: online.has(p.id) }));
  }

  private avisarPresenca() {
    if (!this.campanha) return;
    const participantes = this.listaParticipantes(this.campanha.id);
    for (const c of this.conexoes) if (c.estado.fase === "dentro") c.canal.enviar({ t: "presenca", participantes });
  }

  private jogadoresConhecidos(): JogadorConhecido[] {
    if (!this.campanha) return [];
    return this.repo
      .participantesDa(this.campanha.id)
      .filter((p) => p.papel === "jogador")
      .map((p) => ({ id: p.id, nome: p.nome, revogado: p.revogadoEm !== null }));
  }

  private pedidosParaMestre(): PedidoEntrada[] {
    const jogadores = this.jogadoresConhecidos();
    return [...this.pedidos.values()]
      .filter((p) => !p.decisao)
      .map((p) => {
        return {
          id: p.id,
          nome: p.nome,
          criadoEm: p.criadoEm,
          mesmoNomeDe: jogadores.filter((o) => mesmoNome(o.nome, p.nome)),
        };
      });
  }

  private enviarEstadoMestre(conexao: Conexao) {
    if (!this.campanha) return;
    conexao.canal.enviar({
      t: "estado_mestre",
      codigo: this.campanha.codigo,
      pedidos: this.pedidosParaMestre(),
      jogadores: this.jogadoresConhecidos(),
      rede: this.opcoes.rede?.() ?? SEM_REDE,
    });
  }

  private avisarMestre() {
    for (const c of this.conexoes) {
      if (c.estado.fase === "dentro" && c.estado.quem.papel === "mestre") this.enviarEstadoMestre(c);
    }
  }

  private erro(canal: Canal, codigo: CodigoErro) {
    canal.enviar({ t: "erro", codigo, mensagem: MENSAGEM[codigo] });
  }
}
