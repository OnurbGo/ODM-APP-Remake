import { useId, type ReactNode } from "react";
import css from "./Dica.module.css";

type Props = {
  titulo: string;
  linhas: string[];
  classeBotao?: string;
  alinhar?: "inicio" | "fim";
  children: ReactNode;
};

/* Balão de mouse e teclado. No celular a mesma informação abre numa folha. */
export function Dica({ titulo, linhas, classeBotao, alinhar = "inicio", children }: Props) {
  const id = useId();
  return (
    <span className={css.ancora}>
      <button type="button" className={classeBotao} aria-describedby={id}>
        {children}
      </button>
      <span id={id} role="tooltip" className={`${css.balao} ${css[alinhar]}`}>
        <strong className={css.titulo}>{titulo}</strong>
        {linhas.map((l) => (
          <span key={l} className={css.linha}>
            {l}
          </span>
        ))}
      </span>
    </span>
  );
}
