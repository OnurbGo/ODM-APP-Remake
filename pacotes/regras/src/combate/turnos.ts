import type { Alvo, Combatente, EstadoCombate, Mudanca } from "@odm/protocolo";
import type { Aleatorio } from "../dados";
import type { ContextoCombate } from "./contexto";
import { bloqueiosDePa, paPerdidoPorEfeitos } from "./efeitos";
import type { FonteDeEfeito } from "./testes";

/* Rodadas, turnos e PA (Jogador, Combate: "Seu Turno", "Gastando os PA", "Guardando Ações"). O PA que sobra
   no turno fica guardado até o fim da rodada, para reação ou para agir no fim dela. */

const comoAlvo = (c: Combatente): Alvo => ({ tipo: "combatente", id: c.id });

const somarPa = (c: Combatente, campo: "pa.disponiveis" | "pa.guardados" | "pa.bloqueados", valor: number): Mudanca[] => {
  const atual = c.pa[campo.slice(3) as "disponiveis"];
  return valor === atual ? [] : [{ op: "somar", alvo: comoAlvo(c), campo, delta: valor - atual }];
};

export const daVez = (combate: EstadoCombate) => {
  const id = combate.ordem[combate.vez];
  return combate.combatentes.find((c) => c.id === id) ?? null;
};

const ID_INCONSCIENTE = "efeito.inconsciente";

/* Início do turno: PA do turno menos o que os efeitos tiram, mais o Ás no primeiro turno. Quem começa o turno
   Inconsciente perde todos os PA dele: não há o que guardar, e a cura no meio da rodada não traz reação
   (decisão de 07/11/2026, depois do teste no celular). */
export function inicioDoTurno(c: Combatente, fontes: readonly FonteDeEfeito[], paPorTurno: number, ctx: ContextoCombate, aleatorio: Aleatorio) {
  const inconsciente = fontes.some((f) => f.efeitoId === ID_INCONSCIENTE);
  const perdidos = inconsciente ? paPorTurno : Math.min(paPorTurno, paPerdidoPorEfeitos(fontes));
  const asExtra = !c.jaAgiu && !inconsciente ? c.marcas.paExtraNoPrimeiroTurno : 0;
  const mudancas: Mudanca[] = [...somarPa(c, "pa.disponiveis", paPorTurno - perdidos + asExtra), ...somarPa(c, "pa.bloqueados", perdidos)];
  if (c.ataquesNoTurno) mudancas.push({ op: "somar", alvo: comoAlvo(c), campo: "ataquesNoTurno", delta: -c.ataquesNoTurno });
  if (c.marcas.comboLiberado || c.marcas.imprudenteNoTurno) {
    mudancas.push({ op: "marcas", alvo: comoAlvo(c), antes: c.marcas, depois: { ...c.marcas, comboLiberado: false, imprudenteNoTurno: false } });
  }
  /* Recarga X–Y: no início do turno da criatura, 1d6 por habilidade gasta; na faixa, ela volta. */
  const recargas = c.recargasGastas.map((acaoId) => ({ acaoId, rolagem: aleatorio(1, 6) }));
  return { mudancas, perdidos, asExtra, recargas, regraRecarga: ctx.regras.recarga };
}

/* A Rainha vale "até o início do próximo turno de quem usou": no turno dele, as marcas que ele deu acabam. */
export function expirarMarcasDe(combate: EstadoCombate, quemDeu: string): Mudanca[] {
  return combate.combatentes.flatMap((c): Mudanca[] =>
    c.marcas.reacaoSemCusto?.ate === quemDeu ? [{ op: "marcas", alvo: comoAlvo(c), antes: c.marcas, depois: { ...c.marcas, reacaoSemCusto: null } }] : [],
  );
}

/* Fim do turno: o PA que sobrou vira guardado. */
export function fimDoTurno(c: Combatente) {
  /* "jaAgiu" troca o combatente inteiro: vai antes das somas, para elas valerem por cima. */
  const mudancas: Mudanca[] = c.jaAgiu ? [] : [{ op: "combatente_muda", antes: c, depois: { ...c, jaAgiu: true } }];
  mudancas.push(...somarPa(c, "pa.guardados", c.pa.guardados + c.pa.disponiveis), ...somarPa(c, "pa.disponiveis", 0));
  return mudancas;
}

/* Fim da rodada: acaba o PA guardado, a contagem de deslocamentos e as defesas de reação. */
export function fimDaRodada(combate: EstadoCombate): Mudanca[] {
  const mudancas: Mudanca[] = [];
  for (const c of combate.combatentes) {
    mudancas.push(...somarPa(c, "pa.guardados", 0));
    if (c.deslocamentosNaRodada) mudancas.push({ op: "somar", alvo: comoAlvo(c), campo: "deslocamentosNaRodada", delta: -c.deslocamentosNaRodada });
    if (c.marcas.defesaDeReacao) mudancas.push({ op: "marcas", alvo: comoAlvo(c), antes: c.marcas, depois: { ...c.marcas, defesaDeReacao: null } });
    if (c.horda?.pressaoNaRodada.length) mudancas.push({ op: "horda", alvo: comoAlvo(c), antes: c.horda, depois: { ...c.horda, pressaoNaRodada: [] } });
  }
  return mudancas;
}

/* Próximo da ordem, pulando quem foi derrotado. Depois do último, a rodada vai para o fim (agir com o guardado). */
export function proximoNaOrdem(combate: EstadoCombate) {
  const andamento = { fase: combate.fase, rodada: combate.rodada, vez: combate.vez, ordem: combate.ordem, baralho: combate.baralho };
  if (combate.fase === "fim_da_rodada") {
    const primeiro = combate.ordem.findIndex((id) => !combate.combatentes.find((c) => c.id === id)?.derrotado);
    return { ...andamento, fase: "em_curso" as const, rodada: combate.rodada + 1, vez: Math.max(0, primeiro) };
  }
  for (let i = combate.vez + 1; i < combate.ordem.length; i++) {
    if (!combate.combatentes.find((c) => c.id === combate.ordem[i])?.derrotado) return { ...andamento, vez: i };
  }
  return { ...andamento, fase: "fim_da_rodada" as const };
}

export { aindaPodeDesfazer } from "./prazo";

export type TipoDeGasto = "acao" | "deslocamento" | "reacao";

/* Gasta PA de quem está agindo (do turno) ou de quem reage (do guardado). Rainha: primeira reação sem custo;
   Valete: um deslocamento sem custo no primeiro turno; terceiro deslocamento da rodada: 1 nível de Exaustão. */
export function gastarPa(
  c: Combatente,
  quantos: number,
  tipo: TipoDeGasto,
  opcoes: { naVez: boolean; fontes: readonly FonteDeEfeito[]; ctx: ContextoCombate; personagem?: Alvo | null },
): { mudancas: Mudanca[]; exaustao: boolean; semCusto: string | null } | { recusado: string } {
  const bloqueios = bloqueiosDePa(opcoes.fontes);
  if (tipo === "acao" && bloqueios.acoes) return { recusado: `${bloqueios.fonte}: só dá para gastar PA em deslocamento.` };
  if (tipo === "reacao" && bloqueios.reacoes) return { recusado: `${bloqueios.fonte}: não dá para reagir.` };
  const mudancas: Mudanca[] = [];
  let semCusto: string | null = null;
  let custo = quantos;
  if (tipo === "reacao" && c.marcas.reacaoSemCusto) {
    semCusto = "Rainha";
    custo = 0;
    mudancas.push({ op: "marcas", alvo: comoAlvo(c), antes: c.marcas, depois: { ...c.marcas, reacaoSemCusto: null } });
  } else if (tipo === "deslocamento" && c.marcas.deslocamentoSemCusto > 0 && !c.jaAgiu) {
    semCusto = "Valete";
    custo = 0;
    mudancas.push({ op: "marcas", alvo: comoAlvo(c), antes: c.marcas, depois: { ...c.marcas, deslocamentoSemCusto: c.marcas.deslocamentoSemCusto - 1 } });
  }
  if (custo > 0) {
    const doTurno = opcoes.naVez && tipo !== "reacao";
    const fonte = doTurno ? c.pa.disponiveis : c.pa.guardados;
    if (fonte < custo) return { recusado: doTurno ? `Faltam PA: custa ${custo}, sobram ${fonte}.` : `Sem PA guardado para isso: custa ${custo}, guardados ${fonte}.` };
    mudancas.push({ op: "somar", alvo: comoAlvo(c), campo: doTurno ? "pa.disponiveis" : "pa.guardados", delta: -custo });
  }
  let exaustao = false;
  if (tipo === "deslocamento") {
    mudancas.push({ op: "somar", alvo: comoAlvo(c), campo: "deslocamentosNaRodada", delta: 1 });
    const regra = opcoes.ctx.regras.gastandoPa.mais_de_dois_deslocamentos_na_rodada;
    if (c.deslocamentosNaRodada + 1 === 3 && opcoes.personagem) {
      exaustao = true;
      mudancas.push({ op: "somar", alvo: opcoes.personagem, campo: "exaustao", delta: regra.exaustao });
    }
  }
  return { mudancas, exaustao, semCusto };
}
