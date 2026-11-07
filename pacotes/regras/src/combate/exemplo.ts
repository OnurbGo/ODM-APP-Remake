import type { Efeito } from "@odm/conteudo";
import { opcoesPadrao, type Combatente, type EstadoCombate, type OpcoesCampanha } from "@odm/protocolo";
import { fonte } from "../ficha/exemplo";
import { criarContextoCombate, type ContextoCombate } from "./contexto";

/* Tudo aqui é fictício, como em ficha/exemplo.ts: o repositório é público e não leva texto dos livros.
   Os números mudam de propósito (penalidade de −4, carta que dá +7), para os testes provarem que o motor
   lê o pacote em vez de trazer o valor escrito no código. */

const regra = (id: string, mecanica: Record<string, unknown>) => ({ id, tipo: "regra" as const, nome: id, fonte, texto: "", mecanica });

const reacao = (atributo: string) => ({ custo: { reacao: true, pa: 1 }, gatilho: "ataque_contra_si", defesa: { soma: atributo, contra: "proximo_ataque", ate: "fim_da_rodada" } });

export const regrasDeCombateExemplo = () => [
  regra("regra.iniciativa", { baralho: { padrao: true, coringas: 2 }, ordem: ["coringa", "A", "K", "Q", "J", "10", "9", "8", "7", "6", "5", "4", "3", "2"] }),
  regra("regra.desempate", { criterios: ["agilidade", "opcao_da_campanha"], opcao_da_campanha: { naipe: ["espadas", "copas", "paus", "ouros"], nova_compra: true }, dois_coringas: { nova_compra: true } }),
  regra("regra.cartas-especiais-e-seus-efeitos", {
    uma_vez_por_combate: "por_pessoa",
    efeitos: { coringa: { trocar_posicao: { alvos: 2 } }, A: { pa_extra: 1 }, K: {}, Q: {}, J: { deslocamento_sem_custo: 1 } },
  }),
  regra("regra.gastando-os-pa", { deslocamento: { custo_pa: 1 }, mais_de_dois_deslocamentos_na_rodada: { exaustao: 1 } }),
  regra("regra.guardando-acoes", { pa_nao_gastos: { guardados_ate: "fim_da_rodada" } }),
  regra("regra.ataques-multiplos", { penalidade_por_ataque_anterior: -4 }),
  regra("regra.acerto-critico", { natural: 20, acerta_sempre: true, falha_critica: { natural: 1 } }),
  regra("regra.esquiva", reacao("agilidade")),
  regra("regra.bloqueio", reacao("fibra")),
  regra("regra.vantagem-e-desvantagem", {
    modelos: {
      dados_extras: { uma_fonte: 2, duas_ou_mais: 3, maximo_d20: 3 },
      cartas: {
        uma_fonte: 1,
        duas_ou_mais: 2,
        maximo_cartas: 2,
        modificador: { "2": 1, "3": 1, "4": 1, "5": 1, "6": 2, "7": 2, "8": 2, "9": 2, "10": 3, J: 3, Q: 4, K: 4, A: 5, coringa: 7 },
      },
    },
  }),
  regra("regra.testes-de-habilidade", { escala_dt: { facil: 10, dificil: 20 } }),
  regra("regra.testes-passivos", { base: 10, vantagem: 5, desvantagem: -5 }),
  regra("regra.teste-contestado-ao-se-esconder", { contestado: { empate: "vence_quem_age" } }),
  regra("regra.fazer-com-calma", { d20_vale: 10 }),
  regra("regra.tentar-ate-conseguir", { d20_vale: 20 }),
  regra("regra.forcar-a-rolagem", { dt: -2 }),
  regra("regra.usando-cartas-do-destino", { maximo: 1 }),
  regra("regra.morrendo", {
    teste_de_morte: { sucesso_a_partir_de: 10 },
    consequencia: [
      { de: 1, ate: 1, exaustao: 3, sequela: true },
      { de: 2, ate: 10, exaustao: 2 },
      { de: 11, ate: 20, exaustao: 1 },
    ],
  }),
  regra("regra.quedas-repetidas", { nova_queda_antes_do_descanso_longo: { exaustao: 1 } }),
  regra("regra.sequela-permanente", { tabela: { "1": "Olho de vidro", "2": "Orelha", "3": "Dedo", "4": "Ombro", "5": "Tornozelo", "6": "Joelho" } }),
  regra("regra.atitude-imprudente", { maximo_pendentes: 2, opcoes: { precisao: {}, potencia: {}, violencia: {}, impeto: {} } }),
  regra("regra.ganhando-estresse", { ganhos: { falha_critica: { estresse: 1 }, sofrer_acerto_critico_de_inimigo: { estresse: 1 }, cair_a_0_pv: { estresse: 3 } } }),
  regra("regra.estabilizando-e-recuperando", { dano_em_morrendo: { falhas: 1 } }),
  regra("regra.aliviando-estresse", { alivios: { descanso_curto: { estresse: -2 }, descanso_longo: { estresse: -5 } }, minimo: 0 }),
  regra("regra.crise", {
    aflicoes: Object.fromEntries(["1", "2", "3", "4", "5", "6"].map((l) => [l, { nome: `Aflição ${l}`, intensidade: [{ defesa: -2 }, { defesa: -4 }] }])),
  }),
  regra("regra.virtudes", { virtudes: { "1-6": { nome: "Firmeza", intensidade: [{ ataque: 2 }, { ataque: 4 }] } } }),
  regra("regra.descansos", { curtos_antes_do_longo: 2 }),
  regra("regra.descanso-curto", { recupera_pv: { atributo: "fibra", minimo: 1 } }),
  regra("regra.descanso-longo", { recupera_pv: { minimo: 1 } }),
  regra("regra.resistencia-imunidade-e-vulnerabilidade", { resistencia: "metade", imunidade: "zero", vulnerabilidade: "dobro" }),
  regra("regra.dano-indefensavel", { ignora: ["resistencia", "rd", "imunidade"] }),
  regra("regra.ordem-do-dano", { ordem: ["imunidade", "vulnerabilidade_ou_resistencia", "rd", "pv_temporarios", "pv"], metade: { arredonda: "baixo", minimo: 1 } }),
  regra("regra.recarga", { quando: "inicio_do_turno_da_criatura", rolar: "1d6", na_faixa: "habilidade_volta" }),
];

const efeito = (id: string, nome: string, mecanica?: Record<string, unknown>): Efeito => ({ id, tipo: "efeito", nome, fonte, texto: "", ...(mecanica ? { mecanica } : {}) });

export const efeitosExemplo = (): Efeito[] => [
  efeito("efeito.sangria", "Sangria", {
    acumulos: { max: 3 },
    gatilhos: [
      { quando: "inicio_do_turno", faz: { perde_pv: "1d4", por_acumulo: true, ignora_rd: true } },
      { quando: "fim_do_turno", oferece: { teste: { tipo: "resistencia", atributo: "fibra", dt: 12 }, sucesso: { remover_acumulo: 1 } } },
    ],
  }),
  efeito("efeito.zonzo", "Zonzo", { implica: ["efeito.travado"], falha_automatica: [{ em: "resistencia", atributo: "agilidade" }] }),
  efeito("efeito.travado", "Travado", { bloqueia_pa: ["acoes", "reacoes"], permite_pa: ["movimento"] }),
  efeito("efeito.medroso", "Medroso", { testes: [{ em: ["ataque", "habilidade"], aplica: "desvantagem" }], pa_por_turno: -1 }),
  efeito("efeito.no-chao", "No Chão", {
    deslocamento: { metade: true },
    contra_si: [
      { em: "ataque", ate_m: 1, aplica: "vantagem" },
      { em: "ataque", alem_de_m: 1, aplica: "desvantagem" },
    ],
  }),
  efeito("efeito.preso", "Preso", { deslocamento: { fixar: 0 } }),
  efeito("efeito.encharcado", "Encharcado", { danos: { resistencia: ["fogo"], vulnerabilidade: ["eletrico"] } }),
  efeito("efeito.inconsciente", "Inconsciente", { implica: ["efeito.travado"] }),
  efeito("efeito.amedrontado", "Amedrontado"),
  efeito("efeito.passageiro", "Passageiro", { duracao: { turnos: 2 } }),
  efeito("efeito.exaustao", "Exaustão", {
    niveis: { max: 6 },
    por_nivel: [
      { nivel: 1, testes: -1, deslocamento: -1, defesa: -1 },
      { nivel: 2, testes: -2, deslocamento: -2, defesa: -2, rd: -1 },
      { nivel: 3, testes: -3, deslocamento: -3, defesa: -3, rd: -2 },
      { nivel: 4, testes: -4, deslocamento: -4, defesa: -4, rd: -3, pv_maximo: "metade", sem_pv_temporarios: true },
      { nivel: 5, testes: -5, defesa: -5, rd: -4, deslocamento: { fixar: 0 }, pv_maximo: "metade" },
      { nivel: 6, morre: true },
    ],
  }),
  efeito("efeito.so-texto", "Só Texto"),
];

export function contextoCombateExemplo(opcoes: Partial<OpcoesCampanha> = {}): ContextoCombate {
  const r = criarContextoCombate({ regras: regrasDeCombateExemplo(), efeitos: efeitosExemplo() }, { ...opcoesPadrao(), ...opcoes });
  if (!r.ok) throw new Error(`Faltou: ${r.faltando.join(", ")}`);
  return r.contexto;
}

export const combatente = (id: string, extra: Partial<Combatente> = {}): Combatente => ({
  id,
  tipo: "personagem",
  nome: id,
  personagemId: null,
  ref: null,
  elite: false,
  agilidade: 0,
  carta: null,
  cartasParaEscolher: [],
  desempate: [],
  usaEfeito: null,
  alvosDoEfeito: [],
  efeitosUsados: [],
  jaAgiu: false,
  pa: { disponiveis: 0, guardados: 0, bloqueados: 0 },
  deslocamentosNaRodada: 0,
  ataquesNoTurno: 0,
  marcas: { reacaoSemCusto: null, vantagemNoProximo: false, deslocamentoSemCusto: 0, paExtraNoPrimeiroTurno: 0, defesaDeReacao: null, comboLiberado: false, testeDeMortePendente: false, imprudente: null, imprudenteNoTurno: false },
  pv: null,
  pvMaximo: null,
  pvTemporarios: 0,
  efeitos: [],
  recargasGastas: [],
  derrotado: false,
  horda: null,
  ...extra,
});

export const combateCom = (combatentes: Combatente[], extra: Partial<EstadoCombate> = {}): EstadoCombate => ({
  ataquePendente: null,
  id: "combate-1",
  fase: "em_curso",
  rodada: 1,
  vez: 0,
  ordem: combatentes.map((c) => c.id),
  combatentes,
  baralho: [],
  ...extra,
});

/* Sequência fixa de "dados": cada chamada devolve o próximo valor, cortado no intervalo pedido. */
export function dadosFixos(...valores: number[]) {
  let i = 0;
  return (minimo: number, maximo: number) => {
    const v = valores[i % valores.length]!;
    i += 1;
    return Math.min(maximo, Math.max(minimo, v));
  };
}
