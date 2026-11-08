import { randomUUID } from "node:crypto";
import type { Alvo, Combatente, EfeitoDeServico, EstadoVivo, MensagemClienteLida, Morrendo, Mudanca, RolagemDeCombate } from "@odm/protocolo";
import {
  aliviarEstresse,
  aplicarEfeito,
  consequenciaDeMorte,
  danoEmMorrendo,
  descansoCurto,
  descansoLongo,
  dadosDeVidaExtras,
  fontesDosEfeitos,
  entrarEmMorrendo,
  gastarHabilidade,
  gastarPa,
  ajustarFicha,
  ganharEstresse,
  habilidadesDaFicha,
  resolverCrise,
  semPvTemporarios,
  rolarDados,
  testeDeMorte,
  type Aleatorio,
  type ContextoCombate,
  type ContextoFicha,
  type FichaCalculada,
} from "@odm/regras";
import type { PersonagemBanco } from "../banco/repositorio";
import type { Combates, Recusa } from "./combate";
import type { Espectador } from "./visibilidade";

/* Morrendo, Estresse, fichas, usos e descansos (Jogador, "Morrendo e Estresse", "Descansos"; etapa 9 da fase 5).
   As funções soltas montam mudanças para quem aplica o dano (acoes.ts) e os testes (testes.ts). */

const ID_INCONSCIENTE = "efeito.inconsciente";
const recusa = (motivo: string): Recusa => ({ recusado: motivo });

export type Consequencias = { mudancas: Mudanca[]; notas: string[]; estresse: number };

/* Três falhas: 1d20 na tabela de consequência; sobrevive estável e inconsciente, ou morre com Exaustão 6. */
export function tresFalhas(alvo: Alvo, vivo: EstadoVivo, antes: Morrendo | null, ctx: ContextoCombate, aleatorio: Aleatorio): Consequencias {
  const rolagem = aleatorio(1, 20);
  const c = consequenciaDeMorte(rolagem, ctx);
  const mudancas: Mudanca[] = [];
  const notas = [`três falhas: 1d20 = ${rolagem}`];
  if (c.exaustao) {
    mudancas.push({ op: "somar", alvo, campo: "exaustao", delta: c.exaustao });
    notas.push(`+${c.exaustao} de Exaustão`);
  }
  if (c.sequela) {
    const tabela = ctx.regras.sequela?.tabela;
    const d6 = aleatorio(1, 6);
    const sequela = tabela?.[String(d6)];
    if (sequela) {
      mudancas.push({ op: "sequelas", alvo, antes: vivo.sequelas, depois: [...vivo.sequelas, sequela] });
      notas.push(`Sequela Permanente (1d6 = ${d6}): ${sequela}`);
    } else notas.push("Sequela Permanente: o mestre escolhe");
  }
  if (vivo.exaustao + c.exaustao >= 6) notas.push(`morreu (Exaustão 6)`);
  else notas.push("sobreviveu, estável e inconsciente");
  mudancas.push({ op: "morrendo", alvo, antes, depois: { sucessos: 0, falhas: 3, estavel: true } });
  return { mudancas, notas, estresse: 0 };
}

/* Perdeu PV: a 0 entra em Morrendo (com as falhas pendentes da Atitude Imprudente); já Morrendo, cada dano é 1 falha. */
export function aoPerderPv(alvo: Alvo, vivo: EstadoVivo, pvAntes: number, perda: number, ctx: ContextoCombate, aleatorio: Aleatorio): Consequencias {
  const vazio: Consequencias = { mudancas: [], notas: [], estresse: 0 };
  if (perda <= 0 || !ctx.regras.morrendo) return vazio;
  if (vivo.morrendo) {
    const d = danoEmMorrendo(vivo, ctx);
    if (!d) return vazio;
    const mudancas: Mudanca[] = [{ op: "morrendo", alvo, antes: vivo.morrendo, depois: d.depois }];
    const notas = [vivo.morrendo.estavel ? "voltou a Morrendo com 1 falha" : `${d.depois.falhas} ${d.depois.falhas === 1 ? "falha" : "falhas"} no Morrendo`];
    if (d.tresFalhas) {
      const t = tresFalhas(alvo, vivo, d.depois, ctx, aleatorio);
      mudancas.push(...t.mudancas);
      notas.push(...t.notas);
    }
    return { mudancas, notas, estresse: 0 };
  }
  if (pvAntes - perda > 0) return vazio;
  const e = entrarEmMorrendo(alvo, vivo, ctx, randomUUID);
  const notas = ["caiu: Morrendo e Inconsciente"];
  if (e.falhasImediatas) notas.push(`${e.falhasImediatas} ${e.falhasImediatas === 1 ? "falha" : "falhas"} da Atitude Imprudente`);
  if (e.exaustaoPorQueda) notas.push(`+${e.exaustaoPorQueda} de Exaustão (nova queda antes do descanso longo)`);
  const mudancas = [...e.mudancas];
  if (e.falhasImediatas >= 3) {
    const t = tresFalhas(alvo, vivo, { sucessos: 0, falhas: e.falhasImediatas, estavel: false }, ctx, aleatorio);
    mudancas.push(...t.mudancas);
    notas.push(...t.notas);
  }
  const ganho = estresseDe(ctx, "cair_a_0_pv");
  return { mudancas, notas, estresse: ganho };
}

/* Ganho do acontecimento no pacote (regra.ganhando-estresse), só com a opção da campanha ligada. */
export function estresseDe(ctx: ContextoCombate, acontecimento: string): number {
  if (!ctx.opcoes.estresse) return 0;
  const ganhos = ctx.regras.ganhandoEstresse?.ganhos as Record<string, { estresse?: number }> | undefined;
  return ganhos?.[acontecimento]?.estresse ?? 0;
}

export function alivioDe(ctx: ContextoCombate, acontecimento: string): number {
  if (!ctx.opcoes.estresse) return 0;
  const alivios = ctx.regras.aliviandoEstresse?.alivios as Record<string, { estresse?: number }> | undefined;
  return Math.abs(alivios?.[acontecimento]?.estresse ?? 0);
}

/* Estresse de um acontecimento: ganhos somados e, ao chegar ao máximo, uma Crise (aflição com dano psicológico,
   ou virtude com PV temporários, ambos 1d6 + nível). */
export function mudarEstresse(alvo: Alvo, vivo: EstadoVivo, calc: FichaCalculada, delta: number, ctx: ContextoCombate, aleatorio: Aleatorio): { mudancas: Mudanca[]; notas: string[] } {
  const maximo = calc.estresseMaximo?.valor;
  if (!ctx.opcoes.estresse || !maximo || !delta) return { mudancas: [], notas: [] };
  if (delta < 0) {
    const m = aliviarEstresse(alvo, vivo, delta);
    return { mudancas: m, notas: m.length ? [`Estresse ${delta}`] : [] };
  }
  const g = ganharEstresse(alvo, vivo, delta, maximo);
  const mudancas = [...g.mudancas];
  const notas = [`Estresse +${delta}${g.medo ? " +1 (Amedrontado)" : ""}`];
  if (!g.crise) return { mudancas, notas };
  const crise = resolverCrise(alvo, { ...vivo, estresse: maximo }, maximo, ctx, aleatorio);
  if (!crise) return { mudancas, notas: [...notas, "Crise: as tabelas ainda não estão revisadas no pacote"] };
  mudancas.push(...crise.mudancas);
  const valor = rolarDados("1d6", aleatorio).total + calc.nivel;
  const pv = vivo.pv ?? calc.pvMaximo.valor;
  if (crise.tipo === "aflicao") {
    /* "Não reduz abaixo de 1"; com 0 PV, sem dano. */
    const dano = pv > 0 ? Math.min(valor, pv - 1) : 0;
    if (dano > 0) mudancas.push({ op: "somar", alvo, campo: "pv", delta: -dano });
    notas.push(`Crise: ${crise.nome}${crise.intensidade === 2 ? " II" : ""} (aflição), ${dano} de dano psicológico`);
  } else {
    const sem = semPvTemporarios(vivo, ctx);
    if (!sem) mudancas.push({ op: "somar", alvo, campo: "pvTemporarios", delta: valor });
    notas.push(`Crise: ${crise.nome}${crise.intensidade === 2 ? " II" : ""} (virtude), ${sem ? `sem PV temporários (${sem})` : `+${valor} PV temporários`}`);
  }
  return { mudancas, notas };
}

/* Curar pelo menos 1 PV encerra o Morrendo e devolve a consciência (PV temporários não contam). */
export function curaEncerraMorrendo(alvo: Alvo, vivo: EstadoVivo): Mudanca[] {
  if (!vivo.morrendo) return [];
  const inconsciente = vivo.efeitos.find((e) => e.efeitoId === ID_INCONSCIENTE);
  return [{ op: "morrendo", alvo, antes: vivo.morrendo, depois: null }, ...(inconsciente ? [{ op: "efeito_sai" as const, alvo, efeito: inconsciente }] : [])];
}

type Hospedeiro = {
  combates: Combates;
  contextoFicha: () => ContextoFicha | null;
  personagem: (id: string) => PersonagemBanco | undefined;
  podeAgirPor: (p: PersonagemBanco, quem: Espectador) => boolean;
  campanhaId: () => string | null;
};

type MensagemDeVida = Extract<
  MensagemClienteLida,
  { t: "teste_de_morte" | "estabilizar" | "atitude_imprudente" | "estresse_ajustar" | "ficha_classe_ajustar" | "habilidade_usar" | "oferta_dispensar" | "descanso" }
>;

const OPCOES_IMPRUDENTES = { precisao: "Precisão (vantagem no próximo ataque)", potencia: "Potência (+1 dado de dano)", violencia: "Violência (rola o dano duas vezes)", impeto: "Ímpeto (+1 PA neste turno)" };

export class Vida {
  constructor(
    private readonly host: Hospedeiro,
    private readonly aleatorio: Aleatorio,
  ) {}

  receber(m: MensagemDeVida, quem: Espectador): Recusa | void {
    const r = this.host.combates.contexto();
    if ("recusado" in r) return r;
    const { ctx } = r;
    switch (m.t) {
      case "teste_de_morte":
        return this.testeDeMorte(m.personagemId, m.usarCartaDoDestino, quem, ctx);
      case "estabilizar":
        return this.estabilizar(m.personagemId, quem, ctx);
      case "atitude_imprudente":
        return this.imprudente(m.combatenteId, m.opcao, quem, ctx);
      case "estresse_ajustar":
        return this.ajustarEstresse(m.personagemId, m.delta, quem, ctx);
      case "ficha_classe_ajustar":
        return this.ajustarFichaDeClasse(m.personagemId, m.recursoId, m.delta, quem, ctx);
      case "habilidade_usar":
        return this.usarHabilidade(m.personagemId, m.habilidadeId, m.reacao, quem, ctx);
      case "oferta_dispensar":
        return this.dispensarOferta(m.combatenteId, quem, ctx);
      case "descanso":
        return this.descansar(m, quem, ctx);
    }
  }

  /* Serviço de loja (decisão de 08/11/2026): o nível de Exaustão entra no preço; o efeito roda depois do pagamento. */
  exaustaoDe(personagemId: string): number {
    const r = this.host.combates.contexto();
    if ("recusado" in r) return 0;
    return this.estado(personagemId, r.ctx)?.vivo.exaustao ?? 0;
  }

  podeUsarServico(personagemId: string): Recusa | void {
    const combate = this.host.combates.combate();
    if (combate && combate.fase !== "encerrado" && this.combatenteDe(personagemId)) return recusa("Durante o combate não dá para usar este serviço.");
  }

  efeitoDeServico(personagemId: string, efeito: EfeitoDeServico, rotulo: string, quem: Espectador): Recusa | void {
    const r = this.host.combates.contexto();
    if ("recusado" in r) return r;
    const { ctx } = r;
    const e = this.estado(personagemId, ctx);
    if (!e) return recusa("Personagem não encontrado.");
    const { alvo, vivo } = e;
    const mudancas: Mudanca[] = [];
    const feito: string[] = [];
    if (efeito.tiraExaustao && vivo.exaustao) {
      mudancas.push({ op: "somar", alvo, campo: "exaustao", delta: -vivo.exaustao });
      feito.push("sem Exaustão");
    }
    if (efeito.curaTotal) {
      /* O máximo é o de depois do serviço: sem a Exaustão, a Exaustão 5 já não corta os PV pela metade. */
      const calc = efeito.tiraExaustao ? (this.host.combates.calculo(e.p, { ...vivo, exaustao: 0 }, ctx) ?? e.calc) : e.calc;
      const pv = vivo.pv ?? calc.pvMaximo.valor;
      if (pv < calc.pvMaximo.valor) {
        mudancas.push({ op: "somar", alvo, campo: "pv", delta: calc.pvMaximo.valor - pv });
        mudancas.push(...curaEncerraMorrendo(alvo, vivo));
        feito.push("todos os PV");
      }
    }
    if (efeito.dadosDeVida && vivo.dadosDeVidaGastos) {
      mudancas.push({ op: "somar", alvo, campo: "dadosDeVidaGastos", delta: -vivo.dadosDeVidaGastos });
      feito.push("todos os Dados de Vida");
    }
    if (efeito.condicao && ctx.efeitos.has(efeito.condicao)) {
      const c = aplicarEfeito(alvo, vivo.efeitos, { id: randomUUID(), efeitoId: efeito.condicao, origem: rotulo }, ctx);
      if (!("recusado" in c)) {
        mudancas.push(c.mudanca);
        feito.push(ctx.efeitos.get(efeito.condicao)?.nome ?? "efeito");
      }
    }
    if (!mudancas.length) return;
    const res = this.host.combates.aplicar(quem, ctx, { rotulo: `${rotulo}: ${e.p.ficha.nome || "Personagem"} recebe ${feito.join(", ")}`, mudancas });
    if ("recusado" in res) return res;
  }

  private estado(id: string, ctx: ContextoCombate) {
    const p = this.host.personagem(id);
    if (!p || p.campanhaId !== this.host.campanhaId() || p.situacao !== "ativo") return null;
    const { mundo } = this.host.combates.mundo(ctx);
    const vivo = mundo.vivos[p.id] ?? p.vivo;
    const calc = this.host.combates.calculo(p, vivo, ctx);
    return calc ? { p, vivo, calc, alvo: { tipo: "personagem" as const, id: p.id } } : null;
  }

  private combatenteDe(personagemId: string): Combatente | null {
    return this.host.combates.combate()?.combatentes.find((c) => c.personagemId === personagemId) ?? null;
  }

  /* Teste de Morte (início do turno): 1d20, sucesso a partir do valor do pacote; 20 natural (ou Carta do Destino)
     acorda com 1 PV; três sucessos estabiliza; três falhas, a tabela de consequência. */
  private testeDeMorte(personagemId: string, usarCarta: boolean, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    if (!ctx.regras.morrendo) return recusa("O Morrendo ainda não foi revisado no pacote.");
    const e = this.estado(personagemId, ctx);
    if (!e) return recusa("Esse personagem não está na mesa.");
    if (!this.host.podeAgirPor(e.p, quem)) return recusa("Esse personagem não é seu.");
    const { vivo, alvo } = e;
    if (!vivo.morrendo || vivo.morrendo.estavel) return recusa("Só quem está Morrendo, e não estável, faz o Teste de Morte.");
    const c = this.combatenteDe(personagemId);
    const combate = this.host.combates.combate();
    if (c && combate && combate.fase !== "encerrado" && !c.marcas.testeDeMortePendente) return recusa("O Teste de Morte é no início do seu turno.");
    const mudancas: Mudanca[] = [];
    if (usarCarta) {
      if (!ctx.opcoes.cartasDoDestino || !vivo.cartaDoDestino) return recusa("Não há Carta do Destino para usar.");
      mudancas.push({ op: "carta_do_destino", alvo, antes: true, depois: false });
    }
    const natural = usarCarta ? 20 : this.aleatorio(1, 20);
    const r = testeDeMorte(natural, vivo, ctx);
    const nome = e.p.ficha.nome || "Personagem";
    let texto = `Teste de Morte de ${nome}: ${usarCarta ? "Carta do Destino (vale 20 natural)" : natural}`;
    if (r.acorda) {
      mudancas.push(...curaEncerraMorrendo(alvo, vivo), { op: "somar", alvo, campo: "pv", delta: 1 });
      texto += ". Acordou com 1 PV";
    } else if (r.estabiliza) {
      mudancas.push({ op: "morrendo", alvo, antes: vivo.morrendo, depois: r.morrendo });
      texto += ". Três sucessos: estável e inconsciente";
    } else if (r.tresFalhas) {
      const t = tresFalhas(alvo, vivo, vivo.morrendo, ctx, this.aleatorio);
      mudancas.push(...t.mudancas);
      texto += `. ${t.notas.join(", ")}`;
    } else {
      mudancas.push({ op: "morrendo", alvo, antes: vivo.morrendo, depois: r.morrendo });
      texto += `, ${r.sucesso ? "sucesso" : "falha"} (${r.morrendo!.sucessos} ${r.morrendo!.sucessos === 1 ? "sucesso" : "sucessos"}, ${r.morrendo!.falhas} ${r.morrendo!.falhas === 1 ? "falha" : "falhas"})`;
    }
    if (c?.marcas.testeDeMortePendente) mudancas.push({ op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: c.marcas, depois: { ...c.marcas, testeDeMortePendente: false } });
    /* O jogador vê o Teste de Morte rolar, com animação própria e as marcas de sucesso e falha (07/11/2026). */
    const marcas = r.morrendo ?? { sucessos: vivo.morrendo.sucessos, falhas: vivo.morrendo.falhas };
    const novo = r.acorda ? "acordou" : r.estabiliza ? "estavel" : r.tresFalhas ? "tres_falhas" : r.sucesso ? "sucesso" : "falha";
    const resultado = { acordou: "Acordou", estavel: "Estável", tres_falhas: "Três falhas", sucesso: "Sucesso", falha: "Falha" }[novo];
    const rolagem: RolagemDeCombate = {
      titulo: "Teste de Morte",
      subtitulo: nome,
      dados: [natural],
      escolhido: 0,
      cartas: [],
      modificadores: [],
      total: natural,
      alvo: { rotulo: "Sucesso a partir de", valor: ctx.regras.morrendo.teste_de_morte.sucesso_a_partir_de },
      resultado: { texto: resultado, bom: novo === "acordou" || novo === "estavel" || novo === "sucesso" },
      natural,
      notaFinal: texto.slice(0, 300),
      para: e.p.participanteId ? [e.p.participanteId] : [],
      morte: { sucessos: Math.min(3, marcas.sucessos), falhas: Math.min(3, marcas.falhas), novo },
    };
    const res = this.host.combates.aplicar(quem, ctx, { rotulo: texto, mudancas, autor: c, rolagem: { ...rolagem, para: [] }, rolagemJogador: rolagem });
    if ("recusado" in res) return res;
  }

  /* Kit médico ou o teste de Estabilizar que o mestre pediu: fica estável, ainda inconsciente. */
  private estabilizar(personagemId: string, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre estabiliza.");
    const e = this.estado(personagemId, ctx);
    if (!e?.vivo.morrendo || e.vivo.morrendo.estavel) return recusa("Esse personagem não está Morrendo.");
    const c = this.combatenteDe(personagemId);
    const mudancas: Mudanca[] = [{ op: "morrendo", alvo: e.alvo, antes: e.vivo.morrendo, depois: { ...e.vivo.morrendo, estavel: true } }];
    if (c?.marcas.testeDeMortePendente) mudancas.push({ op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: c.marcas, depois: { ...c.marcas, testeDeMortePendente: false } });
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${e.p.ficha.nome || "Personagem"} foi estabilizado: estável e inconsciente`, mudancas });
    if ("recusado" in r) return r;
  }

  /* Atitude Imprudente: uma vez por turno, consciente; cada uso deixa uma falha pendente (máximo do pacote). */
  private imprudente(combatenteId: string, opcao: "precisao" | "potencia" | "violencia" | "impeto", quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const regra = ctx.regras.imprudente;
    if (!regra) return recusa("A Atitude Imprudente ainda não foi revisada no pacote.");
    const combate = this.host.combates.exigirCombate("em_curso");
    if ("recusado" in combate) return combate;
    const c = combate.combatentes.find((x) => x.id === combatenteId);
    if (!c?.personagemId || !this.host.combates.podeMexer(c, quem)) return recusa("Esse personagem não é seu.");
    if (combate.ordem[combate.vez] !== c.id) return recusa("A Atitude Imprudente é no seu turno.");
    if (c.marcas.imprudenteNoTurno) return recusa("Uma vez por turno.");
    const e = this.estado(c.personagemId, ctx);
    if (!e) return recusa("Esse personagem não está na mesa.");
    if (e.vivo.morrendo) return recusa("Inconsciente não age.");
    if (e.vivo.falhasPendentes >= regra.maximo_pendentes) return recusa(`Já há ${regra.maximo_pendentes} falhas pendentes.`);
    const marcas = { ...c.marcas, imprudenteNoTurno: true, imprudente: opcao === "impeto" ? c.marcas.imprudente : opcao };
    const mudancas: Mudanca[] = [
      { op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: c.marcas, depois: marcas },
      { op: "somar", alvo: e.alvo, campo: "falhasPendentes", delta: 1 },
    ];
    if (opcao === "impeto") mudancas.push({ op: "somar", alvo: { tipo: "combatente", id: c.id }, campo: "pa.disponiveis", delta: 1 });
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${c.nome}: Atitude Imprudente, ${OPCOES_IMPRUDENTES[opcao]}. ${e.vivo.falhasPendentes + 1} falha(s) pendente(s)`, mudancas, autor: c });
    if ("recusado" in r) return r;
  }

  private ajustarEstresse(personagemId: string, delta: number, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre dá ou tira Estresse à mão.");
    if (!ctx.opcoes.estresse) return recusa("O Estresse está desligado nesta campanha.");
    const e = this.estado(personagemId, ctx);
    if (!e) return recusa("Esse personagem não está na mesa.");
    const r = mudarEstresse(e.alvo, e.vivo, e.calc, delta, ctx, this.aleatorio);
    if (!r.mudancas.length) return recusa("Nada mudou no Estresse.");
    const res = this.host.combates.aplicar(quem, ctx, { rotulo: `${e.p.ficha.nome || "Personagem"}: ${r.notas.join(". ")}`, mudancas: r.mudancas });
    if ("recusado" in res) return res;
  }

  private ajustarFichaDeClasse(personagemId: string, recursoId: string, delta: number, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const e = this.estado(personagemId, ctx);
    if (!e) return recusa("Esse personagem não está na mesa.");
    if (!this.host.podeAgirPor(e.p, quem)) return recusa("Esse personagem não é seu.");
    const ficha = e.calc.fichasDeClasse.find((f) => f.id === recursoId);
    if (!ficha) return recusa("Essa ficha de classe não é deste personagem.");
    const mudancas = ajustarFicha(e.alvo, e.vivo, ficha, delta);
    if (!mudancas.length) return recusa(delta < 0 ? "Não há fichas para gastar." : "As fichas já estão no máximo.");
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${e.p.ficha.nome || "Personagem"}: ${ficha.nome} ${delta > 0 ? "+" : "−"}${Math.abs(delta)}`, mudancas, autor: this.combatenteDe(personagemId) });
    if ("recusado" in r) return r;
  }

  /* Usar como reação (oferta depois de um ataque): paga 1 PA guardado, ou a Rainha, além do custo da habilidade,
     e a oferta se fecha. O efeito da habilidade fica combinado com o mestre, como no pop-up de teste. */
  private usarHabilidade(personagemId: string, habilidadeId: string, comoReacao: boolean, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const e = this.estado(personagemId, ctx);
    const ctxFicha = this.host.contextoFicha();
    if (!e || !ctxFicha) return recusa("Esse personagem não está na mesa.");
    if (!this.host.podeAgirPor(e.p, quem)) return recusa("Esse personagem não é seu.");
    const h = habilidadesDaFicha(e.p.ficha, ctxFicha).find((x) => x.id === habilidadeId);
    if (!h) return recusa("Essa habilidade não é deste personagem.");
    const temCusto = !!h.mecanica?.usos || !!h.mecanica?.custo?.fichas;
    if (!temCusto && !comoReacao) return recusa(`${h.nome} não tem usos nem fichas para gastar.`);
    const mudancas: Mudanca[] = [];
    if (temCusto) {
      const g = gastarHabilidade(e.alvo, h, e.vivo, e.calc);
      if ("recusado" in g) return g;
      mudancas.push(...g.mudancas);
    }
    const c = this.combatenteDe(personagemId);
    let sufixo = "";
    if (comoReacao) {
      if (!c) return recusa("Reação só em combate.");
      const gasto = gastarPa(c, 1, "reacao", { naVez: false, fontes: this.host.combates.fontesDe(c, ctx), ctx });
      if ("recusado" in gasto) return gasto;
      mudancas.push(...gasto.mudancas);
      const marcas = gasto.mudancas.filter((x) => x.op === "marcas").at(-1);
      const base = marcas && marcas.op === "marcas" ? marcas.depois : c.marcas;
      if (base.ofertaDeReacao) mudancas.push({ op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: base, depois: { ...base, ofertaDeReacao: null } });
      sufixo = gasto.semCusto ? ` como reação, sem custo (${gasto.semCusto})` : " como reação (1 PA guardado)";
    }
    const r = this.host.combates.aplicar(quem, ctx, { rotulo: `${e.p.ficha.nome || "Personagem"} usou ${h.nome}${sufixo}`, mudancas, autor: c });
    if ("recusado" in r) return r;
  }

  private dispensarOferta(combatenteId: string, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    const c = this.host.combates.combate()?.combatentes.find((x) => x.id === combatenteId);
    if (!c?.marcas.ofertaDeReacao) return recusa("Não há reação oferecida.");
    if (!this.host.combates.podeMexer(c, quem)) return recusa("Esse personagem não é seu.");
    const r = this.host.combates.aplicar(quem, ctx, {
      rotulo: `${c.nome} não usou reação depois do ataque`,
      mudancas: [{ op: "marcas", alvo: { tipo: "combatente", id: c.id }, antes: c.marcas, depois: { ...c.marcas, ofertaDeReacao: null } }],
      autor: c,
    });
    if ("recusado" in r) return r;
  }

  /* Descanso disparado pelo mestre para os personagens escolhidos; passar de 2 curtos só avisa. */
  private descansar(m: Extract<MensagemDeVida, { t: "descanso" }>, quem: Espectador, ctx: ContextoCombate): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre dispara o descanso.");
    const combate = this.host.combates.combate();
    if (combate && combate.fase !== "encerrado") return recusa("Encerre o combate antes do descanso.");
    const ctxFicha = this.host.contextoFicha();
    if (!ctxFicha) return recusa("O conteúdo da ficha não está disponível.");
    const mudancas: Mudanca[] = [];
    const linhas: string[] = [];
    for (const pedido of m.personagens) {
      const e = this.estado(pedido.personagemId, ctx);
      if (!e) continue;
      const nome = e.p.ficha.nome || "Personagem";
      const habilidades = habilidadesDaFicha(e.p.ficha, ctxFicha);
      let r;
      if (m.tipo === "curto") {
        const lados = Number(e.calc.dadoDeVida?.match(/d(\d+)/)?.[1] ?? 0);
        const extras = dadosDeVidaExtras(fontesDosEfeitos(e.vivo.efeitos, ctx));
        const disponiveis = Math.max(0, e.calc.dadosDeVida - e.vivo.dadosDeVidaGastos) + extras;
        const quantos = lados ? Math.min(pedido.dadosDeVida, disponiveis) : 0;
        const dados = Array.from({ length: quantos }, () => this.aleatorio(1, lados));
        r = descansoCurto(e.alvo, e.vivo, e.calc, habilidades, ctx, dados, Math.min(extras, quantos));
        if (extras && quantos) r.resumo.push(`${Math.min(extras, quantos)} Dado de Vida a mais (Bem Nutrido)`);
        if (dados.length) r.resumo.push(`dados: ${dados.join(", ")}`);
      } else {
        r = descansoLongo(e.alvo, e.vivo, e.calc, habilidades, ctx, { alimentado: m.alimentado, cuidadosMedicos: m.cuidadosMedicos });
        if ("recusado" in r) {
          linhas.push(`${nome}: ${r.recusado}`);
          continue;
        }
      }
      mudancas.push(...r.mudancas);
      /* Curar a partir de 0 PV acorda quem estava Morrendo. */
      if (r.mudancas.some((x) => x.op === "somar" && x.campo === "pv" && x.delta > 0)) mudancas.push(...curaEncerraMorrendo(e.alvo, e.vivo));
      linhas.push(`${nome}: ${[...r.resumo, ...r.avisos].join(", ")}`);
    }
    if (!mudancas.length) return recusa(linhas.join(". ") || "Ninguém para descansar.");
    const res = this.host.combates.aplicar(quem, ctx, { rotulo: `Descanso ${m.tipo}. ${linhas.join(". ")}`, mudancas });
    if ("recusado" in res) return res;
  }
}
