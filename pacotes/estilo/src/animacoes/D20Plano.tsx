import { useState } from "react";
import css from "./D20Plano.module.css";
import { SIMBOLOS_D20, simboloDoNatural } from "./simbolosD20";
import simbolos from "./SimboloD20.module.css";

type Props = {
  valores: number[];
  escolhido: number;
  duracaoMs: number;
  pulado: boolean;
};

/* 20 e 1 naturais: o olho com X e a lápide, no lugar do número, centrados na face da frente. */
function Face({ valor, visivel }: { valor: number; visivel: boolean }) {
  const simbolo = simboloDoNatural(valor);
  if (!simbolo) {
    return (
      <text x="50" y="53" className={`${css.numero} ${visivel ? css.numeroVisivel : ""}`}>
        {valor}
      </text>
    );
  }
  return (
    <g transform="translate(38 39) scale(0.24)" className={`${css.simbolo} ${visivel ? css.numeroVisivel : ""}`}>
      {SIMBOLOS_D20[simbolo].map((t, i) =>
        t.contorno ? (
          <path key={i} d={t.d} className={simbolos[t.papel]} fill="none" strokeWidth={t.contorno} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={i} d={t.d} className={simbolos[`${t.papel}Cheio`]} />
        ),
      )}
    </g>
  );
}

/* Sem WebGL e enquanto o 3D carrega: mesmo resultado, em SVG. */
export function D20Plano({ valores, escolhido, duracaoMs, pulado }: Props) {
  /* O resultado aparece ao fim do giro, e não só quando a animação é pulada. */
  const [girou, definirGirou] = useState(false);
  const parado = pulado || duracaoMs === 0 || girou;
  return (
    <div className={css.dados}>
      {valores.map((valor, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          className={`${css.dado} ${parado ? css.parado : ""} ${parado && i !== escolhido ? css.descartado : ""}`}
          style={{ animationDuration: `${duracaoMs}ms` }}
          onAnimationEnd={() => definirGirou(true)}
          aria-hidden="true"
        >
          <polygon className={css.corpo} points="50,4 90,27 90,73 50,96 10,73 10,27" />
          <polygon className={css.face} points="50,22 76,66 24,66" />
          <path className={css.aresta} d="M50 4 50 22M90 27 76 66M10 27 24 66M50 96 76 66M50 96 24 66M90 73 76 66M10 73 24 66M90 27 50 22M10 27 50 22" />
          <Face valor={valor} visivel={parado} />
        </svg>
      ))}
    </div>
  );
}
