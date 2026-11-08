import { MecanicaEncontro, REGRAS_ENCONTRO, type RegrasEncontroLidas, type Tabela } from "@odm/conteudo";

/* Montando encontros e dividindo recompensas (Mestre, "Recompensas e Encontros"; encontros-mecanica.yml).
   Decisões de 07/11/2026: E1 (0,25 por jogador fora de 3, 5 e 6), E2 ("Abaixo de Fácil"), E3 (nível médio para baixo),
   E5 (todos do combate, parte para baixo, sobra some). */

export const GRAUS = ["abaixo_de_facil", "facil", "moderada", "dificil", "morte_certa"] as const;
export type GrauEncontro = (typeof GRAUS)[number];

export const ROTULO_GRAU: Record<GrauEncontro, string> = {
  abaixo_de_facil: "Abaixo de Fácil",
  facil: "Fácil",
  moderada: "Moderada",
  dificil: "Difícil",
  morte_certa: "Morte certa",
};

/* Os graus com coluna na tabela, na ordem das colunas (Fácil, Moderada, Difícil, Morte certa). */
const COLUNAS: readonly GrauEncontro[] = ["facil", "moderada", "dificil", "morte_certa"];

/* "1 600", "5.000", "R$ 1 200" → número. Vazio ou sem dígito → null. */
export function numeroDaTabela(texto: string): number | null {
  const limpo = texto.replace(/R\$/g, "").replace(/[\s. ]/g, "");
  return /^\d+$/.test(limpo) ? Number(limpo) : null;
}

/* A tabela vem em pares de colunas (ND, XP, ND, XP). */
export function xpPorNdDaTabela(tabela: Pick<Tabela, "linhas">): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const linha of tabela.linhas)
    for (let i = 0; i + 1 < linha.length; i += 2) {
      const xp = numeroDaTabela(linha[i + 1]!);
      if (linha[i]!.trim() && xp !== null) mapa.set(linha[i]!.trim(), xp);
    }
  return mapa;
}

/* Linha da tabela por nível: [nível, Fácil, Moderada, Difícil, Morte certa]. */
export function linhasPorNivel(tabela: Pick<Tabela, "linhas">): Map<number, number[]> {
  const mapa = new Map<number, number[]>();
  for (const linha of tabela.linhas) {
    const nivel = numeroDaTabela(linha[0] ?? "");
    const valores = linha.slice(1, 5).map(numeroDaTabela);
    if (nivel !== null && valores.length === 4 && valores.every((v) => v !== null)) mapa.set(nivel, valores as number[]);
  }
  return mapa;
}

export type RegrasEncontro = {
  lidas: RegrasEncontroLidas;
  /* Só com a regra "Montando encontros" aprovada e as duas tabelas no pacote. */
  dificuldade: Map<number, number[]> | null;
  valorGerado: Map<number, number[]> | null;
  xpPorNd: Map<string, number>;
};

type ItemComMecanica = { id: string; mecanica?: Record<string, unknown> };

export function lerRegrasEncontro(conteudo: { regras: readonly ItemComMecanica[]; tabelas: readonly Tabela[] }): RegrasEncontro {
  const fonte = new Map(conteudo.regras.map((r) => [r.id, r.mecanica]));
  const lidas: Record<string, unknown> = {};
  for (const [chave, id] of Object.entries(REGRAS_ENCONTRO)) {
    const lido = MecanicaEncontro[chave as keyof typeof MecanicaEncontro].safeParse(fonte.get(id));
    if (lido.success) lidas[chave] = lido.data;
  }
  const r = lidas as RegrasEncontroLidas;
  const tabela = (id: string | undefined) => (id ? conteudo.tabelas.find((t) => t.id === id) : undefined);
  const dificuldade = tabela(r.montando?.tabela);
  const nd = tabela(r.montando?.xp_por_nd) ?? conteudo.tabelas.find((t) => t.id === "tabela.xp-por-nivel-de-desafio");
  const valor = tabela(r.xpDeMissao?.dinheiro_sugerido) ?? conteudo.tabelas.find((t) => t.id === "tabela.tabela-de-valor-gerado");
  return {
    lidas: r,
    dificuldade: r.montando && dificuldade ? linhasPorNivel(dificuldade) : null,
    valorGerado: valor ? linhasPorNivel(valor) : null,
    xpPorNd: nd ? xpPorNdDaTabela(nd) : new Map(),
  };
}

/* Criatura lendária: a categoria da ficha diz "Lendário (cidade)". Fica fora da conta do encontro. */
export const ehLendaria = (ficha: { tipo: string; categoria: string | null }) => ficha.tipo === "criatura" && /\blend[aá]ri[oa]\b/i.test(ficha.categoria ?? "");

export type OrigemDoXp = "ficha" | "nd" | "nd_elite" | "mestre" | "sem_xp";

/* XP de uma criatura: o da ficha; na Elite com ND próprio, o desse ND (passo 5). Sem XP nem ND conhecido: null. */
export function xpDaCriatura(
  ficha: { xp: number | null; nd: string | null; ndElite?: string | null },
  elite: boolean,
  regras: Pick<RegrasEncontro, "xpPorNd" | "lidas">,
  ajuste: number | null = null,
): { xp: number | null; origem: OrigemDoXp } {
  if (ajuste !== null) return { xp: ajuste, origem: "mestre" };
  if (elite && ficha.ndElite && regras.lidas.montando) {
    const xp = regras.xpPorNd.get(ficha.ndElite.trim());
    if (xp !== undefined) return { xp, origem: "nd_elite" };
  }
  if (ficha.xp !== null) return { xp: ficha.xp, origem: "ficha" };
  const doNd = ficha.nd ? regras.xpPorNd.get(ficha.nd.trim()) : undefined;
  return doNd !== undefined ? { xp: doNd, origem: "nd" } : { xp: null, origem: "sem_xp" };
}

export function multiplicadorDoGrupo(personagens: number, regras: RegrasEncontro): number {
  const m = regras.lidas.montando;
  if (!m) return 1;
  return m.multiplicador.livro[String(personagens)] ?? personagens * m.multiplicador.por_jogador;
}

export function nivelMedioDoGrupo(niveis: readonly number[], regras: RegrasEncontro): number | null {
  const m = regras.lidas.montando;
  if (!m || !niveis.length) return null;
  const media = Math.floor(niveis.reduce((s, n) => s + n, 0) / niveis.length);
  return Math.min(m.nivel_medio.maximo, Math.max(m.nivel_medio.minimo, media));
}

export type LinhaDoEncontro = { nome: string; quantidade: number; xp: number | null; lendaria: boolean };

export type AvaliacaoEncontro = {
  xpTotal: number;
  inimigos: number;
  semXp: string[];
  lendarias: string[];
  /* Nulos sem a regra aprovada ou sem personagens. */
  nivel: number | null;
  multiplicador: number | null;
  limites: Record<Exclude<GrauEncontro, "abaixo_de_facil">, number> | null;
  grauDaTabela: GrauEncontro | null;
  grau: GrauEncontro | null;
  subiuPorNumero: boolean;
  /* A conta passo a passo, para o mestre conferir. */
  conta: string[];
};

const fmt = (n: number) => Math.round(n).toLocaleString("pt-BR");

export function avaliarEncontro(linhas: readonly LinhaDoEncontro[], niveisDoGrupo: readonly number[], regras: RegrasEncontro): AvaliacaoEncontro {
  const contam = linhas.filter((l) => !l.lendaria);
  const xpTotal = contam.reduce((s, l) => s + (l.xp ?? 0) * l.quantidade, 0);
  const inimigos = contam.reduce((s, l) => s + l.quantidade, 0);
  const base: AvaliacaoEncontro = {
    xpTotal,
    inimigos,
    semXp: contam.filter((l) => l.xp === null).map((l) => l.nome),
    lendarias: linhas.filter((l) => l.lendaria).map((l) => l.nome),
    nivel: null,
    multiplicador: null,
    limites: null,
    grauDaTabela: null,
    grau: null,
    subiuPorNumero: false,
    conta: [`XP das criaturas: ${contam.map((l) => `${l.quantidade} × ${l.xp === null ? "?" : fmt(l.xp)}`).join(" + ") || "0"} = ${fmt(xpTotal)}`],
  };
  const m = regras.lidas.montando;
  const nivel = nivelMedioDoGrupo(niveisDoGrupo, regras);
  const linha = nivel !== null ? regras.dificuldade?.get(nivel) : undefined;
  if (!m || nivel === null || !linha) return base;
  const personagens = niveisDoGrupo.length;
  const multiplicador = multiplicadorDoGrupo(personagens, regras);
  const limites = Object.fromEntries(COLUNAS.map((g, i) => [g, linha[i]! * multiplicador])) as AvaliacaoEncontro["limites"] & {};
  const alcancada = [...COLUNAS].reverse().find((g) => xpTotal >= limites[g as keyof typeof limites]);
  const grauDaTabela: GrauEncontro = alcancada ?? "abaixo_de_facil";
  const subiuPorNumero = inimigos > personagens && m.mais_inimigos_que_personagens.sobe > 0;
  const indice = Math.min(GRAUS.length - 1, GRAUS.indexOf(grauDaTabela) + (subiuPorNumero ? m.mais_inimigos_que_personagens.sobe : 0));
  const grau = GRAUS[indice]!;
  const conta = [
    ...base.conta,
    `Nível médio do grupo: ${niveisDoGrupo.join(", ")} → ${nivel}`,
    `Grupo de ${personagens}: linha × ${multiplicador.toLocaleString("pt-BR")} → ${COLUNAS.map((g) => `${ROTULO_GRAU[g]} ${fmt(limites[g as keyof typeof limites])}`).join(", ")}`,
    `Pelo XP: ${ROTULO_GRAU[grauDaTabela]}`,
    ...(subiuPorNumero
      ? [`${inimigos} inimigos contra ${personagens} ${personagens === 1 ? "personagem" : "personagens"}: ${grau === grauDaTabela ? `fica em ${ROTULO_GRAU[grau]}, o grau mais alto` : `sobe para ${ROTULO_GRAU[grau]}`}`]
      : []),
  ];
  return { ...base, nivel, multiplicador, limites, grauDaTabela, grau, subiuPorNumero, conta };
}

/* Divisão igual (passo da divisão das recompensas): cada um recebe a parte para baixo; a sobra se perde. */
export function dividirRecompensa(total: number, participantes: number): { parte: number; sobra: number } {
  if (participantes <= 0 || total <= 0) return { parte: 0, sobra: Math.max(0, total) };
  const parte = Math.floor(total / participantes);
  return { parte, sobra: total - parte * participantes };
}

export type GrauDeMissao = Exclude<GrauEncontro, "abaixo_de_facil">;
export const GRAUS_DE_MISSAO: readonly GrauDeMissao[] = COLUNAS as GrauDeMissao[];

/* XP de missão (M1, 07/11/2026): a fração da coluna da dificuldade (metade) × o multiplicador do grupo.
   Só com a regra aprovada; quem divide é dividirRecompensa. */
export function xpDaMissao(grau: GrauDeMissao, nivel: number, personagens: number, regras: RegrasEncontro): number | null {
  const x = regras.lidas.xpDeMissao;
  const linha = regras.dificuldade?.get(nivel);
  if (!x || !linha || personagens <= 0) return null;
  const mult = x.multiplicador_do_grupo ? multiplicadorDoGrupo(personagens, regras) : 1;
  return Math.floor(linha[COLUNAS.indexOf(grau)]! * x.fracao_da_coluna * mult);
}

/* Dinheiro sugerido pela Tabela de Valor Gerado, com o multiplicador do grupo quando a regra pede. */
export function valorGerado(grau: GrauDeMissao, nivel: number, personagens: number, regras: RegrasEncontro): number | null {
  const valor = regras.valorGerado?.get(nivel)?.[COLUNAS.indexOf(grau)];
  if (valor === undefined || personagens <= 0) return null;
  const mult = regras.lidas.xpDeMissao?.dinheiro_com_multiplicador ? multiplicadorDoGrupo(personagens, regras) : 1;
  return Math.floor(valor * mult);
}

/* "Dividir de outro jeito" (07/11/2026): o total é o que a divisão igual entrega (parte × participantes);
   o mestre muda as partes, e a soma precisa fechar esse total. */
export function partesIguais(total: number, participantes: number): number[] {
  const { parte } = dividirRecompensa(total, participantes);
  return Array.from({ length: Math.max(0, participantes) }, () => parte);
}

export function conferirPartes(partes: readonly number[], total: number): { soma: number; falta: number; sobra: number; fecha: boolean } {
  const soma = partes.reduce((s, p) => s + p, 0);
  return { soma, falta: Math.max(0, total - soma), sobra: Math.max(0, soma - total), fecha: soma === total && partes.every((p) => Number.isInteger(p) && p >= 0) };
}

/* Parte em % → valor, para baixo. A última pessoa fica com o que faltar para fechar, se o % somar 100. */
export function partesDePorcentagem(porcentagens: readonly number[], total: number): number[] {
  const partes = porcentagens.map((p) => Math.floor((total * p) / 100));
  const somaPct = porcentagens.reduce((s, p) => s + p, 0);
  if (partes.length && Math.abs(somaPct - 100) < 1e-9) partes[partes.length - 1]! += total - partes.reduce((s, p) => s + p, 0);
  return partes;
}
