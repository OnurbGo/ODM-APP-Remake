import { Botao, Icone } from "@odm/estilo";
import { useEffect, useState } from "react";

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

export function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [estado, definirEstado] = useState<"parado" | "copiado" | "falhou">("parado");

  useEffect(() => {
    if (estado === "parado") return;
    const id = window.setTimeout(() => definirEstado("parado"), 2000);
    return () => clearTimeout(id);
  }, [estado]);

  return (
    <Botao variante="fantasma" aria-label={rotulo} onClick={async () => definirEstado((await copiar(texto)) ? "copiado" : "falhou")}>
      <Icone nome="copiar" tamanho={18} />
      <span aria-live="polite">{estado === "copiado" ? "Copiado" : estado === "falhou" ? "Copie à mão" : "Copiar"}</span>
    </Botao>
  );
}
