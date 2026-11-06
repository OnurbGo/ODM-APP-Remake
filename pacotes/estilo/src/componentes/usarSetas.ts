import { useCallback, useRef, type KeyboardEvent } from "react";

/* Teclado de abas e grupos de opção: setas, Home e End trocam e levam o foco junto.
   Quem usa põe tabIndex 0 só no item ativo, então Tab entra e sai do grupo de uma vez. */
export function useSetas<T extends string>(ids: readonly T[], ativa: T, aoEscolher: (id: T) => void) {
  const grupo = useRef<HTMLDivElement>(null);

  const aoTeclar = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const atual = ids.indexOf(ativa);
      const ultimo = ids.length - 1;
      let destino: number;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") destino = atual === ultimo ? 0 : atual + 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") destino = atual <= 0 ? ultimo : atual - 1;
      else if (e.key === "Home") destino = 0;
      else if (e.key === "End") destino = ultimo;
      else return;

      e.preventDefault();
      const id = ids[destino];
      if (id === undefined) return;
      aoEscolher(id);
      grupo.current?.querySelectorAll<HTMLElement>("button")[destino]?.focus();
    },
    [ativa, aoEscolher, ids],
  );

  return { grupo, aoTeclar };
}
