import { Icone, type NomeIcone } from "./Icone";
import css from "./Abas.module.css";

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
  return (
    <div role="tablist" aria-label={rotuloGrupo} className={`${css.abas} ${css[variante]}`}>
      {itens.map((item) => (
        <button
          key={item.id}
          type="button"
          role="tab"
          aria-selected={item.id === ativa}
          className={`${css.aba} ${item.id === ativa ? css.ativa : ""} ${item.aviso ? css.aviso : ""}`}
          onClick={() => aoEscolher(item.id)}
        >
          {item.icone && <Icone nome={item.icone} />}
          <span>{item.rotulo}</span>
        </button>
      ))}
    </div>
  );
}
