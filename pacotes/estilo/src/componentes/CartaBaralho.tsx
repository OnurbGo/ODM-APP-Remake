import css from "./CartaBaralho.module.css";

export type Naipe = "espadas" | "copas" | "paus" | "ouros";

type Carta = {
  valor: string;
  naipe: Naipe | null;
};

const NOME_NAIPE: Record<Naipe, string> = { espadas: "espadas", copas: "copas", paus: "paus", ouros: "ouros" };

function Simbolo({ naipe }: { naipe: Naipe }) {
  return (
    <svg viewBox="0 0 24 24" className={css.simbolo} aria-hidden="true">
      {naipe === "copas" && <path d="M12 21.5C5.5 16 2 12.2 2 8.2a5 5 0 0 1 10-1.7 5 5 0 0 1 10 1.7c0 4-3.500 7.800-10 13.300Z" />}
      {naipe === "ouros" && <path d="M12 2 20.500 12 12 22 3.500 12 12 2Z" />}
      {naipe === "espadas" && (
        <path d="M12 2C8.500 7.500 3 10.800 3 15.200a4.500 4.500 0 0 0 7.300 3.500L9 22h6l-1.300-3.300A4.500 4.500 0 0 0 21 15.200C21 10.800 15.500 7.500 12 2Z" />
      )}
      {naipe === "paus" && (
        <>
          <circle cx="12" cy="7.500" r="4.700" />
          <circle cx="6.800" cy="14.500" r="4.700" />
          <circle cx="17.200" cy="14.500" r="4.700" />
          <path d="M10.700 12h2.600L15 22H9l1.700-10Z" />
        </>
      )}
    </svg>
  );
}

function Indice({ valor, naipe }: Carta) {
  return (
    <span className={css.indice}>
      <span>{valor === "Coringa" ? "★" : valor}</span>
      {naipe && <Simbolo naipe={naipe} />}
    </span>
  );
}

const nomeCarta = ({ valor, naipe }: Carta) => (naipe ? `${valor} de ${NOME_NAIPE[naipe]}` : valor);

type Props = Carta & {
  virada: boolean;
  tamanho?: "p" | "m" | "g";
  atraso?: number;
  apagada?: boolean;
};

/* A carta vira só com transform. A chave do componente não muda: virar é uma transição. */
export function CartaBaralho({ valor, naipe, virada, tamanho = "m", atraso = 0, apagada }: Props) {
  const vermelha = naipe === "copas" || naipe === "ouros";
  return (
    <span
      className={[css.carta, css[tamanho], virada ? css.virada : "", apagada ? css.apagada : ""].join(" ")}
      role="img"
      aria-label={virada ? nomeCarta({ valor, naipe }) : "Carta virada para baixo"}
    >
      <span className={css.miolo} style={{ transitionDelay: `calc(${atraso}ms * var(--fator-animacao))` }}>
        <span className={css.verso}>
          <span className={css.versoFrisos} />
        </span>
        <span className={`${css.face} ${vermelha ? css.vermelha : ""}`}>
          <Indice valor={valor} naipe={naipe} />
          <span className={css.centro}>
            {naipe ? <Simbolo naipe={naipe} /> : <span className={css.coringa}>Coringa</span>}
          </span>
          <span className={css.indiceFim}>
            <Indice valor={valor} naipe={naipe} />
          </span>
        </span>
      </span>
    </span>
  );
}

/* Na linha de texto: iniciativa, faixa de turno e registro. */
export function CartaMini({ valor, naipe }: Carta) {
  const vermelha = naipe === "copas" || naipe === "ouros";
  return (
    <span className={`${css.mini} ${vermelha ? css.vermelha : ""}`} role="img" aria-label={nomeCarta({ valor, naipe })}>
      <span>{valor === "Coringa" ? "★" : valor}</span>
      {naipe && <Simbolo naipe={naipe} />}
    </span>
  );
}
