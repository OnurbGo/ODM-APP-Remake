import { SIMBOLOS_D20, type SimboloNatural } from "./simbolosD20";
import css from "./SimboloD20.module.css";

type Props = {
  simbolo: SimboloNatural;
  className?: string;
  /* Sem rótulo, é só decoração ao lado de um texto que já diz "20 natural" ou "1 natural". */
  rotulo?: string;
};

/* O olho com X (20 natural) e a lápide (1 natural), em SVG. As cores vêm de --simbolo-figura,
   --simbolo-entalhe e --simbolo-fundo; sem elas, as do dado. */
export function SimboloD20({ simbolo, className, rotulo }: Props) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${css.simbolo} ${className ?? ""}`}
      role={rotulo ? "img" : undefined}
      aria-label={rotulo}
      aria-hidden={rotulo ? undefined : true}
    >
      {SIMBOLOS_D20[simbolo].map((t, i) =>
        t.contorno ? (
          <path key={i} d={t.d} className={css[t.papel]} fill="none" strokeWidth={t.contorno} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <path key={i} d={t.d} className={css[`${t.papel}Cheio`]} />
        ),
      )}
    </svg>
  );
}
