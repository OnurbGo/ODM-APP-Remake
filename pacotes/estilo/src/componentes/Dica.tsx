import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import css from "./Dica.module.css";
import { PopUp } from "./PopUp";

type Props = {
  titulo: string;
  linhas: string[];
  classeBotao?: string;
  alinhar?: "inicio" | "fim";
  children: ReactNode;
};

const MARGEM = 8;
const AFASTAMENTO = 6;

const semMouse = () => window.matchMedia("(hover: none)").matches;

/* Balão de mouse e teclado; no toque, a mesma informação abre numa folha.
   O balão é fixo na janela: as colunas que rolam sozinhas não o cortam, e ele nunca sai da tela. */
export function Dica({ titulo, linhas, classeBotao, alinhar = "inicio", children }: Props) {
  const id = useId();
  const ancora = useRef<HTMLSpanElement>(null);
  const balao = useRef<HTMLSpanElement>(null);
  const [folha, definirFolha] = useState(false);

  const posicionar = useCallback(() => {
    const a = ancora.current?.getBoundingClientRect();
    const b = balao.current;
    if (!a || !b) return;
    const largura = b.offsetWidth;
    const altura = b.offsetHeight;
    const desejada = alinhar === "fim" ? a.right - largura : a.left;
    const esquerda = Math.max(MARGEM, Math.min(desejada, window.innerWidth - largura - MARGEM));
    const abaixo = a.bottom + AFASTAMENTO;
    const cabe = abaixo + altura <= window.innerHeight - MARGEM;
    b.style.left = `${esquerda}px`;
    b.style.top = `${cabe ? abaixo : Math.max(MARGEM, a.top - altura - AFASTAMENTO)}px`;
  }, [alinhar]);

  return (
    <span ref={ancora} className={css.ancora} onPointerEnter={posicionar} onFocus={posicionar}>
      <button
        type="button"
        className={classeBotao}
        aria-describedby={id}
        onClick={() => {
          if (semMouse()) definirFolha(true);
        }}
      >
        {children}
      </button>
      <span ref={balao} id={id} role="tooltip" className={css.balao}>
        <strong className={css.titulo}>{titulo}</strong>
        {linhas.map((l, i) => (
          <span key={i} className={css.linha}>
            {l}
          </span>
        ))}
      </span>
      <PopUp aberto={folha} titulo={titulo} aoFechar={() => definirFolha(false)}>
        {linhas.map((l, i) => (
          <p key={i} className={css.linhaFolha}>
            {l}
          </p>
        ))}
      </PopUp>
    </span>
  );
}
