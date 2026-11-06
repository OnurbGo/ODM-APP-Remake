import { Alternador, Botao, CampoNumero, Etiqueta, PopUp, Seletor } from "@odm/estilo";
import { useState } from "react";
import { ATRIBUTOS, type Atributo, type Efeito } from "../dados/exemplo";
import type { Combatente } from "../dados/mesa";
import type { ConfigJogador, ConfigPedido } from "../estado/useEscudo";
import type { ModoRolagem } from "../estado/useTeste";
import css from "./PedidoTeste.module.css";

const MODOS: { id: ModoRolagem; rotulo: string }[] = [
  { id: "normal", rotulo: "Normal" },
  { id: "vantagem", rotulo: "Vantagem" },
  { id: "desvantagem", rotulo: "Desvantagem" },
];

const OPCOES_ATRIBUTO = ATRIBUTOS.map((a) => ({ id: a, rotulo: a }));

const EFEITOS_MANUAIS: Efeito[] = [
  { id: "envenenado", nome: "Envenenado", tom: "perigo", turnos: 3 },
  { id: "impedido", nome: "Impedido", tom: "perigo", turnos: 1 },
  { id: "atordoado", nome: "Atordoado", tom: "perigo", turnos: 1 },
];

export type OrigemPedido = {
  origem: string;
  atributo?: Atributo;
  dt?: number;
  efeito?: Efeito;
};

type Props = {
  aberto: OrigemPedido | null;
  jogadores: Combatente[];
  aoFechar: () => void;
  aoEnviar: (config: ConfigPedido) => void;
};

export function PedidoTeste({ aberto, jogadores, aoFechar, aoEnviar }: Props) {
  if (!aberto) return null;
  return (
    <PopUp aberto titulo="Pedir teste de resistência" subtitulo={aberto.origem} variante="larga" aoFechar={aoFechar}>
      <Formulario origem={aberto} jogadores={jogadores} aoEnviar={aoEnviar} />
    </PopUp>
  );
}

type Ajuste = { marcado: boolean; dt: number | null; bonus: number; modo: ModoRolagem };

function Formulario({ origem, jogadores, aoEnviar }: { origem: OrigemPedido; jogadores: Combatente[]; aoEnviar: Props["aoEnviar"] }) {
  const veioDeAtaque = origem.dt !== undefined;
  const [atributo, definirAtributo] = useState<Atributo>(origem.atributo ?? "Agilidade");
  const [dt, definirDt] = useState(origem.dt ?? 15);
  const [dtVisivel, definirDtVisivel] = useState(false);
  const [efeitoId, definirEfeitoId] = useState(origem.efeito?.id ?? "nenhum");
  const [ajustes, definirAjustes] = useState<Record<string, Ajuste>>(() =>
    Object.fromEntries(jogadores.map((j) => [j.id, { marcado: veioDeAtaque, dt: null, bonus: 0, modo: "normal" as ModoRolagem }])),
  );

  const mudar = (id: string, parte: Partial<Ajuste>) => definirAjustes((a) => ({ ...a, [id]: { ...a[id], ...parte } }));
  const marcados = jogadores.filter((j) => ajustes[j.id].marcado);
  const todos = marcados.length === jogadores.length;

  const opcoesEfeito = [
    { id: "nenhum", rotulo: "Nenhum" },
    ...(origem.efeito && !EFEITOS_MANUAIS.some((e) => e.id === origem.efeito?.id) ? [origem.efeito] : []),
    ...EFEITOS_MANUAIS,
  ].map((e) => ({ id: e.id, rotulo: "nome" in e ? e.nome : e.rotulo }));

  function enviar() {
    const efeito = origem.efeito?.id === efeitoId ? origem.efeito : (EFEITOS_MANUAIS.find((e) => e.id === efeitoId) ?? null);
    const lista: ConfigJogador[] = marcados.map((j) => {
      const a = ajustes[j.id];
      return { id: j.id, dt: a.dt ?? dt, bonus: a.bonus, modo: a.modo };
    });
    aoEnviar({ origem: origem.origem, atributo, dt, dtVisivel, efeito, jogadores: lista });
  }

  return (
    <div className={css.formulario}>
      <section className={css.geral}>
        <div className={css.campo}>
          <h3 className={`${css.rotulo} odm-rotulo`}>Atributo</h3>
          <Seletor rotulo="Atributo" opcoes={OPCOES_ATRIBUTO} valor={atributo} aoMudar={definirAtributo} />
        </div>
        <div className={css.linhaGeral}>
          <CampoNumero rotulo="DT" valor={dt} minimo={1} maximo={40} semSinal aoMudar={definirDt} />
          <Alternador rotulo="Mostrar a DT aos jogadores" dica="Padrão: invisível" ligado={dtVisivel} aoMudar={definirDtVisivel} />
        </div>
        <div className={css.campo}>
          <h3 className={`${css.rotulo} odm-rotulo`}>Efeito em quem falhar</h3>
          <Seletor rotulo="Efeito em quem falhar" opcoes={opcoesEfeito} valor={efeitoId} aoMudar={definirEfeitoId} />
        </div>
      </section>

      <section>
        <div className={css.tabelaTopo}>
          <h3 className={`${css.rotulo} odm-rotulo`}>Jogadores</h3>
          <Botao
            variante="fantasma"
            onClick={() => definirAjustes((a) => Object.fromEntries(Object.entries(a).map(([id, v]) => [id, { ...v, marcado: !todos }])))}
          >
            {todos ? "Desmarcar todos" : "Marcar todos"}
          </Botao>
        </div>
        <ul className={css.jogadores}>
          {jogadores.map((j) => {
            const a = ajustes[j.id];
            return (
              <li key={j.id} className={`${css.jogador} ${a.marcado ? "" : css.desmarcado}`}>
                <label className={css.marcar}>
                  <input type="checkbox" checked={a.marcado} onChange={(e) => mudar(j.id, { marcado: e.target.checked })} />
                  <span>
                    <span className={css.nome}>{j.nome}</span>
                    <span className={css.condicoes}>
                      {(j.condicoes ?? []).map((c) => (
                        <Etiqueta key={c.nome} tom="perigo">
                          {c.nome}
                        </Etiqueta>
                      ))}
                    </span>
                  </span>
                </label>
                {a.marcado && (
                  <div className={css.ajustes}>
                    <CampoNumero
                      rotulo={`DT de ${j.nome}`}
                      rotuloOculto
                      semSinal
                      valor={a.dt ?? dt}
                      minimo={1}
                      maximo={40}
                      aoMudar={(v) => mudar(j.id, { dt: v === dt ? null : v })}
                    />
                    <CampoNumero rotulo={`Bônus ou penalidade de ${j.nome}`} rotuloOculto valor={a.bonus} aoMudar={(v) => mudar(j.id, { bonus: v })} />
                    <Seletor rotulo={`Vantagem de ${j.nome}`} opcoes={MODOS} valor={a.modo} aoMudar={(v) => mudar(j.id, { modo: v })} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Botao variante="primario" grande largo disabled={marcados.length === 0} onClick={enviar}>
        {marcados.length === 0
          ? "Marque ao menos um jogador"
          : `Enviar para ${marcados.length} ${marcados.length === 1 ? "jogador" : "jogadores"}`}
      </Botao>
    </div>
  );
}
