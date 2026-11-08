import { criarContexto, type ConteudoFicha, type ContextoFicha } from "@odm/regras";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { tokenDaSessao, useLoja } from "./loja";

/* Baixado uma vez, quando alguém abre uma ficha: fora do pacote inicial do jogador. */
type EstadoConteudo = {
  situacao: "parado" | "carregando" | "pronto" | "falhou";
  conteudo: ConteudoFicha | null;
  /* Cada campanha tem os próprios pacotes ativos. */
  mesaId: string | null;
};

const useConteudo = create<EstadoConteudo>(() => ({ situacao: "parado", conteudo: null, mesaId: null }));

let tentativas = 0;

async function baixar(mesaId: string) {
  useConteudo.setState({ situacao: "carregando", conteudo: null, mesaId });
  try {
    const token = tokenDaSessao();
    const resposta = await fetch("/api/conteudo-ficha", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!resposta.ok) throw new Error(String(resposta.status));
    useConteudo.setState({ situacao: "pronto", conteudo: (await resposta.json()) as ConteudoFicha });
    tentativas = 0;
  } catch {
    useConteudo.setState({ situacao: "falhou" });
    /* O servidor pode estar reiniciando: tenta de novo algumas vezes, com espera crescente. */
    if (tentativas < 5) {
      tentativas += 1;
      setTimeout(() => {
        if (useConteudo.getState().situacao === "falhou" && useConteudo.getState().mesaId === mesaId) void baixar(mesaId);
      }, 1500 * tentativas);
    }
  }
}

export type EstadoDoContexto =
  | { situacao: "carregando" }
  | { situacao: "falhou"; mensagem: string }
  | { situacao: "pronto"; ctx: ContextoFicha; conteudo: ConteudoFicha };

export function useContextoFicha(): EstadoDoContexto {
  const { situacao, conteudo, mesaId } = useConteudo();
  const opcoes = useLoja((e) => e.mesa?.opcoes);
  const mesaAtual = useLoja((e) => e.mesa?.id ?? null);

  useEffect(() => {
    if (mesaAtual && (situacao === "parado" || mesaId !== mesaAtual)) void baixar(mesaAtual);
  }, [situacao, mesaId, mesaAtual]);

  return useMemo(() => {
    if (situacao === "falhou") return { situacao: "falhou", mensagem: "Não foi possível baixar o conteúdo do jogo." };
    if (!conteudo || !opcoes || mesaId !== mesaAtual) return { situacao: "carregando" };
    const r = criarContexto(conteudo, opcoes);
    if (!r.ok) return { situacao: "falhou", mensagem: `O pacote de conteúdo ainda não tem estas regras revisadas: ${r.faltando.join(", ")}.` };
    return { situacao: "pronto", ctx: r.contexto, conteudo };
  }, [situacao, conteudo, opcoes, mesaId, mesaAtual]);
}
