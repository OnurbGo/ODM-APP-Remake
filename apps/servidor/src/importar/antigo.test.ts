import type { ItemCatalogo, Municao } from "@odm/conteudo";
import { describe, expect, it } from "vitest";
import { converterExportacao } from "./antigo";

/* Exportação fictícia com a forma da do app antigo: nada aqui vem da campanha real. */
const exportacao = {
  campanhas: [{ name: "Vale Cinzento", description: "Uma vila no fim do mundo." }],
  missoes: [
    {
      id: 7,
      title: "Chegada",
      description: "O grupo chega à vila.",
      objectives_json: JSON.stringify(["• Achar a ponte.", "• Falar com o guarda."]),
      rewards_json: JSON.stringify(["Um lugar para dormir."]),
      status: "ACTIVE",
      is_visible_to_players: 1,
    },
  ],
  linha_do_tempo: [
    { id: 2, mission_id: 7, title: "Depois", description: "", tags_json: '["discovery"]', occurred_at: "2026-01-02", is_visible_to_players: 0 },
    { id: 1, mission_id: 7, title: "Antes", description: "", tags_json: '["journey"]', occurred_at: "2026-01-01", is_visible_to_players: 1 },
  ],
  npcs: [{ id: 3, name: "Xerife Fulanone", affiliation: "Vila", summary: "Chefe.", public_notes: "Bigode enorme.", secret_notes: null, is_visible_to_players: 1 }],
  fichas_npc: [{ npc_id: 3, sheet_json: JSON.stringify({ challengeRating: 2, hitPoints: 20, attributes: { brutalidade: 1 }, actions: [{ name: "Soco", description: "+2, 1 de dano." }] }) }],
  npcs_pre: [
    { slug: "xerife-fulanone", name: "Xerife Fulanone", payload_json: JSON.stringify({ narrative: { name: "Xerife Fulanone" } }) },
    { slug: "ana", name: "Ana", payload_json: JSON.stringify({ narrative: { name: "Ana", affiliation: "Vila", summary: "Ferreira." } }) },
  ],
  lojas: [{ id: 9, name: "Armazém", cash_balance_cents: 150000, is_visible_to_players: 1 }],
  estoque: [
    { merchant_id: 9, quantity: 2, unit_price_cents: 4500, snapshot_json: JSON.stringify({ name: "Corda" }) },
    { merchant_id: 9, quantity: 1, unit_price_cents: 0, snapshot_json: JSON.stringify({ name: "Espada Torta", payload: { data: { price: 700 } } }) },
    { merchant_id: 9, quantity: 30, unit_price_cents: 2000, snapshot_json: JSON.stringify({ name: "Munição Bala" }) },
  ],
  servicos: [{ merchant_id: 9, name: "Pernoite", description: "", price_cents: 500, is_active: 1 }],
  lojas_pre: [
    { slug: "armazem", name: "Armazém", payload_json: JSON.stringify({ name: "Armazém", cashBalanceCents: 1, stockLines: [], services: [] }) },
    { slug: "bazar", name: "Bazar", payload_json: JSON.stringify({ name: "Bazar", cashBalanceCents: 100000, stockLines: [{ quantity: 3, unitPriceCents: 1000, snapshot: { name: "Bala" } }], services: [] }) },
  ],
  personagens: [{ name: "Não importa" }],
  modelos_missao: [{ slug: "x" }],
};

const catalogo = {
  itens: [{ id: "item.e.corda", nome: "Corda", preco: "50,00" } as ItemCatalogo],
  municoes: [{ id: "municao.municoes.bala", nome: "Bala", preco: "20,00" } as Municao],
};

let n = 0;
const importar = () => converterExportacao(exportacao, catalogo, () => `id${++n}`, { "Xerife Fulanone": "Xerife Fulano" });
const dos = <T extends string>(r: ReturnType<typeof importar>, tipo: T) => r.cadastros.filter((c) => c.cadastro.tipo === tipo).map((c) => c.cadastro as Extract<(typeof r.cadastros)[number]["cadastro"], { tipo: T }>);

describe("importação do app antigo", () => {
  it("conta o que entra e deixa de fora o personagem e os modelos", () => {
    const r = importar();
    expect(r.resumo).toEqual({ nota: 1, missao: 1, marco: 2, npc: 2, loja: 2 });
    expect(r.nomeOriginal).toBe("Vale Cinzento");
  });

  it("missão: descrição no Início, objetivos sem o marcador, recompensa no Desfecho oculto", () => {
    const [m] = dos(importar(), "missao");
    expect(m!.dados.etapas.inicio).toEqual({ jogadores: "O grupo chega à vila.", mestre: "", visivel: true });
    expect(m!.dados.objetivos.map((o) => o.texto)).toEqual(["Achar a ponte.", "Falar com o guarda."]);
    expect(m!.dados.etapas.desfecho).toMatchObject({ jogadores: "Um lugar para dormir.", visivel: false });
    expect(m!.dados.situacao).toBe("ativa");
  });

  it("marcos na ordem em que aconteceram, ligados à missão, com as marcas traduzidas", () => {
    const r = importar();
    const missaoId = r.cadastros.find((c) => c.cadastro.tipo === "missao")!.id;
    const marcos = dos(r, "marco").map((m) => m.dados);
    expect(marcos.map((m) => [m.titulo, m.ordem, m.missaoId, m.tags[0], m.visivel])).toEqual([
      ["Antes", 0, missaoId, "viagem", true],
      ["Depois", 1, missaoId, "descoberta", false],
    ]);
  });

  it("NPC com o nome do livro (I2), sem repetir, e a ficha antiga como texto nas notas", () => {
    const npcs = dos(importar(), "npc").map((c) => c.dados);
    expect(npcs.map((x) => x.nome)).toEqual(["Xerife Fulano", "Ana"]);
    expect(npcs[0]).toMatchObject({ resumo: "Bigode enorme.", visivel: true });
    expect(npcs[0]!.notas).toContain("Ficha do app antigo");
    expect(npcs[0]!.notas).toContain("Soco");
    expect(npcs[1]!.visivel).toBe(false);
  });

  it("lojas: casa pelo nome, preço do app antigo e, com 0, o do item (I1); a repetida não duplica", () => {
    const r = importar();
    const lojas = dos(r, "loja").map((c) => c.dados);
    expect(lojas.map((l) => l.nome)).toEqual(["Armazém", "Bazar"]);
    const [armazem, bazar] = lojas;
    expect(armazem).toMatchObject({ caixa: 1500, aberta: true });
    expect(armazem!.itens.map((l) => [l.nome, l.itemId, l.preco, l.quantidade])).toEqual([
      ["Corda", "item.e.corda", 45, 2],
      ["Espada Torta", null, 700, 1],
      ["Munição Bala", "municao.municoes.bala", 20, 30],
    ]);
    expect(armazem!.servicos[0]).toMatchObject({ nome: "Pernoite", preco: 5 });
    expect(bazar!.itens[0]).toMatchObject({ itemId: "municao.municoes.bala", preco: 10 });
    expect(r.naoCasados).toEqual(["Armazém: Espada Torta"]);
  });
});
