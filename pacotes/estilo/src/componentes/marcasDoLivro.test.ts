import { describe, expect, it } from "vitest";
import { blocosDoTexto, textoSemMarcas, trechosDaLinha } from "./marcasDoLivro";

describe("texto dos livros", () => {
  it("separa negrito e itálico", () => {
    expect(trechosDaLinha("**Perícias:** Furtividade e *Astúcia*")).toEqual([
      { texto: "Perícias:", negrito: true },
      { texto: " Furtividade e " },
      { texto: "Astúcia", italico: true },
    ]);
  });

  it("não confunde multiplicação nem sublinhado no meio da palavra com marca", () => {
    expect(trechosDaLinha("5 + (5 × Fibra) * 2 kg")).toEqual([{ texto: "5 + (5 × Fibra) * 2 kg" }]);
    expect(trechosDaLinha("arquivo_de_teste")).toEqual([{ texto: "arquivo_de_teste" }]);
  });

  it("monta parágrafos, listas e títulos e tira os atributos {.x}", () => {
    const blocos = blocosDoTexto("*Item raro* {.tagline}\n\nTexto.\n- um\n- **dois**\n\n## Título");
    expect(blocos).toHaveLength(3);
    expect(blocos[0]).toEqual([{ trechos: [{ texto: "Item raro", italico: true }] }]);
    expect(blocos[1]![1]).toEqual({ item: true, trechos: [{ texto: "um" }] });
    expect(blocos[1]![2]).toEqual({ item: true, trechos: [{ texto: "dois", negrito: true }] });
    expect(blocos[2]![0]).toEqual({ titulo: true, trechos: [{ texto: "Título" }] });
  });

  it("dá o texto limpo", () => {
    expect(textoSemMarcas("**A:** b\n- c")).toBe("A: b\n• c");
  });
});
