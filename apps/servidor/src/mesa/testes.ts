import { randomUUID } from "node:crypto";
import { ID_EXAUSTAO } from "@odm/conteudo";
import type {
  Alvo,
  AlvoDoTeste,
  DadosResultadoTeste,
  EstadoVivo,
  EventoCompleto,
  MensagemClienteLida,
  ModoRolagem,
  Mudanca,
  OpcaoDeTeste,
  PedidoTeste,
  Personagem,
} from "@odm/protocolo";
import {
  NOME_ATRIBUTO,
  aplicarEfeito,
  removerAcumulo,
  fontesDosEfeitos,
  gastarHabilidade,
  habilidadesDaFicha,
  habilidadesQueServem,
  modificadoresDeCrise,
  parcelasDoMundo,
  montarTeste,
  resolverTeste,
  rolarD20ComVantagem,
  saldoDeVantagem,
  usosRestantes,
  valorPassivo,
  venceContestado,
  type Aleatorio,
  type ContextoCombate,
  type ContextoFicha,
  type FichaCalculada,
  type HabilidadeDaFicha,
  type Parcela,
  type ValorContado,
} from "@odm/regras";
import type { Campanha, PersonagemBanco, Repositorio } from "../banco/repositorio";
import type { Combates, Recusa } from "./combate";
import { alivioDe, estresseDe, mudarEstresse } from "./vida";
import type { Espectador } from "./visibilidade";

/* Testes pedidos pelo mestre e testes rápidos do jogador (especificação 8). O servidor monta a conta pela ficha,
   rola e grava o resultado no registro. Nada do teste passivo sai para o jogador (visibilidade.ts). */

type Hospedeiro = {
  campanha: () => Campanha | undefined;
  combates: Combates;
  contextoFicha: () => ContextoFicha | null;
  registrar: (evento: EventoCompleto) => void;
  novoEvento: <T extends Pick<EventoCompleto, "tipo" | "dados">>(quem: Espectador, corpo: T) => EventoCompleto;
  enviarPersonagem: (personagem: Personagem, antigoDono: string | null) => void;
  /* Ameaça de Massa da Horda (acoes.ts): −1 nos testes de resistência de quem está na área. */
  ameacaDeMassa: (combatenteId: string) => { valor: number; horda: string } | null;
};

type MensagemDeTeste = Extract<
  MensagemClienteLida,
  {
    t:
      | "pedir_teste"
      | "responder_teste"
      | "recusar_teste"
      | "decidir_teste"
      | "forcar_rolagem"
      | "rolar_de_novo"
      | "teste_rapido"
      | "automatico"
      | "carta_do_destino";
  }
>;

const recusa = (motivo: string): Recusa => ({ recusado: motivo });

type EventoPedido = Extract<EventoCompleto, { tipo: "teste_pedido" }>;
type EventoResultado = Extract<EventoCompleto, { tipo: "teste_resultado" }>;
type TipoDoTeste = DadosResultadoTeste["tipo"];

/* O que se testa, já resolvido para um personagem. */
type Especificacao = {
  pedidoId: string | null;
  tipo: TipoDoTeste;
  teste: AlvoDoTeste;
  dt: number | null;
  dtVisivel: boolean;
  dependeDe?: "visao" | "audicao";
  oponente: { nome: string; total: number; dados: number[]; visivel: boolean; quemAge: "personagem" | "oponente" } | null;
};

/* "bonus" e "modo" são do jogador (pop-up ou teste rápido); "mestre" é o ajuste do pedido para este personagem.
   Os dois somam: vantagem de um e desvantagem do outro se anulam, como quaisquer duas fontes. */
type Ajuste = {
  bonus: number;
  modo: ModoRolagem;
  mestre: { bonus: number; modo: ModoRolagem };
  opcao: OpcaoDeTeste;
  criticoGarantido: boolean;
  habilidades: string[];
  forcado: boolean;
  cartaDoDestino: boolean;
  automatico: boolean;
};

const AJUSTE_PADRAO: Ajuste = {
  bonus: 0,
  modo: "normal",
  mestre: { bonus: 0, modo: "normal" },
  opcao: "rolar",
  criticoGarantido: false,
  habilidades: [],
  forcado: false,
  cartaDoDestino: false,
  automatico: false,
};

const ajusteDoMestre = (pedido: PedidoTeste | null, personagemId: string): Ajuste["mestre"] => {
  const a = pedido?.personagens.find((x) => x.personagemId === personagemId);
  return { bonus: a?.bonus ?? 0, modo: a?.modo ?? "normal" };
};

const alvoDe = (p: PersonagemBanco): Alvo => ({ tipo: "personagem", id: p.id });
const nomeDe = (p: PersonagemBanco) => p.ficha.nome || "Sem nome";

/* A conta da ficha vira as parcelas do teste; se ela não fechar com o valor, vale o valor inteiro. */
function parcelasDe(v: ValorContado, rotulo: string): Parcela[] {
  const soma = v.conta.reduce((s, p) => s + p.valor, 0);
  return soma === v.valor ? v.conta.filter((p) => p.valor !== 0) : [{ rotulo, valor: v.valor }];
}

export class Testes {
  constructor(
    private readonly repo: Repositorio,
    private readonly host: Hospedeiro,
    private readonly aleatorio: Aleatorio,
  ) {}

  receber(mensagem: MensagemDeTeste, quem: Espectador): Recusa | void {
    switch (mensagem.t) {
      case "pedir_teste":
        return this.pedir(mensagem.pedido, quem);
      case "responder_teste":
        return this.responder(mensagem.resposta, quem);
      case "recusar_teste":
        return this.recusar(mensagem.pedidoId, mensagem.personagemId, quem);
      case "decidir_teste":
        return this.decidir(mensagem, quem);
      case "forcar_rolagem":
        return this.forcar(mensagem.resultadoId, quem);
      case "rolar_de_novo":
        return this.rolarDeNovo(mensagem.resultadoId, mensagem.habilidadeId, quem);
      case "teste_rapido":
        return this.rapido(mensagem, quem);
      case "automatico":
        return this.automatico(mensagem.personagemId, mensagem.ligado, quem);
      case "carta_do_destino":
        return this.cartaDoDestino(mensagem.personagemId, mensagem.tem, quem);
    }
  }

  /* ---------- Leitura ---------- */

  private eventos(): EventoCompleto[] {
    const campanha = this.host.campanha();
    return campanha ? this.repo.eventosDa(campanha.id) : [];
  }

  private pedidoGravado(pedidoId: string): EventoPedido | undefined {
    return this.eventos().find((e): e is EventoPedido => e.tipo === "teste_pedido" && e.dados.pedido.id === pedidoId);
  }

  private resultados(): EventoResultado[] {
    return this.eventos().filter((e): e is EventoResultado => e.tipo === "teste_resultado");
  }

  /* O resultado que vale para este personagem neste pedido: o último, que nenhum outro substituiu. */
  private atualDoPedido(pedidoId: string, personagemId: string): EventoResultado | undefined {
    const deste = this.resultados().filter((r) => r.dados.pedidoId === pedidoId && r.dados.personagemId === personagemId);
    return deste.at(-1);
  }

  private personagemAtivo(id: string): PersonagemBanco | Recusa {
    const campanha = this.host.campanha();
    const p = this.repo.personagem(id);
    if (!campanha || !p || p.campanhaId !== campanha.id || p.situacao !== "ativo") return recusa("Esse personagem não está na mesa.");
    return p;
  }

  private podeAgirPor(p: PersonagemBanco, quem: Espectador) {
    return quem.papel === "mestre" || p.participanteId === quem.id;
  }

  private estadoDe(p: PersonagemBanco, ctx: ContextoCombate): { vivo: EstadoVivo; calc: FichaCalculada } | Recusa {
    const { mundo } = this.host.combates.mundo(ctx);
    const vivo = mundo.vivos[p.id] ?? p.vivo;
    const calc = this.host.combates.calculo(p, vivo, ctx);
    if (!calc) return recusa("O conteúdo da ficha não está disponível.");
    return { vivo, calc };
  }

  private contexto(): { ctx: ContextoCombate; ctxFicha: ContextoFicha } | Recusa {
    const r = this.host.combates.contexto();
    if ("recusado" in r) return r;
    const ctxFicha = this.host.contextoFicha();
    if (!ctxFicha) return recusa("O conteúdo da ficha não está disponível.");
    return { ctx: r.ctx, ctxFicha };
  }

  private especificacao(pedido: PedidoTeste, personagemId: string, oponente: EventoPedido["dados"]["oponente"]): Especificacao {
    const ajuste = pedido.personagens.find((p) => p.personagemId === personagemId);
    const comum = { pedidoId: pedido.id, ...(pedido.dependeDe ? { dependeDe: pedido.dependeDe } : {}) };
    switch (pedido.tipo) {
      case "habilidade":
        return { ...comum, tipo: "habilidade", teste: pedido.teste, dt: ajuste?.dt ?? pedido.dt, dtVisivel: pedido.dtVisivel, oponente: null };
      case "resistencia":
        return { ...comum, tipo: "resistencia", teste: { alvo: "atributo", atributo: pedido.atributo }, dt: ajuste?.dt ?? pedido.dt, dtVisivel: pedido.dtVisivel, oponente: null };
      case "passivo":
        return { ...comum, tipo: "passivo", teste: pedido.teste, dt: ajuste?.dt ?? pedido.dt, dtVisivel: false, oponente: null };
      case "contestado":
        return {
          ...comum,
          tipo: "contestado",
          teste: pedido.teste,
          dt: null,
          dtVisivel: pedido.oponenteVisivel,
          oponente: { nome: pedido.oponente.nome, total: oponente?.total ?? 0, dados: oponente?.dados ?? [], visivel: pedido.oponenteVisivel, quemAge: pedido.quemAge },
        };
    }
  }

  private rotulo(esp: Especificacao, calc: FichaCalculada | null) {
    const alvo = esp.teste.alvo === "atributo" ? NOME_ATRIBUTO[esp.teste.atributo] : this.nomeDaPericia(esp.teste.periciaId, calc);
    switch (esp.tipo) {
      case "habilidade":
        return `Teste de ${alvo}`;
      case "resistencia":
        return `Resistência de ${alvo}`;
      case "passivo":
        return `${alvo} passiva`;
      /* Sem o nome do oponente: ele pode estar oculto, e o rótulo vai para o jogador. */
      case "contestado":
        return `${alvo} (contestado)`;
    }
  }

  private nomeDaPericia(id: string, calc: FichaCalculada | null) {
    const doPacote = this.host.contextoFicha()?.pericias.get(id);
    return calc?.pericias.find((p) => p.id === id)?.nome ?? (doPacote ? (doPacote.exibir ?? doPacote.nome) : id);
  }

  /* ---------- Rolagem ---------- */

  /* Monta e rola. Devolve o resultado e as mudanças que o teste gasta (Rei, Carta do Destino), ainda sem aplicar. */
  private rolar(p: PersonagemBanco, esp: Especificacao, ajuste: Ajuste, ctx: ContextoCombate): { dados: DadosResultadoTeste; mudancas: Mudanca[] } | Recusa {
    const estado = this.estadoDe(p, ctx);
    if ("recusado" in estado) return estado;
    const { vivo, calc } = estado;
    const mudancas: Mudanca[] = [];

    let atributo;
    let base: Parcela[];
    if (esp.teste.alvo === "atributo") {
      atributo = esp.teste.atributo;
      const valor = esp.tipo === "resistencia" ? calc.resistencias[atributo] : calc.atributos[atributo];
      base = parcelasDe(valor, NOME_ATRIBUTO[atributo]);
    } else {
      const { periciaId } = esp.teste;
      const pericia = calc.pericias.find((x) => x.id === periciaId);
      if (!pericia) return recusa("Essa perícia não está no conteúdo da campanha.");
      atributo = pericia.atributo;
      base = parcelasDe(pericia.total, pericia.nome);
    }

    const tipoDaRegra = esp.tipo === "resistencia" ? "resistencia" : "habilidade";
    if (ajuste.opcao !== "rolar") {
      const regra = ajuste.opcao === "fazer_com_calma" ? ctx.regras.calma : ctx.regras.tentar;
      if (!regra) return recusa("Essa opção ainda não foi revisada no pacote de conteúdo.");
      if (esp.tipo !== "habilidade") return recusa("Fazer com Calma e Tentar até Conseguir valem só em teste de habilidade.");
      if (this.emCombate(p.id)) return recusa("Em combate não dá para fazer com calma nem tentar até conseguir.");
    }

    /* Rei: vantagem no próximo ataque ou teste de habilidade de quem recebeu a carta. */
    const vantagensExtras: string[] = ajuste.mestre.modo === "vantagem" ? ["Ajuste do mestre"] : [];
    const desvantagensExtras: string[] = ajuste.mestre.modo === "desvantagem" ? ["Ajuste do mestre"] : [];
    if (ajuste.mestre.bonus) base = [...base, { rotulo: "Ajuste do mestre", valor: ajuste.mestre.bonus }];
    const combatente = this.host.combates.combate()?.combatentes.find((c) => c.personagemId === p.id);
    if (combatente?.marcas.vantagemNoProximo && tipoDaRegra === "habilidade" && esp.tipo !== "passivo") {
      vantagensExtras.push("Rei");
      mudancas.push({ op: "marcas", alvo: { tipo: "combatente", id: combatente.id }, antes: combatente.marcas, depois: { ...combatente.marcas, vantagemNoProximo: false } });
    }

    const montado = montarTeste({
      teste: { tipo: tipoDaRegra, atributo, ...(esp.dependeDe ? { dependeDe: esp.dependeDe } : {}) },
      base,
      efeitos: fontesDosEfeitos(vivo.efeitos, ctx),
      exaustao: vivo.exaustao,
      ctx,
      bonus: ajuste.bonus,
      modo: ajuste.modo,
      vantagensExtras,
      desvantagensExtras,
    });
    montado.modificadores.push(...modificadoresDeCrise(vivo, ctx, tipoDaRegra));
    /* Chuva e Neblina (modificadores de mundo), com o nome da carta na conta. */
    montado.modificadores.push(...parcelasDoMundo(ctx, esp.teste.alvo === "pericia" ? esp.teste.periciaId : null, esp.tipo === "passivo"));
    const massa = esp.tipo === "resistencia" && combatente ? this.host.ameacaDeMassa(combatente.id) : null;
    if (massa) montado.modificadores.push({ rotulo: "Ameaça de Massa", valor: massa.valor });

    if (ajuste.cartaDoDestino) {
      if (!ctx.opcoes.cartasDoDestino) return recusa("As Cartas do Destino estão desligadas nesta campanha.");
      if (esp.tipo !== "habilidade") return recusa("A Carta do Destino garante crítico só em ataque ou teste de habilidade.");
      if (!vivo.cartaDoDestino) return recusa("Este personagem não tem Carta do Destino.");
      mudancas.push({ op: "carta_do_destino", alvo: alvoDe(p), antes: true, depois: false });
    }

    const comum = {
      pedidoId: esp.pedidoId,
      personagemId: p.id,
      personagemNome: nomeDe(p),
      donoId: p.participanteId,
      tipo: esp.tipo,
      teste: esp.teste,
      rotulo: this.rotulo(esp, calc),
      dt: esp.dt,
      dtVisivel: esp.dtVisivel,
      opcao: ajuste.opcao,
      bonus: ajuste.bonus,
      modo: ajuste.modo,
      anteriorId: null,
      habilidades: ajuste.habilidades,
      forcado: ajuste.forcado,
      consequencia: ajuste.forcado,
      cartaDoDestino: ajuste.cartaDoDestino,
      automatico: ajuste.automatico,
      efeitoAplicado: null,
    };

    if (esp.tipo === "passivo") {
      const passivo = valorPassivo(montado, ctx);
      return {
        mudancas,
        dados: {
          ...comum,
          estado: "passivo",
          dados: [],
          escolhido: 0,
          natural: null,
          cartas: [],
          modificadores: passivo.parcelas,
          total: passivo.falhaAutomatica ? null : passivo.total,
          sucesso: passivo.falhaAutomatica ? false : esp.dt === null ? null : passivo.total >= esp.dt,
          critico: null,
          falhaAutomatica: passivo.falhaAutomatica,
          oponente: null,
        },
      };
    }

    const r = resolverTeste(montado, {
      tipo: tipoDaRegra,
      dt: esp.dt,
      modelo: ctx.opcoes.modeloVantagem,
      ctx,
      aleatorio: this.aleatorio,
      opcao: ajuste.opcao,
      criticoGarantido: ajuste.criticoGarantido,
    });
    let sucesso = r.sucesso;
    if (esp.oponente) sucesso = venceContestado(r.total, esp.oponente.total, esp.oponente.quemAge) === "personagem";
    return {
      mudancas,
      dados: {
        ...comum,
        estado: "rolado",
        dados: r.d20?.dados ?? (r.natural !== null ? [r.natural] : []),
        escolhido: r.d20?.escolhido ?? 0,
        natural: r.natural,
        cartas: (r.d20?.cartas ?? []).map((c) => ({ valor: c.carta.valor, naipe: c.carta.naipe, modificador: c.modificador, valeu: c.valeu })),
        modificadores: r.modificadores,
        total: r.total,
        sucesso,
        critico: r.critico,
        falhaAutomatica: r.falhaAutomatica,
        oponente: esp.oponente ? { nome: esp.oponente.nome, total: esp.oponente.total, dados: esp.oponente.dados, visivel: esp.oponente.visivel } : null,
      },
    };
  }

  private emCombate(personagemId: string) {
    const combate = this.host.combates.combate();
    return !!combate && combate.fase !== "encerrado" && combate.combatentes.some((c) => c.personagemId === personagemId);
  }

  /* Aplica o que o teste gasta (com desfazer), aplica o efeito da falha e grava o resultado. */
  private concluir(
    p: PersonagemBanco,
    dados: DadosResultadoTeste,
    mudancas: Mudanca[],
    quem: Espectador,
    ctx: ContextoCombate,
    pedido: PedidoTeste | null,
    anterior: EventoResultado | null,
  ): Recusa | void {
    if (mudancas.length) {
      const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${nomeDe(p)}: ${this.rotuloDoGasto(mudancas)}`, mudancas });
      if ("recusado" in r) return r;
    }
    let efeitoAplicado: string | null = anterior?.dados.efeitoAplicado ?? null;
    const falhou = dados.sucesso === false && (dados.estado === "rolado" || dados.estado === "decidido" || dados.estado === "passivo");
    if (falhou && pedido?.efeitoNaFalha && !efeitoAplicado) {
      efeitoAplicado = this.aplicarEfeitoDaFalha(p, pedido, quem, ctx);
    }
    /* Deu certo depois de forçar ou rolar de novo: o efeito da falha anterior sai. */
    if (dados.sucesso === true && efeitoAplicado) {
      this.host.combates.desfazerComoMestre(efeitoAplicado, quem);
      efeitoAplicado = null;
    }
    if (dados.sucesso === true && pedido?.efeitoNoSucesso) this.tirarEfeitoNoSucesso(p, pedido.efeitoNoSucesso, quem, ctx);
    /* Estresse (regra opcional): falha crítica em teste de habilidade +1, acerto crítico (inclusive garantido) −1.
       Resistência, Fazer com Calma e Tentar até Conseguir não contam (regra.aliviando-estresse). */
    if ((dados.tipo === "habilidade" || dados.tipo === "contestado") && dados.estado === "rolado" && dados.opcao === "rolar" && dados.critico) {
      const delta = dados.critico === "falha" ? estresseDe(ctx, "falha_critica") : -alivioDe(ctx, "acerto_critico");
      const estado = this.estadoDe(p, ctx);
      if (delta && !("recusado" in estado)) {
        const e = mudarEstresse(alvoDe(p), estado.vivo, estado.calc, delta, ctx, this.aleatorio);
        if (e.mudancas.length) this.host.combates.aplicar(quem, ctx, { rotulo: `${nomeDe(p)}: ${e.notas.join(", ")} (${dados.critico === "falha" ? "falha crítica" : "acerto crítico"})`, mudancas: e.mudancas });
      }
    }
    this.host.registrar(this.host.novoEvento(quem, { tipo: "teste_resultado", dados: { ...dados, anteriorId: anterior?.id ?? null, efeitoAplicado } }));
  }

  private rotuloDoGasto(mudancas: Mudanca[]) {
    const partes = mudancas.map((m) => (m.op === "carta_do_destino" ? "usou a Carta do Destino" : m.op === "marcas" ? "usou a vantagem do Rei" : null)).filter(Boolean);
    return partes.length ? partes.join(", ") : "gasto do teste";
  }

  private tirarEfeitoNoSucesso(p: PersonagemBanco, s: NonNullable<PedidoTeste["efeitoNoSucesso"]>, quem: Espectador, ctx: ContextoCombate) {
    const estado = this.estadoDe(p, ctx);
    if ("recusado" in estado) return;
    const efeito = estado.vivo.efeitos.find((e) => e.id === s.efeitoAtivoId);
    if (!efeito) return;
    const mudanca = removerAcumulo(alvoDe(p), efeito, s.remover === "todos" ? efeito.acumulos : s.remover);
    const rotulo = mudanca.op === "efeito_sai" ? `${efeito.nome} saiu de ${nomeDe(p)} (passou no teste)` : `${efeito.nome} de ${nomeDe(p)} perdeu um acúmulo (passou no teste)`;
    this.host.combates.aplicar(quem, ctx, { rotulo, mudancas: [mudanca] });
  }

  /* Pedido que o próprio app faz: teste de efeito no fim do turno, ou de uma ação de efeito. */
  pedirPeloSistema(pedido: PedidoTeste, quem: Espectador): Recusa | void {
    return this.pedir(pedido, { ...quem, papel: "mestre" });
  }

  private aplicarEfeitoDaFalha(p: PersonagemBanco, pedido: PedidoTeste, quem: Espectador, ctx: ContextoCombate): string | null {
    const efeito = pedido.efeitoNaFalha!;
    const estado = this.estadoDe(p, ctx);
    if ("recusado" in estado) return null;
    const alvo = alvoDe(p);
    let mudanca: Mudanca;
    let nome: string;
    if (efeito.efeitoId === ID_EXAUSTAO) {
      nome = ctx.efeitos.get(ID_EXAUSTAO)?.nome ?? "Exaustão";
      mudanca = { op: "somar", alvo, campo: "exaustao", delta: efeito.acumulos ?? 1 };
    } else {
      const r = aplicarEfeito(alvo, estado.vivo.efeitos, { id: randomUUID(), efeitoId: efeito.efeitoId, acumulos: efeito.acumulos, turnos: efeito.turnos ?? null, origem: pedido.origem ?? "Teste" }, ctx);
      if ("recusado" in r) return null;
      mudanca = r.mudanca;
      nome = ctx.efeitos.get(efeito.efeitoId)?.nome ?? efeito.efeitoId;
    }
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${nome} em ${nomeDe(p)} (falhou no teste)`, mudancas: [mudanca] });
    return "recusado" in r ? null : r.eventoId;
  }

  /* ---------- Mensagens ---------- */

  private pedir(pedido: PedidoTeste, quem: Espectador): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre pede testes.");
    const c = this.contexto();
    if ("recusado" in c) return c;
    const { ctx } = c;
    if (this.pedidoGravado(pedido.id)) return recusa("Esse pedido já foi enviado.");
    const ids = pedido.personagens.map((p) => p.personagemId);
    if (new Set(ids).size !== ids.length) return recusa("Um personagem aparece duas vezes no pedido.");
    const personagens: PersonagemBanco[] = [];
    for (const id of ids) {
      const p = this.personagemAtivo(id);
      if ("recusado" in p) return p;
      personagens.push(p);
    }
    if (pedido.efeitoNaFalha && pedido.efeitoNaFalha.efeitoId !== ID_EXAUSTAO && !ctx.efeitos.has(pedido.efeitoNaFalha.efeitoId)) return recusa("Esse efeito não está no conteúdo da campanha.");

    /* Contra grupo, o oponente rola uma vez (especificação 8.1). */
    let oponente: EventoPedido["dados"]["oponente"] = null;
    if (pedido.tipo === "contestado") {
      const lado = pedido.oponente.modo === "normal" ? null : pedido.oponente.modo;
      const d20 = rolarD20ComVantagem(saldoDeVantagem(lado === "vantagem" ? 1 : 0, lado === "desvantagem" ? 1 : 0), ctx.opcoes.modeloVantagem, ctx.regras, this.aleatorio);
      oponente = { dados: d20.dados, natural: d20.natural, total: d20.natural + pedido.oponente.bonus + d20.modificadorDeCarta };
    }

    const donos = Object.fromEntries(personagens.map((p) => [p.id, p.participanteId]));
    const rotulo = this.rotulo(this.especificacao(pedido, personagens[0]!.id, oponente), null);
    this.host.registrar(this.host.novoEvento(quem, { tipo: "teste_pedido", dados: { pedido, oponente, donos, rotulo } }));

    for (const p of personagens) {
      const esp = this.especificacao(pedido, p.id, oponente);
      const mestre = ajusteDoMestre(pedido, p.id);
      if (pedido.tipo === "passivo") {
        this.rolarEConcluir(p, esp, { ...AJUSTE_PADRAO, mestre }, quem, ctx, pedido, null);
        continue;
      }
      /* "Rolar resistências automaticamente": rola sozinho, a não ser que uma habilidade sirva antes de rolar. */
      if (pedido.tipo === "resistencia" && p.vivo.automatico && !this.temHabilidadeAntesDeRolar(p, esp, ctx)) {
        this.rolarEConcluir(p, esp, { ...AJUSTE_PADRAO, mestre, automatico: true }, quem, ctx, pedido, null);
      }
    }
  }

  private rolarEConcluir(p: PersonagemBanco, esp: Especificacao, ajuste: Ajuste, quem: Espectador, ctx: ContextoCombate, pedido: PedidoTeste | null, anterior: EventoResultado | null): Recusa | void {
    const r = this.rolar(p, esp, ajuste, ctx);
    if ("recusado" in r) return r;
    return this.concluir(p, r.dados, r.mudancas, quem, ctx, pedido, anterior);
  }

  /* Habilidades da ficha marcadas para esta situação, com usos sobrando. */
  habilidadesPara(p: PersonagemBanco, esp: Pick<Especificacao, "tipo" | "teste">, momento: "antes_de_rolar" | "apos_falha", ctx: ContextoCombate): HabilidadeDaFicha[] {
    const ctxFicha = this.host.contextoFicha();
    const estado = this.estadoDe(p, ctx);
    if (!ctxFicha || "recusado" in estado) return [];
    const atributo = esp.teste.alvo === "atributo" ? esp.teste.atributo : (estado.calc.pericias.find((x) => esp.teste.alvo === "pericia" && x.id === esp.teste.periciaId)?.atributo ?? null);
    const situacao = { teste: esp.tipo === "resistencia" ? ("resistencia" as const) : ("habilidade" as const), atributo };
    return habilidadesQueServem(habilidadesDaFicha(p.ficha, ctxFicha), situacao, momento).filter((h) => usosRestantes(h, estado.vivo, estado.calc) !== 0);
  }

  private temHabilidadeAntesDeRolar(p: PersonagemBanco, esp: Especificacao, ctx: ContextoCombate) {
    return this.habilidadesPara(p, esp, "antes_de_rolar", ctx).length > 0;
  }

  /* Gasta usos e fichas da habilidade escolhida antes de rolar ou para rolar de novo. */
  private gastarHabilidade(p: PersonagemBanco, habilidadeId: string, permitidas: HabilidadeDaFicha[], ctx: ContextoCombate): { nome: string; mudancas: Mudanca[] } | Recusa {
    const h = permitidas.find((x) => x.id === habilidadeId);
    if (!h) return recusa("Essa habilidade não serve para este teste agora.");
    const estado = this.estadoDe(p, ctx);
    if ("recusado" in estado) return estado;
    const r = gastarHabilidade(alvoDe(p), h, estado.vivo, estado.calc);
    if ("recusado" in r) return r;
    return { nome: h.nome, mudancas: r.mudancas };
  }

  private exigirPendente(pedidoId: string, personagemId: string): { evento: EventoPedido; p: PersonagemBanco; atual: EventoResultado | undefined } | Recusa {
    const evento = this.pedidoGravado(pedidoId);
    if (!evento || !evento.dados.pedido.personagens.some((x) => x.personagemId === personagemId)) return recusa("Esse teste não existe mais.");
    const p = this.personagemAtivo(personagemId);
    if ("recusado" in p) return p;
    return { evento, p, atual: this.atualDoPedido(pedidoId, personagemId) };
  }

  private responder(resposta: Extract<MensagemDeTeste, { t: "responder_teste" }>["resposta"], quem: Espectador): Recusa | void {
    const c = this.contexto();
    if ("recusado" in c) return c;
    const { ctx } = c;
    const pend = this.exigirPendente(resposta.pedidoId, resposta.personagemId);
    if ("recusado" in pend) return pend;
    const { evento, p, atual } = pend;
    if (!this.podeAgirPor(p, quem)) return recusa("Esse personagem não é seu.");
    const { pedido } = evento.dados;
    if (pedido.tipo === "passivo") return recusa("Esse teste não é rolado.");
    if (atual) return recusa(atual.dados.estado === "recusado" ? "Você recusou: agora o mestre decide." : "Esse teste já foi feito.");
    const esp = this.especificacao(pedido, p.id, evento.dados.oponente);

    const mudancas: Mudanca[] = [];
    const habilidades: string[] = [];
    if (resposta.habilidadeId) {
      const g = this.gastarHabilidade(p, resposta.habilidadeId, this.habilidadesPara(p, esp, "antes_de_rolar", ctx), ctx);
      if ("recusado" in g) return g;
      mudancas.push(...g.mudancas);
      habilidades.push(g.nome);
    }
    const r = this.rolar(
      p,
      esp,
      { ...AJUSTE_PADRAO, bonus: resposta.bonus, modo: resposta.modo, mestre: ajusteDoMestre(pedido, p.id), opcao: resposta.opcao, cartaDoDestino: resposta.usarCartaDoDestino, criticoGarantido: resposta.usarCartaDoDestino, habilidades },
      ctx,
    );
    if ("recusado" in r) return r;
    return this.concluir(p, r.dados, [...mudancas, ...r.mudancas], quem, ctx, pedido, null);
  }

  private recusar(pedidoId: string, personagemId: string, quem: Espectador): Recusa | void {
    const pend = this.exigirPendente(pedidoId, personagemId);
    if ("recusado" in pend) return pend;
    const { evento, p, atual } = pend;
    if (!this.podeAgirPor(p, quem)) return recusa("Esse personagem não é seu.");
    if (atual) return recusa("Esse teste já foi respondido.");
    const esp = this.especificacao(evento.dados.pedido, p.id, evento.dados.oponente);
    this.host.registrar(this.host.novoEvento(quem, { tipo: "teste_resultado", dados: this.semRolagem(p, esp, "recusado", null) }));
  }

  private semRolagem(p: PersonagemBanco, esp: Especificacao, estado: "recusado" | "decidido" | "cancelado", sucesso: boolean | null, anteriorId: string | null = null): DadosResultadoTeste {
    return {
      pedidoId: esp.pedidoId,
      personagemId: p.id,
      personagemNome: nomeDe(p),
      donoId: p.participanteId,
      tipo: esp.tipo,
      teste: esp.teste,
      rotulo: this.rotulo(esp, null),
      estado,
      dados: [],
      escolhido: 0,
      natural: null,
      cartas: [],
      modificadores: [],
      total: null,
      dt: esp.dt,
      dtVisivel: esp.dtVisivel,
      sucesso,
      critico: null,
      opcao: "rolar",
      bonus: 0,
      modo: "normal",
      anteriorId,
      falhaAutomatica: null,
      habilidades: [],
      forcado: false,
      consequencia: false,
      cartaDoDestino: false,
      automatico: false,
      oponente: esp.oponente ? { nome: esp.oponente.nome, total: esp.oponente.total, dados: esp.oponente.dados, visivel: esp.oponente.visivel } : null,
      efeitoAplicado: null,
    };
  }

  /* Cartão do mestre: Sucesso, Falha, Rolar por ele ou Cancelar teste (especificação 8.4). */
  private decidir(m: Extract<MensagemDeTeste, { t: "decidir_teste" }>, quem: Espectador): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre decide o teste.");
    const c = this.contexto();
    if ("recusado" in c) return c;
    const { ctx } = c;
    const pend = this.exigirPendente(m.pedidoId, m.personagemId);
    if ("recusado" in pend) return pend;
    const { evento, p, atual } = pend;
    if (atual && atual.dados.estado !== "recusado") return recusa("Esse teste já tem resultado.");
    const { pedido } = evento.dados;
    if (pedido.tipo === "passivo") return recusa("O passivo não espera resposta.");
    const esp = this.especificacao(pedido, p.id, evento.dados.oponente);
    switch (m.acao) {
      case "rolar":
        return this.rolarEConcluir(p, esp, { ...AJUSTE_PADRAO, mestre: ajusteDoMestre(pedido, p.id) }, quem, ctx, pedido, atual ?? null);
      case "cancelar":
        this.host.registrar(this.host.novoEvento(quem, { tipo: "teste_resultado", dados: this.semRolagem(p, esp, "cancelado", null, atual?.id ?? null) }));
        return;
      case "sucesso":
      case "falha":
        return this.concluir(p, this.semRolagem(p, esp, "decidido", m.acao === "sucesso"), [], quem, ctx, pedido, atual ?? null);
    }
  }

  /* O resultado que ainda pode ser mexido: o último da sua cadeia, rolado, de quem pede. */
  private exigirResultado(resultadoId: string, quem: Espectador): { resultado: EventoResultado; p: PersonagemBanco } | Recusa {
    const todos = this.resultados();
    const resultado = todos.find((r) => r.id === resultadoId);
    if (!resultado) return recusa("Esse resultado não existe.");
    if (todos.some((r) => r.dados.anteriorId === resultadoId)) return recusa("Esse resultado já foi substituído.");
    if (resultado.dados.pedidoId && this.atualDoPedido(resultado.dados.pedidoId, resultado.dados.personagemId)?.id !== resultadoId) return recusa("Esse resultado já foi substituído.");
    const p = this.personagemAtivo(resultado.dados.personagemId);
    if ("recusado" in p) return p;
    if (!this.podeAgirPor(p, quem)) return recusa("Esse personagem não é seu.");
    if (resultado.dados.estado !== "rolado") return recusa("Só dá para fazer isso depois de uma rolagem.");
    return { resultado, p };
  }

  private especificacaoDoResultado(resultado: EventoResultado): { esp: Especificacao; pedido: PedidoTeste | null } | Recusa {
    const d = resultado.dados;
    if (!d.pedidoId) {
      return { pedido: null, esp: { pedidoId: null, tipo: d.tipo, teste: d.teste, dt: null, dtVisivel: false, oponente: null } };
    }
    const evento = this.pedidoGravado(d.pedidoId);
    if (!evento) return recusa("Esse teste não existe mais.");
    return { pedido: evento.dados.pedido, esp: this.especificacao(evento.dados.pedido, d.personagemId, evento.dados.oponente) };
  }

  /* Forçar a Rolagem (Jogador, Progressão): só em teste de habilidade que falhou, uma vez, com a DT 1 menor. */
  private forcar(resultadoId: string, quem: Espectador): Recusa | void {
    const c = this.contexto();
    if ("recusado" in c) return c;
    const { ctx } = c;
    const regra = ctx.regras.forcar;
    if (!regra) return recusa("Forçar a Rolagem ainda não foi revisada no pacote de conteúdo.");
    const alvo = this.exigirResultado(resultadoId, quem);
    if ("recusado" in alvo) return alvo;
    const { resultado, p } = alvo;
    const d = resultado.dados;
    if (d.tipo !== "habilidade" || !d.pedidoId) return recusa("Forçar a Rolagem vale só em teste de habilidade pedido pelo mestre.");
    if (d.sucesso !== false) return recusa("Só dá para forçar depois de uma falha.");
    if (d.falhaAutomatica) return recusa(`${d.falhaAutomatica}: a falha é automática.`);
    if (this.cadeia(resultado).some((r) => r.dados.forcado)) return recusa("A rolagem já foi forçada uma vez.");
    const de = this.especificacaoDoResultado(resultado);
    if ("recusado" in de) return de;
    const esp = { ...de.esp, dt: (de.esp.dt ?? 0) + regra.dt };
    return this.rolarEConcluir(p, esp, { ...AJUSTE_PADRAO, bonus: d.bonus, modo: d.modo, mestre: ajusteDoMestre(de.pedido, p.id), forcado: true, habilidades: d.habilidades }, quem, ctx, de.pedido, resultado);
  }

  /* Todos os resultados que levaram a este, do primeiro ao último. */
  private cadeia(resultado: EventoResultado): EventoResultado[] {
    const todos = new Map(this.resultados().map((r) => [r.id, r]));
    const lista: EventoResultado[] = [];
    let atual: EventoResultado | undefined = resultado;
    while (atual) {
      lista.unshift(atual);
      atual = atual.dados.anteriorId ? todos.get(atual.dados.anteriorId) : undefined;
    }
    return lista;
  }

  /* Habilidade marcada "apos_falha" (Plano B, Persona): gasta e rola de novo. */
  private rolarDeNovo(resultadoId: string, habilidadeId: string, quem: Espectador): Recusa | void {
    const c = this.contexto();
    if ("recusado" in c) return c;
    const { ctx } = c;
    const alvo = this.exigirResultado(resultadoId, quem);
    if ("recusado" in alvo) return alvo;
    const { resultado, p } = alvo;
    const d = resultado.dados;
    if (d.sucesso !== false) return recusa("Só dá para rolar de novo depois de uma falha.");
    const de = this.especificacaoDoResultado(resultado);
    if ("recusado" in de) return de;
    const g = this.gastarHabilidade(p, habilidadeId, this.habilidadesPara(p, de.esp, "apos_falha", ctx), ctx);
    if ("recusado" in g) return g;
    const r = this.rolar(p, de.esp, { ...AJUSTE_PADRAO, bonus: d.bonus, modo: d.modo, mestre: ajusteDoMestre(de.pedido, p.id), opcao: d.opcao, forcado: d.forcado, habilidades: [...d.habilidades, g.nome] }, ctx);
    if ("recusado" in r) return r;
    return this.concluir(p, r.dados, [...g.mudancas, ...r.mudancas], quem, ctx, de.pedido, resultado);
  }

  /* Teste que o próprio jogador faz pela aba Combate, sem pedido e sem DT. */
  private rapido(m: Extract<MensagemDeTeste, { t: "teste_rapido" }>, quem: Espectador): Recusa | void {
    const c = this.contexto();
    if ("recusado" in c) return c;
    const { ctx } = c;
    const p = this.personagemAtivo(m.personagemId);
    if ("recusado" in p) return p;
    if (!this.podeAgirPor(p, quem)) return recusa("Esse personagem não é seu.");
    if (m.tipo === "resistencia" && m.teste.alvo !== "atributo") return recusa("Resistência é sempre de um atributo.");
    const esp: Especificacao = { pedidoId: null, tipo: m.tipo, teste: m.teste, dt: null, dtVisivel: false, oponente: null };
    return this.rolarEConcluir(p, esp, { ...AJUSTE_PADRAO, bonus: m.bonus, modo: m.modo, opcao: m.opcao, cartaDoDestino: m.usarCartaDoDestino, criticoGarantido: m.usarCartaDoDestino }, quem, ctx, null, null);
  }

  /* Preferência do jogador; não vai para o registro. */
  private automatico(personagemId: string, ligado: boolean, quem: Espectador): Recusa | void {
    const p = this.personagemAtivo(personagemId);
    if ("recusado" in p) return p;
    if (!this.podeAgirPor(p, quem)) return recusa("Esse personagem não é seu.");
    const vivo = { ...p.vivo, automatico: ligado };
    this.repo.salvarPersonagem(p.id, { vivo }, new Date().toISOString());
    this.host.enviarPersonagem({ id: p.id, participanteId: p.participanteId, situacao: p.situacao, ficha: p.ficha, vivo }, p.participanteId);
  }

  private cartaDoDestino(personagemId: string, tem: boolean, quem: Espectador): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre dá ou tira a Carta do Destino.");
    const c = this.contexto();
    if ("recusado" in c) return c;
    const { ctx } = c;
    if (!ctx.opcoes.cartasDoDestino) return recusa("As Cartas do Destino estão desligadas nesta campanha.");
    const p = this.personagemAtivo(personagemId);
    if ("recusado" in p) return p;
    if (p.vivo.cartaDoDestino === tem) return recusa(tem ? "Já tem a Carta do Destino: são no máximo uma." : "Não tem Carta do Destino.");
    const r = this.host.combates.aplicar(quem, ctx, {
      rotulo: tem ? `Carta do Destino para ${nomeDe(p)}` : `${nomeDe(p)} perdeu a Carta do Destino`,
      mudancas: [{ op: "carta_do_destino", alvo: alvoDe(p), antes: !tem, depois: tem }],
    });
    if ("recusado" in r) return r;
  }
}
