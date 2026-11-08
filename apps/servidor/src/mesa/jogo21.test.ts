import { Conteudo } from "@odm/conteudo";
import type { EventoCompleto } from "@odm/protocolo";
import { describe, expect, it } from "vitest";
import type { PersonagemBanco } from "../banco/repositorio";
import { Jogos21 } from "./jogo21";
import type { Espectador } from "./visibilidade";

/* Regra fictícia com a mesma forma da do livro. */
const regra = {
  id: "regra.o-jogo-do-21",
  tipo: "regra",
  nome: "Jogo",
  fonte: { arquivo: "x.md" },
  texto: "",
  mecanica: {
    baralho: { cartas: 52, coringas: false },
    cartas_iniciais: 2,
    alvo: 21,
    faixas: [
      { de: 2, ate: 16, resultado: "fraco", rotulo: "Fraco" },
      { de: 17, ate: 21, resultado: "forte", rotulo: "Forte" },
      { de: 22, ate: null, resultado: "estouro", rotulo: "Estouro" },
    ],
  },
};

const mestre: Espectador = { id: "m", papel: "mestre" };
const ana: Espectador = { id: "ana", papel: "jogador" };
const beto: Espectador = { id: "beto", papel: "jogador" };

function montar(comRegra = true) {
  const eventos: EventoCompleto[] = [];
  const conteudo = Conteudo.parse({ regras: comRegra ? [regra] : [] });
  const personagem = { id: "p1", participanteId: "ana", situacao: "ativo", ficha: { nome: "Inácia" } } as unknown as PersonagemBanco;
  /* Embaralhar sem trocar nada: o baralho sai na ordem de criarBaralho (2, 3, 4… de espadas). */
  const jogos = new Jogos21(
    {
      conteudo: () => conteudo,
      personagem: (id) => (id === "p1" ? personagem : undefined),
      registrar: (e) => eventos.push(e),
      novoEvento: (quem, corpo) => ({ id: String(eventos.length), autorId: quem.id, autorNome: null, criadoEm: "", ...corpo }) as EventoCompleto,
      enviar: () => undefined,
    },
    (_min, max) => max,
  );
  return { jogos, eventos };
}

describe("Jogo do 21", () => {
  it("sem a regra revisada, não abre", () => {
    const { jogos } = montar(false);
    expect(jogos.receber({ t: "jogo21_abrir", personagemId: "p1", local: "" }, mestre)).toEqual({ recusado: expect.stringContaining("revisado") });
  });

  it("só o mestre abre; começa com 2 cartas e só o dono vê", () => {
    const { jogos } = montar();
    expect(jogos.receber({ t: "jogo21_abrir", personagemId: "p1", local: "Baú" }, ana)).toEqual({ recusado: expect.any(String) });
    jogos.receber({ t: "jogo21_abrir", personagemId: "p1", local: "Baú" }, mestre);
    const [jogo] = jogos.listaPara(ana);
    expect(jogo!.cartas.map((c) => c.valor)).toEqual(["2", "3"]);
    expect(jogos.listaPara(beto)).toEqual([]);
    expect(jogos.listaPara(mestre)).toHaveLength(1);
  });

  it("compra até parar e registra o resultado", () => {
    const { jogos, eventos } = montar();
    jogos.receber({ t: "jogo21_abrir", personagemId: "p1", local: "" }, mestre);
    const id = jogos.listaPara(ana)[0]!.id;
    expect(jogos.receber({ t: "jogo21_comprar", jogoId: id }, beto)).toEqual({ recusado: expect.any(String) });
    jogos.receber({ t: "jogo21_comprar", jogoId: id }, ana);
    jogos.receber({ t: "jogo21_comprar", jogoId: id }, ana);
    expect(jogos.listaPara(ana)[0]!.cartas.map((c) => c.valor)).toEqual(["2", "3", "4", "5"]);
    jogos.receber({ t: "jogo21_parar", jogoId: id, asesComo11: 0 }, ana);
    expect(jogos.listaPara(ana)[0]).toMatchObject({ situacao: "parou", total: 14, faixa: { resultado: "fraco" } });
    expect(eventos.at(-1)).toMatchObject({ tipo: "jogo21", dados: { total: 14, rotulo: "parou em 14: Fraco" } });
    expect(jogos.receber({ t: "jogo21_comprar", jogoId: id }, ana)).toEqual({ recusado: "Esse jogo já terminou." });
  });

  it("estoura sozinho ao passar de 21", () => {
    const { jogos } = montar();
    jogos.receber({ t: "jogo21_abrir", personagemId: "p1", local: "" }, mestre);
    const id = jogos.listaPara(ana)[0]!.id;
    for (let i = 0; i < 5; i++) jogos.receber({ t: "jogo21_comprar", jogoId: id }, ana);
    expect(jogos.listaPara(ana)[0]).toMatchObject({ situacao: "estourou", total: 27, faixa: { resultado: "estouro" } });
  });

  it("fechar é só do mestre", () => {
    const { jogos } = montar();
    jogos.receber({ t: "jogo21_abrir", personagemId: "p1", local: "" }, mestre);
    const id = jogos.listaPara(ana)[0]!.id;
    expect(jogos.receber({ t: "jogo21_fechar", jogoId: id }, ana)).toEqual({ recusado: expect.any(String) });
    jogos.receber({ t: "jogo21_fechar", jogoId: id }, mestre);
    expect(jogos.listaPara(mestre)).toEqual([]);
  });
});
