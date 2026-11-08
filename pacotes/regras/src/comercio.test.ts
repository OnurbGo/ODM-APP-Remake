import type { ItemCatalogo, Municao } from "@odm/conteudo";
import type { FichaDados } from "@odm/protocolo";
import { describe, expect, it } from "vitest";
import { linhasDaLoja, precoEmReais, valorDeVenda } from "./comercio";
import { aplicarOperacao } from "./ficha/operacoes";

/* Catálogo fictício: o repositório é público. */
const item = (id: string, nome: string, categoria: ItemCatalogo["categoria"], departamento: string, preco: string | null, campos: Record<string, string> = {}): ItemCatalogo =>
  ({ id, nome, tipo: "item", categoria, departamento, preco, campos, texto: "", fonte: { arquivo: "x.md" } }) as ItemCatalogo;
const municao = (id: string, nome: string, preco: string): Municao => ({ id, nome, tipo: "municao", departamento: "Munições", grupo: null, preco, campos: {}, texto: "", fonte: { arquivo: "x.md" } });

const itens = [
  item("item.a.estilingue", "Estilingue", "arma", "Armas Simples", "30,00", { Alcance: "10 Metros" }),
  item("item.a.garrucha", "Garrucha", "arma", "Pistolas", "1.000,00", { Alcance: "8 Metros", Raridade: "Raro" }),
  item("item.a.canhao", "Canhão de mão", "arma", "Especiais", "9.000,00", { Alcance: "30 Metros", Raridade: "Extraordinário" }),
  item("item.a.porrete", "Porrete", "arma", "Armas Simples", "15,00", { Alcance: "Corpo a corpo (1 M)" }),
  item("item.a.espada", "Espada", "arma", "Armas Marciais", "200,00", { Alcance: "Corpo a corpo (1 M)" }),
  item("item.e.corda", "Corda", "equipamento", "Equipamentos", "5,00"),
];
const municoes = [municao("municao.municoes.curta", "Curta", "20,00"), municao("municao.municoes.chumbo-raro", "Chumbo raro", "80,00")];
let n = 0;
const novoId = () => `l${++n}`;

describe("comércio", () => {
  it("preço do catálogo em reais", () => {
    expect([precoEmReais("1.000,00"), precoEmReais("35"), precoEmReais("R$ 7.000"), precoEmReais(null), precoEmReais("Depende")]).toEqual([1000, 35, 7000, null, null]);
  });

  it("monta o estoque: itens, texto sem preço, grupos e munição", () => {
    const linhas = linhasDaLoja(
      {
        nome: "Vila",
        caixa: 100,
        servicos: [],
        estoque: [
          { item: "item.e.corda", quantidade: 3 },
          { texto: "Bomba que falta", quantidade: 2 },
          { item: "municao.municoes.curta", quantidade: 30 },
        ],
        grupos: [
          { grupo: "armas_a_distancia", raridade_ate: "Raro", quantidade: 5 },
          { grupo: "armas_corpo_a_corpo", departamentos: ["Armas Simples"], quantidade: 2 },
        ],
      },
      { itens, municoes },
      novoId,
    );
    const resumo = linhas.map((l) => [l.nome, l.preco, l.quantidade]);
    expect(resumo).toContainEqual(["Corda", 5, 3]);
    expect(resumo).toContainEqual(["Bomba que falta", null, 2]);
    expect(resumo).toContainEqual(["Curta", 20, 30]);
    /* Sem Raridade escrita conta como comum e entra; Extraordinário passa de Raro. */
    expect(resumo).toContainEqual(["Estilingue", 30, 5]);
    expect(resumo).toContainEqual(["Garrucha", 1000, 5]);
    expect(resumo.some((r) => r[0] === "Canhão de mão")).toBe(false);
    expect(resumo).toContainEqual(["Porrete", 15, 2]);
    expect(resumo.some((r) => r[0] === "Espada")).toBe(false);
  });

  it("catálogo inteiro: itens sem limite e munição normal e especial", () => {
    const linhas = linhasDaLoja({ nome: "Porto", caixa: 10, estoque: [], grupos: [], servicos: [], catalogo_inteiro: { municao_normal: 300, municao_especial: 20 } }, { itens, municoes }, novoId);
    expect(linhas).toHaveLength(itens.length + municoes.length);
    expect(linhas.find((l) => l.nome === "Espada")?.quantidade).toBeNull();
    expect(linhas.find((l) => l.nome === "Curta")?.quantidade).toBe(300);
    expect(linhas.find((l) => l.nome === "Chumbo raro")?.quantidade).toBe(20);
  });

  it("venda pela metade do total, para baixo uma vez só (V1), só com a regra", () => {
    const regra = { mecanica: { venda_ao_mercador: 0.5, arredonda: "baixo" } };
    expect(valorDeVenda(35, regra)).toBe(17);
    expect(valorDeVenda(35, regra, 2)).toBe(35);
    expect(valorDeVenda(35, undefined)).toBeNull();
    expect(valorDeVenda(null, regra)).toBeNull();
  });

  it("a transação mexe no dinheiro e no inventário e se desfaz por inteiro", () => {
    const ficha = { dinheiro: 100, inventario: [{ id: "b", itemId: "item.e.corda", nome: "Corda", quantidade: 3, equipado: false, pesoKg: null }] } as unknown as FichaDados;
    const compra = aplicarOperacao(ficha, {
      op: "transacao",
      rotulo: "x",
      dinheiro: -40,
      entra: [{ id: "a", itemId: null, nome: "Faca", quantidade: 1, equipado: false, pesoKg: null }],
      sai: [{ id: "b", itemId: "item.e.corda", nome: "Corda", quantidade: 2, equipado: false, pesoKg: null }],
      loja: { lojaId: "l", caixa: 40, estoque: [{ linhaId: "x", delta: -1 }] },
    });
    expect(compra.ficha.dinheiro).toBe(60);
    expect(compra.ficha.inventario.map((i) => [i.nome, i.quantidade])).toEqual([
      ["Corda", 1],
      ["Faca", 1],
    ]);
    expect(compra.inversa).toMatchObject({ dinheiro: 40, loja: { caixa: -40, estoque: [{ linhaId: "x", delta: 1 }] } });
    const volta = aplicarOperacao(compra.ficha, compra.inversa);
    expect(volta.ficha.dinheiro).toBe(100);
    expect(volta.ficha.inventario.map((i) => [i.nome, i.quantidade])).toEqual([["Corda", 3]]);
  });
});
