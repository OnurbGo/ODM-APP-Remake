import type { ReactNode } from "react";
import css from "./Etiqueta.module.css";

type Props = {
  tom?: "neutro" | "destaque" | "perigo" | "sucesso" | "tecnica";
  children: ReactNode;
};

export function Etiqueta({ tom = "neutro", children }: Props) {
  return <span className={`${css.etiqueta} ${css[tom]}`}>{children}</span>;
}
