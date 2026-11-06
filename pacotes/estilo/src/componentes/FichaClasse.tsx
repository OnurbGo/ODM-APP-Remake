import css from "./FichaClasse.module.css";

type Props = {
  nome: string;
  atual: number;
  maximo: number;
  aoMudar: (diferenca: 1 | -1) => void;
};

const LIMITE_PIPS = 8;

export function FichaClasse({ nome, atual, maximo, aoMudar }: Props) {
  return (
    <div className={css.ficha}>
      <div className={css.textos}>
        <span className={css.nome}>{nome}</span>
        {maximo <= LIMITE_PIPS && (
          <span className={css.pips} aria-hidden="true">
            {Array.from({ length: maximo }, (_, i) => (
              <span key={i} className={`${css.pip} ${i < atual ? css.cheio : ""}`} />
            ))}
          </span>
        )}
      </div>
      <div className={css.controle}>
        <button type="button" className={css.passo} onClick={() => aoMudar(-1)} disabled={atual <= 0} aria-label={`Gastar 1 ${nome}`}>
          −
        </button>
        <span className={`${css.valor} odm-numero`} aria-live="polite">
          {atual}
          <span className={css.maximo}>/{maximo}</span>
        </span>
        <button type="button" className={css.passo} onClick={() => aoMudar(1)} disabled={atual >= maximo} aria-label={`Recuperar 1 ${nome}`}>
          +
        </button>
      </div>
    </div>
  );
}
