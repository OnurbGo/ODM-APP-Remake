import type { MecanicaJogo21, Modificador } from "@odm/conteudo";
import { opcoesPadrao } from "@odm/protocolo";
import { describe, expect, it } from "vitest";
import type { AtaqueMontado } from "./combate/ataque";
import { lerMundo } from "./combate/contexto";
import { alcanceComMundo, deslocamentoDoMundo, estourou, faixaDo21, parcelasDoMundo, testeNaDisparada, totaisPossiveis, totalNo21, valorNo21 } from "./mundo";

/* Modificadores fictícios: o repositório é público. */
const mod = (id: string, nome: string, mecanica?: Record<string, unknown>): Modificador => ({ id, nome, tipo: "modificador", fonte: { arquivo: "x.md" }, texto: `${nome}.`, ...(mecanica ? { mecanica } : {}) });

const PACOTE = [
  mod("modificador.garoa", "Garoa", { testes: [{ pericia: "pericia.esgueirar", bonus: 2 }] }),
  mod("modificador.bruma", "Bruma", { passivos: [{ pericia: "pericia.olhar", bonus: -2 }] }),
  mod("modificador.ventania", "Ventania", {
    alcance_armas_de_fogo: { fator: 0.5, arredonda: "baixo", minimo: 1 },
    deslocamento: { menos_m: 1, so_acima_de_m: 1, campo_aberto: "marcado_pelo_mestre" },
  }),
  mod("modificador.gelo", "Gelo", { disparada: { teste: { pericia: "pericia.equilibrio", dt: 12 }, falha: { efeito: "efeito.no-chao" } } }),
  mod("modificador.so-texto", "Só texto"),
];

const ctx = (ligados: { id: string; campoAberto?: boolean }[]) => ({ mundo: lerMundo(PACOTE, { ...opcoesPadrao(), mundo: ligados.map((l) => ({ campoAberto: false, ...l })) }) });

const arma = (efetivo: number, maximo: number, armaDeFogo = true): AtaqueMontado => ({
  nome: "Arma",
  corpoACorpo: false,
  armaDeFogo,
  acerto: [],
  dano: { formula: "1d6", tipo: null, bonus: [] },
  inicio: false,
  combo: false,
  custoPa: 1,
  alcance: { efetivo, maximo, cone: false, ateOMaximo: null, foraDoMaximo: true, impactoPesado: false },
});

describe("modificadores de mundo", () => {
  it("só vale o que está ligado", () => {
    expect(parcelasDoMundo(ctx([]), "pericia.esgueirar", false)).toEqual([]);
    expect(parcelasDoMundo(ctx([{ id: "modificador.garoa" }]), "pericia.esgueirar", false)).toEqual([{ rotulo: "Garoa", valor: 2 }]);
  });

  it("teste ativo e passivo têm listas separadas", () => {
    const c = ctx([{ id: "modificador.garoa" }, { id: "modificador.bruma" }]);
    expect(parcelasDoMundo(c, "pericia.esgueirar", true)).toEqual([]);
    expect(parcelasDoMundo(c, "pericia.olhar", true)).toEqual([{ rotulo: "Bruma", valor: -2 }]);
    expect(parcelasDoMundo(c, "pericia.olhar", false)).toEqual([]);
    expect(parcelasDoMundo(c, null, false)).toEqual([]);
  });

  it("alcance das armas de fogo pela metade, para baixo, mínimo 1 (W1)", () => {
    const c = ctx([{ id: "modificador.ventania" }]);
    expect(alcanceComMundo(arma(5, 10), c).alcance).toMatchObject({ efetivo: 2, maximo: 5 });
    expect(alcanceComMundo(arma(1, 1), c).alcance).toMatchObject({ efetivo: 1, maximo: 1 });
    expect(alcanceComMundo(arma(5, 10, false), c).alcance).toMatchObject({ efetivo: 5, maximo: 10 });
    expect(alcanceComMundo(arma(5, 10), ctx([])).alcance).toMatchObject({ efetivo: 5 });
  });

  it("deslocamento só com campo aberto marcado", () => {
    expect(deslocamentoDoMundo(ctx([{ id: "modificador.ventania" }]))).toBeNull();
    expect(deslocamentoDoMundo(ctx([{ id: "modificador.ventania", campoAberto: true }]))).toEqual({ valor: 1, acimaDe: 1, motivo: "Ventania (campo aberto)" });
  });

  it("Disparada pede o teste quando a carta tem a regra", () => {
    expect(testeNaDisparada(ctx([]))).toBeNull();
    expect(testeNaDisparada(ctx([{ id: "modificador.gelo" }]))).toEqual({ nome: "Gelo", periciaId: "pericia.equilibrio", dt: 12, efeitoId: "efeito.no-chao" });
  });

  it("carta sem mecânica ou fora do pacote não quebra", () => {
    const c = ctx([{ id: "modificador.so-texto" }, { id: "modificador.nao-existe" }]);
    expect(c.mundo.map((m) => [m.id, m.mecanica])).toEqual([["modificador.so-texto", null]]);
  });
});

describe("Jogo do 21", () => {
  const faixas: MecanicaJogo21 = {
    baralho: { cartas: 52, coringas: false },
    cartas_iniciais: 2,
    alvo: 21,
    faixas: [
      { de: 2, ate: 11, resultado: "ruim", rotulo: "Ruim" },
      { de: 12, ate: 20, resultado: "bom", rotulo: "Bom" },
      { de: 21, ate: 21, resultado: "top", rotulo: "Top" },
      { de: 22, ate: null, resultado: "estouro", rotulo: "Estouro" },
    ],
  };
  const c = (...valores: string[]) => valores.map((valor) => ({ valor }) as { valor: "A" });

  it("valores das cartas", () => {
    expect([valorNo21({ valor: "7" }), valorNo21({ valor: "K" }), valorNo21({ valor: "A" })]).toEqual([7, 10, 1]);
  });

  it("o jogador escolhe quantos Ases valem 11", () => {
    expect(totaisPossiveis(c("A", "A", "9"))).toEqual([
      { asesComo11: 0, total: 11 },
      { asesComo11: 1, total: 21 },
      { asesComo11: 2, total: 31 },
    ]);
    expect(totalNo21(c("A", "K"), 1)).toBe(21);
  });

  it("estoura só se nem com os Ases valendo 1 cabe", () => {
    expect(estourou(c("K", "Q", "A"))).toBe(false);
    expect(estourou(c("K", "Q", "2"))).toBe(true);
  });

  it("faixas da tabela", () => {
    expect(faixaDo21(11, faixas)?.resultado).toBe("ruim");
    expect(faixaDo21(21, faixas)?.resultado).toBe("top");
    expect(faixaDo21(25, faixas)?.resultado).toBe("estouro");
  });
});
