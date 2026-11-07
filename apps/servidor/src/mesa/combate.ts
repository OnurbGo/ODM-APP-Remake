import { randomUUID } from "node:crypto";
import type { Conteudo, Criatura, Ameaca } from "@odm/conteudo";
import {
  EstadoCombate,
  type Alvo,
  type Combatente,
  type EstadoVivo,
  type EventoCompleto,
  type MensagemClienteLida,
  type Mudanca,
  type Personagem,
  type RolagemDeCombate,
} from "@odm/protocolo";
import {
  aindaPodeDesfazer,
  aplicarMudancas,
  calcularFicha,
  comprarCartas,
  completarFichas,
  criarBaralho,
  criarContextoCombate,
  daVez,
  eEspecial,
  embaralhar,
  expirarMarcasDe,
  fimDaRodada,
  fimDoTurno,
  fontesDosEfeitos,
  gastarPa,
  habilidadesDaFicha,
  inicioDoTurno,
  usosDoCombate,
  MudancaInvalida,
  NOME_DA_CARTA,
  ordenarIniciativa,
  pendenciasDaIniciativa,
  proximoNaOrdem,
  situacaoDoVivo,
  trocarPosicoes,
  type Aleatorio,
  type ContextoCombate,
  type ContextoFicha,
  type Limites,
  type Mundo,
} from "@odm/regras";
import type { Campanha, PersonagemBanco, Repositorio } from "../banco/repositorio";
import type { Espectador } from "./visibilidade";

/* A parte da mesa que cuida do combate (especificação 7.1, fase 5). Toda ação vira mudanças do motor de regras,
   que já trazem a inversa: o evento do registro guarda as inversas, e desfazer é aplicar essas inversas. */

type Hospedeiro = {
  campanha: () => Campanha | undefined;
  conteudo: () => Conteudo | null;
  contextoFicha: () => ContextoFicha | null;
  registrar: (evento: EventoCompleto) => void;
  novoEvento: <T extends Pick<EventoCompleto, "tipo" | "dados">>(quem: Espectador, corpo: T) => EventoCompleto;
  enviarPersonagem: (personagem: Personagem, antigoDono: string | null) => void;
  enviarCombate: () => void;
};

export type Recusa = { recusado: string };

/* O que os efeitos fazem no início e no fim de um turno (acoes.ts): mudanças, texto do registro e testes a pedir. */
export type EfeitosDoTurno = { mudancas: Mudanca[]; notas: string[]; notasMestre: string[]; aoTerminar: (quem: Espectador) => void };
export type GanchoDoTurno = (c: Combatente, momento: "inicio_do_turno" | "fim_do_turno", ctx: ContextoCombate, recargas?: { acaoId: string; rolagem: number }[]) => EfeitosDoTurno;
const recusa = (motivo: string): Recusa => ({ recusado: motivo });

type MensagemDeCombate = Extract<
  MensagemClienteLida,
  {
    t:
      | "combate_criar"
      | "iniciativa_comprar"
      | "iniciativa_escolher_carta"
      | "iniciativa_efeito"
      | "iniciativa_desempatar"
      | "combate_comecar"
      | "turno_encerrar"
      | "rodada_nova"
      | "pa_gastar"
      | "combate_encerrar"
      | "combate_desfazer";
  }
>;

const SO_DO_MESTRE = new Set(["combate_criar", "iniciativa_desempatar", "combate_comecar", "rodada_nova", "combate_encerrar"]);

type Execucao = {
  rotulo: string;
  rotuloMestre?: string | null;
  mudancas: Mudanca[];
  autor?: Combatente | null;
  rolagem?: RolagemDeCombate | null;
  rolagemJogador?: RolagemDeCombate | null;
};

/* Elite: "10 (+10 PV)" na ficha. Sem o número entre parênteses, a versão Elite usa os PV normais. */
export const pvDaFicha = (ficha: Criatura | Ameaca, elite: boolean) => {
  const extra = elite ? Number(ficha.pvTexto?.match(/\(\s*\+\s*(\d+)\s*PV/i)?.[1] ?? 0) : 0;
  return (ficha.pv ?? 0) + extra;
};

export class Combates {
  /* Preenchido pela mesa depois de montar as ações: gatilhos de efeito em cada troca de turno. */
  ganchoDoTurno: GanchoDoTurno | null = null;
  /* A Horda tem PA próprio por turno (Formar Horda). */
  paPorTurnoDe: ((c: Combatente) => number | null) | null = null;
  private cacheCtx: { chave: string; ctx: ContextoCombate | null; faltando: string[] } | null = null;

  constructor(
    private readonly repo: Repositorio,
    private readonly host: Hospedeiro,
    private readonly aleatorio: Aleatorio,
  ) {}

  /* ---------- Leitura ---------- */

  combate(): EstadoCombate | null {
    const campanha = this.host.campanha();
    return campanha ? this.repo.combateAberto(campanha.id) : null;
  }

  contexto(): { ctx: ContextoCombate } | Recusa {
    const campanha = this.host.campanha();
    const conteudo = this.host.conteudo();
    if (!campanha || !conteudo) return recusa("O conteúdo da campanha não está disponível.");
    const opcoes = this.repo.opcoesDa(campanha);
    const chave = `${campanha.id}|${JSON.stringify(opcoes)}|${conteudo.regras.length}`;
    if (this.cacheCtx?.chave !== chave) {
      const r = criarContextoCombate(conteudo, opcoes);
      this.cacheCtx = { chave, ctx: r.ok ? r.contexto : null, faltando: r.ok ? [] : r.faltando };
    }
    if (!this.cacheCtx.ctx) return recusa(`O combate precisa destas regras revisadas no pacote: ${this.cacheCtx.faltando.join(", ")}.`);
    return { ctx: this.cacheCtx.ctx };
  }

  private personagensDaCampanha(): PersonagemBanco[] {
    const campanha = this.host.campanha();
    return campanha ? this.repo.personagensDa(campanha.id).filter((p) => p.situacao === "ativo") : [];
  }

  calculo(p: PersonagemBanco, vivo: EstadoVivo, ctx: ContextoCombate) {
    const ctxFicha = this.host.contextoFicha();
    return ctxFicha ? calcularFicha(p.ficha, ctxFicha, situacaoDoVivo(vivo, ctx)) : null;
  }

  mundo(ctx: ContextoCombate): { mundo: Mundo; personagens: Map<string, PersonagemBanco> } {
    const personagens = new Map(this.personagensDaCampanha().map((p) => [p.id, p]));
    const vivos: Record<string, EstadoVivo> = {};
    for (const p of personagens.values()) {
      const calc = this.calculo(p, p.vivo, ctx);
      vivos[p.id] = calc ? completarFichas(p.vivo, calc) : p.vivo;
    }
    return { mundo: { vivos, combate: this.combate() }, personagens };
  }

  private limites(personagens: Map<string, PersonagemBanco>, ctx: ContextoCombate, mundo: () => Mundo): Limites {
    return {
      pvMaximo: (alvo: Alvo) => {
        if (alvo.tipo !== "personagem") return null;
        const p = personagens.get(alvo.id);
        return p ? (this.calculo(p, mundo().vivos[alvo.id] ?? p.vivo, ctx)?.pvMaximo.valor ?? null) : null;
      },
    };
  }

  /* ---------- Execução: aplica, grava, registra e avisa ---------- */

  private executar(quem: Espectador, ctx: ContextoCombate, e: Execucao): Recusa | void {
    const r = this.aplicar(quem, ctx, e);
    if ("recusado" in r) return r;
  }

  /* Também usado pelos testes (efeito na falha, Carta do Destino, gasto de habilidade): tudo com desfazer. */
  aplicar(quem: Espectador, ctx: ContextoCombate, e: Execucao): Recusa | { eventoId: string } {
    const campanha = this.host.campanha();
    if (!campanha) return recusa("Sem mesa aberta.");
    const { mundo, personagens } = this.mundo(ctx);
    let atual = mundo;
    let resultado;
    try {
      resultado = aplicarMudancas(mundo, e.mudancas, this.limites(personagens, ctx, () => atual));
    } catch (erro) {
      if (erro instanceof MudancaInvalida) return recusa("Isso não pode ser feito agora.");
      throw erro;
    }
    atual = resultado.mundo;
    this.gravar(campanha, mundo, atual, personagens);
    const combate = atual.combate ?? mundo.combate;
    const evento = this.host.novoEvento(quem, {
        tipo: "combate",
        dados: {
          rotulo: e.rotulo,
          rotuloMestre: e.rotuloMestre ?? null,
          inversas: resultado.inversas,
          desfazivelAte: combate && e.autor && combate.fase !== "iniciativa" ? { rodada: combate.rodada, combatenteId: e.autor.id, noTurnoDele: combate.ordem[combate.vez] === e.autor.id && combate.fase === "em_curso" } : null,
          personagens: [...new Set(e.mudancas.flatMap((m) => ("alvo" in m && m.alvo.tipo === "personagem" ? [m.alvo.id] : [])))],
          rolagem: e.rolagem ?? null,
          rolagemJogador: e.rolagemJogador ?? null,
        },
      });
    this.host.registrar(evento);
    return { eventoId: evento.id };
  }

  /* O teste forçado ou rolado de novo deu sucesso: o efeito da falha sai, como se o mestre desfizesse. */
  desfazerComoMestre(eventoId: string, quem: Espectador): Recusa | void {
    const r = this.contexto();
    if ("recusado" in r) return r;
    return this.desfazer(eventoId, { ...quem, papel: "mestre" }, r.ctx);
  }

  private gravar(campanha: Campanha, antes: Mundo, depois: Mundo, personagens: Map<string, PersonagemBanco>) {
    const agora = new Date().toISOString();
    for (const [id, vivo] of Object.entries(depois.vivos)) {
      if (vivo === antes.vivos[id]) continue;
      const p = personagens.get(id);
      if (!p) continue;
      this.repo.salvarPersonagem(id, { vivo }, agora);
      this.host.enviarPersonagem({ id: p.id, participanteId: p.participanteId, situacao: p.situacao, ficha: p.ficha, vivo }, p.participanteId);
    }
    if (depois.combate !== antes.combate) {
      if (depois.combate) this.repo.salvarCombate(campanha.id, depois.combate, depois.combate.fase === "encerrado", agora);
      else if (antes.combate) this.repo.salvarCombate(campanha.id, antes.combate, true, agora);
      this.host.enviarCombate();
    }
  }

  /* ---------- Mensagens ---------- */

  receber(mensagem: MensagemDeCombate, quem: Espectador): Recusa | void {
    if (SO_DO_MESTRE.has(mensagem.t) && quem.papel !== "mestre") return recusa("Só o mestre faz isso.");
    const r = this.contexto();
    if ("recusado" in r) return r;
    const { ctx } = r;
    switch (mensagem.t) {
      case "combate_criar":
        return this.criar(mensagem, quem, ctx);
      case "iniciativa_comprar":
        return this.comprar(mensagem.combatenteId, quem, ctx);
      case "iniciativa_escolher_carta":
        return this.escolherCarta(mensagem.combatenteId, mensagem.cartaId, quem, ctx);
      case "iniciativa_efeito":
        return this.decidirEfeito(mensagem, quem, ctx);
      case "iniciativa_desempatar":
        return this.desempatar(quem, ctx);
      case "combate_comecar":
        return this.comecar(quem, ctx);
      case "turno_encerrar":
        return this.encerrarTurno(quem, ctx);
      case "rodada_nova":
        return this.novaRodada(quem, ctx);
      case "pa_gastar":
        return this.gastar(mensagem, quem, ctx);
      case "combate_encerrar":
        return this.encerrar(quem, ctx);
      case "combate_desfazer":
        return this.desfazer(mensagem.eventoId, quem, ctx);
    }
  }

  /* Quem pode mexer num combatente: o mestre em todos; o jogador só no personagem que controla. */
  podeMexer(c: Combatente, quem: Espectador) {
    if (quem.papel === "mestre") return true;
    if (!c.personagemId) return false;
    return this.repo.personagem(c.personagemId)?.participanteId === quem.id;
  }

  exigirCombate(fase?: EstadoCombate["fase"]): EstadoCombate | Recusa {
    const combate = this.combate();
    if (!combate) return recusa("Não há combate em curso.");
    if (fase && combate.fase !== fase) return recusa(fase === "iniciativa" ? "A iniciativa já foi fechada." : "Isso não vale nesta fase do combate.");
    return combate;
  }

  private criar(m: Extract<MensagemDeCombate, { t: "combate_criar" }>, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    if (this.combate()) return recusa("Já há um combate em curso. Encerre-o antes.");
    const conteudo = this.host.conteudo();
    const ctxFicha = this.host.contextoFicha();
    if (!conteudo || !ctxFicha) return recusa("O conteúdo da campanha não está disponível.");
    if (!m.personagens.length && !m.criaturas.length) return recusa("Escolha quem entra no combate.");
    const combatentes: Combatente[] = [];
    const ativos = new Map(this.personagensDaCampanha().map((p) => [p.id, p]));
    for (const id of new Set(m.personagens)) {
      const p = ativos.get(id);
      if (!p) return recusa("Personagem não encontrado.");
      const calc = this.calculo(p, p.vivo, ctx);
      combatentes.push(this.novoCombatente({ tipo: "personagem", nome: p.ficha.nome || "Sem nome", personagemId: p.id, agilidade: calc?.atributos.agilidade.valor ?? 0 }));
    }
    const fichas = new Map<string, Criatura | Ameaca>([...conteudo.criaturas, ...conteudo.ameacas].map((c) => [c.id, c]));
    for (const pedido of m.criaturas) {
      const ficha = fichas.get(pedido.ref);
      if (!ficha) return recusa("Criatura não encontrada no bestiário.");
      for (let i = 1; i <= pedido.quantidade; i++) {
        const nome = `${ficha.nome}${pedido.elite ? " Elite" : ""}${pedido.quantidade > 1 ? ` ${i}` : ""}`;
        const pv = pvDaFicha(ficha, pedido.elite);
        combatentes.push(
          this.novoCombatente({ tipo: ficha.tipo === "ameaca" ? "npc" : "criatura", nome, ref: ficha.id, elite: pedido.elite, agilidade: ficha.atributos.agilidade ?? 0, pv, pvMaximo: pv }),
        );
      }
    }
    const combate: EstadoCombate = EstadoCombate.parse({
      id: randomUUID(),
      fase: "iniciativa",
      rodada: 0,
      vez: 0,
      ordem: [],
      combatentes,
      baralho: embaralhar(criarBaralho(ctx.regras.iniciativa.baralho.coringas), this.aleatorio),
    });
    return this.executar(quem, ctx, { rotulo: `Combate montado: ${combatentes.map((c) => c.nome).join(", ")}`, mudancas: [{ op: "combate_comeca", combate }] });
  }

  private novoCombatente(dados: Partial<Combatente> & Pick<Combatente, "tipo" | "nome">): Combatente {
    return {
      id: randomUUID(),
      personagemId: null,
      ref: null,
      elite: false,
      agilidade: 0,
      carta: null,
      cartasParaEscolher: [],
      desempate: [],
      usaEfeito: null,
      alvosDoEfeito: [],
      efeitosUsados: [],
      jaAgiu: false,
      pa: { disponiveis: 0, guardados: 0, bloqueados: 0 },
      deslocamentosNaRodada: 0,
      ataquesNoTurno: 0,
      marcas: { reacaoSemCusto: null, vantagemNoProximo: false, deslocamentoSemCusto: 0, paExtraNoPrimeiroTurno: 0, defesaDeReacao: null, comboLiberado: false, testeDeMortePendente: false, imprudente: null, imprudenteNoTurno: false },
      pv: null,
      pvMaximo: null,
      pvTemporarios: 0,
      efeitos: [],
      recargasGastas: [],
      derrotado: false,
      horda: null,
      ...dados,
    };
  }

  private redencaoCompleta(c: Combatente) {
    if (!c.personagemId) return false;
    return this.repo.personagem(c.personagemId)?.ficha.redencao.passos.every((p) => p.feito) ?? false;
  }

  private andamento(combate: EstadoCombate, depois: Partial<Pick<EstadoCombate, "fase" | "rodada" | "vez" | "ordem" | "baralho">>): Mudanca {
    const antes = { fase: combate.fase, rodada: combate.rodada, vez: combate.vez, ordem: combate.ordem, baralho: combate.baralho };
    return { op: "andamento", antes, depois: { ...antes, ...depois } };
  }

  private comprar(combatenteId: string | undefined, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate("iniciativa");
    if ("recusado" in combate) return combate;
    if (!combatenteId && quem.papel !== "mestre") return recusa("Só o mestre compra para todos.");
    const alvos = combate.combatentes.filter((c) => (combatenteId ? c.id === combatenteId : true) && !c.carta && !c.cartasParaEscolher.length);
    if (combatenteId && !alvos.length) return recusa("Esta carta já foi comprada.");
    if (alvos.some((c) => !this.podeMexer(c, quem))) return recusa("Esta carta não é sua.");
    let baralho = combate.baralho;
    const mudancas: Mudanca[] = [];
    const extras = ctx.regras.redencao?.iniciativa.cartas_extras ?? 0;
    const nomes: string[] = [];
    for (const c of alvos) {
      const quantas = this.redencaoCompleta(c) ? 1 + extras : 1;
      const r = comprarCartas(baralho, quantas, this.aleatorio, ctx.regras.iniciativa.baralho.coringas);
      baralho = r.resto;
      const depois = quantas > 1 ? { ...c, cartasParaEscolher: r.compradas } : { ...c, carta: r.compradas[0]!, usaEfeito: eEspecial(r.compradas[0]!) ? null : false };
      mudancas.push({ op: "combatente_muda", antes: c, depois });
      nomes.push(quantas > 1 ? `${c.nome} comprou ${quantas} cartas para escolher` : `${c.nome} tirou ${NOME_DA_CARTA[r.compradas[0]!.valor]}`);
    }
    mudancas.push(this.andamento(combate, { baralho }));
    return this.executar(quem, ctx, { rotulo: nomes.join("; "), mudancas, autor: alvos.length === 1 ? alvos[0] : null });
  }

  private escolherCarta(combatenteId: string, cartaId: string, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate("iniciativa");
    if ("recusado" in combate) return combate;
    const c = combate.combatentes.find((x) => x.id === combatenteId);
    if (!c || !this.podeMexer(c, quem)) return recusa("Esta carta não é sua.");
    const carta = c.cartasParaEscolher.find((x) => x.id === cartaId);
    if (!carta) return recusa("Essa carta não está entre as compradas.");
    const depois = { ...c, carta, cartasParaEscolher: [], usaEfeito: eEspecial(carta) ? null : false };
    return this.executar(quem, ctx, { rotulo: `${c.nome} ficou com ${NOME_DA_CARTA[carta.valor]}`, mudancas: [{ op: "combatente_muda", antes: c, depois }], autor: c });
  }

  private decidirEfeito(m: Extract<MensagemDeCombate, { t: "iniciativa_efeito" }>, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate("iniciativa");
    if ("recusado" in combate) return combate;
    const c = combate.combatentes.find((x) => x.id === m.combatenteId);
    if (!c || !this.podeMexer(c, quem)) return recusa("Esta carta não é sua.");
    if (!c.carta || !eEspecial(c.carta)) return recusa("Só carta especial tem efeito.");
    const valor = c.carta.valor;
    if (m.usar && c.efeitosUsados.includes(valor)) return recusa(`${c.nome} já usou o efeito do ${NOME_DA_CARTA[valor]} neste combate.`);
    const existe = (id: string) => combate.combatentes.some((x) => x.id === id);
    let alvos: string[] = [];
    if (m.usar && valor === "coringa") {
      alvos = [...new Set(m.alvos)];
      if (alvos.length !== 2 || alvos.includes(c.id) || !alvos.every(existe)) return recusa("O Coringa troca dois alvos que não sejam você.");
    }
    if (m.usar && (valor === "K" || valor === "Q")) {
      alvos = m.alvos.slice(0, 1);
      if (alvos.length !== 1 || !existe(alvos[0]!)) return recusa("Escolha quem recebe o efeito (pode ser você).");
    }
    const depois = { ...c, usaEfeito: m.usar, alvosDoEfeito: alvos };
    const rotulo = m.usar ? `${c.nome} vai usar o efeito do ${NOME_DA_CARTA[valor]}` : `${c.nome} ficou com a prioridade do ${NOME_DA_CARTA[valor]}`;
    return this.executar(quem, ctx, { rotulo, mudancas: [{ op: "combatente_muda", antes: c, depois }], autor: c });
  }

  private resultado(combate: EstadoCombate, ctx: ContextoCombate) {
    return ordenarIniciativa(combate.combatentes, ctx.regras, ctx.opcoes.empateIniciativa);
  }

  private desempatar(quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate("iniciativa");
    if ("recusado" in combate) return combate;
    const { pendentes } = this.resultado(combate, ctx);
    if (!pendentes.length) return recusa("Não há empate para desfazer com nova compra.");
    let baralho = combate.baralho;
    const mudancas: Mudanca[] = [];
    const nomes: string[] = [];
    for (const id of pendentes.flat()) {
      const c = combate.combatentes.find((x) => x.id === id)!;
      const r = comprarCartas(baralho, 1, this.aleatorio, ctx.regras.iniciativa.baralho.coringas);
      baralho = r.resto;
      mudancas.push({ op: "combatente_muda", antes: c, depois: { ...c, desempate: [...c.desempate, r.compradas[0]!] } });
      nomes.push(`${c.nome}: ${NOME_DA_CARTA[r.compradas[0]!.valor]}`);
    }
    mudancas.push(this.andamento(combate, { baralho }));
    return this.executar(quem, ctx, { rotulo: `Desempate por nova compra (${nomes.join(", ")})`, mudancas });
  }

  /* Fecha a iniciativa: ordem, trocas do Coringa e os benefícios das cartas especiais. Só sem pendência. */
  private comecar(quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate("iniciativa");
    if ("recusado" in combate) return combate;
    const resultado = this.resultado(combate, ctx);
    const p = pendenciasDaIniciativa(combate.combatentes, resultado, eEspecial);
    if (p.semCarta.length) return recusa("Ainda há quem não comprou carta.");
    if (p.escolhendoCarta.length) return recusa("Ainda há quem não escolheu a carta.");
    if (p.decidindoEfeito.length) return recusa("Ainda há carta especial sem escolha entre efeito e prioridade.");
    if (p.desempate.length) return recusa("Há empate pendente: use Desempatar.");
    let ordem = resultado.ordem;
    const mudancas: Mudanca[] = [];
    const efeitos = ctx.regras.cartasEspeciais.efeitos;
    const porId = new Map(combate.combatentes.map((c) => [c.id, c]));
    const marcas = new Map(combate.combatentes.map((c) => [c.id, c.marcas]));
    const usados = new Map<string, Combatente["efeitosUsados"]>();
    for (const c of combate.combatentes) {
      if (!c.usaEfeito || !c.carta) continue;
      const valor = c.carta.valor;
      usados.set(c.id, [...c.efeitosUsados, valor]);
      const alvo = c.alvosDoEfeito[0];
      if (valor === "coringa" && c.alvosDoEfeito.length === 2) ordem = trocarPosicoes(ordem, c.alvosDoEfeito[0]!, c.alvosDoEfeito[1]!);
      if (valor === "A") marcas.set(c.id, { ...marcas.get(c.id)!, paExtraNoPrimeiroTurno: efeitos.A.pa_extra });
      if (valor === "J") marcas.set(c.id, { ...marcas.get(c.id)!, deslocamentoSemCusto: efeitos.J.deslocamento_sem_custo });
      if (valor === "K" && alvo) marcas.set(alvo, { ...marcas.get(alvo)!, vantagemNoProximo: true });
      if (valor === "Q" && alvo) marcas.set(alvo, { ...marcas.get(alvo)!, reacaoSemCusto: { ate: c.id } });
    }
    for (const c of combate.combatentes) {
      const depois = { ...c, marcas: marcas.get(c.id)!, efeitosUsados: usados.get(c.id) ?? c.efeitosUsados };
      if (JSON.stringify(depois) !== JSON.stringify(c)) mudancas.push({ op: "combatente_muda", antes: c, depois });
    }
    mudancas.push(this.andamento(combate, { fase: "em_curso", rodada: 1, vez: 0, ordem }));
    const primeiro = porId.get(ordem[0]!)!;
    const comMarcas = { ...primeiro, marcas: marcas.get(primeiro.id)! };
    const doTurno: EfeitosDoTurno[] = [];
    mudancas.push(...this.inicioDeTurno(comMarcas, ctx, combate, doTurno));
    return this.comEfeitos(quem, ctx, { rotulo: `Combate começou. Ordem: ${ordem.map((id) => porId.get(id)!.nome).join(" → ")}`, mudancas }, doTurno);
  }

  fontesDe(c: Combatente, ctx: ContextoCombate) {
    const vivo = c.personagemId ? this.repo.personagem(c.personagemId)?.vivo : null;
    return fontesDosEfeitos(vivo ? vivo.efeitos : c.efeitos, ctx);
  }

  private inicioDeTurno(c: Combatente, ctx: ContextoCombate, combate: EstadoCombate, efeitos?: EfeitosDoTurno[]): Mudanca[] {
    /* "Seu Turno" (Jogador, Combate) já está aprovado na camada da ficha. */
    const paPorTurno = this.paPorTurnoDe?.(c) ?? this.host.contextoFicha()?.regras.turno.pa_por_turno ?? 0;
    const r = inicioDoTurno(c, this.fontesDe(c, ctx), paPorTurno, ctx, this.aleatorio);
    const doTurno = this.ganchoDoTurno?.(c, "inicio_do_turno", ctx, r.recargas);
    if (doTurno) efeitos?.push(doTurno);
    return [...expirarMarcasDe(combate, c.id), ...r.mudancas, ...(doTurno?.mudancas ?? [])];
  }

  /* Junta o texto dos gatilhos ao rótulo do evento e, depois de gravar, pede os testes que eles trazem. */
  private comEfeitos(quem: Espectador, ctx: ContextoCombate, e: Execucao, efeitos: EfeitosDoTurno[]): Recusa | void {
    const notas = efeitos.flatMap((x) => x.notas);
    const notasMestre = efeitos.flatMap((x) => [...x.notas, ...x.notasMestre]);
    const rotulo = notas.length ? `${e.rotulo}. ${notas.join(". ")}` : e.rotulo;
    const rotuloMestre = notasMestre.length > notas.length ? `${e.rotulo}. ${notasMestre.join(". ")}` : (e.rotuloMestre ?? null);
    const r = this.executar(quem, ctx, { ...e, rotulo, rotuloMestre });
    if (r) return r;
    for (const x of efeitos) x.aoTerminar(quem);
  }

  private exigirQuemAge(combate: EstadoCombate, quem: Espectador) {
    const c = daVez(combate);
    if (!c) return recusa("Ninguém está agindo agora.");
    if (!this.podeMexer(c, quem)) return recusa("Não é o seu turno.");
    return c;
  }

  private encerrarTurno(quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate("em_curso");
    if ("recusado" in combate) return combate;
    const c = this.exigirQuemAge(combate, quem);
    if ("recusado" in c) return c;
    if (combate.ataquePendente) return recusa("Há um ataque esperando reação: siga ou cancele antes.");
    if (c.marcas.testeDeMortePendente) return recusa(`${c.nome} ainda não fez o Teste de Morte deste turno.`);
    const efeitos: EfeitosDoTurno[] = [];
    /* Fim do turno de quem age: gatilhos ("fim do turno") e a duração dos efeitos dele. */
    const fim = this.ganchoDoTurno?.(c, "fim_do_turno", ctx);
    if (fim) efeitos.push(fim);
    const mudancas: Mudanca[] = [...fimDoTurno(c), ...(fim?.mudancas ?? [])];
    const proximo = proximoNaOrdem(combate);
    mudancas.push(this.andamento(combate, proximo));
    let rotulo = `${c.nome} encerrou o turno`;
    if (proximo.fase === "em_curso") {
      const seguinte = combate.combatentes.find((x) => x.id === combate.ordem[proximo.vez])!;
      mudancas.push(...this.inicioDeTurno(seguinte, ctx, combate, efeitos));
      rotulo += `. Vez de ${seguinte.nome}`;
    } else rotulo += ". Fim da rodada: quem guardou PA ainda pode agir";
    return this.comEfeitos(quem, ctx, { rotulo, mudancas }, efeitos);
  }

  private novaRodada(quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate("fim_da_rodada");
    if ("recusado" in combate) return combate;
    if (combate.ataquePendente) return recusa("Há um ataque esperando reação: siga ou cancele antes.");
    const mudancas: Mudanca[] = [...fimDaRodada(combate)];
    const proximo = proximoNaOrdem(combate);
    mudancas.push(this.andamento(combate, proximo));
    const primeiro = combate.combatentes.find((x) => x.id === combate.ordem[proximo.vez]);
    const efeitos: EfeitosDoTurno[] = [];
    if (primeiro) mudancas.push(...this.inicioDeTurno(primeiro, ctx, combate, efeitos));
    return this.comEfeitos(quem, ctx, { rotulo: `Rodada ${proximo.rodada}${primeiro ? `. Vez de ${primeiro.nome}` : ""}`, mudancas }, efeitos);
  }

  private gastar(m: Extract<MensagemDeCombate, { t: "pa_gastar" }>, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate();
    if ("recusado" in combate) return combate;
    if (combate.fase === "iniciativa") return recusa("O combate ainda não começou.");
    const c = combate.combatentes.find((x) => x.id === m.combatenteId);
    if (!c || !this.podeMexer(c, quem)) return recusa("Este personagem não é seu.");
    const naVez = combate.fase === "em_curso" && combate.ordem[combate.vez] === c.id;
    if (!naVez && m.tipo !== "reacao" && combate.fase !== "fim_da_rodada") return recusa("Fora do seu turno, o PA guardado serve só para reação.");
    const personagem: Alvo | null = c.personagemId ? { tipo: "personagem", id: c.personagemId } : null;
    const r = gastarPa(c, m.quantos, m.tipo, { naVez, fontes: this.fontesDe(c, ctx), ctx, personagem });
    if ("recusado" in r) return r;
    const tipo = { acao: "ação", deslocamento: "deslocamento", reacao: "reação" }[m.tipo];
    let rotulo = `${c.nome} gastou ${m.quantos} PA (${tipo})`;
    if (r.semCusto) rotulo = `${c.nome}: ${tipo} sem custo (${r.semCusto})`;
    if (r.exaustao) rotulo += ". Terceiro deslocamento da rodada: 1 nível de Exaustão";
    return this.executar(quem, ctx, { rotulo, mudancas: r.mudancas, autor: c });
  }

  private encerrar(quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.exigirCombate();
    if ("recusado" in combate) return combate;
    /* Usos "por combate" voltam ao fim do combate (especificação 14). */
    const ctxFicha = this.host.contextoFicha();
    const { mundo } = this.mundo(ctx);
    const usos = ctxFicha
      ? combate.combatentes.flatMap((c) => {
          const p = c.personagemId ? this.repo.personagem(c.personagemId) : undefined;
          return p ? usosDoCombate({ tipo: "personagem", id: p.id }, mundo.vivos[p.id] ?? p.vivo, habilidadesDaFicha(p.ficha, ctxFicha)) : [];
        })
      : [];
    return this.executar(quem, ctx, { rotulo: usos.length ? "Combate encerrado. Os usos por combate voltaram" : "Combate encerrado", mudancas: [...usos, { op: "combate_termina", combate }] });
  }

  /* O mestre desfaz qualquer evento, em qualquer ordem; o jogador, os próprios até o fim do turno dele. */
  private desfazer(eventoId: string, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const campanha = this.host.campanha();
    if (!campanha) return recusa("Sem mesa aberta.");
    const eventos = this.repo.eventosDa(campanha.id);
    const alvo = eventos.find((e) => e.id === eventoId);
    if (alvo?.tipo !== "combate") return recusa("Não há o que desfazer aqui.");
    if (eventos.some((e) => e.tipo === "combate_desfeito" && e.dados.eventoId === eventoId)) return recusa("Isso já foi desfeito.");
    if (quem.papel !== "mestre") {
      if (alvo.autorId !== quem.id) return recusa("Só o mestre desfaz ações de outra pessoa.");
      if (!aindaPodeDesfazer(alvo.dados.desfazivelAte, this.combate())) return recusa("O turno já acabou: agora só o mestre desfaz isso.");
    }
    const { mundo, personagens } = this.mundo(ctx);
    let atual = mundo;
    let resultado;
    try {
      resultado = aplicarMudancas(mundo, alvo.dados.inversas, this.limites(personagens, ctx, () => atual));
    } catch (erro) {
      if (erro instanceof MudancaInvalida) return recusa("Não dá mais para desfazer isso: o que ele mudou já saiu do combate.");
      throw erro;
    }
    atual = resultado.mundo;
    this.gravar(campanha, mundo, atual, personagens);
    this.host.registrar(this.host.novoEvento(quem, { tipo: "combate_desfeito", dados: { eventoId, rotulo: alvo.dados.rotulo } }));
  }

}

/* O que cada um vê do combate (especificação 3.1): o jogador nunca recebe PV de criatura, Recarga nem o baralho. */
export function projetarCombate(combate: EstadoCombate | null, quem: Espectador): EstadoCombate | null {
  if (!combate || quem.papel === "mestre") return combate;
  return {
    ...combate,
    baralho: [],
    combatentes: combate.combatentes.map((c) =>
      c.tipo === "personagem"
        ? c
        : {
            ...c,
            pv: null,
            pvMaximo: null,
            pvTemporarios: 0,
            recargasGastas: [],
            horda: c.horda ? { ...c.horda, integrantes: c.horda.integrantes.map((i) => ({ ...i, pv: 0 })), danoAcumulado: 0 } : null,
          },
    ),
  };
}
