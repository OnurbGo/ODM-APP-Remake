import type { ItemCatalogo, MecanicaEspolios, Municao } from "@odm/conteudo";
import { describe, expect, it } from "vitest";
import { lugarDoEspolio, sugerirEspolio } from "./espolios";

/* Dados fictícios: dois lugares, três categorias e um catálogo pequeno. */
const mec: MecanicaEspolios = {
  categorias: [
    { id: "armas", nome: "Armas", departamentos: ["Pistolas"] },
    { id: "comida", nome: "Comida", departamentos: ["Enlatados"] },
    { id: "joias", nome: "Joias", departamentos: [] },
    { id: "balas", nome: "Balas", departamentos: [], municoes: true },
  ],
  faixas: {
    ruim: { raridades: ["Comum"], sem_raridade: "metade_mais_barata", nota: "quebrado" },
    comum: { raridades: ["Comum"], sem_raridade: "todos" },
    bom: { raridades: ["Incomum", "Raro"], sem_raridade: "metade_mais_cara" },
    excepcional: { raridades: ["Extraordinário"], sem_raridade: "quinto_mais_caro" },
    estouro: { raridades: [], nada: true, nota: "nada" },
  },
  lugares: [
    { nome: "Qualquer lugar", pesos: { armas: 1, comida: 1, joias: 1, balas: 1 } },
    { nome: "Arsenal", pesos: { armas: 1, comida: 0, joias: 0, balas: 0 } },
    { nome: "Despensa", pesos: { armas: 0, comida: 1, joias: 0, balas: 0 } },
    { nome: "Joalheria", pesos: { armas: 0, comida: 0, joias: 1, balas: 0 } },
  ],
};

const arma = (id: string, raridade: string | undefined, preco: string): ItemCatalogo =>
  ({ id, tipo: "item", nome: id, departamento: "Pistolas", preco, campos: raridade ? { Raridade: raridade } : {}, texto: "", fonte: { arquivo: "x.md" } }) as unknown as ItemCatalogo;
const lata = (id: string, preco: string): ItemCatalogo =>
  ({ id, tipo: "item", nome: id, departamento: "Enlatados", preco, campos: {}, texto: "", fonte: { arquivo: "x.md" } }) as unknown as ItemCatalogo;
const catalogo = {
  itens: [arma("comum", "Comum", "R$ 10"), arma("incomum", "Incomum", "R$ 50"), arma("extra", "Extraordinário", "R$ 900"), lata("barata", "R$ 1"), lata("media", "R$ 5"), lata("cara", "R$ 30")],
  municoes: [] as Municao[],
};
/* Sempre o primeiro: o sorteio vira escolha determinada. */
const primeiro = (minimo: number) => minimo;

describe("sugerir espólio", () => {
  it("o lugar casa pelo nome, sem acento nem caixa; sem casar, vale o primeiro", () => {
    expect(lugarDoEspolio(mec, "  arsenal ").nome).toBe("Arsenal");
    expect(lugarDoEspolio(mec, "Baú da gangue").nome).toBe("Qualquer lugar");
  });

  it("a faixa escolhe a raridade dentro da categoria do lugar", () => {
    const comum = sugerirEspolio(mec, "Arsenal", "comum", catalogo, primeiro);
    expect(comum).toMatchObject({ nada: false, categoria: { id: "armas" }, item: { id: "comum" } });
    expect(sugerirEspolio(mec, "Arsenal", "bom", catalogo, primeiro)).toMatchObject({ item: { id: "incomum" } });
    expect(sugerirEspolio(mec, "Arsenal", "excepcional", catalogo, primeiro)).toMatchObject({ item: { id: "extra" } });
  });

  it("sem raridade, a faixa vale pelo preço; o ruim traz a nota", () => {
    expect(sugerirEspolio(mec, "Despensa", "ruim", catalogo, primeiro)).toMatchObject({ item: { id: "barata" }, nota: "quebrado" });
    expect(sugerirEspolio(mec, "Despensa", "excepcional", catalogo, primeiro)).toMatchObject({ item: { id: "cara" } });
  });

  it("estouro não sugere nada; categoria sem catálogo pede para o mestre descrever", () => {
    expect(sugerirEspolio(mec, "Arsenal", "estouro", catalogo, primeiro)).toEqual({ nada: true, nota: "nada" });
    expect(sugerirEspolio(mec, "Joalheria", "bom", catalogo, primeiro)).toMatchObject({ nada: false, categoria: { id: "joias" }, item: null });
  });

  it("o peso decide a categoria", () => {
    const vistas = new Set<string>();
    for (let r = 1; r <= 4; r++) {
      const s = sugerirEspolio(mec, "Qualquer lugar", "comum", catalogo, (minimo, maximo) => (maximo === 4 ? r : minimo));
      if (!s.nada) vistas.add(s.categoria.id);
    }
    expect([...vistas].sort()).toEqual(["armas", "balas", "comida", "joias"]);
  });
});
