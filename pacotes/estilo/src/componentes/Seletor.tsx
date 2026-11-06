import css from "./Seletor.module.css";
import { useSetas } from "./usarSetas";

type Props<T extends string> = {
  rotulo: string;
  opcoes: { id: T; rotulo: string }[];
  valor: T;
  aoMudar: (id: T) => void;
};

export function Seletor<T extends string>({ rotulo, opcoes, valor, aoMudar }: Props<T>) {
  const { grupo, aoTeclar } = useSetas(
    opcoes.map((o) => o.id),
    valor,
    aoMudar,
  );
  return (
    <div ref={grupo} className={css.seletor} role="radiogroup" aria-label={rotulo} onKeyDown={aoTeclar}>
      {opcoes.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={o.id === valor}
          tabIndex={o.id === valor ? 0 : -1}
          className={`${css.opcao} ${o.id === valor ? css.ativa : ""}`}
          onClick={() => aoMudar(o.id)}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
  );
}
