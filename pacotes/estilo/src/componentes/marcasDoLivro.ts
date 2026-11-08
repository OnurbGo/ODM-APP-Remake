/* Leitura do Markdown dos livros (negrito, itálico, listas e títulos) para os textos mostrados no app.
   Fica de propósito pequena: o texto sai em linhas, sem HTML, e as marcas viram trechos com estilo. */

export type Trecho = { texto: string; negrito?: boolean; italico?: boolean };
export type Linha = { trechos: Trecho[]; item?: boolean; titulo?: boolean };
/* Um bloco é um parágrafo do livro: linhas separadas por uma quebra simples. */
export type Bloco = Linha[];

/* **negrito**, *itálico* e _itálico_ dentro de uma linha. */
const MARCA = /\*\*(.+?)\*\*|\*(?!\s)(.+?)\*|(?<![\p{L}\d])_(?!\s)(.+?)_(?![\p{L}\d])/gu;

export function trechosDaLinha(linha: string): Trecho[] {
  const trechos: Trecho[] = [];
  let ultimo = 0;
  for (const m of linha.matchAll(MARCA)) {
    if (m.index > ultimo) trechos.push({ texto: linha.slice(ultimo, m.index) });
    if (m[1] !== undefined) trechos.push(...trechosDaLinha(m[1]).map((t) => ({ ...t, negrito: true })));
    else trechos.push({ texto: m[2] ?? m[3] ?? "", italico: true });
    ultimo = m.index + m[0].length;
  }
  if (ultimo < linha.length) trechos.push({ texto: linha.slice(ultimo) });
  return trechos.filter((t) => t.texto);
}

export function blocosDoTexto(texto: string): Bloco[] {
  return texto
    .replace(/\r\n?/g, "\n")
    .replace(/\s*\{\.[\w-]+\}/g, "") /* atributos do Markdown estendido, como {.tagline} */
    .split(/\n\s*\n/)
    .map((paragrafo) =>
      paragrafo
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .map((l): Linha => {
          const item = /^[-*•]\s+/.exec(l);
          if (item) return { item: true, trechos: trechosDaLinha(l.slice(item[0].length)) };
          const titulo = /^#{1,6}\s+/.exec(l);
          if (titulo) return { titulo: true, trechos: trechosDaLinha(l.slice(titulo[0].length)) };
          return { trechos: trechosDaLinha(l) };
        }),
    )
    .filter((b) => b.length);
}

/* O texto sem as marcas, para busca, título de dica ou leitor de tela. */
export function textoSemMarcas(texto: string): string {
  return blocosDoTexto(texto)
    .map((b) => b.map((l) => (l.item ? "• " : "") + l.trechos.map((t) => t.texto).join("")).join("\n"))
    .join("\n\n");
}
