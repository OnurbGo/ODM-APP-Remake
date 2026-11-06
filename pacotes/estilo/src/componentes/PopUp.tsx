import { useEffect, useRef, type ReactNode } from "react";
import { Icone } from "./Icone";
import css from "./PopUp.module.css";

type Props = {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  aoFechar: () => void;
  variante?: "folha" | "central" | "larga";
  children: ReactNode;
};

/* Não usa <dialog> nativo: a camada de topo ignoraria a moldura do protótipo e as transições
   de tela. Esc fecha e o foco vai para o painel ao abrir e volta ao fechar. */
export function PopUp({ aberto, titulo, subtitulo, aoFechar, variante = "folha", children }: Props) {
  const painel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    painel.current?.focus();
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      anterior?.focus?.();
    };
  }, [aberto, aoFechar]);

  if (!aberto) return null;

  return (
    <div className={`${css.fundo} ${css[variante]}`}>
      <button type="button" className={css.veu} aria-label="Fechar" onClick={aoFechar} tabIndex={-1} />
      <div ref={painel} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} className={css.painel}>
        <header className={css.topo}>
          <div>
            <h2 className={css.titulo}>{titulo}</h2>
            {subtitulo && <p className={css.subtitulo}>{subtitulo}</p>}
          </div>
          <button type="button" className={css.fechar} onClick={aoFechar} aria-label="Fechar">
            <Icone nome="fechar" tamanho={20} />
          </button>
        </header>
        <div className={css.corpo}>{children}</div>
      </div>
    </div>
  );
}
