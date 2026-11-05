import type { Naipe } from "@odm/estilo";

/* Regras de "Iniciativa" e do Modelo 2 de "Vantagem e Desvantagem" (Livro do Jogador), simuladas
   com cartas de exemplo. A tabela completa carta → modificador fica nos livros e chega pelo pacote
   de conteúdo: aqui só existem as cartas usadas nos casos abaixo. */

export type Carta = { valor: string; naipe: Naipe | null };

const ORDEM = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "Coringa"];
const ORDEM_NAIPES: (Naipe | null)[] = ["ouros", "paus", "copas", "espadas"];

export const peso = (c: Carta) => ORDEM.indexOf(c.valor);
export const pesoNaipe = (c: Carta) => ORDEM_NAIPES.indexOf(c.naipe);

export const NOME_CARTA: Record<string, string> = { A: "Ás", K: "Rei", Q: "Rainha", J: "Valete", Coringa: "Coringa" };

/* Resumo próprio para a tela: o texto do livro vem do pacote de conteúdo. */
export const EFEITO_ESPECIAL: Record<string, string> = {
  Coringa: "Troca de lugar dois alvos na ordem, menos você.",
  A: "Ganha 1 PA extra no primeiro turno.",
  K: "Vantagem no próximo ataque ou teste de um aliado que ainda não agiu, ou seu.",
  Q: "A primeira reação de um aliado, ou sua, não custa PA até o seu próximo turno.",
  J: "Um deslocamento sem custo de PA no primeiro turno.",
};

export const especial = (c: Carta) => c.valor in EFEITO_ESPECIAL;

export type Participante = {
  id: string;
  nome: string;
  carta: Carta;
  agilidade: number;
  usaEfeito?: boolean;
};

export type Motivo = "agilidade" | "naipe" | null;

/* Cartas iguais: maior Agilidade; depois, naipe. O livro também aceita comprar de novo. */
function comparar(a: Participante, b: Participante) {
  return peso(b.carta) - peso(a.carta) || b.agilidade - a.agilidade || pesoNaipe(b.carta) - pesoNaipe(a.carta);
}

/* Quem usa o efeito vai para o fim; entre esses, a carta maior age primeiro. */
export function ordenar<T extends Participante>(lista: T[]) {
  const prioridade = lista.filter((p) => !p.usaEfeito).sort(comparar);
  const efeito = lista.filter((p) => p.usaEfeito).sort(comparar);
  return [...prioridade, ...efeito];
}

export function motivoEmpate(p: Participante, lista: Participante[]): Motivo {
  const iguais = lista.filter((o) => o.id !== p.id && peso(o.carta) === peso(p.carta));
  if (iguais.length === 0) return null;
  return iguais.some((o) => o.agilidade === p.agilidade) ? "naipe" : "agilidade";
}

/* Ordem do combate em curso, usada nas telas enquanto ninguém compra de novo. */
export const CARTAS_MESA: Record<string, Carta> = {
  zeca: { valor: "K", naipe: "espadas" },
  andarilho: { valor: "J", naipe: "ouros" },
  inacia: { valor: "10", naipe: "copas" },
  lucia: { valor: "9", naipe: "paus" },
  carnicas: { valor: "7", naipe: "ouros" },
  tiao: { valor: "4", naipe: "espadas" },
  bento: { valor: "2", naipe: "copas" },
};

export const COMPRA_MESA: Participante[] = [
  { id: "zeca", nome: "Zeca Tropeiro", carta: { valor: "K", naipe: "espadas" }, agilidade: 1 },
  { id: "andarilho", nome: "Andarilho Podre", carta: { valor: "9", naipe: "ouros" }, agilidade: -1 },
  { id: "inacia", nome: "Inácia Brasa", carta: { valor: "A", naipe: "copas" }, agilidade: 3 },
  { id: "lucia", nome: "Irmã Lúcia", carta: { valor: "9", naipe: "paus" }, agilidade: 1 },
  { id: "carnicas", nome: "Bando de Carniças", carta: { valor: "J", naipe: "ouros" }, agilidade: -2 },
  { id: "tiao", nome: "Tião Fumaça", carta: { valor: "Coringa", naipe: null }, agilidade: 4 },
  { id: "bento", nome: "Xerife Bento", carta: { valor: "2", naipe: "espadas" }, agilidade: 2 },
];

export const CENARIOS_JOGADOR: { id: string; rotulo: string; cartas: Carta[] }[] = [
  { id: "comum", rotulo: "Carta comum", cartas: [{ valor: "7", naipe: "paus" }] },
  { id: "as", rotulo: "Ás", cartas: [{ valor: "A", naipe: "copas" }] },
  { id: "coringa", rotulo: "Coringa", cartas: [{ valor: "Coringa", naipe: null }] },
  {
    id: "redencao",
    rotulo: "Redenção completa: duas cartas",
    cartas: [
      { valor: "Q", naipe: "ouros" },
      { valor: "8", naipe: "espadas" },
    ],
  },
];

/* Modelo 2: só as cartas destes exemplos, cada uma com o modificador que dá no livro. */
export type CartaTeste = Carta & { mod: number };

export const CARTAS_TESTE: CartaTeste[] = [
  { valor: "K", naipe: "copas", mod: 4 },
  { valor: "7", naipe: "ouros", mod: 2 },
  { valor: "3", naipe: "paus", mod: 1 },
  { valor: "A", naipe: "espadas", mod: 5 },
];
