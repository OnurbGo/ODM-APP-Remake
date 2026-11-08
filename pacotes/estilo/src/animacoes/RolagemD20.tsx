import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CartaBaralho, type Naipe } from "../componentes/CartaBaralho";
import { Etiqueta } from "../componentes/Etiqueta";
import { D20Plano } from "./D20Plano";
import { SimboloD20 } from "./SimboloD20";
import { simboloDoNatural } from "./simbolosD20";
import css from "./RolagemD20.module.css";
import { usarVoltar } from "../componentes/usarVoltar";
import { usePularAnimacao } from "./usePularAnimacao";
import { useReduzirAnimacoes } from "./useReduzirAnimacoes";
import { dicaDePular } from "./dicaDePular";

export type ModificadorRolagem = { rotulo: string; valor: number };

/* Tudo chega pronto de quem chamou: este componente só mostra, não calcula regra. */
export type DadosRolagem = {
  /* Identifica a rolagem: dois resultados iguais seguidos ainda são duas rolagens. */
  id?: string;
  titulo: string;
  subtitulo?: string;
  /* Valores dos d20; vazio quando não há rolagem (falha automática). */
  dados: number[];
  escolhido: number;
  notaDados?: string;
  /* Vantagem por cartas: a que valeu já vem marcada. */
  cartas?: { valor: string; naipe: Naipe | null; valeu: boolean }[];
  modificadores: ModificadorRolagem[];
  total: number;
  alvo?: { rotulo: string; valor: number | null };
  resultado?: { texto: string; bom: boolean };
  destaqueNatural?: "alto" | "baixo";
  notaNatural?: string;
  notaFinal?: string;
  /* Teste de Morte: animação própria (batida de coração), com os sucessos e as falhas marcados um a um. */
  morte?: { sucessos: number; falhas: number; novo: "sucesso" | "falha" | "acordou" | "estavel" | "tres_falhas" };
};

type Props = {
  rolagem: DadosRolagem;
  rapida?: boolean;
  semTresD?: boolean;
  fecharSozinhoMs?: number;
  aoFechar: () => void;
};

const D20Tres = lazy(() => import("./D20Tres"));

/* Antecipa o download assim que um teste é pedido, para o dado não atrasar ao rolar. */
export function prepararD20() {
  void import("./D20Tres");
}

function temWebGL() {
  try {
    const tela = document.createElement("canvas");
    return !!(tela.getContext("webgl2") ?? tela.getContext("webgl"));
  } catch {
    return false;
  }
}

const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export function RolagemD20(props: Props) {
  const { rolagem } = props;
  /* Rolagem nova, cena nova: dado, tempos e estado recomeçam juntos. */
  return <Cena key={rolagem.id ?? `${rolagem.titulo}-${rolagem.dados.join("-")}-${rolagem.total}`} {...props} />;
}

function Cena({ rolagem, rapida, semTresD, fecharSozinhoMs, aoFechar }: Props) {
  const reduzir = useReduzirAnimacoes();
  const semDado = rolagem.dados.length === 0;
  const qtdMods = rolagem.modificadores.length;
  const final = qtdMods + 2;

  const tempos = useMemo(() => {
    if (rapida) return { dado: 320, mod: 60, comparar: 90 };
    return { dado: 1400, mod: 350, comparar: 320 };
  }, [rapida]);

  const direto = reduzir || semDado;
  const [passo, definirPasso] = useState(direto ? final : 0);
  const [pulado, definirPulado] = useState(direto);
  const [falhou3D, definirFalhou3D] = useState(false);
  const usar3D = useMemo(() => !semTresD && temWebGL(), [semTresD]);
  const timers = useRef<number[]>([]);
  const inicio = useRef(performance.now());
  const camada = useRef<HTMLDivElement>(null);

  /* O foco entra na rolagem e volta para onde estava ao fechar. */
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    camada.current?.focus();
    return () => anterior?.focus?.();
  }, []);

  useEffect(() => {
    if (direto) return;
    let t = tempos.dado;
    for (let i = 1; i <= qtdMods; i++) {
      timers.current.push(window.setTimeout(() => definirPasso(i), t));
      t += tempos.mod;
    }
    timers.current.push(window.setTimeout(() => definirPasso(qtdMods + 1), t));
    t += tempos.comparar;
    timers.current.push(window.setTimeout(() => definirPasso(final), t));
    const lista = timers.current;
    return () => {
      lista.forEach(clearTimeout);
      timers.current = [];
    };
  }, [direto, final, qtdMods, tempos]);

  const terminou = passo >= final;

  useEffect(() => {
    if (!terminou || !fecharSozinhoMs) return;
    const id = window.setTimeout(aoFechar, fecharSozinhoMs);
    return () => clearTimeout(id);
  }, [terminou, fecharSozinhoMs, aoFechar]);

  const avancar = useCallback(() => {
    if (terminou) {
      aoFechar();
      return;
    }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    definirPulado(true);
    definirPasso(final);
  }, [terminou, aoFechar, final]);

  usePularAnimacao(true, avancar);
  /* Voltar do celular fecha a rolagem, em vez de sair da mesa. */
  usarVoltar(true, aoFechar);

  const natural = rolagem.dados[rolagem.escolhido] ?? 0;
  /* O olho com X e a lápide acompanham o 20 e o 1 naturais no resultado. */
  const simboloNatural = simboloDoNatural(natural);
  const somaParcial =
    natural + rolagem.modificadores.slice(0, Math.max(0, Math.min(passo, qtdMods))).reduce((soma, m) => soma + m.valor, 0);
  const mostrarTotal = terminou ? rolagem.total : somaParcial;
  const dadoParou = passo >= 1 || pulado;
  const alvoTexto = rolagem.alvo ? `${rolagem.alvo.rotulo} ${rolagem.alvo.valor ?? "?"}` : null;

  return (
    <div
      ref={camada}
      tabIndex={-1}
      className={`${css.camada} ${rolagem.morte ? css.morte : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={rolagem.titulo}
      onClick={avancar}
    >
      <header className={css.topo}>
        <h2 className={css.titulo}>{rolagem.titulo}</h2>
        {rolagem.subtitulo && <p className={css.subtitulo}>{rolagem.subtitulo}</p>}
        {alvoTexto && <p className={`${css.alvo} odm-rotulo`}>{alvoTexto}</p>}
      </header>

      <div className={css.palco}>
        {!semDado &&
          (usar3D && !falhou3D ? (
            <Suspense
              fallback={
                <D20Plano valores={rolagem.dados} escolhido={rolagem.escolhido} duracaoMs={tempos.dado} pulado={pulado} />
              }
            >
              <D20Tres
                valores={rolagem.dados}
                escolhido={rolagem.escolhido}
                duracaoMs={direto ? 0 : tempos.dado}
                inicioMs={inicio.current}
                pulado={pulado}
                aoFalhar={() => definirFalhou3D(true)}
              />
            </Suspense>
          ) : (
            /* Se o 3D cair no meio da animação, mostra o resultado em vez de recomeçar o giro. */
            <D20Plano
              valores={rolagem.dados}
              escolhido={rolagem.escolhido}
              duracaoMs={direto ? 0 : tempos.dado}
              pulado={pulado || falhou3D}
            />
          ))}

        {terminou && rolagem.resultado && (
          <p className={`${css.selo} ${rolagem.resultado.bom ? css.bom : css.ruim}`}>{rolagem.resultado.texto}</p>
        )}
      </div>

      <div className={css.conta}>
        <div className={css.notas}>
          {dadoParou && rolagem.notaDados && <Etiqueta>{rolagem.notaDados}</Etiqueta>}
          {dadoParou && rolagem.notaNatural && (
            <Etiqueta tom={rolagem.destaqueNatural === "baixo" ? "perigo" : "destaque"}>
              {simboloNatural && <SimboloD20 simbolo={simboloNatural} className={css.simboloNatural} />}
              {rolagem.notaNatural}
            </Etiqueta>
          )}
        </div>

        {!semDado && rolagem.cartas && rolagem.cartas.length > 0 && (
          <div className={css.cartas}>
            {rolagem.cartas.map((c, i) => (
              <CartaBaralho
                key={i}
                valor={c.valor}
                naipe={c.naipe}
                virada={dadoParou}
                tamanho="p"
                apagada={terminou && !c.valeu}
              />
            ))}
          </div>
        )}

        {!semDado && (
          <ul className={css.mods}>
            <li className={css.mod}>
              <span className="odm-rotulo">d20</span>
              <span className="odm-numero">
                {dadoParou && simboloNatural && <SimboloD20 simbolo={simboloNatural} className={css.simboloNatural} />}
                {dadoParou ? natural : "—"}
              </span>
            </li>
            {rolagem.modificadores.map((m, i) =>
              passo > i ? (
                <li key={i} className={`${css.mod} ${css.modEntrando}`}>
                  <span className="odm-rotulo">{m.rotulo}</span>
                  <span className={`odm-numero ${m.valor < 0 ? css.negativo : ""}`}>{sinal(m.valor)}</span>
                </li>
              ) : null,
            )}
          </ul>
        )}

        {!semDado && dadoParou && (
          <p className={css.total}>
            <span className={`${css.totalValor} odm-numero`}>{mostrarTotal}</span>
            {alvoTexto && passo > qtdMods && <span className={`${css.contra} odm-rotulo`}>contra {alvoTexto}</span>}
          </p>
        )}

        {rolagem.morte && dadoParou && <MarcasDeMorte morte={rolagem.morte} />}

        {terminou && rolagem.notaFinal && <p className={css.notaFinal}>{rolagem.notaFinal}</p>}
      </div>

      <p className={`${css.dica} odm-rotulo`}>
        {dicaDePular(terminou ? "fechar" : "pular")}
      </p>

      {terminou && (
        <p className="odm-oculto" aria-live="polite">
          {rolagem.resultado?.texto ?? "Resultado"}:{" "}
          {semDado ? rolagem.notaFinal : `total ${rolagem.total}${alvoTexto ? ` contra ${alvoTexto}` : ""}`}.
        </p>
      )}
    </div>
  );
}

/* Três sucessos e três falhas do Morrendo. A marca que este teste acabou de pôr entra por último, com o carimbo. */
function MarcasDeMorte({ morte }: { morte: NonNullable<DadosRolagem["morte"]> }) {
  const linha = (tipo: "sucesso" | "falha", quantas: number) => {
    const nova = morte.novo === tipo || (tipo === "falha" && morte.novo === "tres_falhas") || (tipo === "sucesso" && morte.novo === "estavel");
    return (
      <div className={css.linhaMorte}>
        <span className="odm-rotulo">{tipo === "sucesso" ? "Sucessos" : "Falhas"}</span>
        <span className={css.marcasMorte} aria-label={`${quantas} de 3`}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`${css.marcaMorte} ${i < quantas ? (tipo === "sucesso" ? css.marcaSucesso : css.marcaFalha) : ""} ${nova && i === quantas - 1 ? css.marcaNova : ""}`}
            />
          ))}
        </span>
      </div>
    );
  };
  return (
    <div className={css.morteMarcas}>
      {linha("sucesso", morte.sucessos)}
      {linha("falha", morte.falhas)}
    </div>
  );
}
