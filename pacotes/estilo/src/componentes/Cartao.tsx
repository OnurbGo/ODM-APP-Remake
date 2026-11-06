import type { HTMLAttributes, ReactNode } from "react";
import css from "./Cartao.module.css";

type Props = HTMLAttributes<HTMLElement> & {
  titulo?: string;
  extra?: ReactNode;
};

export function Cartao({ titulo, extra, className, children, ...resto }: Props) {
  return (
    <section className={[css.cartao, className ?? ""].join(" ")} {...resto}>
      {titulo && (
        <header className={css.topo}>
          <h2 className={css.titulo}>{titulo}</h2>
          {extra}
        </header>
      )}
      {children}
    </section>
  );
}
