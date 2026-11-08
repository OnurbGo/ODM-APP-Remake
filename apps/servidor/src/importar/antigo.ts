import type { ItemCatalogo, Municao } from "@odm/conteudo";
import { CadastroNovo, type DadosLoja, type DadosMarco, type DadosMissao, type DadosNota, type DadosNpc, type LinhaDeLoja } from "@odm/protocolo";
import { precoEmReais } from "@odm/regras";
import { z } from "zod";

/* Importação da exportação do ODM-App antigo (fase 6, etapa 12). Roda só no computador do mestre: o arquivo e
   o banco nunca entram no repositório. Decisões: I1 (preço do app antigo; com 0, o preço do item), I2 (nome do
   livro nos NPCs que mudaram de nome). Não entram: o personagem antigo, modelos de missão, gerador de caos e
   recursos de classe (plano aprovado, "Assumi" 5). */

const texto = z.string().nullable().optional();
const num = z.number().nullable().optional();
const json = <T extends z.ZodType>(esquema: T) =>
  z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return undefined;
    }
  }, esquema.optional());

const Linha = z.looseObject({ quantity: num, unitPriceCents: num, unit_price_cents: num, snapshot: z.unknown().optional(), snapshot_json: json(z.unknown()) });

const Exportacao = z.looseObject({
  campanhas: z.array(z.looseObject({ name: texto, description: texto })).default([]),
  missoes: z
    .array(z.looseObject({ id: z.number(), title: z.string(), description: texto, objectives_json: json(z.array(z.string())), rewards_json: json(z.array(z.string())), status: texto, is_visible_to_players: num }))
    .default([]),
  linha_do_tempo: z.array(z.looseObject({ id: z.number(), mission_id: num, title: z.string(), description: texto, tags_json: json(z.array(z.string())), occurred_at: texto, is_visible_to_players: num })).default([]),
  npcs: z.array(z.looseObject({ id: z.number(), name: z.string(), affiliation: texto, summary: texto, public_notes: texto, secret_notes: texto, is_visible_to_players: num })).default([]),
  fichas_npc: z.array(z.looseObject({ npc_id: z.number(), sheet_json: json(z.unknown()) })).default([]),
  npcs_pre: z.array(z.looseObject({ slug: z.string(), name: z.string(), payload_json: json(z.looseObject({ narrative: z.looseObject({}).optional(), npcSheet: z.unknown().optional() })) })).default([]),
  lojas: z.array(z.looseObject({ id: z.number(), name: z.string(), cash_balance_cents: num, is_visible_to_players: num })).default([]),
  estoque: z.array(Linha.extend({ merchant_id: z.number() })).default([]),
  servicos: z.array(z.looseObject({ merchant_id: z.number(), name: z.string(), description: texto, price_cents: num, is_active: num })).default([]),
  lojas_pre: z
    .array(z.looseObject({ slug: z.string(), name: z.string(), payload_json: json(z.looseObject({ name: texto, cashBalanceCents: num, stockLines: z.array(Linha).default([]), services: z.array(z.looseObject({ name: z.string(), description: texto, priceCents: num })).default([]) })) }))
    .default([]),
});

const TAGS: Record<string, string> = { journey: "viagem", discovery: "descoberta", npc_encounter: "encontro", milestone: "marco", combat: "combate" };
const SITUACAO: Record<string, DadosMissao["situacao"]> = { ACTIVE: "ativa", COMPLETED: "concluida", DONE: "concluida", FAILED: "falhou", DRAFT: "rascunho" };

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const reais = (centavos: number | null | undefined) => (typeof centavos === "number" ? Math.floor(centavos / 100) : null);
const juntar = (...partes: (string | null | undefined)[]) => partes.map((p) => p?.trim()).filter(Boolean).join("\n\n");

export type Importacao = {
  nomeOriginal: string;
  cadastros: { id: string; cadastro: CadastroNovo }[];
  naoCasados: string[];
  resumo: Record<string, number>;
};

type Catalogo = { itens: readonly ItemCatalogo[]; municoes: readonly Municao[] };

/* Ficha antiga de NPC → texto para as notas do mestre (as ações viram rolagem manual). */
function fichaComoTexto(ficha: unknown): string {
  const f = z
    .looseObject({
      challengeRating: z.unknown().optional(),
      hitPoints: z.unknown().optional(),
      attributes: z.record(z.string(), z.unknown()).optional(),
      actions: z.array(z.looseObject({ name: z.string(), description: texto })).optional(),
      abilities: z.array(z.looseObject({ name: texto, description: texto })).optional(),
    })
    .safeParse(ficha);
  if (!f.success) return "";
  const { challengeRating, hitPoints, attributes, actions, abilities } = f.data;
  const linhas = ["Ficha do app antigo:"];
  if (challengeRating !== undefined || hitPoints !== undefined) linhas.push(`ND ${String(challengeRating ?? "?")} · PV ${String(hitPoints ?? "?")}`);
  if (attributes) linhas.push(Object.entries(attributes).map(([k, v]) => `${k.charAt(0).toUpperCase()}${k.slice(1)} ${String(v)}`).join(", "));
  for (const a of actions ?? []) linhas.push(`- ${a.name}: ${a.description ?? ""}`);
  for (const h of abilities ?? []) if (h.name) linhas.push(`- ${h.name}: ${h.description ?? ""}`);
  return linhas.join("\n");
}

/* I2 (07/11/2026): o nome do livro nos NPCs que o app antigo grafava diferente. O mapa vem de fora
   (--nomes, um JSON {"nome antigo": "nome do livro"}), porque os nomes da campanha não entram no repositório. */
export function converterExportacao(entrada: unknown, catalogo: Catalogo, novoId: () => string, nomesDoLivro: Record<string, string> = {}): Importacao {
  const trocas = new Map(Object.entries(nomesDoLivro).map(([antigo, novo]) => [norm(antigo), novo]));
  const nomeDoLivro = (nome: string) => trocas.get(norm(nome)) ?? nome;
  const d = Exportacao.parse(entrada);
  const cadastros: Importacao["cadastros"] = [];
  const naoCasados: string[] = [];
  const add = (cadastro: CadastroNovo) => {
    const id = novoId();
    cadastros.push({ id, cadastro: CadastroNovo.parse({ ...cadastro, id }) });
    return id;
  };

  /* Sobre a campanha: a descrição antiga vira uma nota fixada. */
  const campanha = d.campanhas[0];
  if (campanha?.description) add({ tipo: "nota", dados: { titulo: `Sobre a campanha (${campanha.name ?? "app antigo"})`, texto: campanha.description, fixada: true } as DadosNota });

  /* Missões: descrição → Início; objetivos → lista; recompensas → Desfecho (oculto) e texto da recompensa. */
  const idDaMissao = new Map<number, string>();
  d.missoes.forEach((m, ordem) => {
    const visivel = !!m.is_visible_to_players;
    const recompensa = (m.rewards_json ?? []).join("\n");
    const vazia = { jogadores: "", mestre: "", visivel: false };
    const dados = {
      titulo: m.title,
      dificuldade: "moderada",
      situacao: SITUACAO[(m.status ?? "").toUpperCase()] ?? "ativa",
      visivel,
      ordem,
      etapas: { inicio: { jogadores: m.description ?? "", mestre: "", visivel }, investigacao: vazia, conflito: vazia, desfecho: { jogadores: recompensa, mestre: "", visivel: false } },
      objetivos: (m.objectives_json ?? []).map((o) => ({ texto: o.replace(/^[•\-\s]+/, "").trim(), feito: false, visivel: true })).filter((o) => o.texto),
      recompensas: { texto: recompensa, itens: [] },
      criaturas: [],
      npcs: [],
      entregue: false,
      notas: "Importada do app antigo. A dificuldade não existia lá: confira.",
    } as DadosMissao;
    idDaMissao.set(m.id, add({ tipo: "missao", dados }));
  });

  /* Linha do tempo: na ordem em que aconteceu. */
  [...d.linha_do_tempo]
    .sort((a, b) => (a.occurred_at ?? "").localeCompare(b.occurred_at ?? "") || a.id - b.id)
    .forEach((m, ordem) => {
      const dados = {
        titulo: m.title,
        descricao: m.description ?? "",
        ordem,
        missaoId: m.mission_id ? (idDaMissao.get(m.mission_id) ?? null) : null,
        tags: (m.tags_json ?? []).map((t) => TAGS[t] ?? t).slice(0, 10),
        visivel: !!m.is_visible_to_players,
        aconteceu: true,
      } as DadosMarco;
      add({ tipo: "marco", dados });
    });

  /* NPCs: os da campanha e os pré-cadastrados, sem repetir (pelo nome, já com o nome do livro). */
  const npcs = new Map<string, DadosNpc>();
  for (const n of d.npcs) {
    const ficha = d.fichas_npc.find((f) => f.npc_id === n.id)?.sheet_json;
    const nome = nomeDoLivro(n.name);
    npcs.set(norm(nome), {
      nome,
      afiliacao: n.affiliation ?? "",
      resumo: n.public_notes ?? "",
      notas: juntar(n.summary, n.secret_notes, fichaComoTexto(ficha)),
      visivel: !!n.is_visible_to_players,
    } as DadosNpc);
  }
  for (const p of d.npcs_pre) {
    const narr = z.looseObject({ name: texto, affiliation: texto, summary: texto, publicNotes: texto }).safeParse(p.payload_json?.narrative ?? {}).data ?? {};
    const nome = nomeDoLivro(narr.name ?? p.name);
    const atual = npcs.get(norm(nome));
    const ficha = fichaComoTexto(p.payload_json?.npcSheet);
    if (atual) {
      if (ficha && !atual.notas.includes("Ficha do app antigo")) atual.notas = juntar(atual.notas, ficha);
      continue;
    }
    npcs.set(norm(nome), { nome, afiliacao: narr.affiliation ?? "", resumo: narr.publicNotes ?? "", notas: juntar(narr.summary, ficha), visivel: false } as DadosNpc);
  }
  for (const dados of npcs.values()) add({ tipo: "npc", dados });

  /* Lojas: os itens casados pelo nome com o catálogo; o que não casa fica como linha escrita e vai para a lista. */
  const porNome = new Map<string, { id: string; preco: string | null }>([...catalogo.itens, ...catalogo.municoes].map((i) => [norm(i.nome), { id: i.id, preco: i.preco }]));
  const linhaDe = (l: z.infer<typeof Linha>, loja: string): LinhaDeLoja => {
    const snapshot = z.looseObject({ name: z.string().optional(), payload: z.unknown().optional() }).safeParse(l.snapshot ?? l.snapshot_json).data ?? {};
    const nome = snapshot.name ?? "Item sem nome";
    /* "Munição Curta" no app antigo é a "Curta" do catálogo. */
    const casado = porNome.get(norm(nome)) ?? porNome.get(norm(nome.replace(/^muni[çc][ãa]o\s+/i, "")));
    if (!casado) naoCasados.push(`${loja}: ${nome}`);
    /* I1: o preço do app antigo; com 0, o preço do próprio item (no app antigo ou no catálogo). */
    let preco = reais(l.unitPriceCents ?? l.unit_price_cents);
    if (!preco) {
      const doItem = JSON.stringify(snapshot.payload ?? {}).match(/"price"\s*:\s*(\d+(?:\.\d+)?)/);
      preco = doItem ? Math.floor(Number(doItem[1])) : precoEmReais(casado?.preco);
    }
    return { id: novoId(), itemId: casado?.id ?? null, nome, preco: preco ?? null, quantidade: l.quantity ?? null };
  };
  const lojas = new Map<string, DadosLoja>();
  for (const l of d.lojas) {
    lojas.set(norm(l.name), {
      nome: l.name,
      cidade: "",
      aberta: !!l.is_visible_to_players,
      caixa: reais(l.cash_balance_cents),
      itens: d.estoque.filter((e) => e.merchant_id === l.id).map((e) => linhaDe(e, l.name)),
      servicos: d.servicos.filter((s) => s.merchant_id === l.id && s.is_active !== 0).map((s) => ({ id: novoId(), nome: s.name, preco: reais(s.price_cents) ?? 0, descricao: s.description ?? "", efeito: null })),
      compraSoForaDoComum: false,
      notas: "Importada do app antigo.",
      origem: null,
    });
  }
  for (const p of d.lojas_pre) {
    const dados = p.payload_json;
    const nome = dados?.name ?? p.name;
    if (lojas.has(norm(nome)) || !dados) continue;
    lojas.set(norm(nome), {
      nome,
      cidade: "",
      aberta: false,
      caixa: reais(dados.cashBalanceCents),
      itens: dados.stockLines.map((l) => linhaDe(l, nome)),
      servicos: dados.services.map((s) => ({ id: novoId(), nome: s.name, preco: reais(s.priceCents) ?? 0, descricao: s.description ?? "", efeito: null })),
      compraSoForaDoComum: false,
      notas: "Importada do app antigo (pré-cadastrada).",
      origem: null,
    });
  }
  for (const dados of lojas.values()) add({ tipo: "loja", dados });

  const resumo: Record<string, number> = {};
  for (const { cadastro } of cadastros) resumo[cadastro.tipo] = (resumo[cadastro.tipo] ?? 0) + 1;
  return { nomeOriginal: campanha?.name ?? "", cadastros, naoCasados, resumo };
}
