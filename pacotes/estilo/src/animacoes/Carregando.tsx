import css from "./Carregando.module.css";

type Props = {
  tamanho?: number;
  rotulo?: string;
  /* Dentro de um botão ou linha de texto: sem repetir "Carregando" para o leitor de tela. */
  decorativo?: boolean;
};

const CAMARAS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 2;
  return { cx: 50 + 27 * Math.cos(a), cy: 50 + 27 * Math.sin(a) };
});

/* Tambor de revólver: gira uma câmara de cada vez e para, como ao engatilhar. */
export function Carregando({ tamanho = 64, rotulo = "Carregando", decorativo }: Props) {
  const desenho = (
    <svg width={tamanho} height={tamanho} viewBox="0 0 100 100" className={css.desenho} aria-hidden="true">
      <g className={css.tambor}>
        <circle cx="50" cy="50" r="44" className={css.metal} />
        <circle cx="50" cy="50" r="38" className={css.friso} />
        {CAMARAS.map((c, i) => (
          <circle key={i} cx={c.cx} cy={c.cy} r="9" className={css.camara} />
        ))}
        <circle cx="50" cy="50" r="6" className={css.camara} />
      </g>
    </svg>
  );
  if (decorativo) return desenho;
  return (
    <span className={css.carregando} role="status" aria-label={rotulo}>
      {desenho}
    </span>
  );
}
