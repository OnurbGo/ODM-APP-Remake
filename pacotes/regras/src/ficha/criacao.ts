import { ATRIBUTOS } from "@odm/conteudo";
import type { FichaDados } from "@odm/protocolo";
import type { Aleatorio } from "../dados";
import type { ContextoFicha } from "./contexto";
import { atributosDaFicha, NOME_ATRIBUTO } from "./calculo";

export const PASSOS_CRIACAO = ["conceito", "origem", "classe", "atributos", "pericias", "redencao", "revisao"] as const;
export type PassoCriacao = (typeof PASSOS_CRIACAO)[number];

export type ErroCriacao = { passo: PassoCriacao; mensagem: string };

/* O que a escolha da classe pede de perícias e ferramentas. As trocas do Perito custam perícias ou ferramentas. */
export function vagasDeProficiencia(ficha: FichaDados, ctx: ContextoFicha) {
  const mecanica = ficha.classeId ? ctx.classes.get(ficha.classeId)?.mecanica : undefined;
  if (!mecanica) return null;
  const { escolher, de } = mecanica.pericias;
  const { ferramentas_a_escolher, trocas } = mecanica.proficiencias;
  const sacrificio = ficha.trocas.reduce((soma, id) => soma + (trocas.find((t) => t.ganha === id)?.sacrifica.pericias_ou_ferramentas ?? 0), 0);
  const lista = de === "qualquer" ? [...ctx.pericias.keys()] : de;
  return { total: escolher + ferramentas_a_escolher - sacrificio, pericias: escolher, ferramentas: ferramentas_a_escolher, sacrificio, lista, trocas };
}

function errosDosAtributos(ficha: FichaDados, ctx: ContextoFicha): ErroCriacao[] {
  const esperados = [...ctx.regras.atributos.valores].sort((a, b) => a - b);
  const usados = ATRIBUTOS.map((a) => ficha.atributos[a]);
  if (usados.some((v) => v === undefined)) return [{ passo: "atributos", mensagem: "Distribua um número para cada atributo." }];
  const ordenados = [...(usados as number[])].sort((a, b) => a - b);
  if (ordenados.some((v, i) => v !== esperados[i])) {
    return [{ passo: "atributos", mensagem: `Use cada número uma vez: ${ctx.regras.atributos.valores.join(", ")}.` }];
  }
  const { minimo, maximo } = ctx.regras.atributos.apos_modificadores;
  const finais = atributosDaFicha(ficha, ctx);
  return ATRIBUTOS.filter((a) => finais[a].valor < minimo || finais[a].valor > maximo).map((a) => ({
    passo: "atributos",
    mensagem: `${NOME_ATRIBUTO[a]} precisa ficar entre ${minimo} e ${maximo}.`,
  }));
}

function errosDasPericias(ficha: FichaDados, ctx: ContextoFicha): ErroCriacao[] {
  const vagas = vagasDeProficiencia(ficha, ctx);
  if (!vagas) return [];
  const erros: ErroCriacao[] = [];
  const validas = new Set(vagas.lista);
  if (ficha.pericias.some((p) => !validas.has(p))) erros.push({ passo: "pericias", mensagem: "Há perícia fora da lista da classe." });
  if (new Set(ficha.pericias).size !== ficha.pericias.length) erros.push({ passo: "pericias", mensagem: "Há perícia repetida." });
  const escolhidas = ficha.pericias.length + ficha.ferramentas.length;
  if (escolhidas !== vagas.total) erros.push({ passo: "pericias", mensagem: `Escolha ${vagas.total} entre perícias e ferramentas; agora são ${escolhidas}.` });
  for (const id of ficha.trocas) {
    const troca = vagas.trocas.find((t) => t.ganha === id);
    if (!troca) erros.push({ passo: "pericias", mensagem: "Troca de proficiência inválida." });
    else if (troca.exige && !ficha.trocas.includes(troca.exige)) erros.push({ passo: "pericias", mensagem: "Essa troca exige a anterior." });
  }
  const pedido = ficha.origemId ? ctx.origens.get(ficha.origemId)?.mecanica?.concede?.escolher : undefined;
  if (pedido && ficha.escolhasDaOrigem.length !== pedido.quantidade) {
    erros.push({ passo: "pericias", mensagem: `A origem pede ${pedido.quantidade}: ${pedido.rotulo}.` });
  }
  return erros;
}

/* Vazio = pode concluir. A tela usa a mesma lista para marcar cada passo. */
export function errosDaCriacao(ficha: FichaDados, ctx: ContextoFicha): ErroCriacao[] {
  const erros: ErroCriacao[] = [];
  if (!ficha.nome.trim()) erros.push({ passo: "conceito", mensagem: "Dê um nome ao personagem." });
  if (!ficha.origemId || !ctx.origens.has(ficha.origemId)) erros.push({ passo: "origem", mensagem: "Escolha uma origem." });
  const classe = ficha.classeId ? ctx.classes.get(ficha.classeId) : undefined;
  if (!classe) erros.push({ passo: "classe", mensagem: "Escolha uma classe." });
  else if (!classe.mecanica) erros.push({ passo: "classe", mensagem: "Esta classe ainda não foi revisada para o app." });
  return [...erros, ...errosDosAtributos(ficha, ctx), ...errosDasPericias(ficha, ctx)];
}

/* Guarda nome e texto do que o personagem tem, para sobreviver se sair do livro. */
export function copiasDaFicha(ficha: FichaDados, ctx: ContextoFicha): FichaDados["copias"] {
  const copias = { ...ficha.copias };
  const guardar = (item?: { id: string; nome: string; texto: string }) => {
    if (item) copias[item.id] = { nome: item.nome, texto: item.texto };
  };
  guardar(ficha.origemId ? ctx.origens.get(ficha.origemId) : undefined);
  guardar(ficha.classeId ? ctx.classes.get(ficha.classeId) : undefined);
  return copias;
}

/* Fórmulas como "4d50+50", da origem. */
export function rolarFormula(formula: string, aleatorio: Aleatorio) {
  const m = formula.match(/^(\d+)d(\d+)(?:\+(\d+))?$/i);
  if (!m) throw new Error(`Fórmula inválida: ${formula}`);
  let total = Number(m[3] ?? 0);
  for (let i = 0; i < Number(m[1]); i++) total += aleatorio(1, Number(m[2]));
  return total;
}

export function dinheiroInicial(ficha: FichaDados, ctx: ContextoFicha, aleatorio: Aleatorio) {
  const formula = ficha.origemId ? ctx.origens.get(ficha.origemId)?.mecanica?.concede?.dinheiro_inicial : undefined;
  return formula ? rolarFormula(formula, aleatorio) : 0;
}
