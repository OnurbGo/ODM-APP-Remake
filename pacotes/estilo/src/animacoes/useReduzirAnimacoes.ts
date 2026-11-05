import { useSyncExternalStore } from "react";

const CONSULTA = "(prefers-reduced-motion: reduce)";

function assinar(aoMudar: () => void) {
  const media = window.matchMedia(CONSULTA);
  const observador = new MutationObserver(aoMudar);
  media.addEventListener("change", aoMudar);
  observador.observe(document.documentElement, { attributes: true, attributeFilter: ["data-animacoes"] });
  return () => {
    media.removeEventListener("change", aoMudar);
    observador.disconnect();
  };
}

function ler() {
  const escolha = document.documentElement.dataset.animacoes;
  if (escolha === "reduzidas") return true;
  if (escolha === "completas") return false;
  return window.matchMedia(CONSULTA).matches;
}

/* Para o que CSS não resolve sozinho (o d20, por exemplo). O CSS usa --fator-animacao. */
export function useReduzirAnimacoes() {
  return useSyncExternalStore(assinar, ler, () => false);
}
