import type { Preferencias } from "../estado/usePreferencias";
import { GrupoPainel, OpcaoPainel } from "./Moldura";

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function PainelAparencia({ preferencias, mudar }: Props) {
  return (
    <>
      <GrupoPainel titulo="Superfície">
        <OpcaoPainel ativa={preferencias.superficie === "tinta"} aoTocar={() => mudar({ superficie: "tinta" })}>
          Tinta
        </OpcaoPainel>
        <OpcaoPainel ativa={preferencias.superficie === "pergaminho"} aoTocar={() => mudar({ superficie: "pergaminho" })}>
          Pergaminho
        </OpcaoPainel>
      </GrupoPainel>
      <GrupoPainel titulo="Tema">
        <OpcaoPainel ativa={preferencias.tema === "olho-da-morte"} aoTocar={() => mudar({ tema: "olho-da-morte" })}>
          Olho da Morte
        </OpcaoPainel>
        <OpcaoPainel ativa={preferencias.tema === "ordem-no-caos"} aoTocar={() => mudar({ tema: "ordem-no-caos" })}>
          A Ordem no Caos
        </OpcaoPainel>
      </GrupoPainel>
      <GrupoPainel titulo="Animações">
        <OpcaoPainel ativa={preferencias.animacoes === "completas"} aoTocar={() => mudar({ animacoes: "completas" })}>
          Completas
        </OpcaoPainel>
        <OpcaoPainel ativa={preferencias.animacoes === "reduzidas"} aoTocar={() => mudar({ animacoes: "reduzidas" })}>
          Reduzidas
        </OpcaoPainel>
      </GrupoPainel>
    </>
  );
}
