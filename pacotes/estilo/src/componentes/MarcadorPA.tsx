import css from "./MarcadorPA.module.css";

export type EstadoPA = "disponivel" | "gasto" | "guardado" | "bloqueado";

const NOME: Record<EstadoPA, string> = {
  disponivel: "PA disponível",
  gasto: "PA gasto",
  guardado: "PA guardado",
  bloqueado: "PA perdido por efeito",
};

type Props = {
  estado: EstadoPA;
  aoTocar?: () => void;
  /* Só leitura, para resumos como o do mestre. */
  pequeno?: boolean;
};

/* Cápsula de bala de pé: projétil, corpo e aro. Ao gastar, o projétil sobe e some. */
export function MarcadorPA({ estado, aoTocar, pequeno }: Props) {
  return (
    <button
      type="button"
      className={`${css.marcador} ${css[estado]} ${pequeno ? css.pequeno : ""}`}
      onClick={aoTocar}
      disabled={!aoTocar || estado === "bloqueado"}
      aria-label={NOME[estado]}
    >
      <svg viewBox="0 0 28 60" className={css.desenho} aria-hidden="true">
        <g className={css.projetil}>
          <path className={css.chumbo} d="M7.5 23 V16 C7.5 9 11 4 14 2 C17 4 20.5 9 20.5 16 V23 Z" />
          <path className={css.brilho} d="M10.5 21 V16 C10.5 12 11.5 9 12.5 7" />
        </g>
        <path className={css.corpo} d="M6.5 23 H21.5 V52 H6.5 Z" />
        <path className={css.reflexo} d="M9.5 25.5 V50" />
        <path className={css.aro} d="M4.5 52 H23.5 V57 H4.5 Z" />
        {estado === "bloqueado" && <path className={css.risco} d="M3 12 L25 50" />}
      </svg>
    </button>
  );
}
