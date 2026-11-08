import type { MecanicaJogo21 } from "@odm/conteudo";
import type { Carta } from "@odm/protocolo";
import type { AtaqueMontado } from "./combate/ataque";
import type { ContextoCombate } from "./combate/contexto";
import type { Parcela, SituacaoDaFicha } from "./ficha/calculo";

/* Modificadores de mundo (Mestre, 22-missoes.md; mundo-mecanica.yml) e Jogo do 21 (23-recompensas.md).
   Decisões de 07/11/2026: W1 (Vendaval, metade para baixo, mínimo 1), "campo aberto" marcado pelo mestre,
   Geada pede o teste sozinha, J1 (2 cartas e o jogador compra até parar). */

type Mundo = Pick<ContextoCombate, "mundo">;

/* Chuva (+2 em Furtividade) e Neblina (−2 em Percepção passiva): parcelas com o nome do modificador. */
export function parcelasDoMundo(ctx: Mundo, periciaId: string | null, passivo: boolean): Parcela[] {
  if (!periciaId) return [];
  return ctx.mundo.flatMap((m) => {
    const lista = passivo ? m.mecanica?.passivos : m.mecanica?.testes;
    return (lista ?? []).filter((x) => x.pericia === periciaId).map((x) => ({ rotulo: m.nome, valor: x.bonus }));
  });
}

/* Vendaval: alcance efetivo e máximo das armas de fogo pela metade. */
export function alcanceComMundo(montado: AtaqueMontado, ctx: Mundo): AtaqueMontado & { motivoDoAlcance?: string } {
  if (!montado.armaDeFogo || !montado.alcance) return montado;
  const m = ctx.mundo.find((x) => x.mecanica?.alcance_armas_de_fogo);
  const regra = m?.mecanica?.alcance_armas_de_fogo;
  if (!m || !regra) return montado;
  const reduzir = (n: number | null) => (n === null ? null : Math.max(regra.minimo, Math.floor(n * regra.fator)));
  return { ...montado, alcance: { ...montado.alcance, efetivo: reduzir(montado.alcance.efetivo), maximo: reduzir(montado.alcance.maximo) }, motivoDoAlcance: m.nome };
}

/* Vendaval em campo aberto: −1 m de quem anda mais que 1 m. */
export function deslocamentoDoMundo(ctx: Mundo): SituacaoDaFicha["deslocamentoMenos"] {
  const m = ctx.mundo.find((x) => x.campoAberto && x.mecanica?.deslocamento);
  const regra = m?.mecanica?.deslocamento;
  return m && regra ? { valor: regra.menos_m, acimaDe: regra.so_acima_de_m, motivo: `${m.nome} (campo aberto)` } : null;
}

/* Geada: a Disparada pede um teste; na falha, um efeito. */
export function testeNaDisparada(ctx: Mundo): { nome: string; periciaId: string; dt: number; efeitoId: string } | null {
  const m = ctx.mundo.find((x) => x.mecanica?.disparada);
  const d = m?.mecanica?.disparada;
  return m && d ? { nome: m.nome, periciaId: d.teste.pericia, dt: d.teste.dt, efeitoId: d.falha.efeito } : null;
}

/* ---------- Jogo do 21 ---------- */

/* Número vale o número; Valete, Dama e Rei valem 10; o Ás vale 1 aqui (o 11 é escolha do jogador). */
export function valorNo21(carta: Pick<Carta, "valor">): number {
  if (carta.valor === "A") return 1;
  if (carta.valor === "J" || carta.valor === "Q" || carta.valor === "K") return 10;
  return Number(carta.valor);
}

export const asesNaMao = (cartas: readonly Pick<Carta, "valor">[]) => cartas.filter((c) => c.valor === "A").length;

/* Total com "asesComo11" Ases valendo 11. */
export function totalNo21(cartas: readonly Pick<Carta, "valor">[], asesComo11 = 0): number {
  const base = cartas.reduce((s, c) => s + valorNo21(c), 0);
  return base + 10 * Math.min(asesComo11, asesNaMao(cartas));
}

/* Os totais que o jogador pode escolher, do menor para o maior. */
export function totaisPossiveis(cartas: readonly Pick<Carta, "valor">[]): { asesComo11: number; total: number }[] {
  return Array.from({ length: asesNaMao(cartas) + 1 }, (_, n) => ({ asesComo11: n, total: totalNo21(cartas, n) }));
}

/* Estourou mesmo com todos os Ases valendo 1. */
export const estourou = (cartas: readonly Pick<Carta, "valor">[], alvo = 21) => totalNo21(cartas, 0) > alvo;

export function faixaDo21(total: number, regra: MecanicaJogo21): MecanicaJogo21["faixas"][number] | null {
  return regra.faixas.find((f) => total >= f.de && (f.ate === null || total <= f.ate)) ?? null;
}
