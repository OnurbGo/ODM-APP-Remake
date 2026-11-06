import { criarContexto, type ConteudoFicha, type ContextoFicha } from "@odm/regras";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { tokenDaSessao, useLoja } from "./loja";

/* Baixado uma vez, quando alguém abre uma ficha: fora do pacote inicial do jogador. */
type EstadoConteudo = {
  situacao: "parado" | "carregando" | "pronto" | "falhou";
  conteudo: ConteudoFicha | null;
};

const useConteudo = create<EstadoConteudo>(() => ({ situacao: "parado", conteudo: null }));

async function baixar() {
  useConteudo.setState({ situacao: "carregando" });
  try {
    const token = tokenDaSessao();
    const resposta = await fetch("/api/conteudo-ficha", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!resposta.ok) throw new Error(String(resposta.status));
    useConteudo.setState({ situacao: "pronto", conteudo: (await resposta.json()) as ConteudoFicha });
  } catch {
    useConteudo.setState({ situacao: "falhou" });
  }
}

export type EstadoDoContexto =
  | { situacao: "carregando" }
  | { situacao: "falhou"; mensagem: string }
  | { situacao: "pronto"; ctx: ContextoFicha; conteudo: ConteudoFicha };

export function useContextoFicha(): EstadoDoContexto {
  const { situacao, conteudo } = useConteudo();
  const opcoes = useLoja((e) => e.mesa?.opcoes);

  useEffect(() => {
    if (situacao === "parado") void baixar();
  }, [situacao]);

  return useMemo(() => {
    if (situacao === "falhou") return { situacao: "falhou", mensagem: "Não foi possível baixar o conteúdo do jogo." };
    if (!conteudo || !opcoes) return { situacao: "carregando" };
    const r = criarContexto(conteudo, opcoes);
    if (!r.ok) return { situacao: "falhou", mensagem: `O pacote de conteúdo ainda não tem estas regras revisadas: ${r.faltando.join(", ")}.` };
    return { situacao: "pronto", ctx: r.contexto, conteudo };
  }, [situacao, conteudo, opcoes]);
}
