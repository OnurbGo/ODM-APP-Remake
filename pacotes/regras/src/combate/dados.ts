import type { Aleatorio } from "../dados";

/* Fórmula de dado do pacote: "2d8+3", "1d6", "2". Crítico dobra só os dados (Jogador, Combate, Acerto Crítico). */
export type Rolagem = { formula: string; dados: number[]; lados: number; fixo: number; total: number };

const FORMULA = /^(?:(\d+)d(\d+))?\s*(?:\+?\s*(\d+))?$/i;

export function lerFormula(formula: string) {
  const m = formula.replace(/\s+/g, "").match(FORMULA);
  if (!m || (!m[1] && !m[3])) return null;
  return { quantidade: m[1] ? Number(m[1]) : 0, lados: m[2] ? Number(m[2]) : 0, fixo: m[3] ? Number(m[3]) : 0 };
}

export function rolarDados(formula: string, aleatorio: Aleatorio, opcoes: { dobrarDados?: boolean; dadosExtras?: number } = {}): Rolagem {
  const lida = lerFormula(formula);
  if (!lida) throw new RangeError(`Fórmula de dado inválida: ${formula}`);
  const quantidade = lida.quantidade * (opcoes.dobrarDados ? 2 : 1) + (lida.lados ? (opcoes.dadosExtras ?? 0) : 0);
  const dados = Array.from({ length: quantidade }, () => aleatorio(1, lida.lados));
  return { formula, dados, lados: lida.lados, fixo: lida.fixo, total: dados.reduce((s, d) => s + d, 0) + lida.fixo };
}

export const rolarDado = (lados: number, aleatorio: Aleatorio) => aleatorio(1, lados);
