import css from "./Seletor.module.css";

type Props<T extends string> = {
  rotulo: string;
  opcoes: { id: T; rotulo: string }[];
  valor: T;
  aoMudar: (id: T) => void;
};

export function Seletor<T extends string>({ rotulo, opcoes, valor, aoMudar }: Props<T>) {
  return (
    <div className={css.seletor} role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === valor}
          className={`${css.opcao} ${o.id === valor ? css.ativa : ""}`}
          onClick={() => aoMudar(o.id)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
