import type { Ameaca, Criatura, Efeito, Regra, Tabela } from "@odm/conteudo";
import { criarContextoCombate, type ContextoCombate } from "@odm/regras";
import { useEffect, useMemo } from "react";
import { create } from "zustand";
import { tokenDaSessao, useLoja } from "./loja";

/* Bestiário, efeitos e regras de combate: só o mestre baixa, da máquina dele (especificação 3.1). */
export type ConteudoMestre = { criaturas: Criatura[]; ameacas: Ameaca[]; efeitos: Efeito[]; regras: Regra[]; tabelas: Tabela[] };

type Estado = { situacao: "parado" | "carregando" | "pronto" | "falhou"; conteudo: ConteudoMestre | null; mesaId: string | null };

const useConteudo = create<Estado>(() => ({ situacao: "parado", conteudo: null, mesaId: null }));

async function baixar(mesaId: string) {
  useConteudo.setState({ situacao: "carregando", conteudo: null, mesaId });
  try {
    const token = tokenDaSessao();
    const resposta = await fetch("/api/conteudo-mestre", { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!resposta.ok) throw new Error(String(resposta.status));
    useConteudo.setState({ situacao: "pronto", conteudo: (await resposta.json()) as ConteudoMestre });
  } catch {
    useConteudo.setState({ situacao: "falhou" });
  }
}

export type DoMestre =
  | { situacao: "carregando" }
  | { situacao: "falhou"; mensagem: string }
  | { situacao: "pronto"; conteudo: ConteudoMestre; ctx: ContextoCombate | null; faltando: string[] };

export function useConteudoMestre(): DoMestre {
  const { situacao, conteudo, mesaId } = useConteudo();
  const mesaAtual = useLoja((e) => e.mesa?.id ?? null);
  const opcoes = useLoja((e) => e.mesa?.opcoes);

  useEffect(() => {
    if (mesaAtual && (situacao === "parado" || mesaId !== mesaAtual)) void baixar(mesaAtual);
  }, [situacao, mesaId, mesaAtual]);

  return useMemo(() => {
    if (situacao === "falhou") return { situacao: "falhou", mensagem: "Não foi possível baixar o bestiário." };
    if (!conteudo || mesaId !== mesaAtual) return { situacao: "carregando" };
    const r = criarContextoCombate(conteudo, opcoes);
    return { situacao: "pronto", conteudo, ctx: r.ok ? r.contexto : null, faltando: r.ok ? [] : r.faltando };
  }, [situacao, conteudo, mesaId, mesaAtual, opcoes]);
}
