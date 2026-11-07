import type { Parcela } from "../ficha/calculo";
import type { FonteDeEfeito } from "./testes";

/* Jogador, Proteções e dano; ordem decidida em 06/11/2026: Imunidade → Vulnerabilidade ou Resistência → RD →
   PV temporários → PV. Metade arredonda para baixo, mínimo 1. Indefensável ignora tudo isso. */

export const INDEFENSAVEL = "indefensavel";

export const normalizarTipo = (tipo: string | null | undefined) =>
  (tipo ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/^dano\s+/, "")
    .trim();

export type DefesasContraDano = {
  imunidades: string[];
  resistencias: string[];
  vulnerabilidades: string[];
  rd: number;
  pvTemporarios: number;
};

export type DanoRecebido = {
  valor: number;
  tipo: string | null;
  /* Hemorragia: perda direta, ignora RD; PV temporários absorvem. */
  ignoraRd?: boolean;
  /* Exposto: vulnerabilidade a este golpe (não acumula com a que já existe). */
  exposto?: boolean;
  /* Horda: dano em área multiplica depois da vulnerabilidade. */
  multiplicador?: number;
};

export type DanoResolvido = { conta: Parcela[]; final: number; absorvidoPorTemporarios: number; perdaDePv: number };

export function resolverDano(dano: DanoRecebido, defesas: DefesasContraDano): DanoResolvido {
  const tipo = normalizarTipo(dano.tipo);
  const conta: Parcela[] = [{ rotulo: dano.tipo ? `Dano (${dano.tipo})` : "Dano", valor: dano.valor }];
  let valor = Math.max(0, dano.valor);
  const indefensavel = tipo === INDEFENSAVEL;

  if (!indefensavel) {
    if (defesas.imunidades.includes(tipo)) {
      conta.push({ rotulo: "Imunidade", valor: -valor });
      return { conta, final: 0, absorvidoPorTemporarios: 0, perdaDePv: 0 };
    }
    const vulneravel = defesas.vulnerabilidades.includes(tipo) || !!dano.exposto;
    const resistente = defesas.resistencias.includes(tipo);
    /* Com as duas, o livro não diz o que fazer: o app aplica as duas, a vulnerabilidade primeiro (pergunta da etapa 4). */
    if (vulneravel) {
      conta.push({ rotulo: dano.exposto && !defesas.vulnerabilidades.includes(tipo) ? "Exposto" : "Vulnerabilidade", valor });
      valor *= 2;
    }
    if (resistente && valor > 0) {
      const metade = Math.max(1, Math.floor(valor / 2));
      conta.push({ rotulo: "Resistência", valor: metade - valor });
      valor = metade;
    }
  }
  if (dano.multiplicador && dano.multiplicador > 1) {
    conta.push({ rotulo: `Área ×${dano.multiplicador}`, valor: valor * (dano.multiplicador - 1) });
    valor *= dano.multiplicador;
  }
  if (!indefensavel && !dano.ignoraRd && defesas.rd > 0 && valor > 0) {
    const reduzido = Math.min(valor, defesas.rd);
    conta.push({ rotulo: "RD", valor: -reduzido });
    valor -= reduzido;
  }
  const absorvidoPorTemporarios = Math.min(valor, defesas.pvTemporarios);
  if (absorvidoPorTemporarios) conta.push({ rotulo: "PV temporários", valor: -absorvidoPorTemporarios });
  return { conta, final: valor, absorvidoPorTemporarios, perdaDePv: valor - absorvidoPorTemporarios };
}

/* Resistências e vulnerabilidades que vêm de efeitos (Molhado). */
export function defesasDosEfeitos(efeitos: readonly FonteDeEfeito[]) {
  const resistencias: string[] = [];
  const vulnerabilidades: string[] = [];
  for (const f of efeitos) {
    resistencias.push(...(f.mecanica?.danos?.resistencia ?? []).map(normalizarTipo));
    vulnerabilidades.push(...(f.mecanica?.danos?.vulnerabilidade ?? []).map(normalizarTipo));
  }
  return { resistencias, vulnerabilidades };
}

/* Linhas "extras" da ficha de criatura: "Imunidade a Dano: Veneno", "Resistencia a Dano: profano",
   "Vulnerabilidade: Fogo", "RD: 2". */
export function defesasDaFichaDeCriatura(extras: readonly string[]) {
  const lista = (texto: string) =>
    texto
      .split(/,|\be\b/)
      .map(normalizarTipo)
      .filter(Boolean);
  const imunidades: string[] = [];
  const resistencias: string[] = [];
  const vulnerabilidades: string[] = [];
  const imunidadesACondicao: string[] = [];
  let rd = 0;
  for (const linha of extras) {
    const [chave = "", ...resto] = linha.split(":");
    const valor = resto.join(":");
    const c = normalizarTipo(chave);
    if (/^imunidade a condic/.test(c)) imunidadesACondicao.push(...lista(valor));
    else if (/^imunidade/.test(c)) imunidades.push(...lista(valor));
    else if (/^resistencia/.test(c)) resistencias.push(...lista(valor));
    else if (/^vulnerabilidade|^fraqueza/.test(c)) vulnerabilidades.push(...lista(valor));
    else if (c === "rd") rd = Number(valor.match(/\d+/)?.[0] ?? 0);
  }
  return { imunidades, resistencias, vulnerabilidades, imunidadesACondicao, rd };
}
