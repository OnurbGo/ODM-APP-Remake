import { Cadastro, type CadastroDe } from "@odm/protocolo";
import { describe, expect, it } from "vitest";
import { cadastrosParaJogador } from "./cadastros";

const em = "2026-11-07T00:00:00.000Z";

const missao = (id: string, dados: Record<string, unknown>) => Cadastro.parse({ id, tipo: "missao", atualizadoEm: em, dados: { titulo: `Missão ${id}`, ...dados } }) as CadastroDe<"missao">;
const marco = (id: string, dados: Record<string, unknown>) => Cadastro.parse({ id, tipo: "marco", atualizadoEm: em, dados: { titulo: `Marco ${id}`, ...dados } });

const segredo = "SEGREDO-DO-MESTRE";

describe("cadastros para o jogador", () => {
  const todos = [
    missao("visivel", {
      visivel: true,
      situacao: "ativa",
      notas: segredo,
      criaturas: ["criatura.oculta"],
      etapas: {
        inicio: { jogadores: "O sino tocou à meia-noite.", mestre: segredo, visivel: true },
        investigacao: { jogadores: segredo, mestre: segredo, visivel: false },
        conflito: { jogadores: segredo, mestre: "", visivel: false },
        desfecho: { jogadores: segredo, mestre: "", visivel: false },
      },
      objetivos: [
        { texto: "Achar o sineiro", visivel: true },
        { texto: segredo, visivel: false },
      ],
      recompensas: { texto: segredo, itens: [{ itemId: null, nome: segredo, quantidade: 1 }] },
    }),
    missao("rascunho", { visivel: true, situacao: "rascunho" }),
    missao("oculta", { visivel: false, situacao: "ativa" }),
    marco("aconteceu", { visivel: true, aconteceu: true, missaoId: "oculta" }),
    marco("ligado", { visivel: true, aconteceu: true, missaoId: "visivel" }),
    marco("futuro", { visivel: true, aconteceu: false }),
    marco("escondido", { visivel: false, aconteceu: true }),
    Cadastro.parse({ id: "enc", tipo: "encontro", atualizadoEm: em, dados: { nome: segredo, criaturas: [] } }),
    Cadastro.parse({ id: "lend", tipo: "lendaria", atualizadoEm: em, dados: { ref: "criatura.x", pistas: [{ texto: segredo }] } }),
  ];

  it("nada só do mestre sai", () => {
    const saida = cadastrosParaJogador(todos);
    expect(JSON.stringify(saida)).not.toContain(segredo);
    expect(JSON.stringify(saida)).not.toContain("criatura.oculta");
  });

  it("só missão visível e fora de rascunho; só marco visível que aconteceu", () => {
    const saida = cadastrosParaJogador(todos);
    expect(saida.map((c) => c.id).sort()).toEqual(["aconteceu", "ligado", "visivel"]);
  });

  it("etapa visível chega sem as notas; objetivo oculto some", () => {
    const m = cadastrosParaJogador(todos).find((c) => c.id === "visivel") as CadastroDe<"missao">;
    expect(m.dados.etapas.inicio).toEqual({ jogadores: "O sino tocou à meia-noite.", mestre: "", visivel: true });
    expect(m.dados.objetivos.map((o) => o.texto)).toEqual(["Achar o sineiro"]);
  });

  it("marco ligado a missão oculta não revela a ligação", () => {
    const saida = cadastrosParaJogador(todos);
    expect(saida.find((c) => c.id === "aconteceu")).toMatchObject({ dados: { missaoId: null } });
    expect(saida.find((c) => c.id === "ligado")).toMatchObject({ dados: { missaoId: "visivel" } });
  });

  it("NPC visível só com o que o jogador pode saber; nota nunca; diário só visível", () => {
    const npc = Cadastro.parse({
      id: "npc",
      tipo: "npc",
      atualizadoEm: em,
      dados: { nome: "Carlinhos", resumo: "Armeiro", objetivo: segredo, segredo, traco: segredo, notas: segredo, ref: "ameaca.capanga", visivel: true },
    });
    const oculto = Cadastro.parse({ id: "npc2", tipo: "npc", atualizadoEm: em, dados: { nome: segredo } });
    const nota = Cadastro.parse({ id: "nota", tipo: "nota", atualizadoEm: em, dados: { titulo: segredo, texto: segredo } });
    const diarios = [
      Cadastro.parse({ id: "d1", tipo: "diario", atualizadoEm: em, dados: { sessao: 1, texto: "Chegamos à vila.", visivel: true } }),
      Cadastro.parse({ id: "d2", tipo: "diario", atualizadoEm: em, dados: { sessao: 2, texto: segredo } }),
    ];
    const saida = cadastrosParaJogador([npc, oculto, nota, ...diarios]);
    expect(saida.map((c) => c.id).sort()).toEqual(["d1", "npc"]);
    expect(JSON.stringify(saida)).not.toContain(segredo);
    expect(JSON.stringify(saida)).not.toContain("ameaca.capanga");
  });

  it("a recompensa aparece com o Desfecho visível", () => {
    const com = missao("fim", { visivel: true, situacao: "concluida", etapas: { inicio: {}, investigacao: {}, conflito: {}, desfecho: { jogadores: "Fim", visivel: true } }, recompensas: { texto: "Uma medalha" } });
    expect((cadastrosParaJogador([com])[0] as CadastroDe<"missao">).dados.recompensas.texto).toBe("Uma medalha");
  });
});
