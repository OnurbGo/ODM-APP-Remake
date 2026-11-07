import { useEffect, useRef, type ReactNode } from "react";
import { Icone } from "./Icone";
import css from "./PopUp.module.css";
import { usarVoltar } from "./usarVoltar";

type Props = {
  aberto: boolean;
  titulo: string;
  subtitulo?: string;
  aoFechar: () => void;
  variante?: "folha" | "central" | "larga";
  /* Sem X, véu ou Esc: só sai respondendo. Para quando alguém espera a resposta. */
  obrigatorio?: boolean;
  children: ReactNode;
};

const SELETOR_FOCO = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/* Com dois abertos, Esc e Tab valem só para o de cima. */
const pilha: symbol[] = [];

/* Sem <dialog> nativo: a camada de topo dele ficaria por cima das transições de tela. */
export function PopUp({ aberto, titulo, subtitulo, aoFechar, variante = "folha", obrigatorio, children }: Props) {
  const painel = useRef<HTMLDivElement>(null);
  /* Por referência: uma função nova a cada render não pode reabrir o efeito, ou o foco
     voltaria ao painel enquanto a pessoa digita. */
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const preso = useRef(obrigatorio);
  preso.current = obrigatorio;
  usarVoltar(aberto, aoFechar, obrigatorio);

  useEffect(() => {
    if (!aberto) return;
    const eu = Symbol();
    pilha.push(eu);
    const anterior = document.activeElement as HTMLElement | null;
    const raiz = document.documentElement;
    const rolagem = raiz.style.overflow;
    raiz.style.overflow = "hidden";
    painel.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (pilha.at(-1) !== eu) return;
      if (e.key === "Escape" && !preso.current) {
        fechar.current();
        return;
      }
      if (e.key !== "Tab" || !painel.current) return;
      const focaveis = [...painel.current.querySelectorAll<HTMLElement>(SELETOR_FOCO)];
      const primeiro = focaveis[0];
      const ultimo = focaveis.at(-1);
      if (!primeiro || !ultimo) {
        e.preventDefault();
        return;
      }
      const atual = document.activeElement;
      if (e.shiftKey && (atual === primeiro || atual === painel.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && atual === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      pilha.splice(pilha.indexOf(eu), 1);
      raiz.style.overflow = rolagem;
      anterior?.focus?.();
    };
  }, [aberto]);

  if (!aberto) return null;

  return (
    <div className={`${css.fundo} ${css[variante]}`}>
      <div className={css.veu} aria-hidden="true" onClick={obrigatorio ? undefined : aoFechar} />
      <div ref={painel} role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} className={css.painel}>
        <header className={css.topo}>
          <div className={css.textos}>
            <h2 className={css.titulo}>{titulo}</h2>
            {subtitulo && <p className={css.subtitulo}>{subtitulo}</p>}
          </div>
          {!obrigatorio && (
            <button type="button" className={css.fechar} onClick={aoFechar} aria-label="Fechar">
              <Icone nome="fechar" tamanho={20} />
            </button>
          )}
        </header>
        <div className={css.corpo}>{children}</div>
      </div>
    </div>
  );
}
