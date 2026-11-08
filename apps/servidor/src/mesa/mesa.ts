import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import {
  TAMANHO_CODIGO_MESA,
  VERSAO_PROTOCOLO,
  type Cadastro as CadastroTipo,
  type CadastroNovo,
  type Mostra,
  type CadastroDe,
  type CodigoErro,
  type EventoCompleto,
  type EventoVisto,
  type JogadorConhecido,
  type MensagemClienteLida,
  type MensagemServidor,
  type Participante,
  type OpcoesCampanha,
  type PacoteDisponivel,
  type PedidoEntrada,
  type Personagem,
  type RedeMestre,
} from "@odm/protocolo";
import { Cadastro } from "@odm/protocolo";
import type { PacoteConteudo } from "@odm/conteudo";
import { rolarD20, totalDaRolagem, type Aleatorio, type Modificador } from "@odm/regras";
import type { Campanha, ParticipanteBanco, Repositorio } from "../banco/repositorio";
import { LimiteTentativas } from "./limite";
import { cadastrosParaJogador } from "./cadastros";
import { Jogos21 } from "./jogo21";
import { Lojas } from "./lojas";
import { Combates, projetarCombate } from "./combate";
import { Acoes } from "./acoes";
import { Testes } from "./testes";
import { Vida } from "./vida";
import { Personagens } from "./personagens";
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

type Contagem = { vistos: number; vistosDe?: string };

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
  pacotes?: readonly PacoteConteudo[];
  /* Volta à campanha que estava aberta. Só para reinício em plena sessão: abrir o app mostra a lista. */
  retomar?: boolean;
};

const SEM_REDE: RedeMestre = { porta: 0, enderecos: [], firewallDev: null };
const NOME_MESTRE = "Mestre";
const PACOTE_BASE = "base";
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
  mesa_ja_existe: "Já há uma campanha aberta. Feche-a antes de abrir outra.",
  codigo_incorreto: "Código da mesa incorreto.",
  muitas_tentativas: "Muitas tentativas. Espere um minuto e tente de novo.",
  indisponivel: "Isso ainda não está disponível nesta versão.",
  recusado: "Isso não pode ser feito agora.",
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
  readonly personagens: Personagens;
  readonly combates: Combates;
  readonly testes: Testes;
  readonly jogos21: Jogos21;
  readonly lojas: Lojas;
  readonly acoes: Acoes;
  readonly vida: Vida;

  constructor(
    private readonly repo: Repositorio,
    private readonly opcoes: OpcoesMesa,
  ) {
    this.aleatorio = opcoes.aleatorio ?? ((minimo, maximo) => randomInt(minimo, maximo + 1));
    this.agora = opcoes.agora ?? Date.now;
    this.campanha = opcoes.retomar ? repo.campanhaAberta() : undefined;
    this.personagens = new Personagens(repo, opcoes.pacotes ?? [], {
      campanha: () => this.campanha,
      registrar: (evento) => this.registrar(evento),
      novoEvento: (quem, corpo) => this.eventoDe(quem.id, corpo),
      enviarPersonagem: (personagem, antigoDono) => this.enviarPersonagem(personagem, antigoDono),
      avisarRemocao: (personagemId, donoId) => this.avisarRemocao(personagemId, donoId),
      avisarOpcoes: (o) => this.avisarOpcoes(o),
      avisarMestre: () => this.avisarMestre(),
      ajustarLoja: (loja) => this.lojas.ajustar(loja),
      emCombate: (personagemId) => !!this.combates.combate()?.combatentes.some((c) => c.personagemId === personagemId),
    }, this.aleatorio);
    this.lojas = new Lojas({
      conteudo: () => this.personagens.conteudoCompleto(),
      loja: (id) => (this.campanha ? this.repo.cadastrosDa(this.campanha.id).find((c): c is CadastroDe<"loja"> => c.id === id && c.tipo === "loja") : undefined),
      salvarLoja: (loja) => {
        if (!this.campanha) return;
        this.repo.salvarCadastro(this.campanha.id, { ...loja, atualizadoEm: new Date(this.agora()).toISOString() });
        this.avisarCadastros();
      },
      personagem: (id) => repo.personagem(id),
      operar: (personagemId, op, quem) => this.personagens.operarPeloSistema(personagemId, op, quem),
      servico: {
        exaustao: (id) => this.vida.exaustaoDe(id),
        pode: (id) => this.vida.podeUsarServico(id),
        aplicar: (id, efeito, rotulo, quem) => this.vida.efeitoDeServico(id, efeito, rotulo, quem),
      },
    });
    this.combates = new Combates(repo, {
      campanha: () => this.campanha,
      conteudo: () => this.personagens.conteudoCompleto(),
      contextoFicha: () => this.personagens.contexto(),
      registrar: (evento) => this.registrar(evento),
      novoEvento: (quem, corpo) => this.eventoDe(quem.id, corpo),
      enviarPersonagem: (personagem, antigoDono) => this.enviarPersonagem(personagem, antigoDono),
      enviarCombate: () => this.enviarCombate(),
    }, this.aleatorio);
    this.testes = new Testes(repo, {
      campanha: () => this.campanha,
      combates: this.combates,
      contextoFicha: () => this.personagens.contexto(),
      registrar: (evento) => this.registrar(evento),
      novoEvento: (quem, corpo) => this.eventoDe(quem.id, corpo),
      enviarPersonagem: (personagem, antigoDono) => this.enviarPersonagem(personagem, antigoDono),
      ameacaDeMassa: (combatenteId) => this.acoes.ameacaDeMassaEm(combatenteId),
    }, this.aleatorio);
    this.acoes = new Acoes({
      conteudo: () => this.personagens.conteudoCompleto(),
      contextoFicha: () => this.personagens.contexto(),
      combates: this.combates,
      registrar: (evento) => this.registrar(evento),
      novoEvento: (quem, corpo) => this.eventoDe(quem.id, corpo),
      pedirTeste: (pedido, quem) => this.testes.pedirPeloSistema(pedido, quem),
      operarFicha: (personagemId, op, quem) => this.personagens.operarPeloSistema(personagemId, op, quem),
      donoDe: (personagemId) => repo.personagem(personagemId)?.participanteId ?? null,
      personagem: (id) => repo.personagem(id),
    }, this.aleatorio);
    this.combates.ganchoDoTurno = (c, momento, ctx, recargas) => this.acoes.efeitosDoTurno(c, momento, ctx, recargas);
    this.jogos21 = new Jogos21({
      conteudo: () => this.personagens.conteudoCompleto(),
      personagem: (id) => repo.personagem(id),
      registrar: (evento) => this.registrar(evento),
      novoEvento: (quem, corpo) => this.eventoDe(quem.id, corpo),
      enviar: () => this.avisarJogos21(),
    }, this.aleatorio);
    this.vida = new Vida({
      combates: this.combates,
      contextoFicha: () => this.personagens.contexto(),
      personagem: (id) => repo.personagem(id),
      podeAgirPor: (p, quem) => quem.papel === "mestre" || p.participanteId === quem.id,
      campanhaId: () => this.campanha?.id ?? null,
    }, this.aleatorio);
    this.combates.pedirTeste = (pedido, quem) => this.testes.pedirPeloSistema(pedido, quem);
    this.combates.paPorTurnoDe = (c) => (c.horda ? (this.acoes.hordaDe(c)?.regras.paPorTurno ?? null) : null);
  }

  /* Pedido HTTP do conteúdo do mestre: criaturas, ameaças e efeitos. Só da máquina do mestre. */
  conteudoDoMestre(token: string, local: boolean) {
    if (!local || !iguais(token, this.opcoes.tokenMestre)) return undefined;
    const c = this.personagens.conteudoCompleto();
    return c ? { criaturas: c.criaturas, ameacas: c.ameacas, efeitos: c.efeitos, regras: c.regras, tabelas: c.tabelas, modificadores: c.modificadores, lojas: c.lojas, municoes: c.municoes, pessoas: c.pessoas } : null;
  }

  /* Pedido HTTP do conteúdo da ficha: vale o token de quem está na mesa. */
  conteudoPara(token: string, local: boolean) {
    const mestre = local && iguais(token, this.opcoes.tokenMestre);
    if (!mestre && this.repo.participantePorToken(hash(token))?.campanhaId !== this.campanha?.id) return undefined;
    return this.personagens.conteudo();
  }

  /* Rosto de criatura ou NPC que já apareceu na iniciativa oculta do combate em curso. */
  private reveladaNoCombate(id: string) {
    const combate = this.combates.combate();
    return !!combate && combate.fase !== "iniciativa" && combate.combatentes.some((c) => c.ref === id && (c.revelado || c.derrotado));
  }

  private readonly donoDoPersonagem = (personagemId: string) => this.repo.personagem(personagemId)?.participanteId ?? null;

  /* Arte dos livros: o mestre vê tudo; o jogador da campanha aberta, só o que está liberado para ele.
     Por enquanto, as silhuetas do retrato; as próximas etapas liberam o rosto revelado na iniciativa,
     o NPC visível e o que o mestre mostrar. Nenhuma imagem sai do servidor sem passar por aqui. */
  imagemPara(token: string, local: boolean, id: string, tipo: "corpo" | "rosto"): Buffer | null | undefined {
    const mestre = local && iguais(token, this.opcoes.tokenMestre);
    if (!mestre) {
      const participante = this.repo.participantePorToken(hash(token));
      if (!participante || participante.campanhaId !== this.campanha?.id) return undefined;
      const quem: Espectador = { id: participante.id, papel: participante.papel };
      if (!imagemLiberadaAoJogador(id) && !this.reveladaNoCombate(id) && !this.imagemLiberadaPelaCampanha(id, quem)) return undefined;
    }
    return this.personagens.imagem(id, tipo);
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
    const escolhendo = (mensagem.t === "criar_campanha" || mensagem.t === "abrir_campanha") && this.ehMestreSemMesa(conexao);
    if (estado.fase !== "dentro" && !escolhendo) {
      this.erro(conexao.canal, "nao_identificado");
      return;
    }

    switch (mensagem.t) {
      case "criar_campanha":
        this.responder(conexao, this.criarCampanha(conexao, mensagem));
        return;
      case "abrir_campanha":
        this.responder(conexao, this.abrirCampanha(conexao, mensagem.campanhaId));
        return;
      case "fechar_campanha":
        if (this.exigirMestre(conexao)) this.fecharCampanha();
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
      case "personagem_criar":
      case "personagem_salvar":
      case "personagem_concluir":
      case "personagem_apagar":
      case "personagem_arquivar":
      case "ficha_operar":
      case "ficha_desfazer":
        if (estado.fase === "dentro") this.responder(conexao, this.personagens.receber(mensagem, estado.quem));
        return;
      case "opcoes_campanha":
        if (this.exigirMestre(conexao)) this.responder(conexao, this.personagens.definirOpcoes(mensagem.opcoes));
        return;
      case "kit_salvar":
        if (this.exigirMestre(conexao)) this.responder(conexao, this.personagens.salvarKit(mensagem.kit));
        return;
      case "mostrar":
        if (this.exigirMestre(conexao)) {
          this.mostra = { ...mensagem.mostra, id: randomUUID() };
          this.avisarMostra();
        }
        return;
      case "mostrar_fechar":
        if (this.exigirMestre(conexao)) {
          this.mostra = null;
          this.avisarMostra();
        }
        return;
      case "jogo21_abrir":
      case "jogo21_fechar":
        if (this.exigirMestre(conexao) && estado.fase === "dentro") this.responder(conexao, this.jogos21.receber(mensagem, estado.quem));
        return;
      case "loja_comprar":
      case "loja_vender":
      case "loja_servico":
        if (estado.fase === "dentro") this.responder(conexao, this.lojas.receber(mensagem, estado.quem));
        return;
      case "jogo21_comprar":
      case "jogo21_parar":
        if (estado.fase === "dentro") this.responder(conexao, this.jogos21.receber(mensagem, estado.quem));
        return;
      case "cadastro_salvar":
        if (this.exigirMestre(conexao)) this.responder(conexao, this.salvarCadastro(mensagem.cadastro));
        return;
      case "cadastro_apagar":
        if (this.exigirMestre(conexao)) this.responder(conexao, this.apagarCadastro(mensagem.id));
        return;
      case "kit_apagar":
        if (this.exigirMestre(conexao)) this.responder(conexao, this.personagens.apagarKit(mensagem.kitId));
        return;
      case "kit_entregar":
        if (estado.fase === "dentro" && this.exigirMestre(conexao)) {
          this.responder(conexao, this.personagens.entregarKit(mensagem.personagemId, mensagem.kitId, estado.quem));
        }
        return;
      case "combate_criar":
      case "iniciativa_comprar":
      case "iniciativa_escolher_carta":
      case "iniciativa_efeito":
      case "iniciativa_desempatar":
      case "combate_comecar":
      case "turno_encerrar":
      case "rodada_nova":
      case "pa_gastar":
      case "combate_encerrar":
      case "combate_desfazer":
        if (estado.fase === "dentro") this.responder(conexao, this.combates.receber(mensagem, estado.quem));
        return;
      case "pedir_teste":
      case "responder_teste":
      case "recusar_teste":
      case "decidir_teste":
      case "forcar_rolagem":
      case "rolar_de_novo":
      case "teste_rapido":
      case "automatico":
      case "carta_do_destino":
        if (estado.fase === "dentro") this.responder(conexao, this.testes.receber(mensagem, estado.quem));
        return;
      case "atacar":
      case "reagir":
      case "ataque_seguir":
      case "ataque_cancelar":
      case "dano_aplicar":
      case "pv_ajustar":
      case "efeito_aplicar":
      case "efeito_editar":
      case "efeito_encerrar":
      case "efeito_acao":
      case "rolar_livre":
      case "horda_formar":
      case "horda_area":
      case "recarga_usar":
        if (estado.fase === "dentro") this.responder(conexao, this.acoes.receber(mensagem, estado.quem));
        return;
      case "teste_de_morte":
      case "estabilizar":
      case "atitude_imprudente":
      case "estresse_ajustar":
      case "ficha_classe_ajustar":
      case "habilidade_usar":
      case "oferta_dispensar":
      case "descanso":
        if (estado.fase === "dentro") this.responder(conexao, this.vida.receber(mensagem, estado.quem));
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

  private responder(conexao: Conexao, resultado: { recusado: string } | void) {
    if (resultado) conexao.canal.enviar({ t: "erro", codigo: "recusado", mensagem: resultado.recusado });
  }

  /* Vai para o dono atual e o mestre; quem deixou de controlar vê o personagem sair. Arquivado, só o mestre recebe. */
  private enviarPersonagem(personagem: Personagem, antigoDono: string | null) {
    const { id, participanteId, situacao, ficha, vivo } = personagem;
    const mensagem = { t: "personagem", personagem: { id, participanteId, situacao, ficha, vivo } } as const;
    for (const c of this.conexoes) {
      if (c.estado.fase !== "dentro") continue;
      const { quem } = c.estado;
      if (quem.papel === "mestre") c.canal.enviar(mensagem);
      else if (quem.id === participanteId) c.canal.enviar(situacao === "arquivado" ? { t: "personagem_removido", personagemId: id } : mensagem);
      else if (quem.id === antigoDono) c.canal.enviar({ t: "personagem_removido", personagemId: personagem.id });
    }
  }

  private avisarRemocao(personagemId: string, donoId: string | null) {
    for (const c of this.conexoes) {
      if (c.estado.fase !== "dentro") continue;
      if (c.estado.quem.papel === "mestre" || c.estado.quem.id === donoId) c.canal.enviar({ t: "personagem_removido", personagemId });
    }
  }

  /* Cada um recebe o combate como pode ver: o jogador, sem PV de criatura nem baralho. */
  private enviarCombate() {
    const combate = this.combates.combate();
    for (const c of this.conexoes) {
      if (c.estado.fase === "dentro") c.canal.enviar({ t: "combate", combate: projetarCombate(combate, c.estado.quem, this.donoDoPersonagem) });
    }
  }

  private avisarOpcoes(opcoes: OpcoesCampanha) {
    for (const c of this.conexoes) if (c.estado.fase === "dentro") c.canal.enviar({ t: "opcoes_campanha", opcoes });
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
        conexao.canal.enviar({ t: "visitante", mesaAberta: !!this.campanha, deOutraCampanha: false });
        return;
      case "mestre":
        this.olaMestre(conexao, credencial.token, mensagem);
        return;
      case "jogador":
        this.olaJogador(conexao, credencial.tokens, mensagem);
        return;
      case "pedido":
        this.olaPedido(conexao, credencial.pedidoId, credencial.segredo);
        return;
    }
  }

  private olaMestre(conexao: Conexao, token: string, contagem: Contagem) {
    /* O token só vale de dentro da máquina do mestre: nunca passa pela rede. */
    if (!conexao.canal.local || !iguais(token, this.opcoes.tokenMestre)) {
      this.erro(conexao.canal, "nao_autorizado");
      conexao.canal.fechar(FECHAR_NAO_AUTORIZADO, "mestre");
      return;
    }
    this.mestreConectado.add(conexao);
    if (!this.campanha) {
      conexao.estado = { fase: "visitante" };
      conexao.canal.enviar({ t: "campanhas", lista: this.repo.resumoDasCampanhas(), pacotes: this.pacotesDisponiveis() });
      return;
    }
    const mestre = this.repo.mestreDa(this.campanha.id);
    if (mestre) this.entrar(conexao, mestre, contagem);
  }

  /* Aprovado em outra campanha continua aprovado: espera a campanha dele abrir, sem perder o token. */
  private olaJogador(conexao: Conexao, tokens: readonly string[], contagem: Contagem) {
    const participantes = tokens.map((token) => this.repo.participantePorToken(hash(token)));
    const indice = participantes.findIndex((p) => p && p.campanhaId === this.campanha?.id);
    const participante = participantes[indice];
    if (participante) {
      this.entrar(conexao, participante, contagem, indice);
      return;
    }
    if (participantes.some(Boolean)) {
      conexao.estado = { fase: "visitante" };
      conexao.canal.enviar({ t: "visitante", mesaAberta: !!this.campanha, deOutraCampanha: true });
      return;
    }
    this.erro(conexao.canal, "token_invalido");
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

  private entrar(conexao: Conexao, participante: ParticipanteBanco, contagem: Contagem, tokenIndice: number | null = null) {
    const campanha = this.campanha;
    if (!campanha) return;
    const quem: Espectador = { id: participante.id, papel: participante.papel };
    const vistos = contagem.vistosDe && contagem.vistosDe !== participante.id ? 0 : contagem.vistos;

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
      mesa: { id: campanha.id, nome: campanha.nome, opcoes: this.repo.opcoesDa(campanha), conteudo: this.personagens.conteudo() !== null },
      tokenIndice,
      participantes: this.listaParticipantes(campanha.id),
      eventos: proprios.filter((e) => e.n > vistos).slice(-MAX_EVENTOS_NA_CHEGADA),
      personagens: this.personagens.visiveisPara(quem).map(({ id, participanteId, situacao, ficha, vivo }) => ({ id, participanteId, situacao, ficha, vivo })),
    });
    conexao.canal.enviar({ t: "combate", combate: projetarCombate(this.combates.combate(), quem, this.donoDoPersonagem) });
    conexao.canal.enviar({ t: "cadastros", lista: this.cadastrosPara(quem) });
    conexao.canal.enviar({ t: "jogos21", lista: this.jogos21.listaPara(quem) });
    conexao.canal.enviar({ t: "mostrando", mostra: this.mostraPara(quem) });
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

  private pacotesDisponiveis(): PacoteDisponivel[] {
    return (this.opcoes.pacotes ?? []).map(({ manifesto: { id, nome, versao, dependencias } }) => ({ id, nome, versao, dependencias: dependencias.map((d) => d.id) }));
  }

  /* Sem pacote instalado a campanha nasce com a base marcada: o conteúdo entra quando o pacote chegar. */
  private validarPacotes(pedidos: readonly string[]): { ativos: string[] } | { recusado: string } {
    const disponiveis = this.pacotesDisponiveis();
    const ativos = pedidos.length ? [...new Set(pedidos)] : [PACOTE_BASE];
    if (!disponiveis.length) return { ativos };
    for (const id of ativos) {
      const pacote = disponiveis.find((p) => p.id === id);
      if (!pacote) return { recusado: "Esse pacote de conteúdo não está instalado." };
      const falta = pacote.dependencias.find((d) => !ativos.includes(d));
      if (falta) return { recusado: `${pacote.nome} precisa do pacote ${disponiveis.find((p) => p.id === falta)?.nome ?? falta}.` };
    }
    return { ativos };
  }

  private criarCampanha(conexao: Conexao, pedido: Extract<MensagemClienteLida, { t: "criar_campanha" }>) {
    if (!this.ehMestreSemMesa(conexao)) {
      this.erro(conexao.canal, this.campanha ? "mesa_ja_existe" : "nao_autorizado");
      return;
    }
    const pacotes = this.validarPacotes(pedido.pacotes);
    if ("recusado" in pacotes) return pacotes;
    const agora = new Date(this.agora()).toISOString();
    const nova = this.repo.criarCampanha(pedido.nome, gerarCodigo(this.aleatorio), NOME_MESTRE, agora, { pacotes: pacotes.ativos, opcoes: pedido.opcoes });
    this.ativar(conexao, nova.id, agora);
  }

  private abrirCampanha(conexao: Conexao, campanhaId: string) {
    if (!this.ehMestreSemMesa(conexao)) {
      this.erro(conexao.canal, this.campanha ? "mesa_ja_existe" : "nao_autorizado");
      return;
    }
    if (!this.repo.campanha(campanhaId)) return { recusado: "Essa campanha não existe mais." };
    this.ativar(conexao, campanhaId, new Date(this.agora()).toISOString());
  }

  private ativar(conexao: Conexao, campanhaId: string, agora: string) {
    this.campanha = this.repo.abrirCampanha(campanhaId, agora);
    const mestre = this.repo.mestreDa(campanhaId);
    if (mestre) this.entrar(conexao, mestre, { vistos: 0 });
    this.avisarMudancaDeMesa(conexao);
  }

  /* Ninguém fica preso: quem estava na mesa volta a esperar, e quem esperava descobre se a campanha é a sua. */
  private fecharCampanha() {
    this.repo.fecharCampanhas();
    this.campanha = undefined;
    this.pedidos.clear();
    this.jogos21.limpar();
    this.mostra = null;
    this.avisarMudancaDeMesa();
  }

  private avisarMudancaDeMesa(exceto?: Conexao) {
    for (const outra of this.conexoes) {
      if (outra === exceto) continue;
      outra.estado = { fase: "novo" };
      outra.canal.enviar({ t: "mesa_mudou" });
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
    return this.eventoDe(estado.fase === "dentro" ? estado.quem.id : null, corpo);
  }

  private eventoDe<T extends Pick<EventoCompleto, "tipo" | "dados">>(autorId: string | null, corpo: T) {
    const autor = autorId ? this.repo.participante(autorId) : undefined;
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

  /* ---------- Cadastros do mestre (fase 6) ---------- */

  /* O que cada um recebe: o mestre, tudo; o jogador, só o que cadastrosParaJogador libera. */
  private cadastrosPara(quem: Espectador): CadastroTipo[] {
    if (!this.campanha) return [];
    const todos = this.repo.cadastrosDa(this.campanha.id);
    return quem.papel === "mestre" ? todos : cadastrosParaJogador(todos);
  }

  /* ---------- Mostrar para os jogadores ---------- */

  private mostra: (Mostra & { id: string }) | null = null;

  private mostraPara(quem: Espectador): (Mostra & { id: string }) | null {
    const m = this.mostra;
    if (!m) return null;
    if (quem.papel === "mestre") return m;
    return m.para.length === 0 || m.para.includes(quem.id) ? { ...m, para: [] } : null;
  }

  private avisarMostra() {
    for (const c of this.conexoes) if (c.estado.fase === "dentro") c.canal.enviar({ t: "mostrando", mostra: this.mostraPara(c.estado.quem) });
  }

  /* Arte do pacote que o jogador pode ver por causa da campanha: o NPC visível e o que o mestre mostra a ele. */
  private imagemLiberadaPelaCampanha(id: string, quem: Espectador) {
    const mostra = this.mostraPara(quem);
    if (mostra?.imagem?.origem === "pacote" && mostra.imagem.id === id) return true;
    if (!this.campanha) return false;
    return this.repo.cadastrosDa(this.campanha.id).some((c) => c.tipo === "npc" && c.dados.visivel && c.dados.imagem?.origem === "pacote" && c.dados.imagem.id === id);
  }

  /* Imagem enviada: o mestre (NPC, Mostrar) e o jogador (retrato do personagem, etapa 11). Só quem está na
     campanha aberta envia e lê; o tamanho é limitado na rota. */
  salvarArquivo(token: string, local: boolean, tipo: string, dados: Buffer): string | undefined | null {
    const mestre = local && iguais(token, this.opcoes.tokenMestre);
    if (!mestre && this.repo.participantePorToken(hash(token))?.campanhaId !== this.campanha?.id) return undefined;
    if (!this.campanha) return null;
    const id = randomUUID();
    this.repo.salvarArquivo(this.campanha.id, { id, tipo, dados }, new Date(this.agora()).toISOString());
    return id;
  }

  arquivoPara(token: string, local: boolean, id: string): { tipo: string; dados: Buffer } | null | undefined {
    const mestre = local && iguais(token, this.opcoes.tokenMestre);
    if (!mestre && this.repo.participantePorToken(hash(token))?.campanhaId !== this.campanha?.id) return undefined;
    return this.campanha ? this.repo.arquivo(this.campanha.id, id) : null;
  }

  private avisarJogos21() {
    for (const c of this.conexoes) if (c.estado.fase === "dentro") c.canal.enviar({ t: "jogos21", lista: this.jogos21.listaPara(c.estado.quem) });
  }

  private avisarCadastros() {
    for (const c of this.conexoes) if (c.estado.fase === "dentro") c.canal.enviar({ t: "cadastros", lista: this.cadastrosPara(c.estado.quem) });
  }

  private salvarCadastro(novo: CadastroNovo): { recusado: string } | void {
    if (!this.campanha) return { recusado: "Nenhuma campanha aberta." };
    const existente = novo.id ? this.repo.cadastrosDa(this.campanha.id).find((c) => c.id === novo.id) : undefined;
    if (novo.id && !existente) return { recusado: "Esse cadastro não existe mais." };
    if (existente && existente.tipo !== novo.tipo) return { recusado: "O tipo do cadastro não muda." };
    const cadastro = Cadastro.parse({ ...novo, id: novo.id ?? randomUUID(), atualizadoEm: new Date(this.agora()).toISOString() });
    this.repo.salvarCadastro(this.campanha.id, cadastro);
    this.avisarCadastros();
  }

  private apagarCadastro(id: string): { recusado: string } | void {
    if (!this.campanha) return { recusado: "Nenhuma campanha aberta." };
    this.repo.apagarCadastro(this.campanha.id, id);
    this.avisarCadastros();
  }

  private enviarEstadoMestre(conexao: Conexao) {
    if (!this.campanha) return;
    conexao.canal.enviar({
      t: "estado_mestre",
      codigo: this.campanha.codigo,
      pedidos: this.pedidosParaMestre(),
      jogadores: this.jogadoresConhecidos(),
      rede: this.opcoes.rede?.() ?? SEM_REDE,
      kits: this.repo.kitsDa(this.campanha.id),
    });
  }

  avisarMestre() {
    for (const c of this.conexoes) {
      if (c.estado.fase === "dentro" && c.estado.quem.papel === "mestre") this.enviarEstadoMestre(c);
    }
  }

  private erro(canal: Canal, codigo: CodigoErro) {
    canal.enviar({ t: "erro", codigo, mensagem: MENSAGEM[codigo] });
  }
}

/* O que qualquer jogador da mesa pode baixar, sem depender do momento: as silhuetas do retrato do personagem. */
/* Silhuetas do retrato e a arte dos itens do catálogo (ícone do inventário): o jogador sempre pode ver. */
export const imagemLiberadaAoJogador = (id: string) => /^(silhueta|item|municao|modificacao)./.test(id);
