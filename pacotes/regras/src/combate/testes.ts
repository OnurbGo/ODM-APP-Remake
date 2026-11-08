import { ReageA, type Atributo, type MecanicaEfeito, type TipoDeTeste } from "@odm/conteudo";
import type { EfeitoAtivo, ModoRolagem, OpcoesCampanha } from "@odm/protocolo";
import type { Aleatorio } from "../dados";
import type { Parcela } from "../ficha/calculo";
import type { ContextoCombate } from "./contexto";
import { rolarD20ComVantagem, saldoDeVantagem, type D20ComVantagem } from "./vantagem";

/* Monta e resolve os testes (Jogador, Progressão; especificação 8): habilidade, resistência, passivo, contestado
   e ataque. Toda parcela tem rótulo, para a tela mostrar a conta. */

export type FonteDeEfeito = { efeitoId: string; nome: string; mecanica: MecanicaEfeito | null; acumulos: number; nivel: number | null };

/* Atordoado e Inconsciente trazem Incapacitado e Caído junto ("implica"). Cada efeito conta uma vez. */
export function fontesDosEfeitos(ativos: readonly EfeitoAtivo[], ctx: ContextoCombate): FonteDeEfeito[] {
  const fontes = new Map<string, FonteDeEfeito>();
  const incluir = (efeitoId: string, acumulos: number, nivel: number | null, nome?: string) => {
    if (fontes.has(efeitoId)) return;
    const doPacote = ctx.efeitos.get(efeitoId);
    fontes.set(efeitoId, { efeitoId, nome: nome ?? doPacote?.nome ?? efeitoId, mecanica: doPacote?.mecanica ?? null, acumulos, nivel });
    for (const outro of doPacote?.mecanica?.implica ?? []) incluir(outro, 1, null);
  };
  for (const e of ativos) incluir(e.efeitoId, e.acumulos, e.nivel, e.nome);
  return [...fontes.values()];
}

export type QueTeste = {
  tipo: TipoDeTeste;
  /* Atributo do teste ou da perícia testada. */
  atributo: Atributo | null;
  corpoACorpo?: boolean;
  armaDeFogo?: boolean;
  /* Marcado pelo mestre: o app não sabe sozinho se o teste depende de visão ou audição. */
  dependeDe?: "visao" | "audicao";
};

export type TesteMontado = {
  modificadores: Parcela[];
  vantagens: string[];
  desvantagens: string[];
  falhaAutomatica: string | null;
};

const vale = (em: readonly string[], q: QueTeste) =>
  em.includes(q.tipo) || (q.tipo === "ataque" && ((q.corpoACorpo && em.includes("ataque_corpo_a_corpo")) || (q.armaDeFogo && em.includes("ataque_arma_de_fogo"))));

export type Montagem = {
  teste: QueTeste;
  /* Atributo, proficiência e o que mais a ficha já soma. */
  base: Parcela[];
  efeitos: readonly FonteDeEfeito[];
  exaustao: number;
  ctx: ContextoCombate;
  /* Ajuste do pedido do mestre e do pop-up do jogador. */
  bonus?: number;
  modo?: ModoRolagem;
  /* Outras fontes de vantagem: Rei, Atitude Imprudente, habilidades. */
  vantagensExtras?: string[];
  desvantagensExtras?: string[];
  /* Ataque: os efeitos de quem é atacado mudam a rolagem de quem ataca ("contra_si"). */
  efeitosDoAlvo?: readonly FonteDeEfeito[];
  aAteUmMetro?: boolean;
};

export function montarTeste(m: Montagem): TesteMontado {
  const modificadores = [...m.base];
  const vantagens = [...(m.vantagensExtras ?? [])];
  const desvantagens = [...(m.desvantagensExtras ?? [])];
  let falhaAutomatica: string | null = null;
  const q = m.teste;

  for (const f of m.efeitos) {
    const mec = f.mecanica;
    if (!mec) continue;
    for (const regra of mec.testes ?? []) {
      if (!vale(regra.em, q)) continue;
      if (regra.atributo && regra.atributo !== q.atributo) continue;
      (regra.aplica === "vantagem" ? vantagens : desvantagens).push(f.nome);
    }
    for (const falha of mec.falha_automatica ?? []) {
      if (falha.em !== q.tipo) continue;
      if (falha.atributo && falha.atributo !== q.atributo) continue;
      if (falha.depende_de && falha.depende_de !== q.dependeDe) continue;
      falhaAutomatica ??= f.nome;
    }
    for (const p of mec.por_acumulo ?? []) {
      if (q.tipo === "ataque" && q.armaDeFogo && p.em === "ataque_arma_de_fogo") modificadores.push({ rotulo: f.nome, valor: p.modificador * f.acumulos });
    }
    const nivel = f.nivel && mec.testes_por_nivel?.find((n) => n.nivel === f.nivel);
    if (nivel && q.atributo && nivel.atributos[q.atributo]) modificadores.push({ rotulo: `${f.nome} ${f.nivel}`, valor: nivel.atributos[q.atributo]! });
  }

  for (const f of m.efeitosDoAlvo ?? []) {
    for (const c of f.mecanica?.contra_si ?? []) {
      if (c.em !== "ataque" || !c.aplica) continue;
      if (c.ate_m !== undefined && !m.aAteUmMetro) continue;
      if (c.alem_de_m !== undefined && m.aAteUmMetro) continue;
      (c.aplica === "vantagem" ? vantagens : desvantagens).push(`${f.nome} (alvo)`);
    }
  }

  const exaustao = m.exaustao > 0 ? m.ctx.exaustao?.find((n) => n.nivel === m.exaustao) : undefined;
  if (exaustao?.testes) modificadores.push({ rotulo: `Exaustão ${m.exaustao}`, valor: exaustao.testes });
  if (m.bonus) modificadores.push({ rotulo: m.bonus > 0 ? "Bônus" : "Penalidade", valor: m.bonus });
  if (m.modo === "vantagem") vantagens.push("Ajuste");
  if (m.modo === "desvantagem") desvantagens.push("Ajuste");
  return { modificadores, vantagens, desvantagens, falhaAutomatica };
}

export type OpcaoDoTeste = "rolar" | "fazer_com_calma" | "tentar_ate_conseguir";

export type ResultadoTeste = {
  d20: D20ComVantagem | null;
  natural: number | null;
  modificadores: Parcela[];
  total: number | null;
  dt: number | null;
  sucesso: boolean | null;
  critico: "acerto" | "falha" | null;
  falhaAutomatica: string | null;
};

const somar = (ps: readonly Parcela[]) => ps.reduce((s, p) => s + p.valor, 0);

export function resolverTeste(
  montado: TesteMontado,
  opcoes: {
    tipo: TipoDeTeste;
    dt: number | null;
    modelo: OpcoesCampanha["modeloVantagem"];
    ctx: ContextoCombate;
    aleatorio: Aleatorio;
    opcao?: OpcaoDoTeste;
    /* Carta do Destino: crítico garantido em ataque ou habilidade. */
    criticoGarantido?: boolean;
  },
): ResultadoTeste {
  const { regras } = opcoes.ctx;
  if (montado.falhaAutomatica) {
    return { d20: null, natural: null, modificadores: montado.modificadores, total: null, dt: opcoes.dt, sucesso: false, critico: null, falhaAutomatica: montado.falhaAutomatica };
  }
  const opcao = opcoes.opcao ?? "rolar";
  if (opcao !== "rolar") {
    const natural = (opcao === "fazer_com_calma" ? regras.calma?.d20_vale : regras.tentar?.d20_vale) ?? (opcao === "fazer_com_calma" ? 10 : 20);
    const total = natural + somar(montado.modificadores);
    return { d20: null, natural, modificadores: montado.modificadores, total, dt: opcoes.dt, sucesso: opcoes.dt === null ? null : total >= opcoes.dt, critico: null, falhaAutomatica: null };
  }
  const d20 = rolarD20ComVantagem(saldoDeVantagem(montado.vantagens.length, montado.desvantagens.length), opcoes.modelo, regras, opcoes.aleatorio);
  const natural = opcoes.criticoGarantido ? regras.critico.natural : d20.natural;
  const modificadores = d20.modificadorDeCarta
    ? [...montado.modificadores, { rotulo: d20.modificadorDeCarta > 0 ? "Carta (vantagem)" : "Carta (desvantagem)", valor: d20.modificadorDeCarta }]
    : montado.modificadores;
  const total = natural + somar(modificadores);
  /* Crítico só tem efeito de regra no ataque; no teste de resistência, 20 e 1 são só destaque (seção 14). */
  const critico = natural === regras.critico.natural ? "acerto" : natural === regras.critico.falha_critica.natural ? "falha" : null;
  let sucesso: boolean | null = opcoes.dt === null ? null : total >= opcoes.dt;
  if (opcoes.tipo === "ataque" && critico === "acerto" && regras.critico.acerta_sempre) sucesso = true;
  if (opcoes.criticoGarantido && opcoes.tipo === "habilidade") sucesso = true;
  return { d20: opcoes.criticoGarantido ? { ...d20, natural } : d20, natural, modificadores, total, dt: opcoes.dt, sucesso, critico, falhaAutomatica: null };
}

/* Teste passivo: 10 + modificadores, vantagem +5 e desvantagem −5 uma vez só; as duas se anulam. */
export function valorPassivo(montado: TesteMontado, ctx: ContextoCombate) {
  const { base, vantagem, desvantagem } = ctx.regras.passivos;
  const lado = saldoDeVantagem(montado.vantagens.length ? 1 : 0, montado.desvantagens.length ? 1 : 0).lado;
  const parcelas: Parcela[] = [{ rotulo: "Base", valor: base }, ...montado.modificadores];
  if (lado === "vantagem") parcelas.push({ rotulo: "Vantagem", valor: vantagem });
  if (lado === "desvantagem") parcelas.push({ rotulo: "Desvantagem", valor: desvantagem });
  return { parcelas, total: somar(parcelas), falhaAutomatica: montado.falhaAutomatica };
}

/* Contestado: no empate, vence quem age (decisão de 06/11/2026, Esconder-se). */
export function venceContestado(totalPersonagem: number | null, totalOponente: number | null, quemAge: "personagem" | "oponente"): "personagem" | "oponente" {
  if (totalPersonagem === null) return "oponente";
  if (totalOponente === null) return "personagem";
  if (totalPersonagem === totalOponente) return quemAge;
  return totalPersonagem > totalOponente ? "personagem" : "oponente";
}

/* Ataques múltiplos: o primeiro do turno sem penalidade, depois −5 a cada ataque anterior. */
export function penalidadeDeAtaquesMultiplos(ataquesAnteriores: number, ctx: ContextoCombate, opcoes: { semPenalidade?: boolean } = {}): Parcela | null {
  if (opcoes.semPenalidade || ataquesAnteriores <= 0) return null;
  return { rotulo: "Ataques múltiplos", valor: ataquesAnteriores * ctx.regras.ataquesMultiplos.penalidade_por_ataque_anterior };
}

/* Habilidades marcadas com "reage_a" para esta situação (situacoes-mecanica.yml): o pop-up as oferece e,
   no automático, as de "antes_de_rolar" fazem o app pausar e perguntar (especificação 8.4). */
export type SituacaoDeReacao = { teste: "resistencia" | "habilidade" | "ataque"; atributo: Atributo | null };

export function habilidadesQueServem<H extends { mecanica?: Record<string, unknown> }>(
  habilidades: readonly H[],
  situacao: SituacaoDeReacao,
  momento: ReageA["momento"],
): H[] {
  return habilidades.filter((h) => {
    const lido = ReageA.array().safeParse(h.mecanica?.reage_a);
    if (!lido.success) return false;
    return lido.data.some(
      (r) => r.teste === situacao.teste && r.momento === momento && (!r.atributos || (situacao.atributo !== null && r.atributos.includes(situacao.atributo))),
    );
  });
}

/* Habilidades para um ataque contra o próprio personagem (reage_a com "ataque": contra_si), no momento pedido:
   antes da rolagem, ou depois dela (acerto, erro, crítico). "so_corpo_a_corpo" vale só contra ataque corpo a corpo. */
export function habilidadesContraAtaque<H extends { mecanica?: Record<string, unknown> }>(
  habilidades: readonly H[],
  ataque: { corpoACorpo: boolean; emArea?: boolean },
  momento: ReageA["momento"],
): H[] {
  return habilidades.filter((h) => {
    const lido = ReageA.array().safeParse(h.mecanica?.reage_a);
    if (!lido.success) return false;
    return lido.data.some(
      (r) => (r.ataque === "contra_si" || (r.ataque === "contra_si_em_area" && ataque.emArea)) && r.momento === momento && (!r.so_corpo_a_corpo || ataque.corpoACorpo),
    );
  });
}
