import { CENARIOS_JOGADOR } from "../dados/baralho";
import { PEDIDOS } from "../dados/testes";
import type { Combate } from "../estado/useCombate";
import { CENARIOS } from "../estado/useCombate";
import type { Ficha } from "../estado/useFicha";
import type { Preferencias } from "../estado/usePreferencias";
import type { Teste } from "../estado/useTeste";
import type { IniciativaJogadorEstado } from "../telas/Iniciativa";
import { GruposFicha } from "./GruposFicha";
import { GrupoPainel, OpcaoPainel } from "./Moldura";
import { PainelAparencia } from "./PainelAparencia";

type Props = {
  combate: Combate;
  teste: Teste;
  iniciativa: IniciativaJogadorEstado;
  ficha: Ficha;
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function PainelCombate({ combate, teste, iniciativa, ficha, preferencias, mudar }: Props) {
  return (
    <>
      <GrupoPainel titulo="Iniciativa">
        {CENARIOS_JOGADOR.map((c) => (
          <OpcaoPainel key={c.id} aoTocar={() => iniciativa.abrir(c.id)}>
            {c.rotulo}
          </OpcaoPainel>
        ))}
      </GrupoPainel>
      <GruposFicha ficha={ficha} />
      <GrupoPainel titulo="Teste de resistência">
        {PEDIDOS.map((p) => (
          <OpcaoPainel key={p.id} aoTocar={() => teste.pedir(p)}>
            {p.rotulo}
          </OpcaoPainel>
        ))}
      </GrupoPainel>
      <GrupoPainel titulo="Ataque">
        <OpcaoPainel aoTocar={() => teste.atacar(20)}>20 natural</OpcaoPainel>
        <OpcaoPainel aoTocar={() => teste.atacar(1)}>1 natural</OpcaoPainel>
      </GrupoPainel>
      <GrupoPainel titulo="Rolagem">
        <OpcaoPainel ativa={teste.rapida} aoTocar={() => teste.definirRapida(!teste.rapida)}>
          Rolagem rápida
        </OpcaoPainel>
        <OpcaoPainel ativa={teste.modelo === "cartas"} aoTocar={() => teste.definirModelo(teste.modelo === "cartas" ? "dados" : "cartas")}>
          Vantagem por cartas
        </OpcaoPainel>
        <OpcaoPainel ativa={teste.semTresD} aoTocar={() => teste.definirSemTresD(!teste.semTresD)}>
          Sem WebGL
        </OpcaoPainel>
      </GrupoPainel>
      <GrupoPainel titulo="Cenário">
        {CENARIOS.map((c) => (
          <OpcaoPainel key={c.id} ativa={combate.estado.cenario === c.id} aoTocar={() => combate.escolherCenario(c.id)}>
            {c.rotulo}
          </OpcaoPainel>
        ))}
      </GrupoPainel>
      <GrupoPainel titulo="Simular">
        <OpcaoPainel aoTocar={() => combate.simularVida("dano", 6)}>Dano 6</OpcaoPainel>
        <OpcaoPainel aoTocar={() => combate.simularVida("cura", 4)}>Cura 4</OpcaoPainel>
      </GrupoPainel>
      <PainelAparencia preferencias={preferencias} mudar={mudar} />
    </>
  );
}
