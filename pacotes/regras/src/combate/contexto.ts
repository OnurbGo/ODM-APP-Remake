import {
  ID_EXAUSTAO,
  MecanicaCombate,
  MecanicaEfeito,
  MecanicaModificador,
  NivelDeExaustao,
  REGRAS_COMBATE,
  REGRAS_COMBATE_OBRIGATORIAS,
  type Efeito,
  type Modificador,
  type RegrasCombate,
} from "@odm/conteudo";
import { opcoesPadrao, type OpcoesCampanha } from "@odm/protocolo";

type Obrigatoria = (typeof REGRAS_COMBATE_OBRIGATORIAS)[number];
/* As obrigatórias sempre estão; as outras só quando aprovadas, e a parte delas fica desligada até lá. */
export type RegrasDoCombate = Pick<RegrasCombate, Obrigatoria> & Partial<Omit<RegrasCombate, Obrigatoria>>;

export type EfeitoDoPacote = { id: string; nome: string; texto: string; mecanica: MecanicaEfeito | null };

export type ContextoCombate = {
  regras: RegrasDoCombate;
  opcoes: OpcoesCampanha;
  efeitos: ReadonlyMap<string, EfeitoDoPacote>;
  /* Nulo enquanto a Exaustão não tiver mecânica aprovada: o nível aparece, mas não muda conta. */
  exaustao: readonly NivelDeExaustao[] | null;
  /* Modificadores de mundo ligados na campanha (fase 6, etapa 9); mecânica nula = só a carta de texto. */
  mundo: readonly ModificadorAtivo[];
};

export type ModificadorAtivo = { id: string; nome: string; texto: string; mecanica: MecanicaModificador | null; campoAberto: boolean };

export function lerMundo(modificadores: readonly Modificador[] | undefined, opcoes: OpcoesCampanha): ModificadorAtivo[] {
  const porId = new Map((modificadores ?? []).map((m) => [m.id, m]));
  return opcoes.mundo.flatMap(({ id, campoAberto }) => {
    const m = porId.get(id);
    if (!m) return [];
    const lido = MecanicaModificador.safeParse(m.mecanica);
    return [{ id, nome: m.nome, texto: m.texto, mecanica: m.mecanica && lido.success ? lido.data : null, campoAberto }];
  });
}

type ItemComMecanica = { id: string; mecanica?: Record<string, unknown> };

export function lerRegrasCombate(itens: readonly ItemComMecanica[]) {
  const fonte = new Map(itens.map((i) => [i.id, i.mecanica]));
  const regras: Record<string, unknown> = {};
  const faltando: string[] = [];
  const obrigatorias = new Set<string>(REGRAS_COMBATE_OBRIGATORIAS);
  for (const [chave, id] of Object.entries(REGRAS_COMBATE)) {
    const lido = MecanicaCombate[chave as keyof typeof MecanicaCombate].safeParse(fonte.get(id));
    if (lido.success) regras[chave] = lido.data;
    else if (obrigatorias.has(chave)) faltando.push(id);
  }
  return faltando.length ? ({ ok: false, faltando } as const) : ({ ok: true, regras: regras as RegrasDoCombate } as const);
}

export function lerEfeitos(efeitos: readonly Efeito[]): Map<string, EfeitoDoPacote> {
  return new Map(
    efeitos.map((e) => {
      const lido = MecanicaEfeito.safeParse(e.mecanica);
      return [e.id, { id: e.id, nome: e.exibir ?? e.nome, texto: e.texto, mecanica: e.mecanica && lido.success ? lido.data : null }];
    }),
  );
}

function lerExaustao(efeitos: ReadonlyMap<string, EfeitoDoPacote>) {
  const niveis = efeitos.get(ID_EXAUSTAO)?.mecanica?.por_nivel;
  if (!niveis) return null;
  const lidos = niveis.map((n) => NivelDeExaustao.safeParse(n));
  return lidos.every((l) => l.success) ? lidos.map((l) => l.data!) : null;
}

export function criarContextoCombate(
  conteudo: { regras: readonly ItemComMecanica[]; tabelas?: readonly ItemComMecanica[]; efeitos: readonly Efeito[]; modificadores?: readonly Modificador[] },
  opcoes: OpcoesCampanha = opcoesPadrao(),
) {
  const lidas = lerRegrasCombate([...conteudo.regras, ...(conteudo.tabelas ?? [])]);
  if (!lidas.ok) return lidas;
  const efeitos = lerEfeitos(conteudo.efeitos);
  const contexto: ContextoCombate = { regras: lidas.regras, opcoes, efeitos, exaustao: lerExaustao(efeitos), mundo: lerMundo(conteudo.modificadores, opcoes) };
  return { ok: true, contexto } as const;
}
