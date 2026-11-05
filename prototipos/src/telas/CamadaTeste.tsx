import { Alternador, Botao, CampoNumero, Etiqueta, PopUp, RolagemD20, Seletor } from "@odm/estilo";
import { useState } from "react";
import { RESISTENCIAS_VALOR, type Habilidade } from "../dados/exemplo";
import { BONUS_HABILIDADE, type PedidoTeste } from "../dados/testes";
import { paLivres, type Combate } from "../estado/useCombate";
import { resumoDados, type ModoRolagem, type Teste } from "../estado/useTeste";
import css from "./CamadaTeste.module.css";

const MODOS: { id: ModoRolagem; rotulo: string }[] = [
  { id: "normal", rotulo: "Normal" },
  { id: "vantagem", rotulo: "Vantagem" },
  { id: "desvantagem", rotulo: "Desvantagem" },
];

const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

type Props = {
  teste: Teste;
  combate: Combate;
  variante: "folha" | "central";
};

export function CamadaTeste({ teste, combate, variante }: Props) {
  const { pedido } = teste;
  return (
    <>
      {pedido && teste.fase === "popup" && (
        <PopUp aberto titulo={`Teste de ${pedido.atributo}`} subtitulo={pedido.origem} variante={variante} aoFechar={teste.cancelar}>
          <FormularioTeste key={pedido.id} pedido={pedido} teste={teste} combate={combate} />
        </PopUp>
      )}
      {pedido && teste.fase === "pergunta" && (
        <PopUp aberto titulo={`Teste de ${pedido.atributo}`} subtitulo={pedido.origem} variante={variante} aoFechar={teste.cancelar}>
          <Pergunta pedido={pedido} teste={teste} />
        </PopUp>
      )}
      {teste.rolagem && (
        <RolagemD20
          rolagem={teste.rolagem}
          rapida={teste.rapida}
          semTresD={teste.semTresD}
          fecharSozinhoMs={teste.fecharSozinho ? 2500 : undefined}
          aoFechar={teste.fecharRolagem}
        />
      )}
    </>
  );
}

function ValorDT({ pedido }: { pedido: PedidoTeste }) {
  return (
    <div className={css.dt}>
      <span className="odm-rotulo">DT</span>
      <span className={`${css.dtValor} odm-numero`}>{pedido.dtVisivel ? pedido.dt : "?"}</span>
    </div>
  );
}

function FormularioTeste({ pedido, teste, combate }: { pedido: PedidoTeste; teste: Teste; combate: Combate }) {
  const [ajuste, definirAjuste] = useState(0);
  const [modo, definirModo] = useState<ModoRolagem>("normal");
  const [habilidade, definirHabilidade] = useState<string | null>(null);

  const automatica = pedido.condicoes.find((c) => c.falhaAutomatica);
  const { nota } = resumoDados(pedido.condicoes, modo, teste.modelo);
  const habilidades = teste.habilidadesDo(pedido);
  const livres = paLivres(combate.estado.pa);

  return (
    <div className={css.formulario}>
      <div className={css.resumo}>
        <div>
          <p className={css.atributo}>{pedido.atributo}</p>
          <p className={`${css.bonus} odm-numero`}>{sinal(RESISTENCIAS_VALOR[pedido.atributo])}</p>
        </div>
        <ValorDT pedido={pedido} />
      </div>

      {pedido.condicoes.length > 0 && (
        <div className={css.condicoes}>
          {pedido.condicoes.map((c) => (
            <Etiqueta key={c.nome} tom={c.vantagem ? "sucesso" : "perigo"}>
              {c.nome}
              {c.mod ? ` ${sinal(c.mod)}` : ""}
              {c.vantagem ? " · vantagem" : ""}
              {c.desvantagem ? " · desvantagem" : ""}
              {c.falhaAutomatica ? " · falha automática" : ""}
            </Etiqueta>
          ))}
        </div>
      )}

      {automatica ? (
        <p className={css.nota}>{automatica.nome} faz falhar automaticamente neste teste, sem rolar.</p>
      ) : (
        <>
          <CampoNumero rotulo="Bônus ou penalidade" valor={ajuste} aoMudar={definirAjuste} />
          <Seletor rotulo="Vantagem ou desvantagem" opcoes={MODOS} valor={modo} aoMudar={definirModo} />
          {nota && <p className={css.nota}>{nota}</p>}

          {habilidades.length > 0 && (
            <div className={css.habilidades}>
              <h3 className={`${css.subtitulo} odm-rotulo`}>Habilidades para esta situação</h3>
              {habilidades.map((h) => (
                <LinhaHabilidade
                  key={h.id}
                  habilidade={h}
                  semPA={livres < (h.pa ?? 0)}
                  ligada={habilidade === h.id}
                  aoMudar={(ligada) => definirHabilidade(ligada ? h.id : null)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <Botao variante="primario" grande largo onClick={() => teste.rolar(pedido, { ajuste, modo, habilidade }, false)}>
        {automatica ? "Ver resultado" : "Rolar"}
      </Botao>
    </div>
  );
}

function LinhaHabilidade({
  habilidade,
  semPA,
  ligada,
  aoMudar,
}: {
  habilidade: Habilidade;
  semPA: boolean;
  ligada: boolean;
  aoMudar: (ligada: boolean) => void;
}) {
  if (habilidade.usada || semPA) {
    return (
      <div className={css.indisponivel}>
        <span>{habilidade.nome}</span>
        <span className={css.detalhe}>
          {habilidade.usada ? `Usada — volta ${habilidade.volta}` : `Custa ${habilidade.pa} PA, sem PA livre`}
        </span>
      </div>
    );
  }
  return (
    <Alternador
      rotulo={`${habilidade.nome} (${sinal(BONUS_HABILIDADE)})`}
      dica={`${habilidade.custo} · ${habilidade.frequencia}`}
      ligado={ligada}
      aoMudar={aoMudar}
    />
  );
}

/* Automático ligado e habilidade disponível: pausa antes de rolar (seção 8.3). */
function Pergunta({ pedido, teste }: { pedido: PedidoTeste; teste: Teste }) {
  const habilidade = teste.habilidadesDo(pedido).find((h) => !h.usada);
  if (!habilidade) return null;
  return (
    <div className={css.formulario}>
      <div className={css.resumo}>
        <p className={css.pergunta}>
          Usar <strong>{habilidade.nome}</strong> neste teste?
        </p>
        <ValorDT pedido={pedido} />
      </div>
      <p className={css.nota}>
        {habilidade.custo} · {habilidade.frequencia}
      </p>
      <div className={css.botoes}>
        <Botao
          variante="primario"
          grande
          largo
          onClick={() => teste.rolar(pedido, { ajuste: 0, modo: "normal", habilidade: habilidade.id }, true)}
        >
          Usar e rolar
        </Botao>
        <Botao grande largo onClick={() => teste.rolar(pedido, { ajuste: 0, modo: "normal", habilidade: null }, true)}>
          Rolar sem usar
        </Botao>
      </div>
    </div>
  );
}
