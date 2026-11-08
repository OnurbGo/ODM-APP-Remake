import { MecanicaItem, type Atributo } from "@odm/conteudo";
import type { ItemFicha } from "@odm/protocolo";
import { ataqueComArma, atributosDaArma, disparoDaArma, proficienciasDaFicha, type ContextoCombate } from "@odm/regras";
import type { FichaVista } from "../Blocos";
import { iconeDeMunicao, type IconeGenerico } from "./iconesGenericos";

/* Itens da ficha como a tela do personagem os mostra (protótipo aprovado na etapa 5). A categoria e a
   raridade são só para agrupar e colorir; as contas vêm do motor (ataqueComArma) e da ficha calculada. */

export type Categoria = "corpo_a_corpo" | "distancia" | "armadura" | "escudo" | "municao" | "explosivo" | "medico" | "comida" | "consumivel" | "roupa" | "ferramenta" | "geral";
export type Raridade = "comum" | "incomum" | "raro" | "extraordinario" | "unico";

export const CATEGORIAS: { id: Categoria | "tudo"; nome: string }[] = [
  { id: "tudo", nome: "Tudo" },
  { id: "corpo_a_corpo", nome: "Corpo a corpo" },
  { id: "distancia", nome: "À distância" },
  { id: "armadura", nome: "Armaduras" },
  { id: "escudo", nome: "Escudos" },
  { id: "municao", nome: "Munição" },
  { id: "explosivo", nome: "Explosivos" },
  { id: "medico", nome: "Médico" },
  { id: "comida", nome: "Comida" },
  { id: "consumivel", nome: "Tabaco e bebida" },
  { id: "roupa", nome: "Roupas" },
  { id: "ferramenta", nome: "Ferramentas" },
  { id: "geral", nome: "Outros" },
];

export type ItemVisto = {
  id: string;
  item: ItemFicha;
  nome: string;
  categoria: Categoria;
  /* O ícone genérico (sem arte no pacote): o da categoria, e a munição pelo tipo. */
  icone: IconeGenerico;
  raridade: Raridade;
  quantidade: number;
  pesoKg: number;
  equipado: boolean;
  texto: string;
  equipavel: boolean;
  ataque: { acerto: number; dano: string; alcance: string } | null;
  defesa: number | null;
  /* Finesse: os atributos que o jogador pode escolher (vazio = não escolhe). */
  atributos: Atributo[];
  modos: string[];
  modoAtual: string | null;
};

const MEDICOS = /T[ôo]nicos|Medicina/i;
const COMIDA = /Enlatados|Alimentos/i;
const CONSUMIVEIS = /Tabaco|Ervas|bebidas/i;
const ROUPAS = /^Roupas/i;
const FERRAMENTAS = /Of[íi]cios|Kits|cria[çc][ãa]o/i;
const EXPLOSIVOS = /bomba|granada|dinamite|explosiv|molotov|inflam[áa]vel/i;

function raridadeDe(texto: string | undefined): Raridade {
  const r = (texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (r.startsWith("incomum")) return "incomum";
  if (r.startsWith("raro")) return "raro";
  if (r.startsWith("extraordinario")) return "extraordinario";
  if (r.startsWith("unico")) return "unico";
  return "comum";
}

const somar = (l: readonly { valor: number }[]) => l.reduce((s, p) => s + p.valor, 0);

export function itensDaFicha(ficha: FichaVista, ctxCombate: ContextoCombate | null): ItemVisto[] {
  const categorias = proficienciasDaFicha(ficha.dados, ficha.ctx).categorias;
  return ficha.dados.inventario.map((i) => {
    const doPacote = i.itemId ? ficha.ctx.itens.get(i.itemId) : undefined;
    const mecanica = MecanicaItem.safeParse(doPacote?.mecanica).data;
    let categoria: Categoria = "geral";
    if (i.itemId?.startsWith("municao.") || (!doPacote && /^muni[çc][ãa]o|^flecha|^cartucho/i.test(i.nome))) categoria = "municao";
    else if (doPacote?.categoria === "arma") categoria = /^corpo a corpo/i.test(doPacote.campos.Alcance ?? "") ? "corpo_a_corpo" : "distancia";
    else if (doPacote?.categoria === "protecao") categoria = mecanica?.protecao?.categoria === "escudo" || /escudo/i.test(doPacote.nome) ? "escudo" : "armadura";
    else if (doPacote && EXPLOSIVOS.test(doPacote.nome)) categoria = "explosivo";
    else if (doPacote && MEDICOS.test(doPacote.departamento ?? "")) categoria = "medico";
    else if (doPacote && COMIDA.test(doPacote.departamento ?? "")) categoria = "comida";
    else if (doPacote && CONSUMIVEIS.test(doPacote.departamento ?? "")) categoria = "consumivel";
    else if (doPacote && ROUPAS.test(doPacote.departamento ?? "")) categoria = "roupa";
    else if (doPacote && FERRAMENTAS.test(doPacote.departamento ?? "")) categoria = "ferramenta";
    const arma = { nome: i.nome, mecanica: doPacote?.mecanica, atributo: i.atributo, modo: i.modo };
    const montado = doPacote?.categoria === "arma" && ctxCombate ? ataqueComArma(arma, { atributos: ficha.calc.atributos, proficiencia: ficha.calc.proficiencia, categorias }, ctxCombate, 1) : null;
    const bonusDano = montado ? somar(montado.dano.bonus) : 0;
    const disparo = doPacote?.categoria === "arma" ? disparoDaArma(arma) : null;
    const defesa = mecanica?.protecao ? (mecanica.protecao.bonus_defesa ?? mecanica.protecao.defesa ?? null) : null;
    return {
      id: i.id,
      item: i,
      nome: i.nome,
      categoria,
      icone: categoria === "municao" ? iconeDeMunicao(i.itemId, i.nome) : categoria,
      raridade: raridadeDe(doPacote?.campos.Raridade),
      quantidade: i.quantidade,
      pesoKg: i.pesoKg ?? mecanica?.peso_kg ?? 0,
      equipado: i.equipado,
      texto: doPacote?.texto ?? "",
      equipavel: categoria === "corpo_a_corpo" || categoria === "distancia" || categoria === "armadura" || categoria === "escudo" || categoria === "ferramenta" || categoria === "roupa",
      ataque: montado
        ? {
            acerto: somar(montado.acerto),
            dano: `${montado.dano.formula}${bonusDano ? (bonusDano > 0 ? ` + ${bonusDano}` : ` − ${-bonusDano}`) : ""}${montado.dano.tipo ? ` ${montado.dano.tipo}` : ""}`,
            alcance: doPacote?.campos.Alcance ?? "",
          }
        : null,
      defesa,
      atributos: doPacote?.categoria === "arma" ? atributosDaArma(arma) : [],
      modos: disparo?.arma.modos?.map((m) => m.nome) ?? [],
      modoAtual: disparo?.modo?.nome ?? null,
    };
  });
}
