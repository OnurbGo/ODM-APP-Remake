import { Icone, type NomeIcone } from "./Icone";
import css from "./Abas.module.css";
import { useSetas } from "./usarSetas";

export type ItemAba = {
  id: string;
  rotulo: string;
  icone?: NomeIcone;
  aviso?: boolean;
};

type Props = {
  itens: ItemAba[];
  ativa: string;
  aoEscolher: (id: string) => void;
  variante?: "segmentada" | "inferior";
  rotuloGrupo: string;
};

export function Abas({ itens, ativa, aoEscolher, variante = "segmentada", rotuloGrupo }: Props) {
  const { grupo, aoTeclar } = useSetas(
    itens.map((i) => i.id),
    ativa,
    aoEscolher,
  );
  return (
    <div ref={grupo} role="tablist" aria-label={rotuloGrupo} className={`${css.abas} ${css[variante]}`} onKeyDown={aoTeclar}>
      {itens.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === ativa}
          tabIndex={item.id === ativa ? 0 : -1}
          className={`${css.aba} ${item.id === ativa ? css.ativa : ""} ${item.aviso ? css.aviso : ""}`}
          onClick={() => aoEscolher(item.id)}
        >
          {item.icone && <Icone nome={item.icone} />}
          <span className={css.rotulo}>{item.rotulo}</span>
        </button>
      ))}
    </div>
  );
}
