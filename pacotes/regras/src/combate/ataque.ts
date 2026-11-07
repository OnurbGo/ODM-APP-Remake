import { MecanicaArma, MecanicaAtaqueDeCriatura, type Atributo } from "@odm/conteudo";
import type { Parcela } from "../ficha/calculo";
import { NOME_ATRIBUTO } from "../ficha/calculo";
import type { Aleatorio } from "../dados";
import type { ContextoCombate } from "./contexto";
import { rolarDados } from "./dados";

/* Ataque (Jogador, Combate: "Acerto Crítico", "Ataques Múltiplos", "Início e Combo"; Progressão: proficiência).
   A conta do ataque com arma é d20 + atributo da arma + proficiência (suposição 7 do plano, aprovada). */

export type AtaqueMontado = {
  nome: string;
  corpoACorpo: boolean;
  armaDeFogo: boolean;
  acerto: Parcela[];
  dano: { formula: string; tipo: string | null; bonus: Parcela[] };
  inicio: boolean;
  combo: boolean;
  custoPa: number;
};

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

/* Arma equipada do personagem (armas-mecanica.yml). O atributo soma no ataque e no dano; numa lista, vale o maior. */
export function ataqueComArma(item: { nome: string; mecanica?: Record<string, unknown> }, ficha: FichaParaAtaque, ctx: ContextoCombate, custoPa: number): AtaqueMontado | null {
  const lido = MecanicaArma.safeParse(item.mecanica);
  const a = lido.success ? lido.data.ataque : undefined;
  if (!a?.dano || !a.atributo || !a.tipo) return null;
  const opcoes = Array.isArray(a.atributo) ? a.atributo : [a.atributo];
  const atributo = opcoes.reduce((melhor, x) => (ficha.atributos[x].valor > ficha.atributos[melhor].valor ? x : melhor));
  const valor = ficha.atributos[atributo].valor;
  const proficiente = !a.categoria || ficha.categorias.has(a.categoria);
  const acerto: Parcela[] = [{ rotulo: NOME_ATRIBUTO[atributo], valor }];
  if (proficiente) acerto.push({ rotulo: "Proficiência", valor: ficha.proficiencia });
  else if (a.arma_de_fogo && ctx.regras.semProficiencia) acerto.push({ rotulo: "Sem proficiência", valor: ctx.regras.semProficiencia.arma_de_fogo_sem_proficiencia.ataque });
  return {
    nome: item.nome,
    corpoACorpo: a.tipo === "corpo_a_corpo",
    armaDeFogo: !!a.arma_de_fogo,
    acerto,
    dano: { formula: a.dano.formula, tipo: a.dano.tipo, bonus: valor ? [{ rotulo: NOME_ATRIBUTO[atributo], valor }] : [] },
    inicio: false,
    combo: false,
    custoPa,
  };
}

export type DanoRolado = { dados: number[]; formula: string; total: number; conta: Parcela[] };

/* Crítico: o dobro dos dados, bônus normal (Jogador, Combate, Acerto Crítico). Dano não fica negativo. */
export function rolarDanoDoAtaque(dano: AtaqueMontado["dano"], critico: boolean, aleatorio: Aleatorio, extras: Parcela[] = [], opcoes: { dadosExtras?: number } = {}): DanoRolado {
  const r = rolarDados(dano.formula, aleatorio, { dobrarDados: critico, dadosExtras: opcoes.dadosExtras ?? 0 });
  const bonus = [...dano.bonus, ...extras];
  const conta: Parcela[] = [{ rotulo: critico ? `${dano.formula} (crítico: dados em dobro)` : dano.formula, valor: r.total }, ...bonus];
  return { dados: r.dados, formula: dano.formula, total: Math.max(0, conta.reduce((s, p) => s + p.valor, 0)), conta };
}
