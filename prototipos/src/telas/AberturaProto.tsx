import { Abertura, Botao } from "@odm/estilo";
import { useCallback, useRef, useState } from "react";
import type { Preferencias } from "../estado/usePreferencias";
import { GrupoPainel, Moldura, OpcaoPainel } from "../moldura/Moldura";
import { PainelAparencia } from "../moldura/PainelAparencia";
import css from "./AberturaProto.module.css";

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function AberturaProto({ preferencias, mudar }: Props) {
  const [chave, definirChave] = useState(1);
  const [tocando, definirTocando] = useState(true);
  const [segurar, definirSegurar] = useState(false);
  const [ultima, definirUltima] = useState<number | null>(null);
  const inicio = useRef(performance.now());

  const tocar = useCallback(() => {
    inicio.current = performance.now();
    definirTocando(true);
    definirChave((c) => c + 1);
  }, []);

  const terminar = useCallback(() => {
    definirUltima(Math.round(performance.now() - inicio.current));
    definirTocando(false);
  }, []);

  return (
    <Moldura
      desktop
      titulo="Abertura"
      painel={
        <>
          <GrupoPainel titulo="Abertura">
            <OpcaoPainel aoTocar={tocar}>Ver de novo</OpcaoPainel>
            <OpcaoPainel ativa={segurar} aoTocar={() => definirSegurar((s) => !s)}>
              Parar no fim
            </OpcaoPainel>
          </GrupoPainel>
          <PainelAparencia preferencias={preferencias} mudar={mudar} />
        </>
      }
    >
      <main className={css.fim}>
        <p className={css.texto}>Aqui entra a tela de entrada na mesa.</p>
        {ultima !== null && <p className={css.tempo}>Durou {(ultima / 1000).toLocaleString("pt-BR")} s</p>}
        <Botao variante="primario" onClick={tocar}>
          Ver de novo
        </Botao>
      </main>
      {tocando && <Abertura key={chave} titulo="Olho da Morte" segurar={segurar} aoTerminar={terminar} />}
    </Moldura>
  );
}
