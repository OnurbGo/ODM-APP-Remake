import { useSyncExternalStore } from "react";

/* Larguras aprovadas em docs/decisoes-visuais.md: abaixo de 900 px, layout de celular. */
const CONSULTA = "(min-width: 900px)";

function assinar(aoMudar: () => void) {
  const media = window.matchMedia(CONSULTA);
  media.addEventListener("change", aoMudar);
  return () => media.removeEventListener("change", aoMudar);
}

export function useTelaLarga() {
  return useSyncExternalStore(assinar, () => window.matchMedia(CONSULTA).matches);
}
