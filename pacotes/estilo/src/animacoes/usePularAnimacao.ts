import { useEffect, useRef } from "react";

/* Espaço e Esc, além do clique do chamador. Roda antes de qualquer outro atalho da tela:
   Espaço não aciona o botão em foco por trás e Esc não fecha o que estiver embaixo. */
export function usePularAnimacao(ativo: boolean, aoPular: () => void) {
  const ultimo = useRef(aoPular);
  ultimo.current = aoPular;

  useEffect(() => {
    if (!ativo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== " " && e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) ultimo.current();
    };
    document.addEventListener("keydown", aoTeclar, true);
    return () => document.removeEventListener("keydown", aoTeclar, true);
  }, [ativo]);
}
