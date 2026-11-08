import { MecanicaVenda, type EntradaDeLoja, type ItemCatalogo, type Municao } from "@odm/conteudo";
import type { LinhaDeLoja } from "@odm/protocolo";

/* Comércio (Mestre, 09-comercio.md; comercio-mecanica.yml). Decisões de 07/11/2026: C1 (item que falta fica
   como texto, sem preço), C2 (o valor inicial é o caixa), arma sem Raridade conta como comum, "itens de
   raridade raro ou inferior" são todos os equipamentos, e "qualquer um que esteja no estoque" é o catálogo inteiro. */

/* "1.000,00" → 1000; "R$ 35" → 35. Centavos caem (o app guarda reais inteiros). */
export function precoEmReais(texto: string | null | undefined): number | null {
  if (!texto) return null;
  const m = texto.replace(/R\$/g, "").trim().match(/^([\d.]+)(?:,(\d+))?$/);
  return m ? Number(m[1]!.replaceAll(".", "")) : null;
}

const RARIDADES = ["comum", "incomum", "raro", "extraordinario"];
const nivelDeRaridade = (r: string | undefined) => {
  const i = RARIDADES.indexOf((r ?? "comum").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim());
  return i < 0 ? 0 : i;
};

const corpoACorpo = (i: ItemCatalogo) => /^corpo a corpo/i.test(i.campos.Alcance ?? "");

/* Munição comum (as que o livro chama de "normais"): as outras são especiais. */
const MUNICAO_NORMAL = new Set(["municao.municoes.curta", "municao.municoes.media", "municao.municoes.longa", "municao.municoes.flecha-comum"]);

type Catalogo = { itens: readonly ItemCatalogo[]; municoes: readonly Municao[] };

/* Monta as linhas da loja a partir da entrada do livro. "novoId" dá o id de cada linha. */
export function linhasDaLoja(entrada: EntradaDeLoja, catalogo: Catalogo, novoId: () => string): LinhaDeLoja[] {
  const porId = new Map<string, { id: string; nome: string; preco: string | null }>([...catalogo.itens, ...catalogo.municoes].map((i) => [i.id, i]));
  const linhas = new Map<string, LinhaDeLoja>();
  const somar = (itemId: string, quantidade: number | null) => {
    const item = porId.get(itemId);
    if (!item) return;
    const ja = linhas.get(itemId);
    const q = ja && ja.quantidade !== null && quantidade !== null ? Math.max(ja.quantidade, quantidade) : quantidade === null || ja?.quantidade === null ? null : quantidade;
    linhas.set(itemId, { id: ja?.id ?? novoId(), itemId, nome: item.nome, preco: precoEmReais(item.preco), quantidade: q });
  };
  const textos: LinhaDeLoja[] = [];
  for (const e of entrada.estoque) {
    const { item, texto } = e as { item?: unknown; texto?: unknown };
    if (typeof item === "string") somar(item, e.quantidade);
    else if (typeof texto === "string") textos.push({ id: novoId(), itemId: null, nome: texto, preco: null, quantidade: e.quantidade });
  }
  for (const g of entrada.grupos) {
    const lista = catalogo.itens.filter((i) => {
      switch (g.grupo) {
        case "armas_a_distancia":
          return i.categoria === "arma" && !corpoACorpo(i) && nivelDeRaridade(i.campos.Raridade) <= nivelDeRaridade(g.raridade_ate);
        case "armas_corpo_a_corpo":
          return i.categoria === "arma" && corpoACorpo(i) && g.departamentos.includes(i.departamento ?? "");
        case "equipamentos":
          return i.categoria === "equipamento";
        case "departamento":
          return i.departamento === g.departamento;
      }
    });
    for (const i of lista) somar(i.id, g.quantidade);
  }
  if (entrada.catalogo_inteiro) {
    for (const i of catalogo.itens) somar(i.id, null);
    for (const m of catalogo.municoes) somar(m.id, MUNICAO_NORMAL.has(m.id) ? entrada.catalogo_inteiro.municao_normal : entrada.catalogo_inteiro.municao_especial);
  }
  return [...linhas.values(), ...textos];
}

/* Venda ao mercador: a fração (50%) do total vendido, arredondada para baixo uma vez só (V1, 07/11/2026):
   2 munições de R$ 35 dão R$ 35. Nulo sem a regra aprovada ou sem preço. */
export function valorDeVenda(precoDoCatalogo: number | null, regra: { mecanica?: Record<string, unknown> } | undefined, quantidade = 1): number | null {
  const lida = MecanicaVenda.safeParse(regra?.mecanica);
  if (!lida.success || precoDoCatalogo === null) return null;
  return Math.floor(precoDoCatalogo * quantidade * lida.data.venda_ao_mercador);
}
