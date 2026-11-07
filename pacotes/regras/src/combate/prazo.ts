import type { EstadoCombate } from "@odm/protocolo";

/* Prazo do jogador para desfazer (especificação 5.2): o que fez no próprio turno, até ele acabar; o que fez fora
   (uma reação), até o fim do próximo turno dele. O mestre não tem prazo.
   Evento de combate sem prazo (a compra da iniciativa, por exemplo) só o mestre desfaz.
   Arquivo à parte, sem dependência de código: a tela do jogador importa só isto, sem levar o motor inteiro. */
export function aindaPodeDesfazer(ate: { rodada: number; combatenteId: string; noTurnoDele: boolean } | null, combate: EstadoCombate | null) {
  if (!ate) return false;
  if (!combate || combate.fase === "iniciativa") return false;
  const posicao = combate.ordem.indexOf(ate.combatenteId);
  if (posicao < 0) return false;
  const agindo = combate.fase === "em_curso" && combate.vez === posicao;
  if (ate.noTurnoDele) return combate.rodada === ate.rodada && agindo;
  if (combate.rodada === ate.rodada) return combate.fase === "em_curso" && combate.vez <= posicao;
  return combate.rodada === ate.rodada + 1 && combate.fase === "em_curso" && combate.vez <= posicao;
}
