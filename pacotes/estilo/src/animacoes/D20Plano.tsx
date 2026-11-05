import css from "./D20Plano.module.css";

type Props = {
  valores: number[];
  escolhido: number;
  duracaoMs: number;
  pulado: boolean;
};

/* Sem WebGL e enquanto o 3D carrega: mesmo resultado, em SVG. */
export function D20Plano({ valores, escolhido, duracaoMs, pulado }: Props) {
  const parado = pulado || duracaoMs === 0;
  return (
    <div className={css.dados}>
      {valores.map((valor, i) => (
        <svg
          key={i}
          viewBox="0 0 100 100"
          className={`${css.dado} ${parado ? css.parado : ""} ${parado && i !== escolhido ? css.descartado : ""}`}
          style={{ animationDuration: `${duracaoMs}ms` }}
          aria-hidden="true"
        >
          <polygon className={css.corpo} points="50,4 90,27 90,73 50,96 10,73 10,27" />
          <polygon className={css.face} points="50,22 76,66 24,66" />
          <path className={css.aresta} d="M50 4 50 22M90 27 76 66M10 27 24 66M50 96 76 66M50 96 24 66M90 73 76 66M10 73 24 66M90 27 50 22M10 27 50 22" />
          <text x="50" y="53" className={`${css.numero} ${parado ? css.numeroVisivel : ""}`}>
            {valor}
          </text>
        </svg>
      ))}
    </div>
  );
}
