import { MecanicaArma, MecanicaAtaqueDeCriatura, type Atributo } from "@odm/conteudo";
import type { Parcela } from "../ficha/calculo";
import { NOME_ATRIBUTO } from "../ficha/calculo";
import type { Aleatorio } from "../dados";
import type { ContextoCombate } from "./contexto";
import { rolarDados } from "./dados";

/* Ataque (Jogador, Combate: "Acerto Crítico", "Ataques Múltiplos", "Início e Combo"; Progressão: proficiência).
   A conta do ataque com arma é d20 + atributo da arma + proficiência (suposição 7 do plano, aprovada). */

/* Alcance da arma em uso: o efetivo, o máximo e o que vale entre os dois (escopetas, decisão de 07/11/2026). */
export type AlcanceDoAtaque = {
  efetivo: number | null;
  maximo: number | null;
  cone: boolean;
  ateOMaximo: { desvantagem: boolean; danoMetade: boolean; alvos: number | null } | null;
  foraDoMaximo: boolean;
  impactoPesado: boolean;
};

export type AtaqueMontado = {
  nome: string;
  corpoACorpo: boolean;
  armaDeFogo: boolean;
  acerto: Parcela[];
  /* "minimo": o Ataque Desarmado causa pelo menos 1, mesmo com o modificador negativo. */
  dano: { formula: string; tipo: string | null; bonus: Parcela[]; minimo?: number };
  inicio: boolean;
  combo: boolean;
  custoPa: number;
  alcance?: AlcanceDoAtaque;
};

/* O que a distância informada faz com o ataque. Sem distância, nada muda (o app não tem mapa). */
export type EfeitoDaDistancia = {
  faixa: "efetivo" | "ate_o_maximo" | "alem_do_efetivo" | "fora_de_alcance";
  desvantagem: boolean;
  danoMetade: boolean;
  maximoDeAlvos: number | null;
  impactoPesado: boolean;
  texto: string | null;
};

export function efeitoDaDistancia(alcance: AlcanceDoAtaque | undefined, distancia: number | null, impacto?: { ate_m: number }): EfeitoDaDistancia {
  const nada: EfeitoDaDistancia = { faixa: "efetivo", desvantagem: false, danoMetade: false, maximoDeAlvos: null, impactoPesado: false, texto: null };
  if (!alcance || distancia === null || alcance.efetivo === null) return nada;
  const impactoPesado = alcance.impactoPesado && !!impacto && distancia <= impacto.ate_m;
  if (distancia <= alcance.efetivo) {
    return { ...nada, impactoPesado, texto: `${distancia} m: alcance efetivo${alcance.cone ? ", em cone" : ""}` };
  }
  if (alcance.maximo !== null && distancia > alcance.maximo && alcance.foraDoMaximo) {
    return { ...nada, faixa: "fora_de_alcance", texto: `${distancia} m: fora de alcance (máximo ${alcance.maximo} m)` };
  }
  if (alcance.ateOMaximo && alcance.maximo !== null) {
    const a = alcance.ateOMaximo;
    const partes = [a.desvantagem && "desvantagem", a.danoMetade && "metade do dano", a.alvos && `${a.alvos === 1 ? "um alvo só" : `até ${a.alvos} alvos`}`].filter(Boolean);
    return { ...nada, faixa: "ate_o_maximo", desvantagem: a.desvantagem, danoMetade: a.danoMetade, maximoDeAlvos: a.alvos, texto: `${distancia} m: até o máximo (${partes.join(", ")})` };
  }
  return { ...nada, faixa: "alem_do_efetivo", texto: `${distancia} m: além do alcance efetivo (${alcance.efetivo} m)` };
}

/* Ação da ficha da criatura com mecânica revisada (ataques-mecanica.yml). */
export function ataqueDeCriatura(acao: { rotulo: string; mecanica?: Record<string, unknown>; custoPa: number | null; inicio: boolean; combo: boolean }): AtaqueMontado | null {
  const lido = MecanicaAtaqueDeCriatura.safeParse(acao.mecanica);
  if (!lido.success) return null;
  const m = lido.data;
  return {
    nome: acao.rotulo,
    corpoACorpo: m.tipo === "corpo_a_corpo",
    armaDeFogo: false,
    acerto: [{ rotulo: "Acerto", valor: m.acerto }],
    dano: { formula: m.dano.formula, tipo: m.dano.tipo, bonus: [] },
    inicio: m.propriedade === "inicio" || acao.inicio,
    combo: m.propriedade === "combo" || acao.combo,
    custoPa: m.custo?.pa ?? acao.custoPa ?? 0,
  };
}

export type FichaParaAtaque = { atributos: Record<Atributo, { valor: number }>; proficiencia: number; categorias: ReadonlySet<string> };

export type ItemParaAtaque = { nome: string; mecanica?: Record<string, unknown>; atributo?: Atributo | null; modo?: string | null };

/* Modo em uso: o escolhido no item, ou o primeiro da lista. Os campos do modo valem por cima dos da arma. */
export function disparoDaArma(item: ItemParaAtaque) {
  const lido = MecanicaArma.safeParse(item.mecanica);
  const a = lido.success ? lido.data.ataque : undefined;
  if (!a) return null;
  const modo = a.modos ? (a.modos.find((m) => m.nome === item.modo) ?? a.modos[0]!) : null;
  return { arma: a, modo, disparo: modo ? { ...a, ...modo } : a };
}

/* Atributos que a arma aceita; com mais de um (Finesse), o jogador escolhe no inventário. */
export function atributosDaArma(item: ItemParaAtaque): Atributo[] {
  const d = disparoDaArma(item)?.disparo.atributo;
  return d ? (Array.isArray(d) ? d : [d]) : [];
}

/* Arma equipada do personagem (armas-mecanica.yml). O atributo soma no ataque e no dano. Numa lista (Finesse),
   vale o que o jogador escolheu no item (decisão de 07/11/2026); sem escolha, o maior. */
export function ataqueComArma(item: ItemParaAtaque, ficha: FichaParaAtaque, ctx: ContextoCombate, custoPa: number): AtaqueMontado | null {
  const lido = disparoDaArma(item);
  if (!lido) return null;
  const { arma: a, modo, disparo: d } = lido;
  if (!d.dano || !d.atributo || !d.tipo) return null;
  const opcoes = Array.isArray(d.atributo) ? d.atributo : [d.atributo];
  const escolhido = item.atributo && opcoes.includes(item.atributo) ? item.atributo : null;
  const atributo = escolhido ?? opcoes.reduce((melhor, x) => (ficha.atributos[x].valor > ficha.atributos[melhor].valor ? x : melhor));
  const valor = ficha.atributos[atributo].valor;
  const proficiente = !a.categoria || ficha.categorias.has(a.categoria);
  const acerto: Parcela[] = [{ rotulo: NOME_ATRIBUTO[atributo], valor }];
  if (proficiente) acerto.push({ rotulo: "Proficiência", valor: ficha.proficiencia });
  else if (a.arma_de_fogo && ctx.regras.semProficiencia) acerto.push({ rotulo: "Sem proficiência", valor: ctx.regras.semProficiencia.arma_de_fogo_sem_proficiencia.ataque });
  /* Arma de distância sem máximo próprio: a regra do alcance (decisão de 07/11/2026) dá o dobro do efetivo,
     com desvantagem e metade do dano até lá, e nada além. A arma que traz o próprio (escopetas) vale primeiro. */
  const regra = ctx.regras.alcance;
  const distancia = d.tipo === "distancia" && d.alcance_m != null;
  const maximoDaRegra = distancia && regra?.alcance_maximo === "dobro_do_efetivo" ? d.alcance_m! * 2 : null;
  const ate = d.ate_o_maximo ?? (maximoDaRegra !== null && regra ? { desvantagem: regra.alem_do_efetivo.desvantagem, dano: regra.alem_do_efetivo.dano } : undefined);
  return {
    nome: modo ? `${item.nome} (modo ${modo.nome})` : item.nome,
    corpoACorpo: d.tipo === "corpo_a_corpo",
    armaDeFogo: !!a.arma_de_fogo,
    acerto,
    dano: { formula: d.dano.formula, tipo: d.dano.tipo, bonus: valor ? [{ rotulo: NOME_ATRIBUTO[atributo], valor }] : [] },
    inicio: false,
    combo: false,
    custoPa,
    alcance: {
      efetivo: d.alcance_m ?? null,
      /* Corpo a corpo: o alcance é o limite. */
      maximo: d.alcance_maximo_m ?? maximoDaRegra ?? (d.tipo === "corpo_a_corpo" ? (d.alcance_m ?? null) : null),
      cone: !!d.cone,
      ateOMaximo: ate ? { desvantagem: !!ate.desvantagem, danoMetade: ate.dano === "metade", alvos: ate.alvos ?? null } : null,
      foraDoMaximo: d.fora_do_maximo === "fora_de_alcance" || (maximoDaRegra !== null && regra?.alem_do_maximo === "fora_de_alcance") || d.tipo === "corpo_a_corpo",
      impactoPesado: !!d.impacto_pesado,
    },
  };
}

export type DanoRolado = { dados: number[]; formula: string; total: number; conta: Parcela[] };

/* Crítico: o dobro dos dados, bônus normal (Jogador, Combate, Acerto Crítico). Dano não fica negativo. */
export function rolarDanoDoAtaque(dano: AtaqueMontado["dano"], critico: boolean, aleatorio: Aleatorio, extras: Parcela[] = [], opcoes: { dadosExtras?: number } = {}): DanoRolado {
  const r = rolarDados(dano.formula, aleatorio, { dobrarDados: critico, dadosExtras: opcoes.dadosExtras ?? 0 });
  const bonus = [...dano.bonus, ...extras];
  const conta: Parcela[] = [{ rotulo: critico ? `${dano.formula} (crítico: dados em dobro)` : dano.formula, valor: r.total }, ...bonus];
  return { dados: r.dados, formula: dano.formula, total: Math.max(dano.minimo ?? 0, conta.reduce((s, p) => s + p.valor, 0)), conta };
}

/* Ataque Desarmado (Jogador, Ações): 1 + Brutalidade de dano, mínimo 1; acerto com Brutalidade + proficiência,
   dano contundente (decisão de 07/11/2026). "extras": o que soma no dano, como a Soqueira (+2). */
export function ataqueDesarmado(ficha: FichaParaAtaque, ctx: ContextoCombate, extras: Parcela[] = []): AtaqueMontado | null {
  const r = ctx.regras.desarmado;
  if (!r) return null;
  const atributo = r.acerto.atributo;
  const valor = ficha.atributos[atributo].valor;
  const somaNoDano = ficha.atributos[r.dano.soma].valor;
  return {
    nome: "Ataque Desarmado",
    corpoACorpo: true,
    armaDeFogo: false,
    acerto: [
      { rotulo: NOME_ATRIBUTO[atributo], valor },
      { rotulo: "Proficiência", valor: ficha.proficiencia },
    ],
    dano: { formula: r.dano.formula, tipo: r.dano.tipo, bonus: [...(somaNoDano ? [{ rotulo: NOME_ATRIBUTO[r.dano.soma], valor: somaNoDano }] : []), ...extras], minimo: r.dano.minimo },
    inicio: false,
    combo: false,
    custoPa: r.custo.pa,
    alcance: { efetivo: r.alcance_m, maximo: r.alcance_m, cone: false, ateOMaximo: null, foraDoMaximo: true, impactoPesado: false },
  };
}

/* Soma do "bonus_desarmado" das armas equipadas (Soqueira, decisão de 07/11/2026). */
export function bonusDesarmado(itens: readonly { nome: string; equipado: boolean; mecanica?: Record<string, unknown> }[]): Parcela[] {
  return itens.flatMap((i) => {
    if (!i.equipado) return [];
    const lido = MecanicaArma.safeParse(i.mecanica);
    const b = lido.success ? lido.data.ataque?.bonus_desarmado : undefined;
    return b ? [{ rotulo: i.nome, valor: b }] : [];
  });
}
