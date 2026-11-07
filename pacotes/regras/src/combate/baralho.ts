import { VALORES_CARTA, type Carta, type Naipe, type ValorCarta } from "@odm/protocolo";
import type { Aleatorio } from "../dados";

const NAIPES: Naipe[] = ["espadas", "copas", "paus", "ouros"];
const COMUNS = VALORES_CARTA.filter((v) => v !== "coringa");

/* Baralho padrão com os Coringas (Jogador, Combate, Iniciativa). */
export function criarBaralho(coringas = 2): Carta[] {
  const cartas: Carta[] = NAIPES.flatMap((naipe) => COMUNS.map((valor) => ({ id: `${valor}-${naipe}`, valor, naipe })));
  for (let i = 1; i <= coringas; i++) cartas.push({ id: `coringa-${i}`, valor: "coringa", naipe: null });
  return cartas;
}

export function embaralhar<T>(lista: readonly T[], aleatorio: Aleatorio): T[] {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = aleatorio(0, i);
    [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  }
  return copia;
}

/* Compra do topo. Acabou o baralho, embaralha um novo: o livro não fala em fim de baralho. */
export function comprarCartas(baralho: readonly Carta[], quantidade: number, aleatorio: Aleatorio, coringas = 2) {
  let resto = [...baralho];
  const compradas: Carta[] = [];
  for (let i = 0; i < quantidade; i++) {
    if (!resto.length) resto = embaralhar(criarBaralho(coringas), aleatorio);
    compradas.push(resto.shift()!);
  }
  return { compradas, resto };
}

/* Posição na ordem do livro (Coringa → Ás → ... → 2): menor índice vai primeiro. */
export const posicaoDaCarta = (valor: ValorCarta, ordem: readonly string[]) => {
  const i = ordem.indexOf(valor);
  return i < 0 ? ordem.length : i;
};

export const NOME_DA_CARTA: Record<ValorCarta, string> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "Valete",
  Q: "Rainha",
  K: "Rei",
  A: "Ás",
  coringa: "Coringa",
};

export const CARTAS_ESPECIAIS: readonly ValorCarta[] = ["coringa", "A", "K", "Q", "J"];
export const eEspecial = (c: Carta) => CARTAS_ESPECIAIS.includes(c.valor);
