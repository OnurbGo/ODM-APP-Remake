import type { EstadoPA } from "@odm/estilo";
import type { Atributo, Efeito } from "./exemplo";
import type { Condicao } from "./testes";

/* Mesa fictícia vista pelo mestre. Criaturas, ações e números são inventados: o bestiário real
   vem do pacote de conteúdo. Nada aqui é regra. */

export const ATRIBUTOS_CURTOS = ["Bru", "Agi", "Fib", "Int", "Ast", "Pre"];

const ENVENENADO: Efeito = { id: "envenenado", nome: "Envenenado", tom: "perigo", turnos: 3 };

export type AcaoCriatura = {
  id: string;
  nome: string;
  custo: string;
  ataque?: { acerto: number; dano: string; tipo: string };
  teste?: { atributo: Atributo; dt: number; efeito: Efeito };
};

export type Horda = { integrantes: number; bonus: number; pa: number };

export type Combatente = {
  id: string;
  nome: string;
  tipo: "jogador" | "criatura" | "npc";
  detalhe: string;
  pv: number;
  pvMax: number;
  pvTemp?: number;
  defesa: number;
  deslocamento: string;
  efeitos: Efeito[];
  /* Jogador */
  pa?: EstadoPA[];
  fichas?: { nome: string; atual: number; maximo: number }[];
  condicoes?: Condicao[];
  resistencias?: Record<Atributo, number>;
  responde?: "automatico" | "manual";
  /* Criatura e NPC */
  atributos?: number[];
  extras?: string[];
  acoes?: AcaoCriatura[];
  horda?: Horda;
};

const res = (bru: number, agi: number, fib: number, int: number, ast: number, pre: number): Record<Atributo, number> => ({
  Brutalidade: bru,
  Agilidade: agi,
  Fibra: fib,
  Intelecto: int,
  Astúcia: ast,
  Presença: pre,
});

const ANDARILHO: Combatente = {
  id: "andarilho",
  nome: "Andarilho Podre",
  tipo: "criatura",
  detalhe: "Morto-vivo, médio · ND 1",
  pv: 34,
  pvMax: 48,
  defesa: 12,
  deslocamento: "6 m",
  efeitos: [{ id: "molhado", nome: "Molhado", tom: "neutro", turnos: 2 }],
  atributos: [2, -1, 3, -4, -2, -3],
  extras: ["Imune a Envenenado", "Vulnerável a fogo", "Percepção passiva 9"],
  acoes: [
    { id: "mordida", nome: "Mordida Podre", custo: "1 PA", ataque: { acerto: 4, dano: "1d6+2", tipo: "perfurante" } },
    { id: "toque", nome: "Toque Frio", custo: "2 PA", ataque: { acerto: 3, dano: "2d6", tipo: "profano" } },
    { id: "bafo", nome: "Bafo de Cova", custo: "2 PA", teste: { atributo: "Fibra", dt: 13, efeito: ENVENENADO } },
  ],
};

export function montarMesa(lotada: boolean): Combatente[] {
  const mesa: Combatente[] = [
    {
      id: "zeca",
      nome: "Zeca Tropeiro",
      tipo: "jogador",
      detalhe: "Bélico · Nível 6",
      pv: 31,
      pvMax: 38,
      defesa: 16,
      deslocamento: "9 m",
      efeitos: [{ id: "atordoado", nome: "Atordoado", tom: "perigo", turnos: 1 }],
      pa: ["gasto", "gasto", "guardado"],
      fichas: [{ nome: "Ficha de Adrenalina", atual: 3, maximo: 4 }],
      condicoes: [{ nome: "Atordoado", falhaAutomatica: true }],
      resistencias: res(5, 1, 4, 0, 1, 2),
      responde: "automatico",
    },
    ANDARILHO,
    {
      id: "inacia",
      nome: "Inácia Brasa",
      tipo: "jogador",
      detalhe: "Caçadora · Nível 6",
      pv: 27,
      pvMax: 42,
      pvTemp: 5,
      defesa: 15,
      deslocamento: "9 m",
      efeitos: [
        { id: "hemorragia", nome: "Hemorragia", tom: "perigo", acumulos: 2 },
        { id: "mao-firme", nome: "Mão Firme", tom: "sucesso", turnos: 1 },
      ],
      pa: ["disponivel", "disponivel", "disponivel"],
      fichas: [
        { nome: "Ficha de Olho da Morte", atual: 2, maximo: 3 },
        { nome: "Ficha de Adrenalina", atual: 1, maximo: 4 },
      ],
      condicoes: [{ nome: "Exaustão 1", mod: -2 }],
      resistencias: res(1, 5, 2, 0, 4, -1),
      responde: "manual",
    },
    {
      id: "lucia",
      nome: "Irmã Lúcia",
      tipo: "jogador",
      detalhe: "Perita · Nível 5",
      pv: 22,
      pvMax: 30,
      defesa: 13,
      deslocamento: "9 m",
      efeitos: [{ id: "envenenado", nome: "Envenenado", tom: "perigo", turnos: 2 }],
      pa: ["guardado", "guardado", "gasto"],
      fichas: [{ nome: "Ficha de Eficiência", atual: 2, maximo: 3 }],
      condicoes: [{ nome: "Envenenado", desvantagem: true }],
      resistencias: res(-1, 1, 2, 4, 3, 5),
      responde: "automatico",
    },
    {
      id: "carnicas",
      nome: "Bando de Carniças",
      tipo: "criatura",
      detalhe: "Horda de mortos-vivos",
      pv: 52,
      pvMax: 70,
      defesa: 10,
      deslocamento: "6 m",
      efeitos: [],
      atributos: [1, -2, 3, -4, -2, -3],
      extras: ["Imune a Envenenado"],
      horda: { integrantes: 7, bonus: 2, pa: 3 },
      acoes: [{ id: "ataque-horda", nome: "Ataque de Horda", custo: "1 PA", ataque: { acerto: 5, dano: "1d6+3", tipo: "contundente" } }],
    },
    {
      id: "tiao",
      nome: "Tião Fumaça",
      tipo: "jogador",
      detalhe: "Patife · Nível 6",
      pv: 29,
      pvMax: 34,
      defesa: 14,
      deslocamento: "12 m",
      efeitos: [],
      pa: ["disponivel", "disponivel", "guardado"],
      fichas: [{ nome: "Ficha de Ardil", atual: 4, maximo: 5 }],
      condicoes: [],
      resistencias: res(0, 4, 1, 2, 5, 1),
      responde: "automatico",
    },
    {
      id: "bento",
      nome: "Xerife Bento",
      tipo: "npc",
      detalhe: "NPC aliado",
      pv: 18,
      pvMax: 26,
      defesa: 14,
      deslocamento: "9 m",
      efeitos: [],
      atributos: [1, 2, 1, 0, 1, 2],
      extras: [],
      acoes: [{ id: "tiro", nome: "Tiro de Colt", custo: "1 PA", ataque: { acerto: 4, dano: "1d8+2", tipo: "perfurante" } }],
    },
  ];

  if (!lotada) return mesa;
  const extras = [2, 3, 4, 5, 6].map((n) => ({
    ...ANDARILHO,
    id: `andarilho-${n}`,
    nome: `Andarilho Podre ${n}`,
    pv: 48 - n * 6,
  }));
  return [...mesa, ...extras];
}
