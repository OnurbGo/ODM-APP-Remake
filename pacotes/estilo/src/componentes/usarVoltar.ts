import { useEffect, useRef } from "react";

/* Voltar do celular (e do navegador): enquanto uma camada está aberta, o Voltar fecha a camada de cima em vez de sair
   da mesa; numa camada obrigatória, não faz nada. Achado do teste no celular de 07/11/2026: sem isto, o Voltar fechava
   a aba do Chrome com o pop-up de teste aberto.

   No Chrome do Android vale o CloseWatcher, feito para isto: entradas de histórico criadas sem toque do usuário (o
   pop-up abre por um evento do servidor) são puladas pelo Voltar. Onde ele não existe (Safari), uma entrada no histórico. */

type Vigia = { onclose: (() => void) | null; destroy: () => void };
type ComVigia = { CloseWatcher?: new () => Vigia };

const pilha: symbol[] = [];
const acoes = new Map<symbol, () => void>();
let ignorar = 0;
let ligado = false;

function aoVoltar() {
  if (ignorar > 0) {
    ignorar -= 1;
    return;
  }
  const topo = pilha.at(-1);
  if (topo) acoes.get(topo)?.();
}

export function usarVoltar(aberto: boolean, fechar: () => void, obrigatorio = false) {
  const aoFechar = useRef(fechar);
  aoFechar.current = fechar;
  const preso = useRef(obrigatorio);
  preso.current = obrigatorio;

  useEffect(() => {
    if (!aberto || typeof window === "undefined") return;
    const Vigia = (window as unknown as ComVigia).CloseWatcher;

    if (Vigia) {
      let vigia: Vigia | null = null;
      let ativo = true;
      /* Cada Voltar fecha um vigia: na obrigatória, outro é posto no lugar e a camada fica. */
      const vigiar = () => {
        vigia = new Vigia();
        vigia.onclose = () => {
          if (!ativo) return;
          if (preso.current) vigiar();
          else aoFechar.current();
        };
      };
      vigiar();
      return () => {
        ativo = false;
        vigia?.destroy();
      };
    }

    if (!ligado) {
      window.addEventListener("popstate", aoVoltar);
      ligado = true;
    }
    const eu = Symbol();
    let saiuPeloVoltar = false;
    pilha.push(eu);
    history.pushState({ odmCamada: true }, "");
    acoes.set(eu, () => {
      if (preso.current) {
        history.pushState({ odmCamada: true }, "");
        return;
      }
      saiuPeloVoltar = true;
      aoFechar.current();
    });
    return () => {
      acoes.delete(eu);
      pilha.splice(pilha.indexOf(eu), 1);
      /* Fechou sem o Voltar: tira a entrada que esta camada pôs no histórico. */
      if (!saiuPeloVoltar) {
        ignorar += 1;
        history.back();
      }
    };
  }, [aberto]);
}
