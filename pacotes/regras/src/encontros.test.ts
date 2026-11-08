import { describe, expect, it } from "vitest";
import type { Tabela } from "@odm/conteudo";
import { avaliarEncontro, conferirPartes, dividirRecompensa, partesDePorcentagem, partesIguais, ehLendaria, lerRegrasEncontro, numeroDaTabela, valorGerado, xpDaCriatura, xpDaMissao, type LinhaDoEncontro } from "./encontros";

/* Tabelas e números fictícios: o repositório é público e não leva as tabelas dos livros. */
const tabela = (id: string, linhas: string[][]): Tabela => ({ id, nome: id, tipo: "tabela", fonte: { arquivo: "x.md" }, texto: "", cabecalho: [], linhas });

const dificuldade = tabela("tabela.dif", [
  ["1", "10", "20", "30", "40"],
  ["2", "20", "40", "60", "80"],
  ["3", "1 000", "2 000", "3 000", "4 000"],
]);
const porNd = tabela("tabela.nd", [
  ["0", "1", "5", "1.500"],
  ["1/2", "5", "6", "2.000"],
]);
const valor = tabela("tabela.valor", [["1", "R$ 7", "R$ 14", "R$ 21", "R$ 28"]]);

const montando = {
  tabela: "tabela.dif",
  xp_por_nd: "tabela.nd",
  grupo_base: 4,
  multiplicador: { por_jogador: 0.25, livro: { "3": 0.75, "5": 1.25, "6": 1.5 } },
  nivel_medio: { arredonda: "baixo", minimo: 1, maximo: 3 },
  grau: "maior_coluna_alcancada",
  abaixo_de_facil: "abaixo_de_facil",
  mais_inimigos_que_personagens: { sobe: 1, teto: "morte_certa" },
  elite: "xp_do_nd_elite_quando_indicado",
};
const xpDeMissao = { tabela: "tabela.dif", fracao_da_coluna: 0.5, multiplicador_do_grupo: true, dinheiro_sugerido: "tabela.valor", dinheiro_com_multiplicador: true };

const regras = (comMissao = false) =>
  lerRegrasEncontro({
    regras: [{ id: "regra.montando-encontros", mecanica: montando }, ...(comMissao ? [{ id: "regra.xp-de-missao", mecanica: xpDeMissao }] : [])],
    tabelas: [dificuldade, porNd, valor],
  });

const linha = (quantidade: number, xp: number | null, lendaria = false): LinhaDoEncontro => ({ nome: "Bicho", quantidade, xp, lendaria });

describe("números das tabelas", () => {
  it.each([
    ["1 600", 1600],
    ["5.000", 5000],
    ["R$ 1 200", 1200],
    ["40", 40],
    ["", null],
    ["—", null],
  ])("%s vira %s", (texto, numero) => expect(numeroDaTabela(texto)).toBe(numero));
});

describe("XP da criatura", () => {
  it("usa o XP da ficha; na Elite com ND próprio, o XP desse ND", () => {
    const r = regras();
    expect(xpDaCriatura({ xp: 12, nd: "1/2", ndElite: "5" }, false, r)).toEqual({ xp: 12, origem: "ficha" });
    expect(xpDaCriatura({ xp: 12, nd: "1/2", ndElite: "5" }, true, r)).toEqual({ xp: 1500, origem: "nd_elite" });
    expect(xpDaCriatura({ xp: 12, nd: "1/2", ndElite: null }, true, r)).toEqual({ xp: 12, origem: "ficha" });
  });

  it("sem XP na ficha, usa o ND; sem nada, avisa", () => {
    const r = regras();
    expect(xpDaCriatura({ xp: null, nd: "6", ndElite: null }, false, r)).toEqual({ xp: 2000, origem: "nd" });
    expect(xpDaCriatura({ xp: null, nd: null }, false, r)).toEqual({ xp: null, origem: "sem_xp" });
    expect(xpDaCriatura({ xp: 12, nd: "1/2" }, false, r, 99)).toEqual({ xp: 99, origem: "mestre" });
  });

  it("reconhece a lendária pela categoria", () => {
    expect(ehLendaria({ tipo: "criatura", categoria: "Criatura sobrenatural, Lendário (Vila)" })).toBe(true);
    expect(ehLendaria({ tipo: "criatura", categoria: "Morto-vivo, Hostil" })).toBe(false);
    expect(ehLendaria({ tipo: "ameaca", categoria: "Humano, Pistoleiro Lendário" })).toBe(false);
  });
});

describe("montando encontros", () => {
  it("grupo de 4: a maior coluna alcançada", () => {
    const r = regras();
    expect(avaliarEncontro([linha(2, 10)], [1, 1, 1, 1], r).grau).toBe("moderada");
    expect(avaliarEncontro([linha(3, 10)], [1, 1, 1, 1], r).grau).toBe("dificil");
    expect(avaliarEncontro([linha(1, 40)], [1, 1, 1, 1], r).grau).toBe("morte_certa");
  });

  it("abaixo da coluna Fácil (E2)", () => {
    const a = avaliarEncontro([linha(1, 9)], [1, 1, 1, 1], regras());
    expect(a.grau).toBe("abaixo_de_facil");
  });

  it("mais inimigos que personagens sobe um grau, com teto em Morte certa", () => {
    const r = regras();
    const cinco = avaliarEncontro([linha(5, 3)], [1, 1, 1, 1], r);
    expect(cinco.grauDaTabela).toBe("facil");
    expect(cinco.grau).toBe("moderada");
    expect(cinco.subiuPorNumero).toBe(true);
    expect(avaliarEncontro([linha(5, 1)], [1, 1, 1, 1], r).grau).toBe("facil");
    expect(avaliarEncontro([linha(5, 10)], [1, 1, 1, 1], r).grau).toBe("morte_certa");
  });

  it("multiplicadores do livro e 0,25 por jogador nos outros tamanhos (E1)", () => {
    const r = regras();
    expect(avaliarEncontro([linha(1, 20)], [1, 1, 1], r).limites).toEqual({ facil: 7.5, moderada: 15, dificil: 22.5, morte_certa: 30 });
    expect(avaliarEncontro([linha(1, 20)], [1, 1], r).multiplicador).toBe(0.5);
    expect(avaliarEncontro([linha(1, 20)], [1], r).multiplicador).toBe(0.25);
    expect(avaliarEncontro([linha(1, 20)], [1, 1, 1, 1, 1, 1, 1], r).multiplicador).toBe(1.75);
  });

  it("nível médio para baixo, dentro da tabela (E3)", () => {
    const r = regras();
    expect(avaliarEncontro([linha(1, 10)], [2, 3, 3], r).nivel).toBe(2);
    expect(avaliarEncontro([linha(1, 10)], [9, 9, 9, 9], r).nivel).toBe(3);
  });

  it("lendárias ficam fora da conta e do número de inimigos", () => {
    const a = avaliarEncontro([linha(1, 10), linha(1, 99999, true)], [1, 1, 1, 1], regras());
    expect(a.xpTotal).toBe(10);
    expect(a.inimigos).toBe(1);
    expect(a.lendarias).toEqual(["Bicho"]);
  });

  it("sem a regra aprovada: só o XP somado, sem grau", () => {
    const r = lerRegrasEncontro({ regras: [], tabelas: [dificuldade, porNd] });
    const a = avaliarEncontro([linha(2, 10)], [1, 1, 1, 1], r);
    expect(a.xpTotal).toBe(20);
    expect(a.grau).toBeNull();
  });

  it("mostra a conta passo a passo", () => {
    const a = avaliarEncontro([linha(5, 3)], [1, 1, 1, 1], regras());
    expect(a.conta[0]).toBe("XP das criaturas: 5 × 3 = 15");
    expect(a.conta.at(-1)).toContain("sobe para Moderada");
  });
});

describe("recompensas", () => {
  it("divide para baixo e a sobra some (E5)", () => {
    expect(dividirRecompensa(100, 3)).toEqual({ parte: 33, sobra: 1 });
    expect(dividirRecompensa(10, 0)).toEqual({ parte: 0, sobra: 10 });
  });

  it("XP de missão e valor gerado só com a regra, com o multiplicador do grupo (M1)", () => {
    expect(xpDaMissao("moderada", 1, 4, regras())).toBeNull();
    expect(xpDaMissao("moderada", 1, 4, regras(true))).toBe(10);
    expect(xpDaMissao("moderada", 1, 3, regras(true))).toBe(7);
    expect(xpDaMissao("moderada", 1, 6, regras(true))).toBe(15);
    expect(valorGerado("dificil", 1, 4, regras(true))).toBe(21);
    expect(valorGerado("dificil", 1, 3, regras(true))).toBe(15);
  });

  it("dividir de outro jeito: começa igual e precisa fechar o total", () => {
    expect(partesIguais(100, 3)).toEqual([33, 33, 33]);
    expect(conferirPartes([33, 33, 33], 99)).toMatchObject({ fecha: true, falta: 0 });
    expect(conferirPartes([50, 30, 10], 99)).toMatchObject({ fecha: false, falta: 9, sobra: 0 });
    expect(conferirPartes([60, 30, 10], 99)).toMatchObject({ fecha: false, falta: 0, sobra: 1 });
    expect(partesDePorcentagem([50, 25, 25], 99)).toEqual([49, 24, 26]);
    expect(partesDePorcentagem([50, 25], 100)).toEqual([50, 25]);
  });
});
