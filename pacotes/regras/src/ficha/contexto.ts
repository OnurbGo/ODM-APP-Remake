import {
  ID_REGRA_HONRA,
  ID_REGRA_KITS,
  MecanicaHonra,
  MecanicaKits,
  MecanicaRegras,
  REGRAS_FICHA,
  type Classe,
  type Conteudo,
  type Especializacao,
  type Habilidade,
  type ItemCatalogo,
  type Origem,
  type Pericia,
  type Recurso,
  type Talento,
} from "@odm/conteudo";
import { opcoesPadrao, type OpcoesCampanha } from "@odm/protocolo";

/* A parte do pacote que a ficha usa. É também o que o jogador recebe: criaturas e encontros ficam com o servidor. */
export type ConteudoFicha = Pick<
  Conteudo,
  "origens" | "talentos" | "classes" | "especializacoes" | "habilidades" | "recursos" | "pericias" | "tabelas" | "regras" | "itens"
>;

type Esquemas = typeof MecanicaRegras;
export type RegrasFicha = { [K in keyof Esquemas]: ReturnType<Esquemas[K]["parse"]> };

export type ContextoFicha = {
  regras: RegrasFicha;
  opcoes: OpcoesCampanha;
  /* Vazio enquanto a regra não for aprovada: a ficha mostra só o número. */
  faixasHonra: { nome: string; de: number; ate: number }[];
  classes: ReadonlyMap<string, Classe>;
  origens: ReadonlyMap<string, Origem>;
  talentos: ReadonlyMap<string, Talento>;
  especializacoes: ReadonlyMap<string, Especializacao>;
  habilidades: ReadonlyMap<string, Habilidade>;
  recursos: ReadonlyMap<string, Recurso>;
  pericias: ReadonlyMap<string, Pericia>;
  itens: ReadonlyMap<string, ItemCatalogo>;
};

const porId = <T extends { id: string }>(lista: readonly T[]) => new Map(lista.map((i) => [i.id, i]));

/* Só o aprovado traz mecânica. Sem uma regra, a ficha não calcula, e a tela diz qual falta. */
export function lerRegrasFicha(conteudo: Pick<ConteudoFicha, "tabelas" | "regras">) {
  const fonte = new Map([...conteudo.tabelas, ...conteudo.regras].map((i) => [i.id, i.mecanica]));
  const faltando: string[] = [];
  const regras: Record<string, unknown> = {};
  for (const [chave, id] of Object.entries(REGRAS_FICHA)) {
    const lido = MecanicaRegras[chave as keyof typeof MecanicaRegras].safeParse(fonte.get(id));
    if (lido.success) regras[chave] = lido.data;
    else faltando.push(id);
  }
  return faltando.length ? ({ ok: false, faltando } as const) : ({ ok: true, regras: regras as RegrasFicha } as const);
}

/* Kits sugeridos pelo pacote, depois de revisados. */
export function kitsDoPacote(conteudo: Pick<ConteudoFicha, "regras">) {
  const lido = MecanicaKits.safeParse(conteudo.regras.find((r) => r.id === ID_REGRA_KITS)?.mecanica);
  return lido.success ? lido.data.kits : [];
}

function lerFaixasHonra(conteudo: ConteudoFicha) {
  const lido = MecanicaHonra.safeParse(conteudo.regras.find((r) => r.id === ID_REGRA_HONRA)?.mecanica);
  return lido.success ? lido.data.faixas : [];
}

export function criarContexto(conteudo: ConteudoFicha, opcoes: OpcoesCampanha = opcoesPadrao()) {
  const lidas = lerRegrasFicha(conteudo);
  if (!lidas.ok) return lidas;
  const contexto: ContextoFicha = {
    regras: lidas.regras,
    opcoes,
    faixasHonra: lerFaixasHonra(conteudo),
    classes: porId(conteudo.classes),
    origens: porId(conteudo.origens),
    talentos: porId(conteudo.talentos),
    especializacoes: porId(conteudo.especializacoes),
    habilidades: porId(conteudo.habilidades),
    recursos: porId(conteudo.recursos),
    pericias: porId(conteudo.pericias),
    itens: porId(conteudo.itens),
  };
  return { ok: true, contexto } as const;
}

export function recortarConteudoFicha(conteudo: Conteudo): ConteudoFicha {
  const usadas = new Set<string>(Object.values(REGRAS_FICHA));
  return {
    origens: conteudo.origens,
    talentos: conteudo.talentos,
    classes: conteudo.classes,
    especializacoes: conteudo.especializacoes,
    habilidades: conteudo.habilidades,
    recursos: conteudo.recursos,
    pericias: conteudo.pericias,
    tabelas: conteudo.tabelas.filter((t) => usadas.has(t.id)),
    regras: conteudo.regras,
    itens: conteudo.itens,
  };
}
