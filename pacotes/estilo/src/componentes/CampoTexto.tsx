import { useId, type InputHTMLAttributes } from "react";
import css from "./CampoTexto.module.css";

type Props = InputHTMLAttributes<HTMLInputElement> & {
  rotulo: string;
  ajuda?: string;
  erro?: string | null;
};

export function CampoTexto({ rotulo, ajuda, erro, className, ...resto }: Props) {
  const id = useId();
  const idAjuda = `${id}-ajuda`;
  const temAjuda = !!(erro || ajuda);
  return (
    <div className={`${css.campo} ${className ?? ""}`}>
      <label htmlFor={id} className={`${css.rotulo} odm-rotulo`}>
        {rotulo}
      </label>
      <input
        id={id}
        className={`${css.entrada} ${erro ? css.comErro : ""}`}
        aria-invalid={erro ? true : undefined}
        aria-describedby={temAjuda ? idAjuda : undefined}
        {...resto}
      />
      {temAjuda && (
        <p id={idAjuda} className={erro ? css.erro : css.ajuda} role={erro ? "alert" : undefined}>
          {erro ?? ajuda}
        </p>
      )}
    </div>
  );
}
