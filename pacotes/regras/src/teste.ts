export type Modificador = { rotulo: string; valor: number };

export function somarModificadores(modificadores: readonly Modificador[]): number {
  return modificadores.reduce((soma, m) => soma + m.valor, 0);
}

export function totalDaRolagem(natural: number, modificadores: readonly Modificador[]): number {
  return natural + somarModificadores(modificadores);
}

/* Jogador, Progressão, "Testes de Habilidade": "igual ou superior à DT" é sucesso. */
export function alcancaDT(total: number, dt: number): boolean {
  return total >= dt;
}
