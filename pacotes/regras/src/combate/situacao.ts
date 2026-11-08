import type { EstadoVivo } from "@odm/protocolo";
import type { Parcela, SituacaoDaFicha } from "../ficha/calculo";
import type { ContextoCombate } from "./contexto";
import { deslocamentoComEfeitos } from "./efeitos";
import { deslocamentoDoMundo } from "../mundo";
import { fontesDosEfeitos } from "./testes";

/* O que o estado vivo muda nos valores da ficha: Exaustão (Jogador, Efeitos), efeitos de deslocamento e as
   aflições e virtudes da Crise que mexem em Defesa e RD. */
export function situacaoDoVivo(vivo: EstadoVivo, ctx: ContextoCombate): SituacaoDaFicha {
  const parcelas: Required<NonNullable<SituacaoDaFicha["parcelas"]>> = { defesa: [], rd: [], deslocamento: [], pvMaximo: [] };
  const situacao: SituacaoDaFicha = { parcelas };
  const nivel = vivo.exaustao > 0 ? ctx.exaustao?.find((n) => n.nivel === vivo.exaustao) : undefined;
  if (nivel) {
    const rotulo = `Exaustão ${vivo.exaustao}`;
    if (nivel.defesa) parcelas.defesa.push({ rotulo, valor: nivel.defesa });
    if (nivel.rd) parcelas.rd.push({ rotulo, valor: nivel.rd });
    if (typeof nivel.deslocamento === "number") parcelas.deslocamento.push({ rotulo, valor: nivel.deslocamento });
    else if (nivel.deslocamento) situacao.deslocamentoFixo = { valor: nivel.deslocamento.fixar, motivo: rotulo };
    if (nivel.pv_maximo === "metade") situacao.pvMaximoMetade = rotulo;
    if (vivo.exaustao <= 4) situacao.deslocamentoMinimo = 1;
  }
  const fontes = fontesDosEfeitos(vivo.efeitos, ctx);
  const desloc = deslocamentoComEfeitos(100, fontes);
  /* 100 é só uma régua: metade volta 50, e fixar volta o valor fixo. */
  if (desloc.motivo && !situacao.deslocamentoFixo) {
    if (desloc.valor === 50) situacao.deslocamentoMetade = desloc.motivo;
    else situacao.deslocamentoFixo = { valor: desloc.valor, motivo: desloc.motivo };
  }
  situacao.deslocamentoMenos = deslocamentoDoMundo(ctx);
  const tabelas = { ...(ctx.regras.crise?.aflicoes ?? {}), ...(ctx.regras.virtudes?.virtudes ?? {}) };
  for (const marca of [...vivo.aflicoes, ...vivo.virtudes]) {
    const efeito = tabelas[marca.linha]?.intensidade[marca.intensidade - 1];
    if (!efeito) continue;
    const rotulo = `${marca.nome}${marca.intensidade === 2 ? " II" : ""}`;
    if (typeof efeito.defesa === "number") parcelas.defesa.push({ rotulo, valor: efeito.defesa });
    if (typeof efeito.rd === "number") parcelas.rd.push({ rotulo, valor: efeito.rd });
  }
  return situacao;
}

/* Exaustão nos testes: a penalidade do nível atual. */
export function penalidadeDeExaustao(vivo: EstadoVivo, ctx: ContextoCombate): Parcela | null {
  const nivel = vivo.exaustao > 0 ? ctx.exaustao?.find((n) => n.nivel === vivo.exaustao) : undefined;
  return nivel?.testes ? { rotulo: `Exaustão ${vivo.exaustao}`, valor: nivel.testes } : null;
}

/* Aflições e virtudes nos testes: Tremores e Concentrado no ataque, Resoluto na resistência. */
export function modificadoresDeCrise(vivo: EstadoVivo, ctx: ContextoCombate, tipo: "ataque" | "habilidade" | "resistencia"): Parcela[] {
  const tabelas = { ...(ctx.regras.crise?.aflicoes ?? {}), ...(ctx.regras.virtudes?.virtudes ?? {}) };
  return [...vivo.aflicoes, ...vivo.virtudes].flatMap((marca) => {
    const efeito = tabelas[marca.linha]?.intensidade[marca.intensidade - 1];
    const valor = efeito?.[tipo];
    return typeof valor === "number" ? [{ rotulo: `${marca.nome}${marca.intensidade === 2 ? " II" : ""}`, valor }] : [];
  });
}

/* Exaustão 4 e 5 (Jogador, Efeitos; decisão de 07/11/2026 para o 5): sem PV temporários. Devolve o motivo. */
export function semPvTemporarios(vivo: EstadoVivo, ctx: ContextoCombate): string | null {
  const nivel = vivo.exaustao > 0 ? ctx.exaustao?.find((n) => n.nivel === vivo.exaustao) : undefined;
  return nivel?.sem_pv_temporarios ? `Exaustão ${vivo.exaustao}: sem PV temporários` : null;
}
