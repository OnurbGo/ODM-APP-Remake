import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import css from "./TrocaDeTela.module.css";
import { useReduzirAnimacoes } from "./useReduzirAnimacoes";

export type TipoTransicao = "portas" | "jornal" | "cartaz" | "nenhuma";

const DURACAO: Record<"portas" | "cartaz", number> = { portas: 760, cartaz: 980 };

/* Na metade, a tela de trás já está coberta e pode ser trocada. */
const MEIO = 0.5;

const LIMITE_JORNAL = 1200;

type Camada = { tipo: "portas" | "cartaz"; chave: number };

/* Jornal usa a View Transitions API: a imagem da tela antiga vira como página.
   Portas e cartaz cobrem a tela com elementos próprios, porque a API não divide a
   imagem da tela em duas folhas nem desenha nada por cima dela. */
export function useTrocaDeTela() {
  const reduzir = useReduzirAnimacoes();
  const [camada, definirCamada] = useState<Camada | null>(null);
  const ocupado = useRef(false);
  const timers = useRef<number[]>([]);
  const chave = useRef(0);
  const geracao = useRef(0);
  /* Uma troca pedida no meio de outra (um evento do servidor, por exemplo) não pode se perder:
     ela espera e entra sem animação assim que a atual terminar. */
  const pendentes = useRef<(() => void)[]>([]);

  useEffect(() => {
    const lista = timers.current;
    /* No StrictMode o efeito desmonta e monta de novo: sem soltar aqui, a tela ficaria presa. */
    return () => {
      lista.forEach(clearTimeout);
      ocupado.current = false;
    };
  }, []);

  const soltar = useCallback(() => {
    ocupado.current = false;
    const fila = pendentes.current;
    pendentes.current = [];
    fila.forEach((aplicar) => aplicar());
  }, []);

  const liberar = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    definirCamada(null);
    soltar();
  }, [soltar]);

  const trocar = useCallback(
    (tipo: TipoTransicao, aplicar: () => void) => {
      if (ocupado.current) {
        pendentes.current.push(aplicar);
        return;
      }
      if (reduzir || tipo === "nenhuma") {
        aplicar();
        return;
      }

      if (tipo === "jornal") {
        const raiz = document.documentElement;
        if (!document.startViewTransition || document.hidden) {
          aplicar();
          return;
        }
        ocupado.current = true;
        raiz.dataset.transicao = "jornal";
        let aplicada = false;
        const aplicarUmaVez = () => {
          if (aplicada) return;
          aplicada = true;
          flushSync(aplicar);
        };
        geracao.current += 1;
        const esta = geracao.current;
        /* Uma transição cancelada termina depois de a seguinte começar: só a atual pode limpar. */
        const concluir = () => {
          if (esta !== geracao.current) return;
          geracao.current += 1;
          delete raiz.dataset.transicao;
          soltar();
        };
        const transicao = document.startViewTransition(aplicarUmaVez);
        /* Cortar a transição rejeita "ready"; aqui isso é esperado, não um erro. */
        transicao.ready.catch(() => undefined);
        void transicao.finished.finally(concluir);
        /* Sem quadros (janela escondida no meio do caminho) a API não avança: a tela não pode
           ficar presa por causa de um enfeite. */
        timers.current.push(
          window.setTimeout(() => {
            aplicarUmaVez();
            transicao.skipTransition();
            concluir();
          }, LIMITE_JORNAL),
        );
        return;
      }

      ocupado.current = true;
      chave.current += 1;
      definirCamada({ tipo, chave: chave.current });
      const total = DURACAO[tipo];
      timers.current.push(window.setTimeout(aplicar, total * MEIO));
      timers.current.push(window.setTimeout(liberar, total));
    },
    [liberar, reduzir, soltar],
  );

  const elemento = useMemo(() => (camada ? <CamadaTransicao key={camada.chave} tipo={camada.tipo} /> : null), [camada]);

  return { trocar, camada: elemento };
}

function CamadaTransicao({ tipo }: { tipo: Camada["tipo"] }) {
  const estilo = { "--duracao": `${DURACAO[tipo]}ms` } as React.CSSProperties;
  if (tipo === "portas") {
    return (
      <div className={css.camada} style={estilo} aria-hidden="true">
        <div className={`${css.folha} ${css.esquerda}`} />
        <div className={`${css.folha} ${css.direita}`} />
      </div>
    );
  }
  return (
    <div className={css.camada} style={estilo} aria-hidden="true">
      <div className={css.parede} />
      <div className={css.cartaz}>
        <span className={css.prego} />
        <p className={css.procurado}>Procurado</p>
        <svg viewBox="0 0 120 110" className={css.retrato}>
          <path d="M8 58 C22 64 98 64 112 58 C104 56 96 52 92 44 L84 16 C81 8 70 8 64 13 C61 15 59 15 56 13 C50 8 39 8 36 16 L28 44 C24 52 16 56 8 58 Z" />
          <path d="M34 62 C34 84 46 92 60 92 C74 92 86 84 86 62 Z" />
          <path d="M18 110 C22 96 40 92 60 92 C80 92 98 96 102 110 Z" />
        </svg>
        <p className={css.recompensa}>Vivo ou morto</p>
        <p className={css.valor}>R$ 500</p>
      </div>
    </div>
  );
}
