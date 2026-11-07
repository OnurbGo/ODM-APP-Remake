import type { Horda, IntegranteHorda } from "@odm/protocolo";

/* Horda do Zumbi (Mestre, ficha do Zumbi; ataques-mecanica.yml; especificação 7.1). O app não tem mapa:
   adjacência e área são marcadas pelo mestre. */

export type RegrasDaHorda = { minimoIntegrantes: number; danoPorIntegrante: number; desfazCom: number; bonusMaximo: number; paPorTurno: number };

export const bonusDeHorda = (integrantes: number, maximo: number) => Math.min(maximo, Math.floor(integrantes / 3));

/* Uma jogada contra metade do bônus em alvos, para baixo, mínimo 1. */
export const alvosDoAtaqueDeHorda = (bonus: number) => Math.max(1, Math.floor(bonus / 2));

const somaDosPv = (integrantes: readonly IntegranteHorda[]) => integrantes.reduce((s, i) => s + i.pv, 0);
export const pvDaHorda = (horda: Horda) => (horda.pvInicial || somaDosPv(horda.integrantes)) - horda.danoAcumulado;

export function formarHorda(integrantes: readonly IntegranteHorda[], regras: RegrasDaHorda): { horda: Horda } | { recusado: string } {
  if (integrantes.length < regras.minimoIntegrantes) return { recusado: `A Horda precisa de pelo menos ${regras.minimoIntegrantes} Zumbis.` };
  return { horda: { integrantes: [...integrantes], pvInicial: somaDosPv(integrantes), danoAcumulado: 0, naArea: [], pressaoNaRodada: [] } };
}

export type DanoNaHorda = {
  horda: Horda;
  removidos: IntegranteHorda[];
  /* Com integrantes de menos, a Horda se desfaz: quem sobra volta com os PV divididos (decisão de 06/11/2026). */
  desfeita: { integrantes: IntegranteHorda[] } | null;
  destruida: boolean;
};

/* A cada 10 de dano acumulado sai um Zumbi. Sai primeiro o de menos PV; o mestre pode trocar. */
export function danoNaHorda(horda: Horda, dano: number, regras: RegrasDaHorda): DanoNaHorda {
  const danoAcumulado = horda.danoAcumulado + Math.max(0, dano);
  const deveSair = Math.floor(danoAcumulado / regras.danoPorIntegrante) - Math.floor(horda.danoAcumulado / regras.danoPorIntegrante);
  const ordenados = [...horda.integrantes].sort((a, b) => a.pv - b.pv);
  const removidos = ordenados.slice(0, Math.min(deveSair, ordenados.length));
  const ficam = horda.integrantes.filter((i) => !removidos.includes(i));
  const nova: Horda = { ...horda, integrantes: ficam, danoAcumulado };
  const restantes = (horda.pvInicial || somaDosPv(horda.integrantes)) - danoAcumulado;
  if (restantes <= 0 || !ficam.length) return { horda: nova, removidos, desfeita: null, destruida: true };
  if (ficam.length <= regras.desfazCom) {
    const cada = Math.floor(restantes / ficam.length);
    return { horda: nova, removidos, desfeita: { integrantes: ficam.map((i) => ({ ...i, pv: cada })) }, destruida: cada <= 0 };
  }
  return { horda: nova, removidos, desfeita: null, destruida: false };
}

/* Dano em Área: ×2 com 3 espaços cobertos, ×3 com 6, máximo ×3 (depois da vulnerabilidade). */
export function multiplicadorDeArea(espacosCobertos: number, tabela: readonly { a_partir_de: number; vezes: number }[], maximo: number) {
  const vale = [...tabela].filter((t) => espacosCobertos >= t.a_partir_de).sort((a, b) => b.vezes - a.vezes)[0];
  return Math.min(maximo, vale?.vezes ?? 1);
}

/* O que a ficha da criatura diz sobre a Horda (ataques-mecanica.yml). Sem as regras de formar, PV e bônus revisadas,
   não há Horda automática: o mestre faz à mão. */
export type HordaDaFicha = {
  regras: RegrasDaHorda;
  /* Ameaça de Massa: modificador em testes de resistência e reações de quem está na área. */
  ameaca: number | null;
  /* Pressão de Massa: dano indefensável igual ao bônus, uma vez por rodada por criatura. */
  pressao: boolean;
  ataqueDeHorda: { acaoId: string; escolhas: string[]; custoPa: number } | null;
  area: { tabela: { a_partir_de: number; vezes: number }[]; maximo: number } | null;
};

type AcaoComMecanica = { id: string; custoPa: number | null; mecanica?: Record<string, unknown> };
type Objeto = Record<string, unknown>;
const obj = (v: unknown): Objeto => (v && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : {});

export function hordaDaFicha(acoes: readonly AcaoComMecanica[]): HordaDaFicha | null {
  let formar: { minimo: number; pa: number } | null = null;
  let pv: { porIntegrante: number; desfazCom: number } | null = null;
  let bonusMaximo: number | null = null;
  let ameaca: number | null = null;
  let pressao = false;
  let ataqueDeHorda: HordaDaFicha["ataqueDeHorda"] = null;
  let area: HordaDaFicha["area"] = null;
  for (const a of acoes) {
    const m = obj(a.mecanica);
    const requisito = obj(m.requisito);
    if (typeof requisito.minimo_integrantes === "number" && typeof m.pa_por_turno === "number") formar = { minimo: requisito.minimo_integrantes, pa: m.pa_por_turno };
    if (typeof m.dano_por_integrante === "number" && typeof m.desfaz_com_integrantes === "number") pv = { porIntegrante: m.dano_por_integrante, desfazCom: m.desfaz_com_integrantes };
    const bonus = obj(m.bonus);
    if (typeof bonus.maximo === "number") bonusMaximo = bonus.maximo;
    const testes = Array.isArray(m.testes) ? m.testes.map(obj) : [];
    const deMassa = testes.find((t) => Array.isArray(t.em) && t.em.includes("reacoes") && typeof t.modificador === "number");
    if (deMassa) ameaca = deMassa.modificador as number;
    const gatilhos = Array.isArray(m.gatilhos) ? m.gatilhos.map(obj) : [];
    if (gatilhos.some((g) => obj(g.faz).dano === "bonus_de_horda")) pressao = true;
    if (Array.isArray(m.ataque_a_escolha)) ataqueDeHorda = { acaoId: a.id, escolhas: m.ataque_a_escolha.filter((x): x is string => typeof x === "string"), custoPa: obj(m.custo).pa as number ?? a.custoPa ?? 1 };
    const naArea = obj(m.ao_receber_dano_em_area);
    if (Array.isArray(naArea.multiplicador) && typeof naArea.maximo === "number") {
      area = { tabela: naArea.multiplicador.map(obj).filter((t) => typeof t.a_partir_de === "number" && typeof t.vezes === "number") as { a_partir_de: number; vezes: number }[], maximo: naArea.maximo };
    }
  }
  if (!formar || !pv || bonusMaximo === null) return null;
  return {
    regras: { minimoIntegrantes: formar.minimo, danoPorIntegrante: pv.porIntegrante, desfazCom: pv.desfazCom, bonusMaximo, paPorTurno: formar.pa },
    ameaca,
    pressao,
    ataqueDeHorda,
    area,
  };
}
