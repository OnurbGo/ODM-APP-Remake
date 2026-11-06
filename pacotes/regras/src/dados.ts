/* Devolve um inteiro entre mínimo e máximo, inclusive. Quem chama escolhe a origem:
   o servidor usa crypto.randomInt e os testes usam valores fixos. */
export type Aleatorio = (minimo: number, maximo: number) => number;

export function rolarD20(aleatorio: Aleatorio): number {
  const valor = aleatorio(1, 20);
  if (!Number.isInteger(valor) || valor < 1 || valor > 20) {
    throw new RangeError(`Valor fora do d20: ${valor}`);
  }
  return valor;
}
