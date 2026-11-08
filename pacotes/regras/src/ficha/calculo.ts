import { ATRIBUTOS, type Atributo, type Habilidade, type MecanicaHabilidade, type MecanicaItem, type ParcelaDeSoma, type Recuperacao, type Recurso } from "@odm/conteudo";
import type { AjusteManual, FichaDados } from "@odm/protocolo";
import type { ContextoFicha } from "./contexto";
import { bonusDeProficiencia, mecanicaDaClasse, niveisAlcancados, nivelDeClasse, nivelDoXp, xpDoProximoNivel } from "./progressao";

export const NOME_ATRIBUTO: Record<Atributo, string> = {
  brutalidade: "Brutalidade",
  agilidade: "Agilidade",
  fibra: "Fibra",
  intelecto: "Intelecto",
  astucia: "Astúcia",
  presenca: "Presença",
};

export type Parcela = { rotulo: string; valor: number };

/* Cada valor guarda a própria conta, que aparece ao tocar no número (especificação, 5.1). */
export type ValorContado = { valor: number; conta: Parcela[]; ajuste: AjusteManual | null };

function contar(campo: string, parcelas: Parcela[], ficha: FichaDados): ValorContado {
  const ajuste = ficha.ajustes[campo] ?? null;
  const conta = ajuste ? [...parcelas, { rotulo: ajuste.motivo ? `Ajuste manual: ${ajuste.motivo}` : "Ajuste manual", valor: ajuste.valor }] : parcelas;
  return { valor: conta.reduce((soma, p) => soma + p.valor, 0), conta, ajuste };
}

/* ---------- O que o personagem tem ---------- */

export type OrigemDaHabilidade = "classe" | "especializacao" | "tecnica" | "origem" | "talento" | "mestre";
export type HabilidadeDaFicha = { id: string; nome: string; texto: string; de: OrigemDaHabilidade; nivel: number | null; foraDoLivro: boolean; mecanica?: MecanicaHabilidade };

function especializacaoNome(ficha: FichaDados, ctx: ContextoFicha) {
  return ficha.especializacaoId ? (ctx.especializacoes.get(ficha.especializacaoId)?.nome ?? null) : null;
}

function habilidadeDaFicha(id: string, de: OrigemDaHabilidade, ficha: FichaDados, ctx: ContextoFicha): HabilidadeDaFicha {
  const h: Habilidade | undefined = ctx.habilidades.get(id);
  if (h) return { id, nome: h.nome, texto: h.texto, de, nivel: h.nivel ?? null, foraDoLivro: false, mecanica: h.mecanica };
  const copia = ficha.copias[id];
  return { id, nome: copia?.nome ?? id, texto: copia?.texto ?? "", de, nivel: null, foraDoLivro: true };
}

export function habilidadesDaFicha(ficha: FichaDados, ctx: ContextoFicha): HabilidadeDaFicha[] {
  const mecanica = mecanicaDaClasse(ficha, ctx);
  const classe = ficha.classeId ? ctx.classes.get(ficha.classeId) : undefined;
  if (!mecanica || !classe) return [];
  const nivel = nivelDoXp(ficha.xp, ctx.regras);
  const lista: HabilidadeDaFicha[] = [];
  const vistos = new Set<string>();
  const por = (id: string, de: OrigemDaHabilidade) => {
    if (vistos.has(id)) return;
    vistos.add(id);
    lista.push(habilidadeDaFicha(id, de, ficha, ctx));
  };
  for (const [, dados] of niveisAlcancados(mecanica, nivel)) {
    for (const id of dados.ganha ?? []) if (id.startsWith("habilidade.")) por(id, "classe");
  }
  for (const ids of Object.values(ficha.escolhasDeNivel)) for (const id of ids) por(id, "classe");
  const especializacao = especializacaoNome(ficha, ctx);
  if (especializacao) {
    for (const h of ctx.habilidades.values()) {
      if (h.classe !== classe.nome || h.especializacao !== especializacao || h.tecnica) continue;
      /* Listas como Receitas e Armadilhas não têm nível: entram com a especialização. */
      if ((h.nivel ?? 0) <= nivelDeClasse(nivel)) por(h.id, "especializacao");
    }
  }
  for (const c of ficha.compras) {
    if (c.tipo === "tecnica_avancada" || c.tipo === "tecnica_lendaria") por(c.habilidadeId, "tecnica");
  }
  for (const id of ficha.habilidadesDoMestre) por(id, "mestre");
  return lista;
}

export type TalentoDaFicha = { id: string; nome: string; texto: string; mecanica?: MecanicaHabilidade; atributo?: Atributo; escolhas: string[]; deCompra: boolean };

export function talentosDaFicha(ficha: FichaDados, ctx: ContextoFicha): TalentoDaFicha[] {
  const ver = (id: string, atributo: Atributo | undefined, escolhas: string[] | undefined, deCompra: boolean): TalentoDaFicha => {
    const t = ctx.talentos.get(id);
    return { id, nome: t?.nome ?? ficha.copias[id]?.nome ?? id, texto: t?.texto ?? ficha.copias[id]?.texto ?? "", mecanica: t?.mecanica, atributo, escolhas: escolhas ?? [], deCompra };
  };
  return [
    ...ficha.talentos.map((t) => ver(t.talentoId, t.atributo, t.escolhas, false)),
    ...ficha.compras.flatMap((c) => (c.tipo === "talento" ? [ver(c.talentoId, c.atributo, c.escolhas, true)] : [])),
  ];
}

const mecanicaDaOrigem = (ficha: FichaDados, ctx: ContextoFicha) => (ficha.origemId ? ctx.origens.get(ficha.origemId)?.mecanica : undefined);

/* Tudo o que pode mudar um valor calculado: origem, habilidades e talentos. */
function mecanicasAtivas(ficha: FichaDados, ctx: ContextoFicha) {
  const fontes: { nome: string; mecanica: MecanicaHabilidade }[] = [];
  const origem = ficha.origemId ? ctx.origens.get(ficha.origemId) : undefined;
  if (origem?.mecanica) fontes.push({ nome: origem.nome, mecanica: origem.mecanica });
  for (const h of habilidadesDaFicha(ficha, ctx)) if (h.mecanica) fontes.push({ nome: h.nome, mecanica: h.mecanica });
  for (const t of talentosDaFicha(ficha, ctx)) if (t.mecanica) fontes.push({ nome: t.nome, mecanica: t.mecanica });
  return fontes;
}

type Equipado = { nome: string; mecanica: MecanicaItem };

function equipados(ficha: FichaDados, ctx: ContextoFicha): Equipado[] {
  return ficha.inventario.flatMap((i) => {
    const mecanica = i.equipado && i.itemId ? ctx.itens.get(i.itemId)?.mecanica : undefined;
    return mecanica ? [{ nome: i.nome, mecanica }] : [];
  });
}

/* ---------- Atributos e proficiências ---------- */

export function atributosDaFicha(ficha: FichaDados, ctx: ContextoFicha): Record<Atributo, ValorContado> {
  const concede = mecanicaDaOrigem(ficha, ctx)?.concede?.atributos;
  const origemNome = ficha.origemId ? ctx.origens.get(ficha.origemId)?.nome : undefined;
  const talentos = talentosDaFicha(ficha, ctx);
  return Object.fromEntries(
    ATRIBUTOS.map((a) => {
      const parcelas: Parcela[] = [{ rotulo: "Distribuição", valor: ficha.atributos[a] ?? 0 }];
      if (concede?.[a]) parcelas.push({ rotulo: origemNome ?? "Origem", valor: concede[a] });
      for (const t of talentos) {
        const pontos = t.mecanica?.concede?.atributo_a_escolha?.pontos;
        if (pontos && t.atributo === a) parcelas.push({ rotulo: t.nome, valor: pontos });
      }
      return [a, contar(`atributo:${a}`, parcelas, ficha)];
    }),
  ) as Record<Atributo, ValorContado>;
}

export function proficienciasDaFicha(ficha: FichaDados, ctx: ContextoFicha) {
  const mecanica = mecanicaDaClasse(ficha, ctx);
  const categorias = new Set<string>([...(mecanica?.proficiencias.armaduras ?? []), ...(mecanica?.proficiencias.armas ?? [])]);
  const pericias = new Set<string>(ficha.pericias);
  const ferramentas = new Set<string>([...(mecanica?.proficiencias.ferramentas ?? []), ...ficha.ferramentas]);
  const resistencias = new Set<Atributo>();
  for (const id of ficha.trocas) categorias.add(id);
  const adicionarEscolha = (id: string) => {
    if (id.startsWith("pericia.")) pericias.add(id);
    else if (id.startsWith("arma")) categorias.add(id);
    else ferramentas.add(id);
  };
  ficha.escolhasDaOrigem.forEach(adicionarEscolha);
  for (const t of talentosDaFicha(ficha, ctx)) {
    t.escolhas.forEach(adicionarEscolha);
    if (t.mecanica?.concede?.resistencia_a_escolha && t.atributo) resistencias.add(t.atributo);
  }
  for (const { mecanica: m } of mecanicasAtivas(ficha, ctx)) {
    for (const id of m.concede?.pericias ?? []) pericias.add(id);
    for (const id of m.concede?.ferramentas ?? []) ferramentas.add(id);
    for (const id of m.concede?.proficiencias ?? []) categorias.add(id);
    for (const a of m.concede?.resistencias ?? []) resistencias.add(a);
  }
  for (const c of ficha.compras) {
    if (c.tipo !== "proficiencia") continue;
    if (c.genero === "categoria") categorias.add(c.valor);
    else if (c.genero === "pericia") pericias.add(c.valor);
    else ferramentas.add(c.valor);
  }
  return { categorias, pericias, ferramentas, resistencias };
}

/* ---------- Valores calculados ---------- */

const REDUCAO_SEM_PROFICIENCIA: Record<string, number> = { armadura_leve: 1, armadura_media: 2, armadura_pesada: 3 };

type Situacao = { armadura: boolean; escudo: boolean; niveis: number; atributos: Record<Atributo, ValorContado> };

function modificadores(alvo: string, sem: Situacao, fontes: ReturnType<typeof mecanicasAtivas>): Parcela[] {
  return fontes.flatMap(({ nome, mecanica }) =>
    (mecanica.modifica ?? [])
      .filter((m) => m.alvo === alvo)
      .filter((m) => !m.enquanto || (m.enquanto === "sem_armadura" ? sem.armadura : sem.armadura && sem.escudo))
      .map((m) => ({ rotulo: nome, valor: m.valor * (m.por_nivel ? sem.niveis : 1) + (m.atributo ? sem.atributos[m.atributo].valor : 0) })),
  );
}

function pesoDe(item: FichaDados["inventario"][number], ctx: ContextoFicha) {
  const unidade = item.pesoKg ?? (item.itemId ? ctx.itens.get(item.itemId)?.mecanica?.peso_kg : undefined) ?? 0;
  return unidade * item.quantidade;
}

export type FichaDeClasseCalculada = { id: string; nome: string; texto: string; maximo: ValorContado; inicial: number; recupera: Recuperacao[]; dt: ValorContado | null };

export type CargaCalculada = { limite: ValorContado; atual: number; condicao: "normal" | "sobrecarregado" | "imobilizado" };

export type PericiaCalculada = { id: string; nome: string; atributo: Atributo; treinada: boolean; total: ValorContado };

export type FichaCalculada = {
  nivel: number;
  xpProximo: number | null;
  proficiencia: number;
  consagracao: boolean;
  atributos: Record<Atributo, ValorContado>;
  resistencias: Record<Atributo, ValorContado>;
  pericias: PericiaCalculada[];
  percepcaoPassiva: ValorContado;
  pvMaximo: ValorContado;
  defesa: ValorContado;
  rd: ValorContado;
  deslocamento: ValorContado;
  paPorTurno: number;
  carga: CargaCalculada;
  estresseMaximo: ValorContado | null;
  fichasDeClasse: FichaDeClasseCalculada[];
  dadoDeVida: string | null;
  dadosDeVida: number;
};

export const dadosDeVida = (niveisDeClasse: number) => (niveisDeClasse < 1 ? 0 : 1 + Math.floor((niveisDeClasse - 1) / 2));

function somarParcelas(soma: readonly ParcelaDeSoma[], atributos: Record<Atributo, ValorContado>, proficiencia: number): Parcela[] {
  return soma.map((s) =>
    s === "proficiencia" ? { rotulo: "Proficiência", valor: proficiencia } : { rotulo: NOME_ATRIBUTO[s], valor: atributos[s].valor },
  );
}

function defesaBase(ctx: ContextoFicha, atributos: Record<Atributo, ValorContado>, proficiencia: number, itens: Equipado[], fontes: ReturnType<typeof mecanicasAtivas>): Parcela[] {
  const armadura = itens.find((i) => i.mecanica.protecao && i.mecanica.protecao.categoria !== "escudo");
  const protecao = armadura?.mecanica.protecao;
  if (armadura && protecao) {
    const parcelas: Parcela[] = [{ rotulo: armadura.nome, valor: protecao.defesa ?? 0 }];
    if (protecao.soma_agilidade) {
      const agilidade = atributos.agilidade.valor;
      const limite = protecao.agilidade_maxima;
      parcelas.push({ rotulo: "Agilidade", valor: limite === null || limite === undefined ? agilidade : Math.min(agilidade, limite) });
    }
    return parcelas;
  }
  const comEscudo = itens.some((i) => i.mecanica.protecao?.categoria === "escudo");
  const geral: Parcela[] = [
    { rotulo: "Base", valor: ctx.regras.defesa.formula.base },
    ...somarParcelas(ctx.regras.defesa.formula.soma, atributos, proficiencia),
  ];
  let melhor = geral;
  let total = geral.reduce((s, p) => s + p.valor, 0);
  for (const { nome, mecanica } of fontes) {
    const alternativa = mecanica.defesa_sem_armadura;
    if (!alternativa || (comEscudo && !alternativa.permite_escudo)) continue;
    const parcelas: Parcela[] = [{ rotulo: nome, valor: alternativa.base }, ...somarParcelas(alternativa.soma, atributos, proficiencia)];
    const soma = parcelas.reduce((s, p) => s + p.valor, 0);
    if (soma > total) {
      melhor = parcelas;
      total = soma;
    }
  }
  return melhor;
}

function fichasDeClasse(ficha: FichaDados, ctx: ContextoFicha, nivel: number, atributos: Record<Atributo, ValorContado>, proficiencia: number): FichaDeClasseCalculada[] {
  const mecanica = mecanicaDaClasse(ficha, ctx);
  const classe = ficha.classeId ? ctx.classes.get(ficha.classeId) : undefined;
  if (!mecanica || !classe) return [];
  const temHabilidade = new Set(habilidadesDaFicha(ficha, ctx).map((h) => h.id));
  const especializacao = especializacaoNome(ficha, ctx);
  const recursos: Recurso[] = [];
  for (const [, dados] of niveisAlcancados(mecanica, nivel)) {
    for (const id of dados.ganha ?? []) {
      const r = ctx.recursos.get(id);
      if (r) recursos.push(r);
    }
  }
  if (especializacao) {
    for (const r of ctx.recursos.values()) if (r.classe === classe.nome && r.especializacao === especializacao) recursos.push(r);
  }
  return recursos.flatMap((r) => {
    const m = r.mecanica;
    if (!m) return [];
    const parcelas: Parcela[] = [];
    const max = m.maximo;
    if (max?.valor !== undefined) parcelas.push({ rotulo: "Máximo", valor: max.valor });
    if (max?.coluna) {
      const linha = classe.tabela.find((l) => l.nivel === nivel);
      parcelas.push({ rotulo: max.coluna, valor: Number.parseInt(linha?.colunas?.[max.coluna] ?? "0", 10) || 0 });
    }
    if (max?.nivel_da_classe) parcelas.push({ rotulo: "Nível de classe", valor: Math.min(nivel, max.ate ?? nivel) });
    if (max?.soma) parcelas.push(...somarParcelas(max.soma, atributos, proficiencia));
    const soma = parcelas.reduce((s, p) => s + p.valor, 0);
    if (max?.minimo !== undefined && soma < max.minimo) parcelas.push({ rotulo: "Mínimo", valor: max.minimo - soma });
    for (const a of m.aumenta ?? []) {
      if (temHabilidade.has(a.com)) parcelas.push({ rotulo: ctx.habilidades.get(a.com)?.nome ?? a.com, valor: a.soma });
    }
    const maximo = contar(`ficha:${r.id}`, parcelas, ficha);
    const dt = m.dt ? contar(`dt:${r.id}`, [{ rotulo: "Base", valor: m.dt.base }, ...somarParcelas(m.dt.soma, atributos, proficiencia)], ficha) : null;
    return [{ id: r.id, nome: r.nome, texto: r.texto, maximo, inicial: m.inicial ?? maximo.valor, recupera: m.recupera ?? [], dt }];
  });
}

/* O que o estado vivo muda na ficha (Exaustão, efeitos, Crise). O motor de combate monta; a ficha só soma,
   e cada parcela aparece na conta do valor. */
export type SituacaoDaFicha = {
  parcelas?: Partial<Record<"defesa" | "rd" | "deslocamento" | "pvMaximo", Parcela[]>>;
  pvMaximoMetade?: string | null;
  deslocamentoFixo?: { valor: number; motivo: string } | null;
  deslocamentoMetade?: string | null;
  deslocamentoMinimo?: number;
  /* Vendaval em campo aberto: tira metros de quem tem mais que "acimaDe", sem passar dele. Vem por último. */
  deslocamentoMenos?: { valor: number; acimaDe: number; motivo: string } | null;
};

function cortarEmZero(valor: ValorContado, rotulo: string): ValorContado {
  if (valor.valor >= 0) return valor;
  return { ...valor, conta: [...valor.conta, { rotulo, valor: -valor.valor }], valor: 0 };
}

export function calcularFicha(ficha: FichaDados, ctx: ContextoFicha, situacao: SituacaoDaFicha = {}): FichaCalculada {
  const nivel = nivelDoXp(ficha.xp, ctx.regras);
  const proficiencia = bonusDeProficiencia(nivel, ctx.regras);
  const mecanica = mecanicaDaClasse(ficha, ctx);
  const atributos = atributosDaFicha(ficha, ctx);
  const proficiencias = proficienciasDaFicha(ficha, ctx);
  const fontes = mecanicasAtivas(ficha, ctx);
  const itens = equipados(ficha, ctx);
  const niveis = nivelDeClasse(nivel);
  const sem: Situacao = {
    armadura: !itens.some((i) => i.mecanica.protecao && i.mecanica.protecao.categoria !== "escudo"),
    escudo: !itens.some((i) => i.mecanica.protecao?.categoria === "escudo"),
    niveis,
    atributos,
  };

  const resistencias = Object.fromEntries(
    ATRIBUTOS.map((a) => {
      const parcelas: Parcela[] = [{ rotulo: NOME_ATRIBUTO[a], valor: atributos[a].valor }];
      if (proficiencias.resistencias.has(a)) parcelas.push({ rotulo: "Proficiência", valor: proficiencia });
      return [a, contar(`resistencia:${a}`, parcelas, ficha)];
    }),
  ) as Record<Atributo, ValorContado>;

  const pericias: PericiaCalculada[] = [...ctx.pericias.values()].map((p) => {
    const treinada = proficiencias.pericias.has(p.id);
    const parcelas: Parcela[] = [{ rotulo: NOME_ATRIBUTO[p.atributo], valor: atributos[p.atributo].valor }];
    if (treinada) parcelas.push({ rotulo: "Proficiência", valor: proficiencia });
    parcelas.push(...modificadores(p.id, sem, fontes));
    return { id: p.id, nome: p.exibir, atributo: p.atributo, treinada, total: contar(`pericia:${p.id}`, parcelas, ficha) };
  });

  /* A Fibra vale para todos os níveis de classe: comprar um ponto no nível 11 dá +10 PV, como manda a Nota Especial. */
  const fibra = atributos.fibra.valor;
  const parcelasPv: Parcela[] = mecanica
    ? [
        { rotulo: "1º nível", valor: mecanica.pv.primeiro_nivel },
        { rotulo: `Níveis seguintes (${niveis - 1} × ${mecanica.pv.por_nivel})`, valor: (niveis - 1) * mecanica.pv.por_nivel },
        { rotulo: `Fibra (${niveis} × ${fibra})`, valor: niveis * fibra },
      ]
    : [];
  const vitalidade = ctx.regras.prestigio.opcoes.find((o) => o.id === "vitalidade_aprimorada")?.pv_maximo ?? 0;
  const compradas = ficha.compras.filter((c) => c.tipo === "vitalidade_aprimorada").length;
  if (compradas) parcelasPv.push({ rotulo: `Vitalidade Aprimorada (${compradas} × ${vitalidade})`, valor: compradas * vitalidade });
  parcelasPv.push(...modificadores("pv_maximo", sem, fontes));
  parcelasPv.push(...(situacao.parcelas?.pvMaximo ?? []));
  if (situacao.pvMaximoMetade) {
    const soma = parcelasPv.reduce((s, p) => s + p.valor, 0);
    parcelasPv.push({ rotulo: situacao.pvMaximoMetade, valor: Math.floor(soma / 2) - soma });
  }
  const pvMaximo = contar("pv_maximo", parcelasPv, ficha);

  const parcelasDefesa = defesaBase(ctx, atributos, proficiencia, itens, fontes);
  const escudo = itens.find((i) => i.mecanica.protecao?.categoria === "escudo");
  if (escudo?.mecanica.protecao?.bonus_defesa) parcelasDefesa.push({ rotulo: escudo.nome, valor: escudo.mecanica.protecao.bonus_defesa });
  parcelasDefesa.push(...modificadores("defesa", sem, fontes));
  parcelasDefesa.push(...(situacao.parcelas?.defesa ?? []));
  const defesa = contar("defesa", parcelasDefesa, ficha);

  const parcelasRd: Parcela[] = itens.flatMap((i) => (i.mecanica.protecao?.rd ? [{ rotulo: i.nome, valor: i.mecanica.protecao.rd }] : []));
  parcelasRd.push(...modificadores("rd", sem, fontes));
  parcelasRd.push(...(situacao.parcelas?.rd ?? []));
  const rd = cortarEmZero(contar("rd", parcelasRd, ficha), "RD não fica abaixo de 0");

  const { base, por_fibra, minimo } = ctx.regras.carga.limite_kg;
  const parcelasCarga: Parcela[] = [{ rotulo: "Base", valor: base }, { rotulo: `${por_fibra} × Fibra`, valor: por_fibra * fibra }];
  const somaCarga = base + por_fibra * fibra;
  if (somaCarga < minimo) parcelasCarga.push({ rotulo: "Mínimo", valor: minimo - somaCarga });
  for (const i of itens) if (i.mecanica.carga_extra_kg) parcelasCarga.push({ rotulo: i.nome, valor: i.mecanica.carga_extra_kg });
  parcelasCarga.push(...modificadores("carga_kg", sem, fontes));
  const limite = contar("carga", parcelasCarga, ficha);
  const atual = ficha.inventario.reduce((soma, i) => soma + pesoDe(i, ctx), 0);
  const condicao = atual >= limite.valor * 2 ? "imobilizado" : atual > limite.valor ? "sobrecarregado" : "normal";

  const parcelasDesloc: Parcela[] = [{ rotulo: "Base", valor: ctx.regras.deslocamento.metros }];
  parcelasDesloc.push(...modificadores("deslocamento", sem, fontes));
  for (const i of itens) {
    const categoria = i.mecanica.protecao?.categoria;
    if (i.mecanica.protecao?.deslocamento) parcelasDesloc.push({ rotulo: i.nome, valor: i.mecanica.protecao.deslocamento });
    if (categoria && categoria !== "escudo" && !proficiencias.categorias.has(categoria)) {
      parcelasDesloc.push({ rotulo: `Sem proficiência em ${i.nome}`, valor: -REDUCAO_SEM_PROFICIENCIA[categoria]! });
    }
  }
  const semCarga = parcelasDesloc.reduce((s, p) => s + p.valor, 0);
  if (condicao === "sobrecarregado") parcelasDesloc.push({ rotulo: "Sobrecarregado (metade)", valor: Math.ceil(semCarga / 2) - semCarga });
  if (condicao === "imobilizado") parcelasDesloc.push({ rotulo: "Imobilizado", valor: -semCarga });
  parcelasDesloc.push(...(situacao.parcelas?.deslocamento ?? []));
  const antesDosEfeitos = parcelasDesloc.reduce((s, p) => s + p.valor, 0);
  if (situacao.deslocamentoMinimo !== undefined && antesDosEfeitos < situacao.deslocamentoMinimo && condicao !== "imobilizado") {
    parcelasDesloc.push({ rotulo: "Mínimo", valor: situacao.deslocamentoMinimo - antesDosEfeitos });
  }
  const somaDesloc = parcelasDesloc.reduce((s, p) => s + p.valor, 0);
  if (situacao.deslocamentoFixo) parcelasDesloc.push({ rotulo: situacao.deslocamentoFixo.motivo, valor: situacao.deslocamentoFixo.valor - somaDesloc });
  else if (situacao.deslocamentoMetade) parcelasDesloc.push({ rotulo: situacao.deslocamentoMetade, valor: Math.max(1, Math.floor(somaDesloc / 2)) - somaDesloc });
  if (situacao.deslocamentoMenos) {
    const { valor, acimaDe, motivo } = situacao.deslocamentoMenos;
    const agora = parcelasDesloc.reduce((s, p) => s + p.valor, 0);
    if (agora > acimaDe) parcelasDesloc.push({ rotulo: motivo, valor: -Math.min(valor, agora - acimaDe) });
  }
  const deslocamento = contar("deslocamento", parcelasDesloc, ficha);

  const percepcao = pericias.find((p) => p.id === "pericia.percepcao");
  const percepcaoPassiva = contar(
    "percepcao_passiva",
    [{ rotulo: "Base", valor: 10 }, { rotulo: "Percepção", valor: percepcao?.total.valor ?? 0 }, ...modificadores("percepcao_passiva", sem, fontes)],
    ficha,
  );

  const estresseMaximo = ctx.opcoes.estresse
    ? contar(
        "estresse_maximo",
        [
          { rotulo: "Base", valor: ctx.regras.estresse.formula.base },
          ...somarParcelas(ctx.regras.estresse.formula.soma, atributos, proficiencia),
          ...modificadores("estresse_maximo", sem, fontes),
        ],
        ficha,
      )
    : null;

  return {
    nivel,
    xpProximo: xpDoProximoNivel(nivel, ctx.regras),
    proficiencia,
    consagracao: nivel > 10,
    atributos,
    resistencias,
    pericias,
    percepcaoPassiva,
    pvMaximo,
    defesa,
    rd,
    deslocamento,
    paPorTurno: ctx.regras.turno.pa_por_turno,
    carga: { limite, atual, condicao },
    estresseMaximo,
    fichasDeClasse: fichasDeClasse(ficha, ctx, nivel, atributos, proficiencia),
    /* Jogador, Contextualização: 1 Dado de Vida no 1º nível e mais 1 a cada dois níveis (3º, 5º, 7º...). */
    dadoDeVida: mecanica ? `${dadosDeVida(niveis)}${mecanica.dado_de_vida}` : null,
    dadosDeVida: mecanica ? dadosDeVida(niveis) : 0,
  };
}
