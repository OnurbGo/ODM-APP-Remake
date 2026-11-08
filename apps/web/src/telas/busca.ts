/* Texto para comparar numa busca: sem acento e em minúsculas ("revólver" acha "Revolver Lemat"). */
export function paraBusca(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR").trim();
}

/* Linha de loja: o nome e, se for munição do catálogo, a palavra "munição" (na loja ela se chama só "Curta", "Média"…). */
export function buscaDaLinha(linha: { nome: string; itemId: string | null }): string {
  return paraBusca(`${linha.nome} ${linha.itemId?.startsWith("municao.") ? "munição" : ""}`);
}
