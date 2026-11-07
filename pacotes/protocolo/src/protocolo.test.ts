import { describe, expect, it } from "vitest";
import { ATRIBUTOS, MensagemCliente, PedidoTeste, RespostaTeste, VERSAO_PROTOCOLO } from "./index";

/* O pedido aponta para o personagem: um jogador pode controlar dois. */
const personagens = [{ personagemId: "pe1" }, { personagemId: "pe2", dt: 12, bonus: 2, modo: "vantagem" as const }];
const pericia = { alvo: "pericia" as const, periciaId: "pericia.exemplo" };

describe("PedidoTeste", () => {
  it("aceita teste de habilidade com atributo ou perícia, e a DT começa invisível", () => {
    const comAtributo = PedidoTeste.parse({
      id: "p1",
      tipo: "habilidade",
      teste: { alvo: "atributo", atributo: "intelecto" },
      dt: 15,
      personagens,
    });
    const comPericia = PedidoTeste.parse({ id: "p2", tipo: "habilidade", teste: pericia, dt: 20, personagens });
    expect(comAtributo.tipo === "habilidade" && comAtributo.dtVisivel).toBe(false);
    expect(comPericia.tipo).toBe("habilidade");
  });

  it("aceita teste de resistência com atributo e DT", () => {
    const pedido = PedidoTeste.parse({ id: "p3", tipo: "resistencia", atributo: "fibra", dt: 13, dtVisivel: true, personagens });
    expect(pedido.tipo === "resistencia" && pedido.dtVisivel).toBe(true);
  });

  it("teste passivo não tem como ficar visível", () => {
    const pedido = PedidoTeste.parse({ id: "p4", tipo: "passivo", teste: pericia, dt: 14, dtVisivel: true, personagens });
    expect(pedido).not.toHaveProperty("dtVisivel");
  });

  it("aceita teste contestado contra uma criatura", () => {
    const pedido = PedidoTeste.parse({
      id: "p5",
      tipo: "contestado",
      teste: { alvo: "pericia", periciaId: "pericia.outra" },
      oponente: { nome: "Criatura de exemplo", teste: pericia, bonus: 3 },
      personagens,
    });
    expect(pedido.tipo === "contestado" && pedido.oponenteVisivel).toBe(false);
  });

  it("guarda o ajuste de cada personagem e preenche os padrões", () => {
    const pedido = PedidoTeste.parse({ id: "p6", tipo: "resistencia", atributo: "agilidade", dt: 15, personagens });
    expect(pedido.personagens).toEqual([
      { personagemId: "pe1", bonus: 0, modo: "normal" },
      { personagemId: "pe2", dt: 12, bonus: 2, modo: "vantagem" },
    ]);
  });

  it("aceita DT fora dos degraus da escala do livro", () => {
    expect(PedidoTeste.safeParse({ id: "p7", tipo: "resistencia", atributo: "fibra", dt: 13, personagens }).success).toBe(true);
  });

  it("recusa pedido sem personagens, tipo desconhecido e atributo que não existe", () => {
    expect(PedidoTeste.safeParse({ id: "x", tipo: "resistencia", atributo: "fibra", dt: 10, personagens: [] }).success).toBe(false);
    expect(PedidoTeste.safeParse({ id: "x", tipo: "sorte", atributo: "fibra", dt: 10, personagens }).success).toBe(false);
    expect(PedidoTeste.safeParse({ id: "x", tipo: "resistencia", atributo: "forca", dt: 10, personagens }).success).toBe(false);
  });
});

describe("RespostaTeste", () => {
  it("rola por padrão e aceita as opções cautelosas", () => {
    expect(RespostaTeste.parse({ pedidoId: "p1", personagemId: "pe1" }).opcao).toBe("rolar");
    for (const opcao of ["fazer_com_calma", "tentar_ate_conseguir"]) {
      expect(RespostaTeste.safeParse({ pedidoId: "p1", personagemId: "pe1", opcao }).success).toBe(true);
    }
  });

  it("Forçar a Rolagem não é opção do pop-up: vem depois da falha, por mensagem própria", () => {
    expect(RespostaTeste.safeParse({ pedidoId: "p1", personagemId: "pe1", opcao: "forcar_rolagem" }).success).toBe(false);
    expect(MensagemCliente.safeParse({ t: "forcar_rolagem", resultadoId: "r1" }).success).toBe(true);
  });

  it("a resposta é de um personagem", () => {
    expect(RespostaTeste.safeParse({ pedidoId: "p1" }).success).toBe(false);
  });
});

describe("MensagemCliente", () => {
  it("o cliente não tem como enviar o resultado do dado", () => {
    const lida = MensagemCliente.parse({ t: "rolar", natural: 20, total: 99, bonus: 1 });
    expect(lida).toEqual({ t: "rolar", bonus: 1 });
  });

  it("normaliza o código da mesa e recusa tamanho errado", () => {
    expect(MensagemCliente.parse({ t: "pedir_entrada", nome: " Ana ", codigo: "abc234" })).toEqual({
      t: "pedir_entrada",
      nome: "Ana",
      codigo: "ABC234",
    });
    expect(MensagemCliente.safeParse({ t: "pedir_entrada", nome: "Ana", codigo: "ABC" }).success).toBe(false);
  });

  it("aceita o olá de cada credencial", () => {
    for (const credencial of [
      { tipo: "visitante" },
      { tipo: "jogador", tokens: ["t".repeat(43)] },
      { tipo: "pedido", pedidoId: "p", segredo: "s".repeat(43) },
    ]) {
      expect(MensagemCliente.safeParse({ t: "ola", versao: VERSAO_PROTOCOLO, credencial }).success).toBe(true);
    }
  });
});

describe("atributos", () => {
  it("seguem a ordem dos livros", () => {
    expect(ATRIBUTOS).toEqual(["brutalidade", "agilidade", "fibra", "intelecto", "astucia", "presenca"]);
  });
});
