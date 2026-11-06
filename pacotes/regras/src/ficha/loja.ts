import type { Atributo } from "@odm/conteudo";
import type { CompraPrestigio, FichaDados, TalentoDeNivel } from "@odm/protocolo";
import { atributosDaFicha, habilidadesDaFicha, talentosDaFicha } from "./calculo";
import type { ContextoFicha } from "./contexto";
import { nivelDoXp, pontosDePrestigio } from "./progressao";

/* A Consagração começa depois do nível 10 (Jogador, Progressão). */
const NIVEL_MINIMO_DA_LOJA = 11;
/* Polivalência, A Ordem no Caos: cada nível de classe secundária custa 2 pontos. */
const CUSTO_POLIVALENCIA = 2;

export type IdOpcaoLoja = "tecnica_avancada" | "tecnica_lendaria" | "talento_ou_proficiencia" | "vitalidade_aprimorada" | "polivalencia";

/* motivo nulo = pode comprar. O motivo aparece no próprio botão (decisões visuais, parada 5). */
export type OpcaoLoja = { id: IdOpcaoLoja; custo: number; motivo: string | null };

export type AlvoLoja = { id: string; nome: string; texto: string; motivo: string | null };

const motivoSaldo = (custo: number, saldo: number) => (saldo < custo ? `Custa ${custo}, você tem ${saldo}` : null);


export function opcoesDaLoja(ficha: FichaDados, ctx: ContextoFicha): OpcaoLoja[] {
  const { saldo } = pontosDePrestigio(ficha, ctx);
  const nivel = nivelDoXp(ficha.xp, ctx.regras);
  const antes = nivel < NIVEL_MINIMO_DA_LOJA ? `Só depois do nível 10` : null;
  const opcoes: OpcaoLoja[] = ctx.regras.prestigio.opcoes.map((o) => {
    const exigidas = o.exige?.tecnicas_avancadas ?? 0;
    const avancadas = ficha.compras.filter((c) => c.tipo === "tecnica_avancada").length;
    const falta = avancadas < exigidas ? "Exige uma Técnica Avançada" : null;
    return { id: o.id, custo: o.custo, motivo: antes ?? falta ?? motivoSaldo(o.custo, saldo) };
  });
  const polivalencia = !ctx.opcoes.polivalencia ? "Polivalência desligada na campanha" : "Exige o pacote A Ordem no Caos";
  return [...opcoes, { id: "polivalencia", custo: CUSTO_POLIVALENCIA, motivo: polivalencia }];
}

export function tecnicasDaLoja(ficha: FichaDados, ctx: ContextoFicha, tipo: "avancada" | "lendaria"): AlvoLoja[] {
  const classe = ficha.classeId ? ctx.classes.get(ficha.classeId) : undefined;
  if (!classe) return [];
  const especializacao = ficha.especializacaoId ? ctx.especializacoes.get(ficha.especializacaoId)?.nome : null;
  const tem = new Set(habilidadesDaFicha(ficha, ctx).map((h) => h.id));
  return [...ctx.habilidades.values()]
    .filter((h) => h.classe === classe.nome && h.tecnica === tipo)
    .filter((h) => !h.especializacao || h.especializacao === especializacao)
    .map((h) => ({ id: h.id, nome: h.nome, texto: h.texto, motivo: tem.has(h.id) ? "Já comprada" : null }));
}

export function talentosDaLoja(ficha: FichaDados, ctx: ContextoFicha): AlvoLoja[] {
  const tem = new Set(talentosDaFicha(ficha, ctx).map((t) => t.id));
  return [...ctx.talentos.values()].map((t) => {
    const repetivel = t.mecanica?.repetivel;
    return { id: t.id, nome: t.nome, texto: t.texto, motivo: tem.has(t.id) && !repetivel ? "Já tem este talento" : null };
  });
}

/* Quantas opções o talento pede, se pedir. */
export function opcoesDoTalento(talentoId: string, ctx: ContextoFicha) {
  const pedido = ctx.talentos.get(talentoId)?.mecanica?.concede?.escolher;
  if (!pedido) return null;
  const lista = pedido.de === "pericias" ? [...ctx.pericias.keys()] : pedido.de;
  return { rotulo: pedido.rotulo, quantidade: pedido.quantidade, opcoes: lista };
}

export const pedeAtributo = (talentoId: string, ctx: ContextoFicha) => {
  const concede = ctx.talentos.get(talentoId)?.mecanica?.concede;
  return !!concede?.atributo_a_escolha || !!concede?.resistencia_a_escolha;
};

export function motivoDoAtributo(ficha: FichaDados, talentoId: string, atributo: Atributo | undefined, ctx: ContextoFicha): string | null {
  const concede = ctx.talentos.get(talentoId)?.mecanica?.concede;
  if (concede?.resistencia_a_escolha) {
    if (!atributo) return "Escolha o atributo";
    const repetido = talentosDaFicha(ficha, ctx).some((t) => t.id === talentoId && t.atributo === atributo);
    return repetido ? "Já escolheu este atributo" : null;
  }
  const regra = concede?.atributo_a_escolha;
  if (!regra) return null;
  if (!atributo) return "Escolha o atributo";
  return atributosDaFicha(ficha, ctx)[atributo].valor >= regra.maximo ? `Máximo ${regra.maximo} neste atributo` : null;
}

function motivoDaCompra(ficha: FichaDados, compra: CompraPrestigio, ctx: ContextoFicha): string | null {
  const tipoOpcao = compra.tipo === "talento" || compra.tipo === "proficiencia" ? "talento_ou_proficiencia" : compra.tipo;
  const opcao = opcoesDaLoja(ficha, ctx).find((o) => o.id === tipoOpcao);
  if (!opcao) return "Opção indisponível";
  if (opcao.motivo) return opcao.motivo;
  if (compra.tipo === "tecnica_avancada" || compra.tipo === "tecnica_lendaria") {
    const tipo = compra.tipo === "tecnica_avancada" ? "avancada" : "lendaria";
    const alvo = tecnicasDaLoja(ficha, ctx, tipo).find((t) => t.id === compra.habilidadeId);
    return alvo ? alvo.motivo : "Técnica fora da sua classe ou especialização";
  }
  if (compra.tipo === "talento") {
    const alvo = talentosDaLoja(ficha, ctx).find((t) => t.id === compra.talentoId);
    if (!alvo) return "Talento não encontrado";
    return alvo.motivo ?? motivoDoAtributo(ficha, compra.talentoId, compra.atributo, ctx);
  }
  return null;
}

export type ResultadoFicha = { ok: true; ficha: FichaDados } | { ok: false; motivo: string };

export function comprar(ficha: FichaDados, compra: CompraPrestigio, ctx: ContextoFicha): ResultadoFicha {
  const motivo = motivoDaCompra(ficha, compra, ctx);
  if (motivo) return { ok: false, motivo };
  return { ok: true, ficha: { ...ficha, compras: [...ficha.compras, compra] } };
}

/* Tirar a última Avançada deixaria uma Lendária sem o requisito. */
export function motivoParaNaoDesfazer(ficha: FichaDados, compraId: string, ctx: ContextoFicha): string | null {
  const compra = ficha.compras.find((c) => c.id === compraId);
  if (!compra || compra.tipo !== "tecnica_avancada") return null;
  const restam = ficha.compras.filter((c) => c.tipo === "tecnica_avancada" && c.id !== compraId).length;
  const lendaria = ficha.compras.find((c) => c.tipo === "tecnica_lendaria");
  if (restam === 0 && lendaria?.tipo === "tecnica_lendaria") {
    return `${ctx.habilidades.get(lendaria.habilidadeId)?.nome ?? "Uma Técnica Lendária"} depende desta compra`;
  }
  return null;
}

/* ---------- Escolhas de nível ---------- */

export function motivoDoTalentoDeNivel(ficha: FichaDados, escolha: TalentoDeNivel, ctx: ContextoFicha): string | null {
  if (!ctx.talentos.has(escolha.talentoId)) return "Talento não encontrado";
  const alvo = talentosDaLoja(ficha, ctx).find((t) => t.id === escolha.talentoId);
  return alvo?.motivo ?? motivoDoAtributo(ficha, escolha.talentoId, escolha.atributo, ctx);
}
