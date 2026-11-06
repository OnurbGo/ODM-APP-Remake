import { Botao, CartaBaralho, CartaMini, Etiqueta, PopUp, Seletor } from "@odm/estilo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CARTAS_MESA,
  CENARIOS_JOGADOR,
  COMPRA_MESA,
  EFEITO_ESPECIAL,
  NOME_CARTA,
  especial,
  motivoEmpate,
  ordenar,
  type Carta,
  type Participante,
} from "../dados/baralho";
import type { Combate } from "../estado/useCombate";
import css from "./Iniciativa.module.css";

const nome = (c: Carta) => NOME_CARTA[c.valor] ?? c.valor;

const OPCOES = [
  { id: "prioridade", rotulo: "Prioridade" },
  { id: "efeito", rotulo: "Usar efeito" },
];

const trocar = <T extends { id: string }>(lista: T[], [a, b]: [string, string]) => {
  const i = lista.findIndex((p) => p.id === a);
  const j = lista.findIndex((p) => p.id === b);
  if (i < 0 || j < 0) return lista;
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
};

function ListaOrdem({ ordem, voce }: { ordem: Participante[]; voce?: string }) {
  return (
    <ol className={css.ordem}>
      {ordem.map((p, i) => {
        const empate = motivoEmpate(p, ordem);
        return (
          <li key={p.id} className={`${css.ordemLinha} ${p.id === voce ? css.voce : ""}`}>
            <span className={`${css.posicao} odm-numero`}>{i + 1}</span>
            <CartaMini valor={p.carta.valor} naipe={p.carta.naipe} />
            <span className={css.ordemNome}>{p.nome}</span>
            {p.usaEfeito && <Etiqueta tom="tecnica">Efeito</Etiqueta>}
            {empate && <Etiqueta>{empate === "agilidade" ? "Agilidade" : "Naipe"}</Etiqueta>}
          </li>
        );
      })}
    </ol>
  );
}

function SeletorAlvo({ rotulo, valor, opcoes, bloqueado, aoMudar }: { rotulo: string; valor: string; opcoes: Participante[]; bloqueado: string; aoMudar: (id: string) => void }) {
  return (
    <select className={css.alvo} aria-label={rotulo} value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">{rotulo}</option>
      {opcoes
        .filter((p) => p.id !== bloqueado)
        .map((p) => (
          <option key={p.id} value={p.id}>
            {p.nome}
          </option>
        ))}
    </select>
  );
}

/* Mestre */

type DecisaoMestre = "prioridade" | "efeito" | "";

export function IniciativaMestre({ aberta, aoFechar, aoComecar }: { aberta: boolean; aoFechar: () => void; aoComecar: (ordem: Participante[]) => void }) {
  if (!aberta) return null;
  return (
    <PopUp aberto titulo="Iniciativa" subtitulo="Cada criatura engajada compra uma carta" variante="larga" aoFechar={aoFechar}>
      <FormularioMestre aoComecar={aoComecar} />
    </PopUp>
  );
}

function FormularioMestre({ aoComecar }: { aoComecar: (ordem: Participante[]) => void }) {
  const [compradas, definirCompradas] = useState(false);
  const [decisoes, definirDecisoes] = useState<Record<string, DecisaoMestre>>({});
  const [troca, definirTroca] = useState<[string, string]>(["", ""]);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const lista = timers.current;
    return () => lista.forEach(clearTimeout);
  }, []);

  function comprar() {
    definirCompradas(true);
    /* As respostas dos jogadores chegam quando cada um decide. */
    const responder = (id: string, escolha: DecisaoMestre, ms: number) =>
      timers.current.push(window.setTimeout(() => definirDecisoes((d) => (d[id] ? d : { ...d, [id]: escolha })), ms));
    responder("zeca", "prioridade", 1500);
    responder("inacia", "efeito", 2300);
    responder("tiao", "efeito", 3000);
    timers.current.push(window.setTimeout(() => definirTroca((t) => (t[0] ? t : ["andarilho", "bento"])), 3400));
  }

  const participantes = useMemo(
    () => COMPRA_MESA.map((p) => ({ ...p, usaEfeito: decisoes[p.id] === "efeito" })),
    [decisoes],
  );
  const coringa = participantes.find((p) => p.carta.valor === "Coringa" && p.usaEfeito);
  const ordem = useMemo(() => {
    const base = ordenar(participantes);
    return coringa && troca[0] && troca[1] ? trocar(base, troca) : base;
  }, [coringa, participantes, troca]);

  const faltam =
    participantes.filter((p) => especial(p.carta) && !decisoes[p.id]).length + (coringa && (!troca[0] || !troca[1]) ? 1 : 0);

  return (
    <div className={css.mestre}>
      <ul className={css.participantes}>
        {participantes.map((p, i) => {
          const eEspecial = especial(p.carta);
          const pendente = compradas && eEspecial && !decisoes[p.id];
          const humano = !["andarilho", "carnicas", "bento"].includes(p.id);
          return (
            <li key={p.id} className={css.participante}>
              <CartaBaralho valor={p.carta.valor} naipe={p.carta.naipe} virada={compradas} tamanho="p" atraso={i * 110} />
              <div className={css.detalhes}>
                <p className={css.nome}>{p.nome}</p>
                {compradas && <p className={css.carta}>{nome(p.carta)}</p>}
                {compradas && eEspecial && (
                  <>
                    <p className={css.nota}>{EFEITO_ESPECIAL[p.carta.valor]}</p>
                    <Seletor
                      rotulo={`Decisão de ${p.nome}`}
                      opcoes={OPCOES}
                      valor={decisoes[p.id] ?? ""}
                      aoMudar={(v) => definirDecisoes((d) => ({ ...d, [p.id]: v as DecisaoMestre }))}
                    />
                    {pendente && humano && <p className={css.nota}>Aguardando o jogador</p>}
                    {coringa?.id === p.id && (
                      <div className={css.alvos}>
                        <SeletorAlvo rotulo="Primeiro alvo" valor={troca[0]} opcoes={COMPRA_MESA} bloqueado={p.id} aoMudar={(v) => definirTroca((t) => [v, t[1]])} />
                        <SeletorAlvo rotulo="Segundo alvo" valor={troca[1]} opcoes={COMPRA_MESA} bloqueado={p.id} aoMudar={(v) => definirTroca((t) => [t[0], v])} />
                      </div>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <aside className={css.lateral} aria-label="Ordem resultante">
        <h3 className={`${css.subtitulo} odm-rotulo`}>Ordem</h3>
        {compradas ? <ListaOrdem ordem={ordem} /> : <p className={css.nota}>A ordem aparece quando as cartas forem reveladas.</p>}
        <div className={css.acao}>
          {!compradas ? (
            <Botao variante="primario" grande largo onClick={comprar}>
              Comprar cartas
            </Botao>
          ) : (
            <Botao variante="primario" grande largo disabled={faltam > 0} onClick={() => aoComecar(ordem)}>
              {faltam > 0 ? `${faltam === 1 ? "Falta 1 escolha" : `Faltam ${faltam} escolhas`}` : "Começar combate"}
            </Botao>
          )}
        </div>
      </aside>
    </div>
  );
}

/* Jogador */

const OUTROS: Participante[] = COMPRA_MESA.filter((p) => p.id !== "inacia").map((p) => ({ ...p, carta: CARTAS_MESA[p.id] }));
const AGILIDADE_VOCE = 3;

export function useIniciativaJogador() {
  const [cenario, definirCenario] = useState<(typeof CENARIOS_JOGADOR)[number] | null>(null);
  const [carta, definirCarta] = useState<Carta>(CARTAS_MESA.inacia);
  const abrir = useCallback((id: string) => definirCenario(CENARIOS_JOGADOR.find((c) => c.id === id) ?? null), []);
  const fechar = useCallback(() => definirCenario(null), []);
  return { cenario, carta, definirCarta, abrir, fechar };
}

export type IniciativaJogadorEstado = ReturnType<typeof useIniciativaJogador>;

export function IniciativaJogador({ ini, combate, variante }: { ini: IniciativaJogadorEstado; combate: Combate; variante: "folha" | "central" }) {
  if (!ini.cenario) return null;
  return (
    <PopUp aberto titulo="Iniciativa" subtitulo="Compre sua carta" variante={variante} aoFechar={ini.fechar}>
      <FluxoJogador key={ini.cenario.id} cartas={ini.cenario.cartas} ini={ini} combate={combate} />
    </PopUp>
  );
}

function FluxoJogador({ cartas, ini, combate }: { cartas: Carta[]; ini: IniciativaJogadorEstado; combate: Combate }) {
  const [viradas, definirViradas] = useState(false);
  const [escolhida, definirEscolhida] = useState<Carta | null>(cartas.length === 1 ? cartas[0] : null);
  const [decisao, definirDecisao] = useState<"prioridade" | "efeito" | null>(null);
  const [troca, definirTroca] = useState<[string, string]>(["", ""]);

  const eEspecial = !!escolhida && especial(escolhida);
  const decidido = viradas && !!escolhida && (!eEspecial || !!decisao);
  const ehCoringa = escolhida?.valor === "Coringa" && decisao === "efeito";
  const faltaAlvo = ehCoringa && (!troca[0] || !troca[1]);

  const ordem = useMemo(() => {
    if (!escolhida) return [];
    const voce: Participante = { id: "inacia", nome: "Inácia Brasa", carta: escolhida, agilidade: AGILIDADE_VOCE, usaEfeito: decisao === "efeito" };
    const base = ordenar([...OUTROS, voce]);
    return ehCoringa && !faltaAlvo ? trocar(base, troca) : base;
  }, [decisao, ehCoringa, escolhida, faltaAlvo, troca]);

  return (
    <div className={css.jogador}>
      <div className={css.mesaCartas}>
        {cartas.map((c) => {
          const apagada = !!escolhida && escolhida !== c;
          const carta = <CartaBaralho valor={c.valor} naipe={c.naipe} virada={viradas} tamanho="g" apagada={apagada} />;
          return cartas.length > 1 && viradas && !decisao ? (
            <button key={`${c.valor}${c.naipe}`} type="button" className={css.escolher} aria-label={`Ficar com ${nome(c)}`} onClick={() => definirEscolhida(c)}>
              {carta}
            </button>
          ) : (
            <span key={`${c.valor}${c.naipe}`}>{carta}</span>
          );
        })}
      </div>

      {!viradas && (
        <>
          {cartas.length > 1 && <p className={css.nota}>Redenção completa: compre uma adicional e fique com a que quiser.</p>}
          <Botao variante="primario" grande largo onClick={() => definirViradas(true)}>
            {cartas.length > 1 ? "Comprar duas cartas" : "Comprar carta"}
          </Botao>
        </>
      )}

      {viradas && !escolhida && <p className={css.nota}>Toque na carta com que quer ficar.</p>}

      {viradas && eEspecial && escolhida && !decisao && (
        <div className={css.decidir}>
          <p className={css.efeito}>
            <strong>{nome(escolhida)}:</strong> {EFEITO_ESPECIAL[escolhida.valor]}
          </p>
          <Botao variante="primario" grande largo onClick={() => definirDecisao("efeito")}>
            Usar efeito e ir para o fim da ordem
          </Botao>
          <Botao grande largo onClick={() => definirDecisao("prioridade")}>
            Manter a prioridade
          </Botao>
        </div>
      )}

      {ehCoringa && (
        <div className={css.alvos}>
          <SeletorAlvo rotulo="Primeiro alvo" valor={troca[0]} opcoes={OUTROS} bloqueado="inacia" aoMudar={(v) => definirTroca((t) => [v, t[1]])} />
          <SeletorAlvo rotulo="Segundo alvo" valor={troca[1]} opcoes={OUTROS} bloqueado="inacia" aoMudar={(v) => definirTroca((t) => [t[0], v])} />
        </div>
      )}

      {decidido && (
        <>
          <h3 className={`${css.subtitulo} odm-rotulo`}>Ordem</h3>
          <ListaOrdem ordem={ordem} voce="inacia" />
          <Botao
            variante="primario"
            grande
            largo
            disabled={faltaAlvo}
            onClick={() => {
              if (escolhida) ini.definirCarta(escolhida);
              if (escolhida?.valor === "A" && decisao === "efeito") combate.escolherCenario("pa-extra");
              ini.fechar();
            }}
          >
            {faltaAlvo ? "Escolha os dois alvos" : "Pronto"}
          </Botao>
        </>
      )}
    </div>
  );
}
