import { CENARIOS_CARGA } from "../dados/ficha";
import type { Ficha } from "../estado/useFicha";
import { GrupoPainel, OpcaoPainel } from "./Moldura";

export function GruposFicha({ ficha }: { ficha: Ficha }) {
  const { estado } = ficha;
  return (
    <>
      <GrupoPainel titulo="Progressão">
        <OpcaoPainel ativa={estado.fase === "escalada"} aoTocar={() => ficha.definirFase("escalada")}>
          Escalada
        </OpcaoPainel>
        <OpcaoPainel ativa={estado.fase === "consagracao"} aoTocar={() => ficha.definirFase("consagracao")}>
          Consagração
        </OpcaoPainel>
        <OpcaoPainel aoTocar={ficha.receberXP}>Mestre dá XP</OpcaoPainel>
      </GrupoPainel>
      <GrupoPainel titulo="Pontos de Prestígio">
        {[0, 1, 2, 3].map((n) => (
          <OpcaoPainel key={n} ativa={estado.saldo === n} aoTocar={() => ficha.definirSaldo(n)}>
            {n}
          </OpcaoPainel>
        ))}
      </GrupoPainel>
      <GrupoPainel titulo="Travas da loja">
        <OpcaoPainel ativa={estado.avancadas.length > 0} aoTocar={ficha.alternarAvancada}>
          Tem Técnica Avançada
        </OpcaoPainel>
        <OpcaoPainel ativa={estado.polivalencia.ligada} aoTocar={ficha.alternarPolivalencia}>
          Polivalência ligada
        </OpcaoPainel>
        <OpcaoPainel ativa={estado.atributos.Agilidade === 5} aoTocar={ficha.atributoNoMaximo}>
          Agilidade em 5
        </OpcaoPainel>
        {estado.polivalencia.pedido && <OpcaoPainel aoTocar={ficha.mestreAprova}>Mestre aprova</OpcaoPainel>}
      </GrupoPainel>
      <GrupoPainel titulo="Carga">
        {CENARIOS_CARGA.map((c) => (
          <OpcaoPainel key={c.id} ativa={estado.cargaAtual === c.atual} aoTocar={() => ficha.definirCarga(c.atual)}>
            {c.rotulo}
          </OpcaoPainel>
        ))}
      </GrupoPainel>
    </>
  );
}
