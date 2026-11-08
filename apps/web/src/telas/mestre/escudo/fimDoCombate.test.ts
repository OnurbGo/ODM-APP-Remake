import type { Criatura } from "@odm/conteudo";
import { lerRegrasEncontro } from "@odm/regras";
import { describe, expect, it } from "vitest";
import { combateCom, combatente } from "../../../../../../pacotes/regras/src/combate/exemplo";
import { gruposDoCombate } from "./fimDoCombate";

/* Fichas fictícias: o repositório é público. */
const ficha = (id: string, nome: string, xp: number): Criatura =>
  ({ id, nome, tipo: "criatura", xp, nd: null, ndElite: null, categoria: null }) as unknown as Criatura;
const fichas = new Map([
  ["criatura.rato", ficha("criatura.rato", "Rato", 10)],
  ["criatura.morto", ficha("criatura.morto", "Morto", 30)],
]);
const regras = lerRegrasEncontro({ regras: [], tabelas: [] });

describe("fim do combate", () => {
  it("agrupa por ficha e conta os derrotados", () => {
    const combate = combateCom([
      combatente("p", { tipo: "personagem", personagemId: "p" }),
      combatente("r1", { tipo: "criatura", ref: "criatura.rato", derrotado: true }),
      combatente("r2", { tipo: "criatura", ref: "criatura.rato" }),
      combatente("r3", { tipo: "criatura", ref: "criatura.rato", elite: true, derrotado: true }),
    ]);
    const grupos = gruposDoCombate(combate, fichas, regras, []);
    expect(grupos.map((g) => [g.nome, g.elite, g.presentes, g.derrotados, g.iniciais, g.xp])).toEqual([
      ["Rato", false, 2, 1, 2, 10],
      ["Rato", true, 1, 1, 1, 10],
    ]);
  });

  it("os que saíram da Horda pelo dano contam pelo encontro montado", () => {
    const horda = combatente("h", {
      tipo: "criatura",
      ref: "criatura.morto",
      horda: { integrantes: [{ id: "m1", nome: "Morto 1", pv: 5, elite: false }, { id: "m2", nome: "Morto 2", pv: 5, elite: false }], pvInicial: 20, danoAcumulado: 10, naArea: [], pressaoNaRodada: [] },
    });
    const grupos = gruposDoCombate(combateCom([horda]), fichas, regras, [{ ref: "criatura.morto", elite: false, quantidade: 4, xp: 25 }]);
    expect(grupos).toEqual([expect.objectContaining({ nome: "Morto", presentes: 2, derrotados: 0, iniciais: 4, xp: 25 })]);
  });
});
