import { ICONES_CONDICOES } from "../icones/condicoes";
import css from "./IconeCondicao.module.css";

/* Ícone de uma condição ou efeito ("efeito.hemorragia" → hemorragia), os mesmos dos tokens de condição dos livros.
   Sem ícone para o id, não mostra nada. O nome do efeito fica no texto ao lado: o ícone é decoração. */
export function IconeCondicao({ efeitoId, className }: { efeitoId: string; className?: string }) {
  const d = ICONES_CONDICOES[efeitoId.replace(/^efeito\./, "")];
  if (!d) return null;
  return (
    <svg viewBox="0 0 512 512" className={`${css.icone} ${className ?? ""}`} aria-hidden="true" focusable="false">
      <path d={d} fill="currentColor" />
    </svg>
  );
}
