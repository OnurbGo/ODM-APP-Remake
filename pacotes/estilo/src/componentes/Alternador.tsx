import css from "./Alternador.module.css";

type Props = {
  rotulo: string;
  dica?: string;
  ligado: boolean;
  aoMudar: (ligado: boolean) => void;
};

export function Alternador({ rotulo, dica, ligado, aoMudar }: Props) {
  return (
    <button type="button" role="switch" aria-checked={ligado} className={css.linha} onClick={() => aoMudar(!ligado)}>
      <span className={css.textos}>
        <span>{rotulo}</span>
        {dica && <span className={css.dica}>{dica}</span>}
      </span>
      <span className={`${css.trilho} ${ligado ? css.ligado : ""}`}>
        <span className={css.pino} />
      </span>
    </button>
  );
}
