import type { ButtonHTMLAttributes } from "react";
import css from "./Botao.module.css";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario" | "perigo" | "fantasma";
  grande?: boolean;
  largo?: boolean;
};

export function Botao({ variante = "secundario", grande, largo, className, type = "button", ...resto }: Props) {
  const classes = [css.botao, css[variante], grande ? css.grande : "", largo ? css.largo : "", className ?? ""];
  return <button type={type} className={classes.join(" ")} {...resto} />;
}
