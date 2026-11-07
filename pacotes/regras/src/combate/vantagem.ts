import type { Carta, OpcoesCampanha } from "@odm/protocolo";
import type { Aleatorio } from "../dados";
import { comprarCartas, criarBaralho, embaralhar } from "./baralho";
import type { RegrasDoCombate } from "./contexto";

/* Jogador, Progressão, "Vantagem e Desvantagem". As fontes se anulam em mesma quantidade. */
export type Saldo = { lado: "vantagem" | "desvantagem" | null; fontes: number };

export function saldoDeVantagem(vantagens: number, desvantagens: number): Saldo {
  const saldo = vantagens - desvantagens;
  if (saldo === 0) return { lado: null, fontes: 0 };
  return { lado: saldo > 0 ? "vantagem" : "desvantagem", fontes: Math.abs(saldo) };
}

export type CartaDeVantagem = { carta: Carta; modificador: number; valeu: boolean };

export type D20ComVantagem = {
  dados: number[];
  /* Índice do dado que vale. */
  escolhido: number;
  natural: number;
  cartas: CartaDeVantagem[];
  /* Modelo de Cartas: soma ou subtrai do total, sem mudar o natural. */
  modificadorDeCarta: number;
  saldo: Saldo;
};

export function rolarD20ComVantagem(saldo: Saldo, modelo: OpcoesCampanha["modeloVantagem"], regras: RegrasDoCombate, aleatorio: Aleatorio): D20ComVantagem {
  const m = regras.vantagem.modelos;
  if (saldo.lado && modelo === "dados_extras") {
    const quantidade = Math.min(saldo.fontes >= 2 ? m.dados_extras.duas_ou_mais : m.dados_extras.uma_fonte, m.dados_extras.maximo_d20);
    const dados = Array.from({ length: quantidade }, () => aleatorio(1, 20));
    const alvo = saldo.lado === "vantagem" ? Math.max(...dados) : Math.min(...dados);
    const escolhido = dados.indexOf(alvo);
    return { dados, escolhido, natural: alvo, cartas: [], modificadorDeCarta: 0, saldo };
  }
  const natural = aleatorio(1, 20);
  if (!saldo.lado) return { dados: [natural], escolhido: 0, natural, cartas: [], modificadorDeCarta: 0, saldo };
  /* Cartas: um baralho completo a cada teste (suposição 6 do plano), e vale o maior modificador. */
  const quantidade = Math.min(saldo.fontes >= 2 ? m.cartas.duas_ou_mais : m.cartas.uma_fonte, m.cartas.maximo_cartas);
  const { compradas } = comprarCartas(embaralhar(criarBaralho(regras.iniciativa.baralho.coringas), aleatorio), quantidade, aleatorio);
  const valores = compradas.map((carta) => m.cartas.modificador[carta.valor] ?? 0);
  const maior = Math.max(...valores);
  const indice = valores.indexOf(maior);
  const cartas = compradas.map((carta, i) => ({ carta, modificador: valores[i]!, valeu: i === indice }));
  return { dados: [natural], escolhido: 0, natural, cartas, modificadorDeCarta: saldo.lado === "vantagem" ? maior : -maior, saldo };
}
