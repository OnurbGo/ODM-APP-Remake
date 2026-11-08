import type { ItemCatalogo, MecanicaEspolios, Municao } from "@odm/conteudo";
import { precoEmReais } from "./comercio";
import type { Aleatorio } from "./dados";

/* "Sugerir item" do Jogo do 21 (Mestre, "Categorias de Espólio"; lote 11, 08/11/2026). O lugar dá o peso de
   cada categoria; a faixa do 21 dá a raridade. Arma sem raridade escrita conta como comum (C2); nos itens sem
   raridade, a faixa vale pelo preço dentro da categoria. É só sugestão: o mestre entrega ou pede outra. */

export type SugestaoDeEspolio =
  | { nada: true; nota: string }
  | { nada: false; lugar: string; categoria: { id: string; nome: string }; item: { id: string; nome: string; raridade: string | null } | null; nota: string | null };

type Catalogo = { itens: readonly ItemCatalogo[]; municoes: readonly Municao[] };
type Candidato = { id: string; nome: string; raridade: string | null; preco: number | null };

const normal = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/* O lugar pelo nome que o mestre escreveu em "Onde"; sem casar, vale o primeiro (Qualquer lugar). */
export function lugarDoEspolio(mec: MecanicaEspolios, onde: string) {
  const alvo = normal(onde);
  return (alvo ? mec.lugares.find((l) => normal(l.nome) === alvo) : undefined) ?? mec.lugares[0]!;
}

function sortearPorPeso<T>(opcoes: readonly { valor: T; peso: number }[], aleatorio: Aleatorio): T | null {
  const total = opcoes.reduce((s, o) => s + o.peso, 0);
  if (total <= 0) return null;
  let r = aleatorio(1, total);
  for (const o of opcoes) {
    r -= o.peso;
    if (r <= 0) return o.valor;
  }
  return opcoes.at(-1)!.valor;
}

function porPreco(itens: Candidato[], parte: NonNullable<MecanicaEspolios["faixas"][string]["sem_raridade"]>): Candidato[] {
  if (parte === "todos" || itens.length < 2) return itens;
  const ordem = [...itens].sort((a, b) => (a.preco ?? 0) - (b.preco ?? 0));
  const metade = Math.ceil(ordem.length / 2);
  if (parte === "metade_mais_barata") return ordem.slice(0, metade);
  if (parte === "metade_mais_cara") return ordem.slice(ordem.length - metade);
  return ordem.slice(ordem.length - Math.max(1, Math.ceil(ordem.length / 5)));
}

export function sugerirEspolio(mec: MecanicaEspolios, onde: string, resultado: string, catalogo: Catalogo, aleatorio: Aleatorio): SugestaoDeEspolio {
  const faixa = mec.faixas[resultado];
  if (!faixa || faixa.nada) return { nada: true, nota: faixa?.nota ?? "Nenhum item." };
  const lugar = lugarDoEspolio(mec, onde);
  const categoria = sortearPorPeso(
    mec.categorias.map((c) => ({ valor: c, peso: lugar.pesos[c.id] ?? 0 })),
    aleatorio,
  );
  if (!categoria) return { nada: true, nota: `${lugar.nome} não tem categoria com chance.` };
  const base = { nada: false as const, lugar: lugar.nome, categoria: { id: categoria.id, nome: categoria.nome } };

  const departamentos = new Set(categoria.departamentos.map(normal));
  const candidatos: Candidato[] = [
    ...catalogo.itens.filter((i) => departamentos.has(normal(i.departamento ?? ""))).map((i) => ({ id: i.id, nome: i.nome, raridade: i.campos.Raridade?.trim() || null, preco: precoEmReais(i.preco) })),
    ...(categoria.municoes ? catalogo.municoes.map((m) => ({ id: m.id, nome: m.nome, raridade: null, preco: precoEmReais(m.preco) })) : []),
  ];
  if (!candidatos.length) return { ...base, item: null, nota: "O catálogo não tem itens desta categoria: descreva o que encontraram." };

  const raridades = new Set(faixa.raridades.map(normal));
  const comRaridade = candidatos.filter((c) => c.raridade && raridades.has(normal(c.raridade)));
  const semRaridade = porPreco(
    candidatos.filter((c) => !c.raridade),
    faixa.sem_raridade ?? "todos",
  );
  /* Sem raridade conta como comum: entra direto só se a faixa aceita comum, senão pela parte do preço. */
  const elegiveis = [...comRaridade, ...(raridades.has("comum") || faixa.sem_raridade ? semRaridade : [])];
  const lista = elegiveis.length ? elegiveis : candidatos;
  const item = lista[aleatorio(0, lista.length - 1)]!;
  const notas = [faixa.nota ?? null, elegiveis.length ? null : "Nenhum item desta faixa na categoria: sorteado entre todos."].filter(Boolean);
  return { ...base, item: { id: item.id, nome: item.nome, raridade: item.raridade }, nota: notas.length ? notas.join(" ") : null };
}
