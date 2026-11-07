import { randomUUID } from "node:crypto";
import { faixaDeRecarga, ID_EXAUSTAO, type Acao, type Ameaca, type Conteudo, type Criatura } from "@odm/conteudo";
import type {
  Alvo,
  AtaquePendente,
  Combatente,
  EstadoCombate,
  EstadoVivo,
  IntegranteHorda,
  EventoCompleto,
  MensagemClienteLida,
  Mudanca,
  Operacao,
  PedidoTeste,
  RolagemDeCombate,
} from "@odm/protocolo";
import {
  alvosDoAtaqueDeHorda,
  bonusDeHorda,
  comprarCartas,
  danoNaHorda,
  eEspecial,
  formarHorda,
  hordaDaFicha,
  multiplicadorDeArea,
  posicaoDaCarta,
  pvDaHorda,
  ataqueComArma,
  ataqueDeCriatura,
  aplicarEfeito,
  bloqueiosDePa,
  defesasDaFichaDeCriatura,
  defesasDosEfeitos,
  descontarDuracao,
  disparosDoTurno,
  fontesDosEfeitos,
  gastarPa,
  modificadoresDeCrise,
  montarTeste,
  NOME_ATRIBUTO,
  penalidadeDeAtaquesMultiplos,
  proficienciasDaFicha,
  removerAcumulo,
  resolverDano,
  resolverTeste,
  rolarDados,
  rolarDanoDoAtaque,
  type AtaqueMontado,
  type ContextoCombate,
  type ContextoFicha,
  type DanoRecebido,
  type FichaCalculada,
  type Mundo,
  type Parcela,
} from "@odm/regras";
import type { PersonagemBanco } from "../banco/repositorio";
import { pvDaFicha, type Combates, type EfeitosDoTurno, type Recusa } from "./combate";
import { alivioDe, aoPerderPv, curaEncerraMorrendo, estresseDe, mudarEstresse } from "./vida";
import type { Espectador } from "./visibilidade";

/* Ataques, dano e efeitos em combate (especificação 7.1, etapa 7 da fase 5). Tudo passa por Combates.aplicar,
   que grava as inversas: o mestre desfaz qualquer coisa, o jogador o que fez até o fim do turno dele. */

type Hospedeiro = {
  conteudo: () => Conteudo | null;
  contextoFicha: () => ContextoFicha | null;
  combates: Combates;
  registrar: (evento: EventoCompleto) => void;
  novoEvento: <T extends Pick<EventoCompleto, "tipo" | "dados">>(quem: Espectador, corpo: T) => EventoCompleto;
  pedirTeste: (pedido: PedidoTeste, quem: Espectador) => Recusa | void;
  operarFicha: (personagemId: string, op: Operacao, quem: Espectador) => Recusa | void;
  donoDe: (personagemId: string) => string | null;
  personagem: (id: string) => PersonagemBanco | undefined;
};

type MensagemDeAcao = Extract<
  MensagemClienteLida,
  {
    t:
      | "atacar"
      | "reagir"
      | "ataque_seguir"
      | "ataque_cancelar"
      | "dano_aplicar"
      | "pv_ajustar"
      | "efeito_aplicar"
      | "efeito_editar"
      | "efeito_encerrar"
      | "efeito_acao"
      | "rolar_livre"
      | "horda_formar"
      | "horda_area"
      | "recarga_usar";
  }
>;

const SO_DO_MESTRE = new Set(["ataque_seguir", "ataque_cancelar", "dano_aplicar", "pv_ajustar", "efeito_aplicar", "efeito_editar", "efeito_encerrar", "rolar_livre", "horda_formar", "horda_area", "recarga_usar"]);

const recusa = (motivo: string): Recusa => ({ recusado: motivo });
const comoAlvo = (c: Combatente): Alvo => (c.personagemId ? { tipo: "personagem", id: c.personagemId } : { tipo: "combatente", id: c.id });
const soma = (ps: readonly Parcela[]) => ps.reduce((s, p) => s + p.valor, 0);
const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto => (v && typeof v === "object" ? (v as Objeto) : {});

/* Estado de um alvo de dano: de onde vêm PV, defesas e efeitos. */
type Vitima = {
  alvo: Alvo;
  nome: string;
  pv: number;
  defesa: number | null;
  efeitos: ReturnType<typeof fontesDosEfeitos>;
  imunidades: string[];
  resistencias: string[];
  vulnerabilidades: string[];
  imunidadesACondicao: string[];
  rd: number;
  pvTemporarios: number;
  personagem: PersonagemBanco | null;
  combatente: Combatente | null;
  vivo: EstadoVivo | null;
  calc: FichaCalculada | null;
};

export class Acoes {
  constructor(
    private readonly host: Hospedeiro,
    private readonly aleatorio: (minimo: number, maximo: number) => number,
  ) {}

  receber(m: MensagemDeAcao, quem: Espectador): Recusa | void {
    if (SO_DO_MESTRE.has(m.t) && quem.papel !== "mestre") return recusa("Só o mestre faz isso.");
    const r = this.host.combates.contexto();
    if ("recusado" in r) return r;
    const { ctx } = r;
    switch (m.t) {
      case "atacar":
        return this.atacar(m, quem, ctx);
      case "reagir":
        return this.reagir(m.combatenteId, m.reacao, quem, ctx);
      case "ataque_seguir":
        return this.seguir(quem, ctx);
      case "ataque_cancelar":
        return this.cancelar(quem, ctx);
      case "dano_aplicar":
        return this.danoManual(m.combatenteId, m.valor, m.tipo, m.espacos, quem, ctx);
      case "pv_ajustar":
        return this.ajustarPv(m.alvo, m.delta, m.temporarios, quem, ctx);
      case "efeito_aplicar":
        return this.aplicarEfeito(m, quem, ctx);
      case "efeito_editar":
        return this.editarEfeito(m, quem, ctx);
      case "efeito_encerrar":
        return this.encerrarEfeito(m.alvo, m.efeitoAtivoId, quem, ctx);
      case "efeito_acao":
        return this.acaoDeEfeito(m.alvo, m.efeitoAtivoId, m.indice, quem, ctx);
      case "rolar_livre":
        return this.rolarLivre(m.rotulo, m.formula, m.oculta, quem);
      case "horda_formar":
        return this.formarHorda(m.integrantes, quem, ctx);
      case "horda_area":
        return this.marcarArea(m.hordaId, m.marcados, quem, ctx);
      case "recarga_usar":
        return this.usarRecarga(m.combatenteId, m.acaoId, m.gasta, quem, ctx);
    }
  }

  /* ---------- Leitura ---------- */

  private fichaDe(c: Combatente): Criatura | Ameaca | undefined {
    const conteudo = this.host.conteudo();
    return c.ref ? [...(conteudo?.criaturas ?? []), ...(conteudo?.ameacas ?? [])].find((f) => f.id === c.ref) : undefined;
  }

  private acaoDe(c: Combatente, acaoId: string): Acao | undefined {
    for (const s of this.fichaDe(c)?.secoes ?? []) for (const item of s.itens) if ("id" in item && item.id === acaoId) return item;
    return undefined;
  }

  /* A Horda da ficha da criatura (null sem as regras revisadas). */
  hordaDe(c: Combatente) {
    const acoes = (this.fichaDe(c)?.secoes ?? []).flatMap((s) => s.itens.filter((i): i is Acao => "id" in i));
    return hordaDaFicha(acoes);
  }

  /* Ameaça de Massa sobre este combatente: o modificador da Horda em cuja área o mestre o marcou. */
  ameacaDeMassaEm(combatenteId: string): { valor: number; horda: string } | null {
    for (const h of this.host.combates.combate()?.combatentes ?? []) {
      if (!h.horda || h.derrotado || !h.horda.naArea.includes(combatenteId)) continue;
      const valor = this.hordaDe(h)?.ameaca;
      if (valor) return { valor, horda: h.nome };
    }
    return null;
  }

  private vitima(c: Combatente, mundo: Mundo, personagens: Map<string, PersonagemBanco>, ctx: ContextoCombate): Vitima | null {
    if (c.personagemId) {
      const p = personagens.get(c.personagemId);
      if (!p) return null;
      const vivo = mundo.vivos[p.id] ?? p.vivo;
      const calc = this.host.combates.calculo(p, vivo, ctx);
      if (!calc) return null;
      const efeitos = fontesDosEfeitos(vivo.efeitos, ctx);
      const doEfeito = defesasDosEfeitos(efeitos);
      return {
        alvo: { tipo: "personagem", id: p.id },
        nome: c.nome,
        pv: vivo.pv ?? calc.pvMaximo.valor,
        defesa: calc.defesa.valor,
        efeitos,
        imunidades: [],
        resistencias: doEfeito.resistencias,
        vulnerabilidades: doEfeito.vulnerabilidades,
        imunidadesACondicao: [],
        rd: calc.rd.valor,
        pvTemporarios: vivo.pvTemporarios,
        personagem: p,
        combatente: c,
        vivo,
        calc,
      };
    }
    const ficha = this.fichaDe(c);
    const daFicha = defesasDaFichaDeCriatura(ficha?.extras ?? []);
    const efeitos = fontesDosEfeitos(c.efeitos, ctx);
    const doEfeito = defesasDosEfeitos(efeitos);
    return {
      alvo: { tipo: "combatente", id: c.id },
      nome: c.nome,
      pv: c.pv ?? 0,
      defesa: ficha?.defesa ?? null,
      efeitos,
      imunidades: daFicha.imunidades,
      resistencias: [...daFicha.resistencias, ...doEfeito.resistencias],
      vulnerabilidades: [...daFicha.vulnerabilidades, ...doEfeito.vulnerabilidades],
      imunidadesACondicao: daFicha.imunidadesACondicao,
      rd: daFicha.rd,
      pvTemporarios: c.pvTemporarios,
      personagem: null,
      combatente: c,
      vivo: null,
      calc: null,
    };
  }

  /* Dano pela ordem decidida (Imunidade → Vulnerabilidade/Resistência → RD → PV temporários → PV). Criatura a 0 PV fica
     Derrotada (suposição 4 do plano). Personagem a 0 PV entra em Morrendo; já Morrendo, cada dano é 1 falha. */
  private danoEm(v: Vitima, dano: DanoRecebido, ctx: ContextoCombate, espacos = 0): { mudancas: Mudanca[]; resolvido: ReturnType<typeof resolverDano>; restante: number; nota: string; conta: string; estresse: number } {
    const h = v.combatente?.horda ? v.combatente : null;
    const regrasDaHorda = h ? this.hordaDe(h) : null;
    if (h && regrasDaHorda) {
      const area = espacos && regrasDaHorda.area ? multiplicadorDeArea(espacos, regrasDaHorda.area.tabela, regrasDaHorda.area.maximo) : 1;
      return { ...this.danoNaHorda(v, h, { ...dano, multiplicador: area }, regrasDaHorda.regras), estresse: 0 };
    }
    const r = resolverDano(dano, v);
    const mudancas: Mudanca[] = [];
    if (r.absorvidoPorTemporarios) mudancas.push({ op: "somar", alvo: v.alvo, campo: "pvTemporarios", delta: -r.absorvidoPorTemporarios });
    if (r.perdaDePv) mudancas.push({ op: "somar", alvo: v.alvo, campo: "pv", delta: -r.perdaDePv });
    const restante = Math.max(0, v.pv - r.perdaDePv);
    let nota = "";
    let estresse = 0;
    if (v.personagem && v.vivo) {
      const queda = aoPerderPv(v.alvo, v.vivo, v.pv, r.perdaDePv, ctx, this.aleatorio);
      mudancas.push(...queda.mudancas);
      if (queda.notas.length) nota = `${v.nome} ${queda.notas.join(", ")}`;
      estresse = queda.estresse;
    } else if (restante === 0 && r.perdaDePv > 0 && v.combatente && !v.combatente.derrotado) {
      mudancas.push({ op: "derrotado", alvo: { tipo: "combatente", id: v.combatente.id }, antes: false, depois: true });
      nota = `${v.nome} foi derrotado`;
    }
    const conta = r.conta.map((p) => `${p.rotulo} ${p.valor < 0 ? `−${-p.valor}` : p.valor}`).join(", ");
    return { mudancas, resolvido: r, restante, nota, conta, estresse };
  }

  /* Depois de um dano, a vítima segue com o Morrendo novo (dois danos no mesmo evento não entram duas vezes). */
  private depoisDoDano(v: Vitima, d: { mudancas: Mudanca[]; restante: number; resolvido: { absorvidoPorTemporarios: number } }): Vitima {
    const morrendo = d.mudancas.filter((m) => m.op === "morrendo").at(-1);
    const vivo = v.vivo && morrendo && morrendo.op === "morrendo" ? { ...v.vivo, morrendo: morrendo.depois } : v.vivo;
    return { ...v, vivo, pv: d.restante, pvTemporarios: v.pvTemporarios - d.resolvido.absorvidoPorTemporarios };
  }

  /* Horda: o dano final acumula, e a cada 10 sai um Zumbi; com 2 ou menos, ela se desfaz e quem sobra volta com os PV
     divididos, na carta da Horda (decisão de 06/11/2026). */
  private danoNaHorda(v: Vitima, h: Combatente, dano: DanoRecebido, regras: NonNullable<ReturnType<Acoes["hordaDe"]>>["regras"]) {
    const r = resolverDano(dano, v);
    /* Horda gravada antes de existir "pvInicial": os PV máximos dela são a soma do começo. */
    const horda = h.horda!.pvInicial ? h.horda! : { ...h.horda!, pvInicial: h.pvMaximo ?? pvDaHorda(h.horda!) };
    const depois = danoNaHorda(horda, r.final, regras);
    const mudancas: Mudanca[] = [{ op: "horda", alvo: { tipo: "combatente", id: h.id }, antes: horda, depois: depois.horda }];
    const pvAntes = pvDaHorda(horda);
    const restante = Math.max(0, pvDaHorda(depois.horda));
    const delta = restante - (h.pv ?? pvAntes);
    if (delta) mudancas.push({ op: "somar", alvo: { tipo: "combatente", id: h.id }, campo: "pv", delta });
    const notas: string[] = [];
    if (depois.removidos.length) notas.push(`saíram ${depois.removidos.map((i) => i.nome).join(", ")}`);
    if (depois.destruida) {
      mudancas.push({ op: "derrotado", alvo: { tipo: "combatente", id: h.id }, antes: false, depois: true });
      notas.push(`${h.nome} foi destruída`);
    } else if (depois.desfeita) {
      mudancas.push(...this.desfazerHorda(h, depois.desfeita.integrantes));
      notas.push(`a Horda se desfez: ${depois.desfeita.integrantes.map((i) => `${i.nome} com ${i.pv} PV`).join(", ")}`);
    } else if (depois.removidos.length) {
      notas.push(`bônus de Horda ${bonusDeHorda(depois.horda.integrantes.length, regras.bonusMaximo)}`);
    }
    const conta = r.conta.map((p) => `${p.rotulo} ${p.valor < 0 ? `−${-p.valor}` : p.valor}`).join(", ");
    return { mudancas, resolvido: { ...r, perdaDePv: r.final }, restante, nota: notas.join("; "), conta };
  }

  /* Quem sobra volta como combatente comum, na posição e na carta da Horda. */
  private desfazerHorda(h: Combatente, ficam: IntegranteHorda[]): Mudanca[] {
    const combate = this.host.combates.combate();
    if (!combate) return [];
    const ficha = this.fichaDe(h);
    const novos: Combatente[] = ficam.map((i) => ({
      ...h,
      id: i.id,
      nome: i.nome,
      elite: i.elite,
      pv: i.pv,
      pvMaximo: ficha ? pvDaFicha(ficha, i.elite) : i.pv,
      pvTemporarios: 0,
      horda: null,
      efeitos: [],
      recargasGastas: [],
      derrotado: false,
      pa: { disponiveis: 0, guardados: 0, bloqueados: 0 },
      ataquesNoTurno: 0,
      deslocamentosNaRodada: 0,
      jaAgiu: true,
    }));
    const indice = combate.ordem.indexOf(h.id);
    const ordem = indice < 0 ? combate.ordem : [...combate.ordem.slice(0, indice), ...novos.map((n) => n.id), ...combate.ordem.slice(indice + 1)];
    const vez = indice >= 0 && combate.vez > indice ? combate.vez + novos.length - 1 : combate.vez;
    return [
      ...novos.map((c): Mudanca => ({ op: "combatente_entra", combatente: c, posicao: null })),
      this.andamento(combate, { ordem, vez }),
      { op: "combatente_sai", combatente: h, posicao: null },
    ];
  }

  private andamento(combate: EstadoCombate, depois: Partial<Pick<EstadoCombate, "fase" | "rodada" | "vez" | "ordem" | "baralho">>): Mudanca {
    const antes = { fase: combate.fase, rodada: combate.rodada, vez: combate.vez, ordem: combate.ordem, baralho: combate.baralho };
    return { op: "andamento", antes, depois: { ...antes, ...depois } };
  }

  /* Formar Horda: os integrantes saem, a Horda entra com uma carta nova; as dos Zumbis são descartadas. */
  private formarHorda(ids: string[], quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    const integrantes = [...new Set(ids)].map((id) => combate.combatentes.find((c) => c.id === id));
    if (integrantes.some((c) => !c || c.derrotado || c.personagemId || c.horda)) return recusa("Escolha criaturas que ainda estão no combate e fora de uma Horda.");
    const cs = integrantes as Combatente[];
    if (new Set(cs.map((c) => c.ref)).size !== 1) return recusa("A Horda junta criaturas da mesma ficha.");
    const regras = this.hordaDe(cs[0]!);
    if (!regras) return recusa("A ficha desta criatura não tem a Horda revisada no pacote.");
    if (combate.fase === "em_curso" && cs.some((c) => combate.ordem[combate.vez] === c.id)) return recusa("Forme a Horda fora do turno dos integrantes.");
    const r = formarHorda(cs.map((c) => ({ id: c.id, nome: c.nome, pv: c.pv ?? 0, elite: c.elite })), regras.regras);
    if ("recusado" in r) return r;
    const compra = comprarCartas(combate.baralho, 1, this.aleatorio, ctx.regras.iniciativa.baralho.coringas);
    const carta = compra.compradas[0]!;
    const nomeDaFicha = this.fichaDe(cs[0]!)?.nome ?? "Criaturas";
    const pv = pvDaHorda(r.horda);
    const horda: Combatente = {
      ...cs[0]!,
      id: randomUUID(),
      nome: `Horda de ${nomeDaFicha} (${cs.length})`,
      elite: false,
      carta,
      cartasParaEscolher: [],
      desempate: [],
      /* Carta especial na iniciativa: o mestre decide entre efeito e prioridade, como para qualquer um. */
      usaEfeito: combate.fase === "iniciativa" && eEspecial(carta) ? null : false,
      alvosDoEfeito: [],
      efeitosUsados: [],
      jaAgiu: combate.fase !== "iniciativa",
      pa: { disponiveis: 0, guardados: 0, bloqueados: 0 },
      deslocamentosNaRodada: 0,
      ataquesNoTurno: 0,
      pv,
      pvMaximo: pv,
      pvTemporarios: 0,
      efeitos: [],
      recargasGastas: [],
      derrotado: false,
      horda: r.horda,
    };
    /* Em combate, a Horda entra na ordem pela carta dela; quem já passou na rodada só age na próxima. */
    let ordem = combate.ordem.filter((id) => !cs.some((c) => c.id === id));
    let vez = combate.vez;
    if (combate.fase !== "iniciativa") {
      const rank = (id: string) => {
        const c = combate.combatentes.find((x) => x.id === id);
        return c?.carta ? posicaoDaCarta(c.carta.valor, ctx.regras.iniciativa.ordem) : Number.MAX_SAFE_INTEGER;
      };
      const minha = posicaoDaCarta(carta.valor, ctx.regras.iniciativa.ordem);
      const onde = ordem.findIndex((id) => rank(id) > minha);
      ordem = onde < 0 ? [...ordem, horda.id] : [...ordem.slice(0, onde), horda.id, ...ordem.slice(onde)];
      const quemAge = combate.ordem[combate.vez];
      vez = Math.max(0, quemAge ? ordem.indexOf(quemAge) : 0);
    }
    const mudancas: Mudanca[] = [
      { op: "combatente_entra", combatente: horda, posicao: null },
      ...cs.map((c): Mudanca => ({ op: "combatente_sai", combatente: c, posicao: null })),
      this.andamento(combate, { ordem, vez, baralho: compra.resto }),
    ];
    const res = this.host.combates.aplicar(quem, ctx, {
      rotulo: `${cs.map((c) => c.nome).join(", ")} formaram uma Horda`,
      rotuloMestre: `${cs.map((c) => c.nome).join(", ")} formaram uma Horda: ${pv} PV, bônus de Horda ${bonusDeHorda(cs.length, regras.regras.bonusMaximo)}, carta ${carta.valor}`,
      mudancas,
    });
    if ("recusado" in res) return res;
  }

  private marcarArea(hordaId: string, marcados: string[], quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    const h = combate.combatentes.find((c) => c.id === hordaId);
    if (!h?.horda) return recusa("Essa Horda não está no combate.");
    const validos = [...new Set(marcados)].filter((id) => id !== h.id && combate.combatentes.some((c) => c.id === id));
    const nomes = validos.map((id) => combate.combatentes.find((c) => c.id === id)!.nome);
    const r = this.host.combates.aplicar(quem, ctx, {
      rotulo: nomes.length ? `Na área de ${h.nome}: ${nomes.join(", ")}` : `Ninguém na área de ${h.nome}`,
      mudancas: [{ op: "horda", alvo: { tipo: "combatente", id: h.id }, antes: h.horda, depois: { ...h.horda, naArea: validos } }],
    });
    if ("recusado" in r) return r;
  }

  private usarRecarga(combatenteId: string, acaoId: string, gasta: boolean, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    const c = combate.combatentes.find((x) => x.id === combatenteId);
    const acao = c ? this.acaoDe(c, acaoId) : undefined;
    if (!c || !acao?.recargaCriatura) return recusa("Essa ação não tem Recarga.");
    if (c.recargasGastas.includes(acaoId) === gasta) return recusa(gasta ? "Essa ação já está gasta." : "Essa ação já está disponível.");
    const r = this.host.combates.aplicar(quem, ctx, {
      rotulo: gasta ? `${c.nome} usou ${acao.rotulo}` : `${acao.rotulo} de ${c.nome} voltou (mestre)`,
      mudancas: [{ op: "recarga", alvo: { tipo: "combatente", id: c.id }, acaoId, gasta }],
    });
    if ("recusado" in r) return r;
  }

  private normalizar(alvo: Alvo, combate: EstadoCombate | null): Alvo {
    if (alvo.tipo === "personagem") return alvo;
    const c = combate?.combatentes.find((x) => x.id === alvo.id);
    return c ? comoAlvo(c) : alvo;
  }

  /* ---------- Ataque ---------- */

  private montar(c: Combatente, fonte: AtaquePendente["fonte"], mundo: Mundo, personagens: Map<string, PersonagemBanco>, ctx: ContextoCombate): AtaqueMontado | Recusa {
    if (fonte.tipo === "acao") {
      if (c.personagemId) return recusa("Personagem ataca com a arma equipada.");
      const acao = this.acaoDe(c, fonte.acaoId);
      if (!acao) return recusa("Essa ação não está na ficha da criatura.");
      if (acao.recargaCriatura && c.recargasGastas.includes(acao.id)) return recusa(`${acao.rotulo} está gasta: volta com a Recarga ${acao.recargaCriatura}.`);
      const regras = c.horda ? this.hordaDe(c) : null;
      const bonus = regras && c.horda ? bonusDeHorda(c.horda.integrantes.length, regras.regras.bonusMaximo) : 0;
      const comBonus = (a: AtaqueMontado): AtaqueMontado =>
        bonus ? { ...a, acerto: [...a.acerto, { rotulo: "Bônus de Horda", valor: bonus }], dano: { ...a.dano, bonus: [...a.dano.bonus, { rotulo: "Bônus de Horda", valor: bonus }] } } : a;
      /* Ataque de Horda: a Pancada ou a Mordida, com o bônus, sem Início e Combo, contra vários alvos. */
      if (regras?.ataqueDeHorda?.acaoId === acao.id) {
        const escolha = fonte.escolha ?? regras.ataqueDeHorda.escolhas[0];
        const base = escolha && regras.ataqueDeHorda.escolhas.includes(escolha) ? this.acaoDe(c, escolha) : undefined;
        const montado = base ? ataqueDeCriatura(base) : null;
        if (!montado) return recusa("Escolha a Pancada ou a Mordida para o Ataque de Horda.");
        return comBonus({ ...montado, nome: `${acao.rotulo.replace(/\s*\(.*\)\s*$/, "")} (${base!.rotulo.replace(/\s*\(.*$/, "")})`, inicio: false, combo: false, custoPa: regras.ataqueDeHorda.custoPa });
      }
      if (!c.horda && acao.id === this.hordaDe(c)?.ataqueDeHorda?.acaoId) return recusa("Só a Horda faz o Ataque de Horda.");
      const montado = ataqueDeCriatura(acao);
      return montado ? comBonus(montado) : recusa(`${acao.rotulo} ainda não tem mecânica revisada: use a rolagem manual.`);
    }
    const p = c.personagemId ? personagens.get(c.personagemId) : undefined;
    const ctxFicha = this.host.contextoFicha();
    if (!p || !ctxFicha) return recusa("Só personagem ataca com arma.");
    const item = p.ficha.inventario.find((i) => i.id === fonte.itemFichaId);
    if (!item?.equipado) return recusa("Equipe a arma antes de atacar.");
    const doPacote = item.itemId ? ctxFicha.itens.get(item.itemId) : undefined;
    const vivo = mundo.vivos[p.id] ?? p.vivo;
    const calc = this.host.combates.calculo(p, vivo, ctx);
    if (!calc || !doPacote) return recusa("Essa arma não tem dados de ataque no pacote.");
    const custo = ctx.regras.acaoPadrao?.acao_padrao.ataque_com_arma.pa;
    if (custo === undefined) return recusa("O custo do ataque com arma (Seu Turno) ainda não foi revisado no pacote.");
    const montado = ataqueComArma(
      { nome: item.nome, mecanica: doPacote.mecanica },
      { atributos: calc.atributos, proficiencia: calc.proficiencia, categorias: proficienciasDaFicha(p.ficha, ctxFicha).categorias },
      ctx,
      custo,
    );
    return montado ?? recusa(`${item.nome} ainda não tem mecânica de ataque revisada.`);
  }

  private quemPodeReagir(alvo: Combatente, ctx: ContextoCombate) {
    if (!alvo.personagemId || alvo.derrotado) return false;
    if (!ctx.regras.esquiva && !ctx.regras.bloqueio) return false;
    if (bloqueiosDePa(this.host.combates.fontesDe(alvo, ctx)).reacoes) return false;
    return alvo.pa.guardados > 0 || !!alvo.marcas.reacaoSemCusto;
  }

  private atacar(m: Extract<MensagemDeAcao, { t: "atacar" }>, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    if (combate.fase === "iniciativa") return recusa("O combate ainda não começou.");
    if (combate.ataquePendente) return recusa("Já há um ataque esperando reação.");
    const c = combate.combatentes.find((x) => x.id === m.atacanteId);
    if (!c || !this.host.combates.podeMexer(c, quem)) return recusa("Esse combatente não é seu.");
    if (c.derrotado) return recusa(`${c.nome} foi derrotado.`);
    const naVez = combate.fase === "em_curso" && combate.ordem[combate.vez] === c.id;
    if (!naVez && combate.fase !== "fim_da_rodada") return recusa("Só dá para atacar no seu turno ou no fim da rodada, com PA guardado.");
    const alvos = [...new Set(m.alvos)].map((id) => combate.combatentes.find((x) => x.id === id));
    if (alvos.some((a) => !a || a.derrotado || a.id === c.id)) return recusa("Escolha alvos que ainda estão no combate.");
    const { mundo, personagens } = this.host.combates.mundo(ctx);
    const montado = this.montar(c, m.fonte, mundo, personagens, ctx);
    if ("recusado" in montado) return montado;
    const fonteDePa = naVez ? c.pa.disponiveis : c.pa.guardados;
    if (montado.custoPa > fonteDePa) return recusa(`Faltam PA: ${montado.nome} custa ${montado.custoPa}, sobram ${fonteDePa}.`);
    const doAtaque = m.fonte.tipo === "acao" ? this.hordaDe(c)?.ataqueDeHorda : null;
    const maximo =
      m.fonte.tipo !== "acao"
        ? 1
        : c.horda && doAtaque?.acaoId === m.fonte.acaoId
          ? alvosDoAtaqueDeHorda(bonusDeHorda(c.horda.integrantes.length, this.hordaDe(c)!.regras.bonusMaximo))
          : (objeto(this.acaoDe(c, m.fonte.acaoId)?.mecanica).alvos as number | undefined);
    if (maximo && alvos.length > maximo) return recusa(`${montado.nome} atinge até ${maximo} ${maximo === 1 ? "alvo" : "alvos"}.`);

    const pendente: AtaquePendente = {
      id: randomUUID(),
      atacanteId: c.id,
      autorId: quem.id,
      fonte: m.fonte,
      rotulo: montado.nome,
      alvos: alvos.map((a) => a!.id),
      aguardando: alvos.filter((a) => this.quemPodeReagir(a!, ctx)).map((a) => a!.id),
      reacoes: {},
      opcoes: m.opcoes,
    };
    if (!pendente.aguardando.length) return this.resolver(pendente, quem, ctx);
    const nomes = pendente.aguardando.map((id) => combate.combatentes.find((x) => x.id === id)!.nome).join(", ");
    const r = this.host.combates.aplicar(quem, ctx, {
      rotulo: `${c.nome} vai atacar ${alvos.map((a) => a!.nome).join(", ")}: esperando a reação de ${nomes}`,
      rotuloMestre: `${c.nome} vai atacar com ${montado.nome}: esperando a reação de ${nomes}`,
      mudancas: [{ op: "ataque_pendente", antes: null, depois: pendente }],
    });
    if ("recusado" in r) return r;
  }

  /* Esquiva ou Bloqueio (Jogador, Combate): 1 PA guardado, soma o atributo na Defesa contra este ataque. */
  private reagir(combatenteId: string, reacao: "esquiva" | "bloqueio" | "nenhuma", quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    const p = combate.ataquePendente;
    if (!p || !p.aguardando.includes(combatenteId)) return recusa("Não há ataque esperando a sua reação.");
    const c = combate.combatentes.find((x) => x.id === combatenteId)!;
    if (!this.host.combates.podeMexer(c, quem)) return recusa("Esse personagem não é seu.");
    const depois: AtaquePendente = { ...p, aguardando: p.aguardando.filter((id) => id !== c.id), reacoes: { ...p.reacoes, [c.id]: reacao } };
    const mudancas: Mudanca[] = [];
    let rotulo = `${c.nome} não reagiu`;
    if (reacao !== "nenhuma") {
      const regra = ctx.regras[reacao];
      const personagem = c.personagemId ? this.host.personagem(c.personagemId) : null;
      if (!regra?.defesa || !personagem) return recusa("Essa reação ainda não foi revisada no pacote.");
      const gasto = gastarPa(c, regra.custo.pa ?? 1, "reacao", { naVez: false, fontes: this.host.combates.fontesDe(c, ctx), ctx });
      if ("recusado" in gasto) return gasto;
      const { mundo } = this.host.combates.mundo(ctx);
      const calc = this.host.combates.calculo(personagem, mundo.vivos[personagem.id] ?? personagem.vivo, ctx);
      /* Ameaça de Massa: −1 em todas as reações de quem o mestre marcou na área da Horda, inclusive o Bloqueio. */
      const massa = this.ameacaDeMassaEm(c.id);
      const valor = (calc?.atributos[regra.defesa.soma].valor ?? 0) + (massa?.valor ?? 0);
      const nome = reacao === "esquiva" ? "Esquiva" : "Bloqueio";
      /* "marcas" de novo: o gasto pode ter mexido nelas (Rainha). */
      const marcasDoGasto = gasto.mudancas.filter((x) => x.op === "marcas").at(-1);
      const base = marcasDoGasto && marcasDoGasto.op === "marcas" ? marcasDoGasto.depois : c.marcas;
      mudancas.push(...gasto.mudancas, { op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: base, depois: { ...base, defesaDeReacao: { valor, rotulo: nome } } });
      rotulo = `${c.nome} reagiu com ${nome} (${sinal(valor)} na Defesa, ${NOME_ATRIBUTO[regra.defesa.soma]}${massa ? `, ${sinal(massa.valor)} da Ameaça de Massa` : ""})${gasto.semCusto ? `, sem custo (${gasto.semCusto})` : ""}`;
    }
    mudancas.push({ op: "ataque_pendente", antes: p, depois });
    const r = this.host.combates.aplicar(quem, ctx, { rotulo, mudancas, autor: c });
    if ("recusado" in r) return r;
    if (!depois.aguardando.length) return this.resolver(depois, quem, ctx);
  }

  private seguir(quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    if (!combate.ataquePendente) return recusa("Não há ataque esperando.");
    return this.resolver(combate.ataquePendente, quem, ctx);
  }

  private cancelar(quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    const p = combate.ataquePendente;
    if (!p) return recusa("Não há ataque esperando.");
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `Ataque cancelado (${p.rotulo})`, mudancas: [{ op: "ataque_pendente", antes: p, depois: null }] });
    if ("recusado" in r) return r;
  }

  /* Uma rolagem de ataque contra a Defesa de cada alvo; o dano de cada um, pela ordem do dano. */
  private resolver(p: AtaquePendente, quemDisparou: Espectador, ctx: ContextoCombate): Recusa | void {
    const quem: Espectador = p.autorId && p.autorId !== quemDisparou.id ? { id: p.autorId, papel: "mestre" } : quemDisparou;
    const combate = this.host.combates.combate();
    if (!combate) return recusa("Não há combate em curso.");
    const c = combate.combatentes.find((x) => x.id === p.atacanteId);
    if (!c) return recusa("Quem atacava saiu do combate.");
    const { mundo, personagens: porId } = this.host.combates.mundo(ctx);
    const montado = this.montar(c, p.fonte, mundo, porId, ctx);
    if ("recusado" in montado) return montado;
    const naVez = combate.fase === "em_curso" && combate.ordem[combate.vez] === c.id;
    const mudancas: Mudanca[] = [];
    if (combate.ataquePendente) mudancas.push({ op: "ataque_pendente", antes: combate.ataquePendente, depois: null });

    /* PA, ataques múltiplos, Início e Combo, Rei. */
    const fontesAtacante = this.host.combates.fontesDe(c, ctx);
    if (montado.custoPa > 0) {
      const gasto = gastarPa(c, montado.custoPa, "acao", { naVez, fontes: fontesAtacante, ctx });
      if ("recusado" in gasto) return gasto;
      mudancas.push(...gasto.mudancas);
    }
    const semPenalidade = montado.combo && c.marcas.comboLiberado && !!ctx.regras.inicioCombo?.combo.sem_penalidade_de_ataques_multiplos;
    const multiplos = penalidadeDeAtaquesMultiplos(c.ataquesNoTurno, ctx, { semPenalidade });
    const vivoAtacante = c.personagemId ? (mundo.vivos[c.personagemId] ?? porId.get(c.personagemId)?.vivo) : undefined;
    const base = [...montado.acerto, ...(multiplos ? [multiplos] : []), ...(vivoAtacante ? modificadoresDeCrise(vivoAtacante, ctx, "ataque") : [])];
    const vantagens = c.marcas.vantagemNoProximo ? ["Rei"] : [];
    /* Atitude Imprudente declarada antes: Precisão dá vantagem, Potência +1 dado, Violência rola o dano duas vezes. */
    const imprudente = c.marcas.imprudente;
    if (imprudente === "precisao") vantagens.push("Atitude Imprudente");
    const desvantagens = p.opcoes.alemDoAlcance && ctx.regras.alcance?.alem_do_efetivo.desvantagem ? ["Além do alcance efetivo"] : [];

    const alvos = p.alvos.map((id) => combate.combatentes.find((x) => x.id === id)).filter((x): x is Combatente => !!x && !x.derrotado);
    if (!alvos.length) return recusa("Os alvos já saíram do combate.");
    const vitimas = alvos.map((a) => this.vitima(a, mundo, porId, ctx));
    if (vitimas.some((v) => !v)) return recusa("Falta a ficha de um dos alvos.");

    /* Uma só rolagem: os efeitos do primeiro alvo valem para ela (ataques de um alvo são quase todos). */
    const primeiro = vitimas[0]!;
    const testeMontado = montarTeste({
      teste: { tipo: "ataque", atributo: null, corpoACorpo: montado.corpoACorpo, armaDeFogo: montado.armaDeFogo },
      base,
      efeitos: fontesAtacante,
      exaustao: vivoAtacante?.exaustao ?? 0,
      ctx,
      bonus: p.opcoes.bonus,
      modo: p.opcoes.modo,
      vantagensExtras: vantagens,
      desvantagensExtras: desvantagens,
      efeitosDoAlvo: primeiro.efeitos,
      aAteUmMetro: montado.corpoACorpo,
    });
    const rolado = resolverTeste(testeMontado, { tipo: "ataque", dt: null, modelo: ctx.opcoes.modeloVantagem, ctx, aleatorio: this.aleatorio });
    const critico = rolado.critico === "acerto";
    const falhaCritica = rolado.critico === "falha";
    /* Estresse do acontecimento, por personagem (regra opcional da campanha). */
    const estresse = new Map<string, number>();
    const somarEstresse = (id: string | null | undefined, delta: number) => {
      if (id && delta) estresse.set(id, (estresse.get(id) ?? 0) + delta);
    };
    if (c.personagemId) somarEstresse(c.personagemId, critico ? -alivioDe(ctx, "acerto_critico") : falhaCritica ? estresseDe(ctx, "falha_critica") : 0);

    const linhas: string[] = [];
    const linhasMestre: string[] = [];
    let acertouAlgum = false;
    alvos.forEach((a, i) => {
      const v = vitimas[i]!;
      const reacao = a.marcas.defesaDeReacao;
      const defesa = (v.defesa ?? 0) + (reacao?.valor ?? 0);
      if (reacao) mudancas.push({ op: "marcas", alvo: { tipo: "combatente", id: a.id }, antes: a.marcas, depois: { ...a.marcas, defesaDeReacao: null } });
      const acertou = !rolado.falhaAutomatica && rolado.total !== null && (rolado.total >= defesa || (critico && ctx.regras.critico.acerta_sempre));
      const contraMestre = `${rolado.total ?? "falha automática"} contra Defesa ${v.defesa ?? "?"}${reacao ? ` ${sinal(reacao.valor)} (${reacao.rotulo})` : ""}`;
      const contraJogador = v.personagem ? contraMestre : `${rolado.total ?? "falha automática"}`;
      if (v.personagem && !c.personagemId && falhaCritica) somarEstresse(v.personagem.id, -alivioDe(ctx, "inimigo_falha_critica_contra_si"));
      if (!acertou) {
        linhas.push(`${a.nome}: ${contraJogador}, errou`);
        linhasMestre.push(`${a.nome}: ${contraMestre}, errou`);
        return;
      }
      acertouAlgum = true;
      let dano = rolarDanoDoAtaque(montado.dano, critico, this.aleatorio, [], { dadosExtras: imprudente === "potencia" ? 1 : 0 });
      if (imprudente === "violencia") {
        const outra = rolarDanoDoAtaque(montado.dano, critico, this.aleatorio);
        if (outra.total > dano.total) dano = outra;
      }
      const d = this.danoEm(v, { valor: dano.total, tipo: montado.dano.tipo }, ctx);
      mudancas.push(...d.mudancas);
      if (v.personagem) somarEstresse(v.personagem.id, d.estresse + (critico && !c.personagemId ? estresseDe(ctx, "sofrer_acerto_critico_de_inimigo") : 0));
      const tipo = montado.dano.tipo ? ` ${montado.dano.tipo}` : "";
      const final = d.resolvido.final !== dano.total ? ` (${d.resolvido.final} depois das defesas)` : "";
      linhas.push(`${a.nome}: ${contraJogador}, ${critico ? "acerto crítico" : "acertou"}. ${dano.total} de dano${tipo}${v.personagem ? final : ""}${d.nota && v.personagem ? `. ${d.nota}` : ""}`);
      linhasMestre.push(`${a.nome}: ${contraMestre}, ${critico ? "acerto crítico" : "acertou"}. ${dano.total} de dano${tipo} (${d.conta}). PV ${d.restante}${d.nota ? `. ${d.nota}` : ""}`);
    });

    mudancas.push({ op: "somar", alvo: { tipo: "combatente", id: c.id }, campo: "ataquesNoTurno", delta: 1 });
    /* Habilidade com Recarga X–Y: fica gasta até a rolagem do início do turno trazer de volta. */
    const acaoUsada = p.fonte.tipo === "acao" ? this.acaoDe(c, p.fonte.acaoId) : undefined;
    if (acaoUsada?.recargaCriatura) mudancas.push({ op: "recarga", alvo: { tipo: "combatente", id: c.id }, acaoId: acaoUsada.id, gasta: true });
    /* Início que acertou libera o Combo; o Combo o consome; o Rei vale só para este ataque. */
    const comboDepois = montado.inicio ? acertouAlgum : montado.combo ? false : c.marcas.comboLiberado;
    if (comboDepois !== c.marcas.comboLiberado || c.marcas.vantagemNoProximo || imprudente) {
      mudancas.push({ op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: c.marcas, depois: { ...c.marcas, comboLiberado: comboDepois, vantagemNoProximo: false, imprudente: null } });
    }
    for (const [id, delta] of estresse) {
      const v = vitimas.find((x) => x?.personagem?.id === id) ?? this.vitima(combate.combatentes.find((x) => x.personagemId === id)!, mundo, porId, ctx);
      if (!v?.vivo || !v.calc) continue;
      const r = mudarEstresse({ tipo: "personagem", id }, v.vivo, v.calc, delta, ctx, this.aleatorio);
      mudancas.push(...r.mudancas);
      if (r.notas.length) {
        linhas.push(`${v.nome}: ${r.notas.join(", ")}`);
        linhasMestre.push(`${v.nome}: ${r.notas.join(", ")}`);
      }
    }

    const resultado = alvos.length === 1 ? { texto: critico && acertouAlgum ? "Acerto crítico" : acertouAlgum ? "Acertou" : "Errou", bom: acertouAlgum } : null;
    const rolagem: RolagemDeCombate = {
      titulo: `${c.nome}: ${montado.nome}`,
      subtitulo: `Contra ${alvos.map((a) => a.nome).join(", ")}`,
      dados: rolado.d20?.dados ?? [],
      escolhido: rolado.d20?.escolhido ?? 0,
      cartas: (rolado.d20?.cartas ?? []).map((x) => ({ valor: x.carta.valor, naipe: x.carta.naipe, valeu: x.valeu })),
      modificadores: rolado.modificadores,
      total: rolado.total ?? 0,
      alvo: alvos.length === 1 ? { rotulo: "Defesa", valor: (vitimas[0]!.defesa ?? 0) + (alvos[0]!.marcas.defesaDeReacao?.valor ?? 0) } : null,
      resultado,
      natural: rolado.natural,
      notaFinal: linhasMestre.join(" · "),
      para: [],
    };
    /* O jogador que ataca vê o d20 dele; contra criatura, sem a Defesa e sem o dano depois das defesas. */
    const dono = c.personagemId ? this.host.donoDe(c.personagemId) : null;
    const rolagemJogador: RolagemDeCombate | null = dono
      ? { ...rolagem, alvo: rolagem.alvo && vitimas[0]!.personagem ? rolagem.alvo : rolagem.alvo ? { rotulo: "Defesa", valor: null } : null, notaFinal: linhas.join(" · "), para: [dono] }
      : null;

    const abre = `${c.nome} atacou com ${montado.nome}`;
    const r = this.host.combates.aplicar(quem, ctx, {
      rotulo: `${abre}. ${linhas.join(". ")}`,
      rotuloMestre: `${abre} (${soma(rolado.modificadores) >= 0 ? "+" : ""}${soma(rolado.modificadores)}). ${linhasMestre.join(". ")}`,
      mudancas,
      autor: c,
      rolagem,
      rolagemJogador,
    });
    if ("recusado" in r) return r;
  }

  /* ---------- Dano, PV e efeitos à mão ---------- */

  private danoManual(combatenteId: string, valor: number, tipo: string | null, espacos: number, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.exigirCombate();
    if ("recusado" in combate) return combate;
    const c = combate.combatentes.find((x) => x.id === combatenteId);
    if (!c) return recusa("Esse combatente não está no combate.");
    const { mundo, personagens: porId } = this.host.combates.mundo(ctx);
    const v = this.vitima(c, mundo, porId, ctx);
    if (!v) return recusa("Falta a ficha desse combatente.");
    const d = this.danoEm(v, { valor, tipo }, ctx, espacos);
    if (!d.mudancas.length) return recusa(`${c.nome} não sofreu dano (${d.conta}).`);
    if (d.estresse && v.vivo && v.calc) {
      const e = mudarEstresse(v.alvo, v.vivo, v.calc, d.estresse, ctx, this.aleatorio);
      d.mudancas.push(...e.mudancas);
      if (e.notas.length) d.nota = [d.nota, ...e.notas].filter(Boolean).join(". ");
    }
    const r = this.host.combates.aplicar(quem, ctx, {
      rotulo: `${c.nome} sofreu ${d.resolvido.final} de dano${tipo ? ` ${tipo}` : ""}${v.personagem && d.nota ? `. ${d.nota}` : ""}`,
      rotuloMestre: `${c.nome} sofreu dano: ${d.conta}. PV ${d.restante}${d.nota ? `. ${d.nota}` : ""}`,
      mudancas: d.mudancas,
    });
    if ("recusado" in r) return r;
  }

  private ajustarPv(alvoBruto: Alvo, delta: number, temporarios: boolean, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.combate();
    const alvo = this.normalizar(alvoBruto, combate);
    const c = combate?.combatentes.find((x) => (alvo.tipo === "combatente" ? x.id === alvo.id : x.personagemId === alvo.id));
    const nome = c?.nome ?? this.host.personagem(alvo.id)?.ficha.nome ?? "Personagem";
    const mudancas: Mudanca[] = [{ op: "somar", alvo, campo: temporarios ? "pvTemporarios" : "pv", delta }];
    if (!temporarios && delta > 0 && alvo.tipo === "personagem") {
      const { mundo } = this.host.combates.mundo(ctx);
      const vivo = mundo.vivos[alvo.id];
      if (vivo) mudancas.push(...curaEncerraMorrendo(alvo, vivo));
    }
    if (!temporarios && alvo.tipo === "combatente" && c) {
      const depois = Math.max(0, Math.min(c.pvMaximo ?? Number.MAX_SAFE_INTEGER, (c.pv ?? 0) + delta));
      if (depois === 0 && !c.derrotado) mudancas.push({ op: "derrotado", alvo, antes: false, depois: true });
      if (depois > 0 && c.derrotado) mudancas.push({ op: "derrotado", alvo, antes: true, depois: false });
    }
    const texto = temporarios ? `${delta > 0 ? "+" : "−"}${Math.abs(delta)} PV temporários` : delta > 0 ? `recuperou ${delta} PV` : `perdeu ${-delta} PV`;
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${nome} ${texto}`, rotuloMestre: `${nome} ${texto} (ajuste do mestre)`, mudancas });
    if ("recusado" in r) return r;
  }

  private efeitosDoAlvo(alvo: Alvo, combate: EstadoCombate | null, ctx: ContextoCombate) {
    const { mundo } = this.host.combates.mundo(ctx);
    if (alvo.tipo === "personagem") {
      const vivo = mundo.vivos[alvo.id] ?? this.host.personagem(alvo.id)?.vivo;
      return vivo ? { efeitos: vivo.efeitos, nome: this.host.personagem(alvo.id)?.ficha.nome || "Personagem", imunes: [] as string[], exaustao: vivo.exaustao } : null;
    }
    const c = combate?.combatentes.find((x) => x.id === alvo.id);
    return c ? { efeitos: c.efeitos, nome: c.nome, imunes: defesasDaFichaDeCriatura(this.fichaDe(c)?.extras ?? []).imunidadesACondicao, exaustao: 0 } : null;
  }

  private aplicarEfeito(m: Extract<MensagemDeAcao, { t: "efeito_aplicar" }>, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const combate = this.host.combates.combate();
    const alvo = this.normalizar(m.alvo, combate);
    const dele = this.efeitosDoAlvo(alvo, combate, ctx);
    if (!dele) return recusa("Esse alvo não está na mesa.");
    let mudanca: Mudanca;
    if (m.efeitoId === ID_EXAUSTAO) {
      if (alvo.tipo !== "personagem") return recusa("Exaustão vale para personagem.");
      mudanca = { op: "somar", alvo, campo: "exaustao", delta: m.acumulos ?? 1 };
    } else {
      if (!ctx.efeitos.has(m.efeitoId)) return recusa("Esse efeito não está no conteúdo da campanha.");
      const naVezDele = !!combate && combate.ordem[combate.vez] === combate.combatentes.find((x) => comoAlvo(x).id === alvo.id)?.id;
      const r = aplicarEfeito(alvo, dele.efeitos, { id: randomUUID(), efeitoId: m.efeitoId, acumulos: m.acumulos, turnos: m.turnos ?? null, origem: "Mestre", noTurnoDoAfetado: naVezDele }, ctx, dele.imunes);
      if ("recusado" in r) return r;
      mudanca = r.mudanca;
    }
    const nome = ctx.efeitos.get(m.efeitoId)?.nome ?? "Efeito";
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${nome} em ${dele.nome}`, mudancas: [mudanca] });
    if ("recusado" in r) return r;
  }

  private achar(alvoBruto: Alvo, efeitoAtivoId: string, ctx: ContextoCombate) {
    const combate = this.host.combates.combate();
    const alvo = this.normalizar(alvoBruto, combate);
    const dele = this.efeitosDoAlvo(alvo, combate, ctx);
    const efeito = dele?.efeitos.find((e) => e.id === efeitoAtivoId);
    return dele && efeito ? { alvo, dele, efeito, combate } : null;
  }

  private editarEfeito(m: Extract<MensagemDeAcao, { t: "efeito_editar" }>, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const achado = this.achar(m.alvo, m.efeitoAtivoId, ctx);
    if (!achado) return recusa("Esse efeito não está mais ativo.");
    const { alvo, dele, efeito } = achado;
    const maximo = ctx.efeitos.get(efeito.efeitoId)?.mecanica?.acumulos?.max ?? 20;
    const depois = { ...efeito, acumulos: Math.min(maximo, m.acumulos), turnosRestantes: m.turnos };
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${efeito.nome} em ${dele.nome} ajustado pelo mestre`, mudancas: [{ op: "efeito_muda", alvo, antes: efeito, depois }] });
    if ("recusado" in r) return r;
  }

  private encerrarEfeito(alvoBruto: Alvo, efeitoAtivoId: string, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const achado = this.achar(alvoBruto, efeitoAtivoId, ctx);
    if (!achado) return recusa("Esse efeito não está mais ativo.");
    const { alvo, dele, efeito } = achado;
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${efeito.nome} saiu de ${dele.nome}`, mudancas: [{ op: "efeito_sai", alvo, efeito }] });
    if ("recusado" in r) return r;
  }

  /* Botões que o efeito oferece (efeitos-mecanica.yml, "acoes"): Levantar, Usar Trapos, Apagar o fogo, Me aqueci. */
  private acaoDeEfeito(alvoBruto: Alvo, efeitoAtivoId: string, indice: number, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const achado = this.achar(alvoBruto, efeitoAtivoId, ctx);
    if (!achado) return recusa("Esse efeito não está mais ativo.");
    const { alvo, dele, efeito, combate } = achado;
    if (quem.papel !== "mestre" && (alvo.tipo !== "personagem" || this.host.donoDe(alvo.id) !== quem.id)) return recusa("Esse personagem não é seu.");
    const acao = objeto(ctx.efeitos.get(efeito.efeitoId)?.mecanica?.acoes?.[indice]);
    if (typeof acao.nome !== "string") return recusa("Essa ação não existe mais neste efeito.");
    if (acao.exige === "aprovacao_do_mestre" && quem.papel !== "mestre") return recusa(`${acao.nome} precisa da aprovação do mestre: peça a ele.`);
    const custo = objeto(acao.custo);
    const mudancas: Mudanca[] = [];
    let item: { personagemId: string; op: Operacao[] } | null = null;

    /* PA: só em combate, de quem age (ou do guardado no fim da rodada). */
    const c = combate?.combatentes.find((x) => comoAlvo(x).id === alvo.id && comoAlvo(x).tipo === alvo.tipo);
    if (typeof custo.pa === "number" && combate && c && combate.fase !== "iniciativa") {
      const naVez = combate.fase === "em_curso" && combate.ordem[combate.vez] === c.id;
      if (!naVez && combate.fase !== "fim_da_rodada") return recusa(`${acao.nome} custa ${custo.pa} PA: só no turno de ${c.nome}.`);
      const gasto = gastarPa(c, custo.pa, "acao", { naVez, fontes: this.host.combates.fontesDe(c, ctx), ctx });
      if ("recusado" in gasto) return gasto;
      mudancas.push(...gasto.mudancas);
    }
    if (typeof custo.item === "string") {
      if (alvo.tipo !== "personagem") return recusa(`${acao.nome} gasta um item do inventário.`);
      const p = this.host.personagem(alvo.id);
      const noInventario = p?.ficha.inventario.find((i) => i.itemId === custo.item);
      if (!p || !noInventario) return recusa(`Falta ${this.host.contextoFicha()?.itens.get(custo.item)?.nome ?? "o item"} no inventário.`);
      const op: Operacao[] = [{ op: "tirar_item", item: noInventario }];
      if (noInventario.quantidade > 1) op.push({ op: "dar_item", item: { ...noInventario, quantidade: noInventario.quantidade - 1 } });
      item = { personagemId: p.id, op };
    }

    const faz = objeto(acao.faz);
    const teste = objeto(acao.teste);
    if (typeof faz.remover_acumulo === "number") mudancas.push(removerAcumulo(alvo, efeito, faz.remover_acumulo));
    else if (faz.encerrar) mudancas.push({ op: "efeito_sai", alvo, efeito });

    let pedido: PedidoTeste | null = null;
    if (typeof teste.dt === "number" && alvo.tipo === "personagem") {
      const sucesso = objeto(acao.sucesso);
      const atributo = (typeof teste.atributo === "string" ? teste.atributo : "fibra") as "fibra";
      const comum = { id: randomUUID(), origem: `${acao.nome} (${efeito.nome})`, personagens: [{ personagemId: alvo.id, bonus: 0, modo: "normal" as const }], efeitoNoSucesso: { efeitoAtivoId: efeito.id, remover: sucesso.encerrar ? ("todos" as const) : typeof sucesso.remover_acumulo === "number" ? sucesso.remover_acumulo : ("todos" as const) } };
      pedido = teste.tipo === "resistencia" ? { ...comum, tipo: "resistencia", atributo, dt: teste.dt, dtVisivel: true } : { ...comum, tipo: "habilidade", teste: { alvo: "atributo", atributo }, dt: teste.dt, dtVisivel: true };
    }
    if (!mudancas.length && !pedido && !item) return recusa(`${acao.nome}: combine o resultado com o mestre.`);

    if (mudancas.length) {
      const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${dele.nome}: ${acao.nome}`, mudancas, autor: c ?? null });
      if ("recusado" in r) return r;
    }
    /* Devolver o resto da pilha é operação do mestre; quem gastou o item continua sendo o autor. */
    if (item) for (const op of item.op) this.host.operarFicha(item.personagemId, op, { ...quem, papel: "mestre" });
    if (pedido) return this.host.pedirTeste(pedido, quem);
  }

  private rolarLivre(rotulo: string, formula: string, oculta: boolean, quem: Espectador): Recusa | void {
    let r;
    try {
      r = rolarDados(formula, this.aleatorio);
    } catch {
      return recusa("Fórmula inválida. Use, por exemplo, 2d6+3, 1d20 ou 4.");
    }
    this.host.registrar(this.host.novoEvento(quem, { tipo: "rolagem_livre", dados: { rotulo, formula, dados: r.dados, total: r.total, oculta } }));
  }

  /* ---------- Gatilhos dos efeitos no turno ---------- */

  efeitosDoTurno(c: Combatente, momento: "inicio_do_turno" | "fim_do_turno", ctx: ContextoCombate, recargas: { acaoId: string; rolagem: number }[] = []): EfeitosDoTurno {
    const { mundo, personagens: porId } = this.host.combates.mundo(ctx);
    const alvo = comoAlvo(c);
    const ativos = alvo.tipo === "personagem" ? (mundo.vivos[alvo.id]?.efeitos ?? []) : c.efeitos;
    const v = this.vitima(c, mundo, porId, ctx);
    const mudancas: Mudanca[] = [];
    const notas: string[] = [];
    const notasMestre: string[] = [];

    /* Recarga X–Y (Mestre, "Como criar uma criatura?"): no início do turno da criatura, 1d6 por habilidade gasta. */
    if (momento === "inicio_do_turno" && ctx.regras.recarga) {
      for (const { acaoId, rolagem } of recargas) {
        const acao = this.acaoDe(c, acaoId);
        const faixa = faixaDeRecarga(acao?.recargaCriatura);
        if (!acao || !faixa) continue;
        const volta = rolagem >= faixa[0] && rolagem <= faixa[1];
        if (volta) mudancas.push({ op: "recarga", alvo: { tipo: "combatente", id: c.id }, acaoId, gasta: false });
        notasMestre.push(`Recarga ${acao.recargaCriatura} de ${acao.rotulo}: 1d6 = ${rolagem}, ${volta ? "voltou" : "ainda gasta"}`);
      }
    }

    /* Pressão de Massa: uma vez por rodada por criatura, ao começar ou terminar o turno na área da Horda. */
    const combate = this.host.combates.combate();
    let pvAntes = v?.pv ?? 0;
    let tempAntes = v?.pvTemporarios ?? 0;
    let vAtual = v;

    /* Morrendo e não estável: o Teste de Morte do início do turno fica pendente até rolar. */
    if (momento === "inicio_do_turno" && ctx.regras.morrendo && v?.vivo?.morrendo && !v.vivo.morrendo.estavel && !c.marcas.testeDeMortePendente) {
      mudancas.push({ op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: c.marcas, depois: { ...c.marcas, testeDeMortePendente: true } });
      notas.push(`${c.nome} faz o Teste de Morte`);
    }
    for (const h of combate?.combatentes ?? []) {
      if (!h.horda || h.derrotado || h.id === c.id || !h.horda.naArea.includes(c.id) || h.horda.pressaoNaRodada.includes(c.id) || !v) continue;
      const regras = this.hordaDe(h);
      if (!regras?.pressao) continue;
      const bonus = bonusDeHorda(h.horda.integrantes.length, regras.regras.bonusMaximo);
      if (bonus <= 0) continue;
      const d = this.danoEm({ ...vAtual!, pv: pvAntes, pvTemporarios: tempAntes }, { valor: bonus, tipo: "indefensável" }, ctx);
      vAtual = this.depoisDoDano(vAtual!, d);
      mudancas.push(...d.mudancas, { op: "horda", alvo: { tipo: "combatente", id: h.id }, antes: h.horda, depois: { ...h.horda, pressaoNaRodada: [...h.horda.pressaoNaRodada, c.id] } });
      pvAntes = d.restante;
      tempAntes -= d.resolvido.absorvidoPorTemporarios;
      notas.push(`Pressão de Massa (${h.nome}): ${c.nome} sofreu ${d.resolvido.final} de dano indefensável${v.personagem && d.nota ? ` (${d.nota})` : ""}`);
    }

    if (!ativos.length) return { mudancas, notas, notasMestre, aoTerminar: () => undefined };
    const pedidos: PedidoTeste[] = [];
    let pv = pvAntes;
    let temporarios = tempAntes;
    for (const d of disparosDoTurno(ativos, momento, ctx)) {
      if ((d.tipo === "perda" || d.tipo === "dano") && v) {
        let total = 0;
        for (let i = 0; i < d.vezes; i++) total += rolarDados(d.formula, this.aleatorio).total;
        const r = this.danoEm({ ...vAtual!, pv, pvTemporarios: temporarios }, { valor: total, tipo: d.tipo === "dano" ? d.tipoDano : null, ignoraRd: d.tipo === "perda" && d.ignoraRd }, ctx);
        vAtual = this.depoisDoDano(vAtual!, r);
        mudancas.push(...r.mudancas);
        pv = r.restante;
        temporarios -= r.resolvido.absorvidoPorTemporarios;
        const vezes = d.vezes > 1 ? ` ×${d.vezes}` : "";
        const texto = `${d.efeito.nome}${vezes}: ${c.nome} ${d.tipo === "perda" ? "perdeu" : "sofreu"} ${r.resolvido.final}`;
        if (v.personagem) notas.push(`${texto} PV${r.nota ? ` (${r.nota})` : ""}`);
        else {
          notas.push(`${d.efeito.nome}${vezes} em ${c.nome}`);
          notasMestre.push(`${texto} (${r.conta}). PV ${r.restante}${r.nota ? `. ${r.nota}` : ""}`);
        }
      } else if (d.tipo === "teste") {
        if (alvo.tipo === "personagem") {
          const atributo = (d.teste.atributo ?? "fibra") as "fibra";
          const comum = {
            id: randomUUID(),
            origem: `${d.efeito.nome} (${momento === "fim_do_turno" ? "fim do turno" : "início do turno"})`,
            personagens: [{ personagemId: alvo.id, bonus: 0, modo: "normal" as const }],
            efeitoNoSucesso: { efeitoAtivoId: d.efeito.id, remover: d.encerra ? ("todos" as const) : Math.max(1, d.removeAcumulos) },
          };
          pedidos.push(d.teste.tipo === "habilidade" ? { ...comum, tipo: "habilidade", teste: { alvo: "atributo", atributo }, dt: d.teste.dt, dtVisivel: true } : { ...comum, tipo: "resistencia", atributo, dt: d.teste.dt, dtVisivel: true });
          notas.push(`${d.efeito.nome}: teste de ${d.teste.atributo ? NOME_ATRIBUTO[atributo] : "resistência"} DT ${d.teste.dt}`);
        } else notasMestre.push(`${d.efeito.nome} em ${c.nome}: role ${d.teste.atributo ?? "o teste"} DT ${d.teste.dt} no Escudo`);
      } else if (d.tipo === "escolha") {
        notas.push(`${d.efeito.nome}: ${c.nome} escolhe o que acontece (veja o efeito)`);
      }
    }
    if (momento === "fim_do_turno") {
      const duracao = descontarDuracao(alvo, ativos);
      mudancas.push(...duracao);
      for (const m of duracao) if (m.op === "efeito_sai") notas.push(`${m.efeito.nome} acabou em ${c.nome}`);
    }
    return { mudancas, notas, notasMestre, aoTerminar: (quem) => pedidos.forEach((p) => this.host.pedirTeste(p, quem)) };
  }
}
