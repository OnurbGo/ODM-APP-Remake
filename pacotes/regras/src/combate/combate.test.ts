import { estadoVivoNovo, fichaVazia, opcoesPadrao, type Alvo, type Carta, type EfeitoAtivo, type EstadoVivo, type FichaDados } from "@odm/protocolo";
import { describe, expect, it } from "vitest";
import { calcularFicha, criarContexto, habilidadesDaFicha, recortarConteudoFicha } from "../index";
import { conteudoExemplo } from "../ficha/exemplo";
import { ataqueComArma, ataqueDeCriatura, rolarDanoDoAtaque } from "./ataque";
import { criarBaralho, embaralhar } from "./baralho";
import { criarContextoCombate } from "./contexto";
import { defesasDaFichaDeCriatura, resolverDano } from "./dano";
import { lerFormula, rolarDados } from "./dados";
import { completarFichas, descansoCurto, descansoLongo, fichasAtuais, gastarHabilidade, usosDoCombate } from "./descansos";
import { aplicarEfeito, descontarDuracao, disparosDoTurno, deslocamentoComEfeitos } from "./efeitos";
import { combateCom, combatente, contextoCombateExemplo, dadosFixos, regrasDeCombateExemplo } from "./exemplo";
import { alvosDoAtaqueDeHorda, bonusDeHorda, danoNaHorda, formarHorda, hordaDaFicha, multiplicadorDeArea, pvDaHorda } from "./horda";
import { ordenarIniciativa, trocarPosicoes } from "./iniciativa";
import { aplicarMudanca, aplicarMudancas, type Mundo } from "./mudancas";
import { situacaoDoVivo } from "./situacao";
import { fontesDosEfeitos, montarTeste, penalidadeDeAtaquesMultiplos, resolverTeste, valorPassivo, venceContestado } from "./testes";
import { expirarMarcasDe, fimDaRodada, fimDoTurno, gastarPa, inicioDoTurno, proximoNaOrdem } from "./turnos";
import { rolarD20ComVantagem, saldoDeVantagem } from "./vantagem";
import { consequenciaDeMorte, danoEmMorrendo, entrarEmMorrendo, ganharEstresse, resolverCrise, testeDeMorte } from "./vida";

const ctx = contextoCombateExemplo();
const eu: Alvo = { tipo: "personagem", id: "p1" };
let contador = 0;
const novoId = () => `id-${++contador}`;

const carta = (valor: Carta["valor"], naipe: Carta["naipe"] = "copas"): Carta => ({ id: `${valor}-${naipe}`, valor, naipe });
const ativo = (efeitoId: string, extra: Partial<EfeitoAtivo> = {}): EfeitoAtivo => ({
  id: novoId(),
  efeitoId,
  nome: ctx.efeitos.get(efeitoId)?.nome ?? efeitoId,
  acumulos: 1,
  nivel: null,
  turnosRestantes: null,
  origem: null,
  contadores: {},
  ...extra,
});
const vivo = (extra: Partial<EstadoVivo> = {}): EstadoVivo => ({ ...estadoVivoNovo(), ...extra });

describe("contexto do combate", () => {
  it("sem uma regra obrigatória aprovada, diz qual falta", () => {
    const r = criarContextoCombate({ regras: regrasDeCombateExemplo().filter((x) => x.id !== "regra.vantagem-e-desvantagem"), efeitos: [] });
    expect(r).toEqual({ ok: false, faltando: ["regra.vantagem-e-desvantagem"] });
  });

  it("regra opcional que falta só desliga a parte dela", () => {
    const r = criarContextoCombate({ regras: regrasDeCombateExemplo().filter((x) => x.id !== "regra.crise"), efeitos: [] });
    expect(r.ok && r.contexto.regras.crise).toBeUndefined();
  });
});

describe("dados e baralho", () => {
  it("lê fórmulas do pacote e dobra só os dados no crítico", () => {
    expect(lerFormula("2d8+3")).toEqual({ quantidade: 2, lados: 8, fixo: 3 });
    expect(lerFormula("2")).toEqual({ quantidade: 0, lados: 0, fixo: 2 });
    const r = rolarDados("1d6+2", dadosFixos(4, 5), { dobrarDados: true });
    expect(r).toMatchObject({ dados: [4, 5], fixo: 2, total: 11 });
  });

  it("o baralho tem 54 cartas, com dois Coringas sem naipe", () => {
    const b = criarBaralho();
    expect(b).toHaveLength(54);
    expect(b.filter((c) => c.valor === "coringa").every((c) => c.naipe === null)).toBe(true);
    expect(new Set(embaralhar(b, dadosFixos(0)).map((c) => c.id)).size).toBe(54);
  });
});

describe("iniciativa", () => {
  const inscrito = (id: string, c: Carta, agilidade = 0, extra: { usaEfeito?: boolean; desempate?: Carta[] } = {}) => ({ id, carta: c, agilidade, usaEfeito: extra.usaEfeito ?? false, desempate: extra.desempate ?? [] });

  it("Coringa, Ás, Rei... e Agilidade desempata a mesma carta", () => {
    const r = ordenarIniciativa([inscrito("b", carta("9")), inscrito("a", carta("A")), inscrito("c", carta("9", "paus"), 3), inscrito("d", carta("coringa", null))], ctx.regras, "naipe");
    expect(r.ordem).toEqual(["d", "a", "c", "b"]);
    expect(r.empates).toEqual([{ ids: ["c", "b"], motivo: "agilidade" }]);
  });

  it("com a mesma Agilidade, o naipe decide se a campanha escolheu naipe", () => {
    const r = ordenarIniciativa([inscrito("ouros", carta("7", "ouros")), inscrito("espadas", carta("7", "espadas"))], ctx.regras, "naipe");
    expect(r.ordem).toEqual(["espadas", "ouros"]);
    expect(r.pendentes).toEqual([]);
  });

  it("com nova compra, fica pendente até a carta extra sair, e ela decide", () => {
    const sem = ordenarIniciativa([inscrito("x", carta("7")), inscrito("y", carta("7", "paus"))], ctx.regras, "nova_compra");
    expect(sem.pendentes).toEqual([["x", "y"]]);
    const com = ordenarIniciativa([inscrito("x", carta("7"), 0, { desempate: [carta("3")] }), inscrito("y", carta("7", "paus"), 0, { desempate: [carta("K")] })], ctx.regras, "nova_compra");
    expect(com.ordem).toEqual(["y", "x"]);
    expect(com.pendentes).toEqual([]);
  });

  it("dois Coringas com a mesma Agilidade compram de novo, mesmo com a opção de naipe", () => {
    const r = ordenarIniciativa([inscrito("um", carta("coringa", null)), inscrito("dois", { id: "c2", valor: "coringa", naipe: null })], ctx.regras, "naipe");
    expect(r.pendentes).toEqual([["um", "dois"]]);
    expect(r.empates[0]!.motivo).toBe("nova_compra");
  });

  it("quem usa o efeito vai para o fim, e entre eles a carta maior age primeiro", () => {
    const r = ordenarIniciativa([inscrito("as", carta("A"), 0, { usaEfeito: true }), inscrito("rei", carta("K"), 0, { usaEfeito: true }), inscrito("dois", carta("2"))], ctx.regras, "naipe");
    expect(r.ordem).toEqual(["dois", "as", "rei"]);
  });

  it("o Coringa troca dois de lugar", () => {
    expect(trocarPosicoes(["a", "b", "c"], "a", "c")).toEqual(["c", "b", "a"]);
  });
});

describe("vantagem e desvantagem", () => {
  it("as fontes se anulam em mesma quantidade", () => {
    expect(saldoDeVantagem(2, 1)).toEqual({ lado: "vantagem", fontes: 1 });
    expect(saldoDeVantagem(1, 1)).toEqual({ lado: null, fontes: 0 });
  });

  it("Dados Extras: duas fontes rolam 3d20 e a desvantagem fica com o menor", () => {
    const v = rolarD20ComVantagem({ lado: "vantagem", fontes: 2 }, "dados_extras", ctx.regras, dadosFixos(4, 17, 9));
    expect(v).toMatchObject({ dados: [4, 17, 9], natural: 17, escolhido: 1 });
    const d = rolarD20ComVantagem({ lado: "desvantagem", fontes: 1 }, "dados_extras", ctx.regras, dadosFixos(15, 6));
    expect(d.natural).toBe(6);
  });

  it("Cartas: um d20 só, a maior carta vale e entra como modificador", () => {
    const v = rolarD20ComVantagem({ lado: "desvantagem", fontes: 2 }, "cartas", ctx.regras, dadosFixos(12, 0));
    expect(v.dados).toEqual([12]);
    expect(v.cartas).toHaveLength(2);
    expect(v.cartas.filter((c) => c.valeu)).toHaveLength(1);
    expect(v.modificadorDeCarta).toBe(-Math.max(...v.cartas.map((c) => c.modificador)));
  });
});

describe("testes", () => {
  const fontes = (...ids: string[]) => fontesDosEfeitos(ids.map((id) => ativo(id)), ctx);

  it("efeito que implica outro conta os dois, uma vez cada", () => {
    expect(fontes("efeito.zonzo", "efeito.inconsciente").map((f) => f.efeitoId)).toEqual(["efeito.zonzo", "efeito.travado", "efeito.inconsciente"]);
  });

  it("desvantagem de efeito, penalidade de Exaustão e o ajuste do mestre entram na conta", () => {
    const m = montarTeste({ teste: { tipo: "ataque", atributo: "agilidade" }, base: [{ rotulo: "Agilidade", valor: 3 }], efeitos: fontes("efeito.medroso"), exaustao: 2, ctx, bonus: 1 });
    expect(m.desvantagens).toEqual(["Medroso"]);
    expect(m.modificadores).toEqual([
      { rotulo: "Agilidade", valor: 3 },
      { rotulo: "Exaustão 2", valor: -2 },
      { rotulo: "Bônus", valor: 1 },
    ]);
  });

  it("falha automática só no atributo que o efeito diz", () => {
    expect(montarTeste({ teste: { tipo: "resistencia", atributo: "agilidade" }, base: [], efeitos: fontes("efeito.zonzo"), exaustao: 0, ctx }).falhaAutomatica).toBe("Zonzo");
    expect(montarTeste({ teste: { tipo: "resistencia", atributo: "fibra" }, base: [], efeitos: fontes("efeito.zonzo"), exaustao: 0, ctx }).falhaAutomatica).toBeNull();
  });

  it("alvo no chão: vantagem de perto, desvantagem de longe", () => {
    const alvo = fontes("efeito.no-chao");
    expect(montarTeste({ teste: { tipo: "ataque", atributo: "brutalidade" }, base: [], efeitos: [], exaustao: 0, ctx, efeitosDoAlvo: alvo, aAteUmMetro: true }).vantagens).toEqual(["No Chão (alvo)"]);
    expect(montarTeste({ teste: { tipo: "ataque", atributo: "agilidade" }, base: [], efeitos: [], exaustao: 0, ctx, efeitosDoAlvo: alvo, aAteUmMetro: false }).desvantagens).toEqual(["No Chão (alvo)"]);
  });

  const montado = { modificadores: [{ rotulo: "Mod", valor: 2 }], vantagens: [], desvantagens: [], falhaAutomatica: null };
  const resolver = (natural: number, tipo: "ataque" | "habilidade" | "resistencia", dt: number, extra: object = {}) =>
    resolverTeste(montado, { tipo, dt, modelo: "dados_extras", ctx, aleatorio: dadosFixos(natural), ...extra });

  it("igual à DT passa; 20 natural no ataque acerta qualquer Defesa; 1 natural ainda vale pelo total", () => {
    expect(resolver(13, "habilidade", 15).sucesso).toBe(true);
    expect(resolver(20, "ataque", 40)).toMatchObject({ sucesso: true, critico: "acerto" });
    expect(resolver(1, "ataque", 3)).toMatchObject({ sucesso: true, critico: "falha", total: 3 });
    expect(resolver(20, "resistencia", 40)).toMatchObject({ sucesso: false, critico: "acerto" });
  });

  it("Fazer com Calma vale 10 sem rolar; Carta do Destino garante o crítico", () => {
    expect(resolver(1, "habilidade", 12, { opcao: "fazer_com_calma" })).toMatchObject({ natural: 10, total: 12, sucesso: true });
    expect(resolver(3, "ataque", 30, { criticoGarantido: true })).toMatchObject({ natural: 20, sucesso: true, critico: "acerto" });
  });

  it("passivo: 10 + modificadores, vantagem soma 5 uma vez só", () => {
    expect(valorPassivo({ ...montado, vantagens: ["a", "b"] }, ctx).total).toBe(17);
    expect(valorPassivo({ ...montado, vantagens: ["a"], desvantagens: ["b"] }, ctx).total).toBe(12);
  });

  it("contestado: no empate vence quem age", () => {
    expect(venceContestado(14, 14, "personagem")).toBe("personagem");
    expect(venceContestado(14, 14, "oponente")).toBe("oponente");
    expect(venceContestado(13, 14, "personagem")).toBe("oponente");
  });

  it("ataques múltiplos usam a penalidade do pacote", () => {
    expect(penalidadeDeAtaquesMultiplos(0, ctx)).toBeNull();
    expect(penalidadeDeAtaquesMultiplos(2, ctx)).toEqual({ rotulo: "Ataques múltiplos", valor: -8 });
  });
});

describe("dano", () => {
  const defesas = { imunidades: ["veneno"], resistencias: ["fogo"], vulnerabilidades: ["gelo"], rd: 2, pvTemporarios: 3 };

  it("na ordem: resistência (metade para baixo), RD e PV temporários", () => {
    const r = resolverDano({ valor: 11, tipo: "Fogo" }, defesas);
    expect(r.conta.map((p) => p.rotulo)).toEqual(["Dano (Fogo)", "Resistência", "RD", "PV temporários"]);
    expect(r).toMatchObject({ final: 3, absorvidoPorTemporarios: 3, perdaDePv: 0 });
  });

  it("imunidade zera, vulnerabilidade dobra antes da RD, e metade nunca passa de 1 para 0", () => {
    expect(resolverDano({ valor: 9, tipo: "veneno" }, defesas).final).toBe(0);
    expect(resolverDano({ valor: 5, tipo: "gelo" }, { ...defesas, pvTemporarios: 0 }).final).toBe(8);
    expect(resolverDano({ valor: 1, tipo: "fogo" }, { ...defesas, rd: 0, pvTemporarios: 0 }).final).toBe(1);
  });

  it("indefensável ignora imunidade, resistência e RD; perda direta ignora só a RD", () => {
    expect(resolverDano({ valor: 4, tipo: "Indefensável" }, { ...defesas, imunidades: ["indefensavel"], pvTemporarios: 0 }).final).toBe(4);
    expect(resolverDano({ valor: 4, tipo: null, ignoraRd: true }, defesas)).toMatchObject({ final: 4, perdaDePv: 1 });
  });

  it("lê as defesas da ficha de criatura", () => {
    expect(defesasDaFichaDeCriatura(["Imunidade a Dano: Veneno", "Imunidade a Condição: Envenenado", "Vulnerabilidade: Fogo", "RD: 2", "Sentidos: nada"])).toEqual({
      imunidades: ["veneno"],
      resistencias: [],
      vulnerabilidades: ["fogo"],
      imunidadesACondicao: ["envenenado"],
      rd: 2,
    });
  });
});

describe("mudanças e desfazer", () => {
  const mundo = (v: EstadoVivo = vivo()): Mundo => ({ vivos: { p1: v }, combate: null });
  const limites = { pvMaximo: () => 20 };

  it("PV cheio começa no máximo, e a inversa leva só o que entrou depois do limite", () => {
    const r = aplicarMudanca(mundo(), { op: "somar", alvo: eu, campo: "pv", delta: -25 }, limites);
    expect(r.mundo.vivos.p1!.pv).toBe(0);
    expect(r.inversa).toMatchObject({ delta: 20 });
  });

  it("desfazer o primeiro dano mantém o segundo", () => {
    const a = aplicarMudanca(mundo(), { op: "somar", alvo: eu, campo: "pv", delta: -5 }, limites);
    const b = aplicarMudanca(a.mundo, { op: "somar", alvo: eu, campo: "pv", delta: -3 }, limites);
    const desfeito = aplicarMudanca(b.mundo, a.inversa, limites);
    expect(desfeito.mundo.vivos.p1!.pv).toBe(17);
  });

  it("efeito entra e sai pela inversa; sequência desfaz na ordem certa", () => {
    const e = ativo("efeito.medroso");
    const { mundo: depois, inversas } = aplicarMudancas(mundo(), [
      { op: "efeito_entra", alvo: eu, efeito: e },
      { op: "somar", alvo: eu, campo: "exaustao", delta: 2 },
    ]);
    expect(depois.vivos.p1!.efeitos).toHaveLength(1);
    const voltou = aplicarMudancas(depois, inversas).mundo.vivos.p1!;
    expect(voltou.efeitos).toEqual([]);
    expect(voltou.exaustao).toBe(0);
  });

  it("desfazer a mudança de um combatente volta só o que ela mexeu", () => {
    const antes = combatente("a");
    const combate = combateCom([antes]);
    const carta = aplicarMudanca({ vivos: {}, combate }, { op: "combatente_muda", antes, depois: { ...antes, carta: { id: "A-copas", valor: "A", naipe: "copas" } } });
    const comPa = aplicarMudanca(carta.mundo, { op: "somar", alvo: { tipo: "combatente", id: "a" }, campo: "pa.disponiveis", delta: 3 });
    const desfeito = aplicarMudanca(comPa.mundo, carta.inversa).mundo.combate!.combatentes[0]!;
    expect(desfeito.carta).toBeNull();
    expect(desfeito.pa.disponiveis).toBe(3);
  });

  it("combatente sai e volta na mesma posição", () => {
    const combate = combateCom([combatente("a"), combatente("b"), combatente("c")]);
    const r = aplicarMudanca({ vivos: {}, combate }, { op: "combatente_sai", combatente: combate.combatentes[1]!, posicao: null });
    expect(r.mundo.combate!.ordem).toEqual(["a", "c"]);
    expect(aplicarMudanca(r.mundo, r.inversa).mundo.combate!.ordem).toEqual(["a", "b", "c"]);
  });
});

describe("efeitos automáticos", () => {
  it("acumula até o máximo e recusa passar dele", () => {
    const um = ativo("efeito.sangria", { acumulos: 3 });
    expect(aplicarEfeito(eu, [um], { id: "x", efeitoId: "efeito.sangria" }, ctx)).toEqual({ recusado: "Sangria já está no máximo." });
    const r = aplicarEfeito(eu, [{ ...um, acumulos: 1 }], { id: "x", efeitoId: "efeito.sangria", acumulos: 1 }, ctx);
    expect("mudanca" in r && r.mudanca.op === "efeito_muda" && r.mudanca.depois.acumulos).toBe(2);
  });

  it("imunidade a condição recusa o efeito", () => {
    expect(aplicarEfeito(eu, [], { id: "x", efeitoId: "efeito.medroso" }, ctx, ["medroso"])).toEqual({ recusado: "Imune a Medroso." });
  });

  it("início do turno: perda por acúmulo; fim do turno: teste oferecido", () => {
    const sangria = ativo("efeito.sangria", { acumulos: 2 });
    expect(disparosDoTurno([sangria], "inicio_do_turno", ctx)).toMatchObject([{ tipo: "perda", formula: "1d4", vezes: 2, ignoraRd: true }]);
    expect(disparosDoTurno([sangria], "fim_do_turno", ctx)).toMatchObject([{ tipo: "teste", teste: { tipo: "resistencia", atributo: "fibra", dt: 12 }, removeAcumulos: 1 }]);
  });

  it("duração desconta no fim do turno e encerra no zero", () => {
    const e = ativo("efeito.passageiro", { turnosRestantes: 2 });
    expect(descontarDuracao(eu, [e])).toMatchObject([{ op: "efeito_muda", depois: { turnosRestantes: 1 } }]);
    expect(descontarDuracao(eu, [{ ...e, turnosRestantes: 1 }])).toMatchObject([{ op: "efeito_sai" }]);
  });

  it("fixar vence metade no deslocamento", () => {
    const f = fontesDosEfeitos([ativo("efeito.no-chao"), ativo("efeito.preso")], ctx);
    expect(deslocamentoComEfeitos(6, f)).toEqual({ valor: 0, motivo: "Preso" });
    expect(deslocamentoComEfeitos(5, fontesDosEfeitos([ativo("efeito.no-chao")], ctx))).toEqual({ valor: 2, motivo: "No Chão" });
  });
});

describe("Horda", () => {
  const regras = { minimoIntegrantes: 3, danoPorIntegrante: 10, desfazCom: 2, bonusMaximo: 8, paPorTurno: 3 };
  const zumbi = (id: string, pv: number) => ({ id, nome: id, pv, elite: false });

  it("bônus de 1 a cada três, até o máximo, e metade dele em alvos, mínimo 1", () => {
    expect(bonusDeHorda(7, 8)).toBe(2);
    expect(bonusDeHorda(40, 8)).toBe(8);
    expect(alvosDoAtaqueDeHorda(1)).toBe(1);
    expect(alvosDoAtaqueDeHorda(5)).toBe(2);
  });

  it("precisa do mínimo para formar e soma os PV atuais", () => {
    expect(formarHorda([zumbi("a", 10), zumbi("b", 10)], regras)).toEqual({ recusado: "A Horda precisa de pelo menos 3 Zumbis." });
    const r = formarHorda([zumbi("a", 10), zumbi("b", 4), zumbi("c", 10), zumbi("d", 10)], regras);
    expect("horda" in r && pvDaHorda(r.horda)).toBe(34);
  });

  it("a cada 10 de dano sai um; com 2 ou menos, desfaz e divide os PV que sobram", () => {
    const r = formarHorda([zumbi("a", 10), zumbi("b", 4), zumbi("c", 10), zumbi("d", 10)], regras);
    if (!("horda" in r)) throw new Error();
    const primeiro = danoNaHorda(r.horda, 9, regras);
    expect(primeiro.removidos).toEqual([]);
    const segundo = danoNaHorda(primeiro.horda, 11, regras);
    expect(segundo.removidos.map((z) => z.id)).toEqual(["b", "a"]);
    expect(segundo.desfeita!.integrantes.map((z) => z.pv)).toEqual([7, 7]);
  });

  it("quem sai não leva PV a mais: a conta é sempre os PV iniciais menos o dano acumulado", () => {
    const r = formarHorda([zumbi("a", 10), zumbi("b", 10), zumbi("c", 10), zumbi("d", 10)], regras);
    if (!("horda" in r)) throw new Error();
    const um = danoNaHorda(r.horda, 10, regras);
    expect(um.removidos).toHaveLength(1);
    expect(pvDaHorda(um.horda)).toBe(30);
    const dois = danoNaHorda(um.horda, 10, regras);
    expect(dois.desfeita!.integrantes.map((z) => z.pv)).toEqual([10, 10]);
  });

  it("dano em área: ×2 com 3 espaços, ×3 com 6, nunca mais que ×3", () => {
    const tabela = [{ a_partir_de: 3, vezes: 2 }, { a_partir_de: 6, vezes: 3 }];
    expect(multiplicadorDeArea(2, tabela, 3)).toBe(1);
    expect(multiplicadorDeArea(4, tabela, 3)).toBe(2);
    expect(multiplicadorDeArea(9, tabela, 3)).toBe(3);
  });
});

describe("Morrendo", () => {
  it("cair registra as falhas pendentes e, se não for a primeira queda, dá Exaustão", () => {
    const r = entrarEmMorrendo(eu, vivo({ falhasPendentes: 2, quedasDesdeODescansoLongo: 1 }), ctx, novoId);
    expect(r.falhasImediatas).toBe(2);
    expect(r.exaustaoPorQueda).toBe(1);
    expect(r.mudancas).toContainEqual({ op: "morrendo", alvo: eu, antes: null, depois: { sucessos: 0, falhas: 2, estavel: false } });
    expect(r.mudancas.some((m) => m.op === "efeito_entra")).toBe(true);
  });

  it("20 natural acorda; três sucessos estabilizam; três falhas vão à tabela", () => {
    const morrendo = vivo({ morrendo: { sucessos: 2, falhas: 2, estavel: false } });
    expect(testeDeMorte(20, morrendo, ctx)).toMatchObject({ acorda: true, morrendo: null });
    expect(testeDeMorte(10, morrendo, ctx)).toMatchObject({ estabiliza: true, morrendo: { estavel: true } });
    expect(testeDeMorte(9, morrendo, ctx).tresFalhas).toBe(true);
    expect(consequenciaDeMorte(1, ctx)).toEqual({ rolagem: 1, exaustao: 3, sequela: true });
  });

  it("estável que sofre dano volta a Morrendo com uma falha", () => {
    expect(danoEmMorrendo(vivo({ morrendo: { sucessos: 3, falhas: 1, estavel: true } }), ctx)).toEqual({ depois: { sucessos: 0, falhas: 1, estavel: false }, tresFalhas: false });
  });
});

describe("Estresse e Crise", () => {
  it("Medo soma 1, e chegar ao máximo dispara a Crise", () => {
    const r = ganharEstresse(eu, vivo({ estresse: 7, efeitos: [ativo("efeito.amedrontado")] }), 2, 10);
    expect(r.mudancas).toEqual([{ op: "somar", alvo: eu, campo: "estresse", delta: 3 }]);
    expect(r.crise).toBe(true);
  });

  it("a Crise leva o Estresse à metade e a aflição repetida sobe para II", () => {
    const antes = vivo({ estresse: 11, aflicoes: [{ linha: "3", nome: "Aflição 3", intensidade: 1 }] });
    const r = resolverCrise(eu, antes, 11, ctx, dadosFixos(2, 3))!;
    expect(r.mudancas[0]).toEqual({ op: "somar", alvo: eu, campo: "estresse", delta: -6 });
    expect(r).toMatchObject({ tipo: "aflicao", intensidade: 2 });
  });
});

describe("ficha com estado vivo, fichas e descansos", () => {
  const r = criarContexto(recortarConteudoFicha(conteudoExemplo()), opcoesPadrao());
  if (!r.ok) throw new Error();
  const ctxFicha = r.contexto;
  const ficha: FichaDados = { ...fichaVazia(), nome: "Zé", classeId: "classe.rufiao", atributos: { brutalidade: 0, agilidade: 3, fibra: 2, intelecto: 0, astucia: 1, presenca: -1 }, xp: 400 };
  const calc = calcularFicha(ficha, ctxFicha);

  it("Dados de Vida: 1 no 1º nível e mais 1 a cada dois", () => {
    expect(calc.dadosDeVida).toBe(3);
    expect(calc.dadoDeVida).toBe("3d8");
  });

  it("Exaustão 4: metade dos PV máximos e a Defesa reduzida, com a conta", () => {
    const comExaustao = calcularFicha(ficha, ctxFicha, situacaoDoVivo(vivo({ exaustao: 4 }), ctx));
    expect(comExaustao.pvMaximo.valor).toBe(Math.floor(calc.pvMaximo.valor / 2));
    expect(comExaustao.defesa.valor).toBe(calc.defesa.valor - 4);
    expect(comExaustao.defesa.conta.at(-1)).toEqual({ rotulo: "Exaustão 4", valor: -4 });
    expect(comExaustao.rd.valor).toBe(0);
  });

  it("efeito que prende fixa o deslocamento em 0", () => {
    expect(calcularFicha(ficha, ctxFicha, situacaoDoVivo(vivo({ efeitos: [ativo("efeito.preso")] }), ctx)).deslocamento.valor).toBe(0);
  });

  it("gastar fichas e desfazer volta ao valor inicial", () => {
    const folego = calc.fichasDeClasse.find((f) => f.id === "recurso.rufiao.astucia")!;
    const inicial = completarFichas(vivo(), calc);
    const gasto = gastarHabilidade(eu, { id: "h", nome: "Golpe", mecanica: { custo: { fichas: { recurso: folego.id, quantidade: 2 } } } }, inicial, calc);
    if (!("mudancas" in gasto)) throw new Error(gasto.recusado);
    const { mundo, inversas } = aplicarMudancas({ vivos: { p1: inicial }, combate: null }, gasto.mudancas);
    expect(fichasAtuais(mundo.vivos.p1!, folego)).toBe(folego.maximo.valor - 2);
    expect(fichasAtuais(aplicarMudancas(mundo, inversas).mundo.vivos.p1!, folego)).toBe(folego.maximo.valor);
  });

  it("uso acabado é recusado com o motivo e quando volta", () => {
    const h = { id: "h", nome: "Golpe", mecanica: { usos: { quantidade: 1, por: "descanso_curto" as const } } };
    expect(gastarHabilidade(eu, h, vivo({ usos: { h: 1 } }), calc)).toEqual({ recusado: "Golpe já foi usada. Volta no descanso curto." });
  });

  it("descanso curto: Fibra e Dados de Vida; zera os usos por descanso curto", () => {
    const h = { id: "h", nome: "Golpe", mecanica: { usos: { quantidade: 1, por: "descanso_curto" as const } } };
    const d = descansoCurto(eu, vivo({ pv: 5, usos: { h: 1 } }), calc, [h], ctx, [4, 1]);
    expect(d.mudancas).toContainEqual({ op: "somar", alvo: eu, campo: "pv", delta: 2 + (4 + 2) + (1 + 2) });
    expect(d.mudancas).toContainEqual({ op: "uso", alvo: eu, habilidadeId: "h", delta: -1 });
    expect(d.mudancas).toContainEqual({ op: "somar", alvo: eu, campo: "dadosDeVidaGastos", delta: 2 });
  });

  it("o terceiro descanso curto avisa", () => {
    expect(descansoCurto(eu, vivo({ descansosCurtos: 2 }), calc, [], ctx).avisos).toHaveLength(1);
  });

  it("descanso longo: metade dos PV, metade dos Dados de Vida, Exaustão −1 com comida; com 0 PV não há", () => {
    const d = descansoLongo(eu, vivo({ pv: 3, dadosDeVidaGastos: 3, exaustao: 2 }), calc, [], ctx, { alimentado: true });
    if ("recusado" in d) throw new Error();
    expect(d.mudancas).toContainEqual({ op: "somar", alvo: eu, campo: "pv", delta: Math.floor(calc.pvMaximo.valor / 2) });
    expect(d.mudancas).toContainEqual({ op: "somar", alvo: eu, campo: "dadosDeVidaGastos", delta: -1 });
    expect(d.mudancas).toContainEqual({ op: "somar", alvo: eu, campo: "exaustao", delta: -1 });
    expect(descansoLongo(eu, vivo({ pv: 0 }), calc, [], ctx, { alimentado: true })).toHaveProperty("recusado");
  });

  it("habilidades da ficha chegam com a mecânica que os descansos leem", () => {
    expect(habilidadesDaFicha(ficha, ctxFicha).map((h) => h.id)).toContain("habilidade.rufiao.soco");
  });
});

describe("turnos e PA", () => {
  const fontes = (...ids: string[]) => fontesDosEfeitos(ids.map((id) => ativo(id)), ctx);

  it("início do turno: efeito tira PA, e o Ás dá 1 a mais só no primeiro turno", () => {
    const c = combatente("a", { marcas: { ...combatente("x").marcas, paExtraNoPrimeiroTurno: 1 } });
    const r = inicioDoTurno(c, fontes("efeito.medroso"), 3, ctx, dadosFixos(1));
    expect(r.mudancas).toEqual([
      { op: "somar", alvo: { tipo: "combatente", id: "a" }, campo: "pa.disponiveis", delta: 3 },
      { op: "somar", alvo: { tipo: "combatente", id: "a" }, campo: "pa.bloqueados", delta: 1 },
    ]);
    expect(inicioDoTurno({ ...c, jaAgiu: true }, [], 3, ctx, dadosFixos(1)).asExtra).toBe(0);
  });

  it("criatura com Recarga gasta rola 1d6 no início do turno", () => {
    expect(inicioDoTurno(combatente("z", { recargasGastas: ["sopro"] }), [], 3, ctx, dadosFixos(5)).recargas).toEqual([{ acaoId: "sopro", rolagem: 5 }]);
  });

  it("o que sobra no turno fica guardado até o fim da rodada", () => {
    const c = combatente("a", { pa: { disponiveis: 2, guardados: 0, bloqueados: 0 } });
    expect(fimDoTurno(c)).toContainEqual({ op: "somar", alvo: { tipo: "combatente", id: "a" }, campo: "pa.guardados", delta: 2 });
    const { mundo } = aplicarMudancas({ vivos: {}, combate: combateCom([c]) }, fimDoTurno(c));
    expect(mundo.combate!.combatentes[0]).toMatchObject({ jaAgiu: true, pa: { disponiveis: 0, guardados: 2 } });
    const combate = combateCom([{ ...c, pa: { disponiveis: 0, guardados: 2, bloqueados: 0 }, deslocamentosNaRodada: 2 }]);
    expect(fimDaRodada(combate)).toEqual([
      { op: "somar", alvo: { tipo: "combatente", id: "a" }, campo: "pa.guardados", delta: -2 },
      { op: "somar", alvo: { tipo: "combatente", id: "a" }, campo: "deslocamentosNaRodada", delta: -2 },
    ]);
  });

  it("reação gasta do guardado; a Rainha faz a primeira sair de graça", () => {
    const c = combatente("a", { pa: { disponiveis: 0, guardados: 1, bloqueados: 0 } });
    expect(gastarPa(c, 1, "reacao", { naVez: false, fontes: [], ctx })).toMatchObject({ mudancas: [{ campo: "pa.guardados", delta: -1 }] });
    expect(gastarPa({ ...c, pa: { disponiveis: 0, guardados: 0, bloqueados: 0 } }, 1, "reacao", { naVez: false, fontes: [], ctx })).toEqual({ recusado: "Sem PA guardado para isso: custa 1, guardados 0." });
    const rainha = { ...c, marcas: { ...c.marcas, reacaoSemCusto: { ate: "b" } } };
    expect(gastarPa(rainha, 1, "reacao", { naVez: false, fontes: [], ctx })).toMatchObject({ semCusto: "Rainha" });
    expect(expirarMarcasDe(combateCom([rainha]), "b")).toHaveLength(1);
  });

  it("o terceiro deslocamento da rodada dá 1 nível de Exaustão, uma vez", () => {
    const c = combatente("a", { pa: { disponiveis: 3, guardados: 0, bloqueados: 0 }, deslocamentosNaRodada: 2 });
    const r = gastarPa(c, 1, "deslocamento", { naVez: true, fontes: [], ctx, personagem: eu });
    expect(r).toMatchObject({ exaustao: true });
    expect("mudancas" in r && r.mudancas).toContainEqual({ op: "somar", alvo: eu, campo: "exaustao", delta: 1 });
    expect(gastarPa({ ...c, deslocamentosNaRodada: 3 }, 1, "deslocamento", { naVez: true, fontes: [], ctx, personagem: eu })).toMatchObject({ exaustao: false });
  });

  it("travado não gasta PA em ação, só em deslocamento", () => {
    const c = combatente("a", { pa: { disponiveis: 3, guardados: 0, bloqueados: 0 } });
    expect(gastarPa(c, 1, "acao", { naVez: true, fontes: fontes("efeito.travado"), ctx })).toEqual({ recusado: "Travado: só dá para gastar PA em deslocamento." });
    expect(gastarPa(c, 1, "deslocamento", { naVez: true, fontes: fontes("efeito.travado"), ctx })).not.toHaveProperty("recusado");
  });

  it("a vez pula quem foi derrotado, e depois do último vem o fim da rodada", () => {
    const combate = combateCom([combatente("a"), combatente("b", { derrotado: true }), combatente("c")]);
    expect(proximoNaOrdem(combate).vez).toBe(2);
    const fim = proximoNaOrdem({ ...combate, vez: 2 });
    expect(fim.fase).toBe("fim_da_rodada");
    expect(proximoNaOrdem({ ...combate, fase: "fim_da_rodada", vez: 2 })).toMatchObject({ fase: "em_curso", rodada: 2, vez: 0 });
  });
});

describe("ataque", () => {
  const ctx = contextoCombateExemplo();
  const fila = (valores: number[]) => (minimo: number, maximo: number) => valores.shift() ?? Math.min(maximo, Math.max(minimo, 1));

  it("criatura: o acerto e o dano vêm da mecânica revisada; sem ela, não há ataque automático", () => {
    const acao = { rotulo: "Garra", custoPa: null, inicio: false, combo: true, mecanica: { tipo: "corpo_a_corpo", acerto: 4, alcance_m: 1, alvos: 1, dano: { formula: "1d6+2", tipo: "cortante" }, custo: { pa: 1 } } };
    const montado = ataqueDeCriatura(acao)!;
    expect(montado).toMatchObject({ acerto: [{ rotulo: "Acerto", valor: 4 }], custoPa: 1, combo: true, corpoACorpo: true });
    expect(ataqueDeCriatura({ ...acao, mecanica: undefined })).toBeNull();
  });

  it("arma: atributo e proficiência no acerto; sem proficiência em arma de fogo, a penalidade do pacote", () => {
    const ficha = { atributos: { brutalidade: { valor: 3 }, agilidade: { valor: 2 }, fibra: { valor: 0 }, intelecto: { valor: 0 }, astucia: { valor: 0 }, presenca: { valor: 0 } }, proficiencia: 2, categorias: new Set(["armas_simples"]) };
    const porrete = ataqueComArma({ nome: "Porrete", mecanica: { ataque: { categoria: "armas_simples", tipo: "corpo_a_corpo", atributo: "brutalidade", dano: { formula: "1d6", tipo: "contundente" } } } }, ficha, ctx, 1)!;
    expect(porrete.acerto).toEqual([{ rotulo: "Brutalidade", valor: 3 }, { rotulo: "Proficiência", valor: 2 }]);
    expect(porrete.dano.bonus).toEqual([{ rotulo: "Brutalidade", valor: 3 }]);
    const ctxComRegra = { ...ctx, regras: { ...ctx.regras, semProficiencia: { arma_de_fogo_sem_proficiencia: { ataque: -7 } } } };
    const revolver = ataqueComArma({ nome: "Revólver", mecanica: { ataque: { categoria: "armas_de_fogo_curtas", tipo: "distancia", arma_de_fogo: true, atributo: ["brutalidade", "agilidade"], dano: { formula: "1d10", tipo: "perfurante" } } } }, ficha, ctxComRegra, 1)!;
    expect(revolver.acerto).toEqual([{ rotulo: "Brutalidade", valor: 3 }, { rotulo: "Sem proficiência", valor: -7 }]);
  });

  it("crítico dobra só os dados; o bônus soma uma vez", () => {
    const dano = { formula: "1d6+2", tipo: "cortante", bonus: [{ rotulo: "Brutalidade", valor: 3 }] };
    expect(rolarDanoDoAtaque(dano, false, fila([4])).total).toBe(9);
    expect(rolarDanoDoAtaque(dano, true, fila([4, 5])).total).toBe(14);
  });
});

describe("Horda da ficha", () => {
  const a = (id: string, mecanica: Record<string, unknown>) => ({ id, custoPa: null, mecanica });
  it("lê formar, PV, bônus, ameaça, pressão, ataque e área; sem os três primeiros, não há Horda", () => {
    const acoes = [
      a("formar", { requisito: { minimo_integrantes: 4 }, pa_por_turno: 2 }),
      a("pv", { dano_por_integrante: 7, desfaz_com_integrantes: 1 }),
      a("bonus", { bonus: { maximo: 6 } }),
      a("ameaca", { testes: [{ em: ["resistencia", "reacoes"], modificador: -3 }] }),
      a("pressao", { gatilhos: [{ faz: { dano: "bonus_de_horda" } }] }),
      a("ataque", { custo: { pa: 2 }, ataque_a_escolha: ["garra"] }),
      a("area", { ao_receber_dano_em_area: { multiplicador: [{ a_partir_de: 2, vezes: 2 }], maximo: 2 } }),
    ];
    expect(hordaDaFicha(acoes)).toEqual({
      regras: { minimoIntegrantes: 4, danoPorIntegrante: 7, desfazCom: 1, bonusMaximo: 6, paPorTurno: 2 },
      ameaca: -3,
      pressao: true,
      ataqueDeHorda: { acaoId: "ataque", escolhas: ["garra"], custoPa: 2 },
      area: { tabela: [{ a_partir_de: 2, vezes: 2 }], maximo: 2 },
    });
    expect(hordaDaFicha(acoes.filter((x) => x.id !== "pv"))).toBeNull();
  });
});

describe("usos por combate", () => {
  it("voltam ao fim do combate; os de descanso, não", () => {
    const alvo: Alvo = { tipo: "personagem", id: "p" };
    const vivo = { ...estadoVivoNovo(), usos: { a: 1, b: 1 } };
    const habilidades = [
      { id: "a", nome: "A", mecanica: { usos: { quantidade: 1, por: "combate" as const } } },
      { id: "b", nome: "B", mecanica: { usos: { quantidade: 1, por: "descanso_curto" as const } } },
    ];
    expect(usosDoCombate(alvo, vivo, habilidades)).toEqual([{ op: "uso", alvo, habilidadeId: "a", delta: -1 }]);
  });
});

describe("turno de quem está inconsciente", () => {
  it("perde todos os PA do turno: não sobra nada para guardar (decisão de 07/11/2026)", () => {
    const ctx = contextoCombateExemplo();
    const c = combatente("p", { pa: { disponiveis: 0, guardados: 0, bloqueados: 0 } });
    const r = inicioDoTurno(c, fontesDosEfeitos([{ id: "e", efeitoId: "efeito.inconsciente", nome: "Inconsciente", acumulos: 1, nivel: null, turnosRestantes: null, origem: null, contadores: {} }], ctx), 3, ctx, () => 1);
    expect(r.perdidos).toBe(3);
    expect(r.mudancas).toContainEqual({ op: "somar", alvo: { tipo: "combatente", id: "p" }, campo: "pa.bloqueados", delta: 3 });
    expect(r.mudancas.some((m) => m.op === "somar" && m.campo === "pa.disponiveis")).toBe(false);
  });
});
