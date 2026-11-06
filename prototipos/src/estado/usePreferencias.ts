import { useEffect, useState } from "react";

export type Preferencias = {
  superficie: "tinta" | "pergaminho";
  tema: "olho-da-morte" | "ordem-no-caos";
  animacoes: "completas" | "reduzidas";
};

const CHAVE = "odm-prototipos";
const PADRAO: Preferencias = { superficie: "tinta", tema: "olho-da-morte", animacoes: "completas" };

function carregar(): Preferencias {
  try {
    const salvo = JSON.parse(localStorage.getItem(CHAVE) ?? "{}");
    return { ...PADRAO, ...salvo, tema: salvo.tema === "ordem-no-caos" ? salvo.tema : PADRAO.tema };
  } catch {
    return PADRAO;
  }
}

export function usePreferencias() {
  const [preferencias, definir] = useState(carregar);

  useEffect(() => {
    const raiz = document.documentElement.dataset;
    raiz.superficie = preferencias.superficie;
    raiz.tema = preferencias.tema;
    raiz.animacoes = preferencias.animacoes;
    try {
      localStorage.setItem(CHAVE, JSON.stringify(preferencias));
    } catch {
      /* sem armazenamento: a escolha vale só nesta aba */
    }
  }, [preferencias]);

  return [preferencias, (parte: Partial<Preferencias>) => definir((p) => ({ ...p, ...parte }))] as const;
}
