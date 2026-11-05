import css from "./CampoNumero.module.css";

type Props = {
  rotulo: string;
  rotuloOculto?: boolean;
  semSinal?: boolean;
  valor: number;
  minimo?: number;
  maximo?: number;
  aoMudar: (valor: number) => void;
};

const comSinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : n > 0 ? `+${n}` : "0");

export function CampoNumero({ rotulo, rotuloOculto, semSinal, valor, minimo = -20, maximo = 20, aoMudar }: Props) {
  return (
    <div className={css.campo} role="group" aria-label={rotulo}>
      {!rotuloOculto && <span>{rotulo}</span>}
      <div className={css.controle}>
        <button type="button" className={css.passo} disabled={valor <= minimo} onClick={() => aoMudar(valor - 1)} aria-label={`Diminuir ${rotulo}`}>
          −
        </button>
        <output className={`${css.valor} odm-numero`}>{semSinal ? valor : comSinal(valor)}</output>
        <button type="button" className={css.passo} disabled={valor >= maximo} onClick={() => aoMudar(valor + 1)} aria-label={`Aumentar ${rotulo}`}>
          +
        </button>
      </div>
    </div>
  );
}
