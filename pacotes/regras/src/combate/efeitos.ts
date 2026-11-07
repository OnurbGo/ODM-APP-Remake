import type { Alvo, EfeitoAtivo, Mudanca } from "@odm/protocolo";
import type { ContextoCombate } from "./contexto";
import { normalizarTipo } from "./dano";
import type { FonteDeEfeito } from "./testes";

/* Efeitos automáticos (especificação 4.4): acúmulos, duração, gatilhos de turno e o que tiram de PA.
   O que depende do mestre (Alucinado, Enfeitiçado) fica só como texto. */

export type NovoEfeito = {
  id: string;
  efeitoId: string;
  acumulos?: number;
  nivel?: number | null;
  turnos?: number | null;
  origem?: string | null;
  /* Aplicado durante o turno do próprio afetado: "fim do próximo turno" pula este. */
  noTurnoDoAfetado?: boolean;
};

/* Devolve a mudança a aplicar, ou o motivo de não aplicar (imunidade, acúmulo no máximo). */
export function aplicarEfeito(
  alvo: Alvo,
  ativos: readonly EfeitoAtivo[],
  novo: NovoEfeito,
  ctx: ContextoCombate,
  imunidadesACondicao: readonly string[] = [],
): { mudanca: Mudanca } | { recusado: string } {
  const doPacote = ctx.efeitos.get(novo.efeitoId);
  const nome = doPacote?.nome ?? novo.efeitoId;
  if (imunidadesACondicao.includes(normalizarTipo(nome))) return { recusado: `Imune a ${nome}.` };
  const mec = doPacote?.mecanica;
  const maxAcumulos = mec?.acumulos?.max ?? 1;
  const maxNivel = mec?.niveis?.max ?? null;
  const atual = ativos.find((e) => e.efeitoId === novo.efeitoId);
  if (atual) {
    const acumulos = Math.min(maxAcumulos, atual.acumulos + (novo.acumulos ?? 1));
    const nivel = maxNivel !== null ? Math.min(maxNivel, (atual.nivel ?? 0) + (novo.nivel ?? 1)) : atual.nivel;
    const turnosRestantes = novo.turnos ?? atual.turnosRestantes;
    if (acumulos === atual.acumulos && nivel === atual.nivel && turnosRestantes === atual.turnosRestantes) return { recusado: `${nome} já está no máximo.` };
    return { mudanca: { op: "efeito_muda", alvo, antes: atual, depois: { ...atual, acumulos, nivel, turnosRestantes } } };
  }
  const efeito: EfeitoAtivo = {
    id: novo.id,
    efeitoId: novo.efeitoId,
    nome,
    acumulos: Math.min(maxAcumulos, novo.acumulos ?? 1),
    nivel: maxNivel !== null ? Math.min(maxNivel, novo.nivel ?? 1) : (novo.nivel ?? null),
    turnosRestantes: novo.turnos ?? (typeof mec?.duracao?.turnos === "number" ? mec.duracao.turnos : (mec?.duracao?.turnos_da_criatura_afetada ?? null)),
    origem: novo.origem ?? null,
    contadores: novo.noTurnoDoAfetado ? { pularFimDoTurno: 1 } : {},
  };
  return { mudanca: { op: "efeito_entra", alvo, efeito } };
}

export function removerAcumulo(alvo: Alvo, efeito: EfeitoAtivo, quantos = 1): Mudanca {
  if (efeito.acumulos - quantos <= 0) return { op: "efeito_sai", alvo, efeito };
  return { op: "efeito_muda", alvo, antes: efeito, depois: { ...efeito, acumulos: efeito.acumulos - quantos } };
}

export type Momento = "inicio_do_turno" | "fim_do_turno";

/* O que o turno dispara. "perda" ignora RD (Hemorragia); "dano" passa pela ordem do dano; "teste" é oferecido. */
export type Disparo =
  | { tipo: "perda"; efeito: EfeitoAtivo; formula: string; vezes: number; ignoraRd: boolean }
  | { tipo: "dano"; efeito: EfeitoAtivo; formula: string; tipoDano: string | null; vezes: number }
  | { tipo: "teste"; efeito: EfeitoAtivo; teste: { tipo: "resistencia" | "habilidade"; atributo: string | null; dt: number }; removeAcumulos: number; encerra: boolean }
  | { tipo: "escolha"; efeito: EfeitoAtivo; texto: string };

const quandoVale = (quando: string | string[], momento: Momento) => (Array.isArray(quando) ? quando : [quando]).includes(momento);

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto => (v && typeof v === "object" ? (v as Objeto) : {});

export function disparosDoTurno(ativos: readonly EfeitoAtivo[], momento: Momento, ctx: ContextoCombate): Disparo[] {
  const disparos: Disparo[] = [];
  for (const efeito of ativos) {
    const mec = ctx.efeitos.get(efeito.efeitoId)?.mecanica;
    for (const g of mec?.gatilhos ?? []) {
      const proximo = quandoVale(g.quando, "fim_do_proximo_turno" as Momento) && momento === "fim_do_turno";
      if (!quandoVale(g.quando, momento) && !proximo) continue;
      if (proximo && (efeito.contadores.pularFimDoTurno ?? 0) > 0) continue;
      const faz = objeto(g.faz);
      const vezes = faz.por_acumulo ? efeito.acumulos : 1;
      if (typeof faz.perde_pv === "string") disparos.push({ tipo: "perda", efeito, formula: faz.perde_pv, vezes, ignoraRd: !!faz.ignora_rd });
      if (typeof faz.dano === "string" && /^\d/.test(faz.dano)) disparos.push({ tipo: "dano", efeito, formula: faz.dano, tipoDano: typeof faz.tipo === "string" ? faz.tipo : null, vezes });
      const oferece = objeto(g.oferece);
      const teste = objeto(oferece.teste);
      if (typeof teste.dt === "number") {
        const sucesso = objeto(oferece.sucesso);
        disparos.push({
          tipo: "teste",
          efeito,
          teste: { tipo: teste.tipo === "habilidade" ? "habilidade" : "resistencia", atributo: typeof teste.atributo === "string" ? teste.atributo : null, dt: teste.dt },
          removeAcumulos: typeof sucesso.remover_acumulo === "number" ? sucesso.remover_acumulo : 0,
          encerra: !!sucesso.encerrar,
        });
      }
      /* Sem "faz" nem "oferece" (Podridão Sangrenta): quem sofre escolhe, e a tela mostra o texto. */
      if (g.faz === undefined && g.oferece === undefined) disparos.push({ tipo: "escolha", efeito, texto: ctx.efeitos.get(efeito.efeitoId)?.texto ?? "" });
    }
  }
  return disparos;
}

/* Fim do turno do afetado: desconta a duração e encerra o que chegou a zero (suposição 5 do plano). */
export function descontarDuracao(alvo: Alvo, ativos: readonly EfeitoAtivo[]): Mudanca[] {
  const mudancas: Mudanca[] = [];
  for (const e of ativos) {
    if ((e.contadores.pularFimDoTurno ?? 0) > 0) {
      const { pularFimDoTurno: _p, ...resto } = e.contadores;
      mudancas.push({ op: "efeito_muda", alvo, antes: e, depois: { ...e, contadores: resto } });
      continue;
    }
    if (e.turnosRestantes === null) continue;
    if (e.turnosRestantes <= 1) mudancas.push({ op: "efeito_sai", alvo, efeito: e });
    else mudancas.push({ op: "efeito_muda", alvo, antes: e, depois: { ...e, turnosRestantes: e.turnosRestantes - 1 } });
  }
  return mudancas;
}

/* PA perdido por efeito no início do turno (Amedrontado, Debilitado). */
export function paPerdidoPorEfeitos(fontes: readonly FonteDeEfeito[]) {
  return fontes.reduce((soma, f) => soma + Math.max(0, -(f.mecanica?.pa_por_turno ?? 0)), 0);
}

/* Incapacitado: não gasta PA em ações nem reações, só em deslocamento. */
export function bloqueiosDePa(fontes: readonly FonteDeEfeito[]) {
  const bloqueia = new Set<string>();
  for (const f of fontes) for (const b of f.mecanica?.bloqueia_pa ?? []) bloqueia.add(b);
  return { acoes: bloqueia.has("acoes"), reacoes: bloqueia.has("reacoes"), fonte: fontes.find((f) => f.mecanica?.bloqueia_pa?.length)?.nome ?? null };
}

/* Deslocamento: fixar vence metade (Agarrado, Impedido, Atordoado); metade arredonda para baixo, mínimo 1. */
export function deslocamentoComEfeitos(base: number, fontes: readonly FonteDeEfeito[]) {
  const fixos = fontes.filter((f) => f.mecanica?.deslocamento?.fixar !== undefined);
  if (fixos.length) return { valor: Math.min(...fixos.map((f) => f.mecanica!.deslocamento!.fixar!)), motivo: fixos[0]!.nome };
  const metade = fontes.find((f) => f.mecanica?.deslocamento?.metade);
  if (metade) return { valor: Math.max(1, Math.floor(base / 2)), motivo: metade.nome };
  return { valor: base, motivo: null };
}
