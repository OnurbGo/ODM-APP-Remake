/* Dica das animações que se pulam: no celular não há teclado nem clique, só toque. */
export function dicaDePular(acao: "pular" | "fechar"): string {
  const toque = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  return toque ? `Toque para ${acao}` : `Clique, Espaço ou Esc para ${acao}`;
}
