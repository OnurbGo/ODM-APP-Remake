import type { EfeitoDeServico } from "@odm/protocolo";

/* Serviço de loja com efeito ao pagar (decisão de 08/11/2026). */

export const EFEITO_VAZIO: EfeitoDeServico = { curaTotal: false, dadosDeVida: false, tiraExaustao: false, condicao: null, extraPorExaustao: 0 };

export const temEfeito = (e: EfeitoDeServico | null): e is EfeitoDeServico =>
  !!e && (e.curaTotal || e.dadosDeVida || e.tiraExaustao || !!e.condicao || e.extraPorExaustao > 0);

/* "Recupera todos os PV, todos os Dados de Vida e tira a Exaustão · Bem Nutrido". */
export function resumoDoEfeito(e: EfeitoDeServico | null, nomeDoEfeito: (id: string) => string): string {
  if (!temEfeito(e)) return "";
  const partes = [
    e.curaTotal ? "recupera todos os PV" : null,
    e.dadosDeVida ? "recupera os Dados de Vida" : null,
    e.tiraExaustao ? "tira toda a Exaustão" : null,
    e.condicao ? `recebe ${nomeDoEfeito(e.condicao)}` : null,
  ].filter(Boolean);
  const texto = partes.join(", ");
  const extra = e.extraPorExaustao ? `+ R$ ${e.extraPorExaustao.toLocaleString("pt-BR")} por nível de Exaustão` : "";
  return [texto && texto.charAt(0).toUpperCase() + texto.slice(1), extra].filter(Boolean).join(" · ");
}

export const precoComExaustao = (preco: number, e: EfeitoDeServico | null, exaustao: number) => preco + (e?.extraPorExaustao ?? 0) * exaustao;
