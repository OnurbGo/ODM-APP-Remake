import { useState, type ReactNode } from "react";
import css from "./Moldura.module.css";

type Props = {
  titulo: string;
  painel: ReactNode;
  desktop?: boolean;
  children: ReactNode;
};

/* Tela de celular: no PC, mostra um aparelho de 390×844 com o painel ao lado; no celular de
   verdade, ocupa tudo. Tela de desktop: ocupa a janela. Nos dois casos sem lado livre, o painel
   abre pelo botão "P". */
export function Moldura({ titulo, painel, desktop, children }: Props) {
  const [aberto, definirAberto] = useState(false);
  return (
    <div className={`${css.palco} ${desktop ? css.desktop : ""}`}>
      <div className={`${css.tela} odm-grao`}>{children}</div>
      <aside className={`${css.painel} ${aberto ? css.aberto : ""}`} aria-label="Controles do protótipo">
        <a href="#/" className={css.voltar}>
          ← Protótipos
        </a>
        <h1 className={css.titulo}>{titulo}</h1>
        <p className={css.aviso}>Este painel é só do protótipo.</p>
        {painel}
      </aside>
      <button type="button" className={css.alternar} onClick={() => definirAberto((a) => !a)} aria-label="Controles do protótipo">
        P
      </button>
    </div>
  );
}

export function GrupoPainel({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className={css.grupo}>
      <h2 className={css.grupoTitulo}>{titulo}</h2>
      <div className={css.opcoes}>{children}</div>
    </div>
  );
}

export function OpcaoPainel({ ativa, aoTocar, children }: { ativa?: boolean; aoTocar: () => void; children: ReactNode }) {
  return (
    <button type="button" className={`${css.opcao} ${ativa ? css.ativa : ""}`} onClick={aoTocar} aria-pressed={ativa}>
      {children}
    </button>
  );
}
