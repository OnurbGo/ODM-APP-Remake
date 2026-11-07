import { z } from "zod";
import { Atributo } from "./mecanica";

/* Formato da camada mecânica de combate (lotes 8 e 9). A fonte são os YAML do repositório dos livros:
   combate-mecanica.yml, efeitos-mecanica.yml, armas-mecanica.yml, situacoes-mecanica.yml e ataques-mecanica.yml.
   Aqui só se confere que o que chegou tem a forma que o motor de combate lê. Campo que o motor não lê fica solto. */

const Inteiro = z.number().int();
const Positivo = z.number().int().min(0);
const Faixa = z.tuple([Positivo, Positivo]);
const Formula = z.string().regex(/^\d+(d\d+)?(\+\d+)?$/i);

export const TipoDeTeste = z.enum(["ataque", "habilidade", "resistencia"]);
export type TipoDeTeste = z.infer<typeof TipoDeTeste>;

/* ---------- Regras: cada uma num item regra.* do pacote ---------- */

export const REGRAS_COMBATE = {
  iniciativa: "regra.iniciativa",
  desempate: "regra.desempate",
  cartasEspeciais: "regra.cartas-especiais-e-seus-efeitos",
  redencao: "regra.redencao-completa",
  gastandoPa: "regra.gastando-os-pa",
  guardando: "regra.guardando-acoes",
  ataquesMultiplos: "regra.ataques-multiplos",
  acaoPadrao: "regra.seu-turno",
  critico: "regra.acerto-critico",
  alcance: "regra.alcance-efetivo",
  inicioCombo: "regra.mecanica-de-inicio-e-combo",
  oportunidade: "regra.ataque-de-oportunidade",
  esquiva: "regra.esquiva",
  bloqueio: "regra.bloqueio",
  vantagem: "regra.vantagem-e-desvantagem",
  testes: "regra.testes-de-habilidade",
  passivos: "regra.testes-passivos",
  contestado: "regra.teste-contestado-ao-se-esconder",
  calma: "regra.fazer-com-calma",
  tentar: "regra.tentar-ate-conseguir",
  forcar: "regra.forcar-a-rolagem",
  semProficiencia: "regra.armas-sem-proficiencia",
  estabilizar: "regra.estabilizar",
  acalmar: "regra.acalmar",
  morrendo: "regra.morrendo",
  quedas: "regra.quedas-repetidas",
  estabilizando: "regra.estabilizando-e-recuperando",
  sequela: "regra.sequela-permanente",
  imprudente: "regra.atitude-imprudente",
  ganhandoEstresse: "regra.ganhando-estresse",
  horror: "regra.horror",
  aliviandoEstresse: "regra.aliviando-estresse",
  crise: "regra.crise",
  virtudes: "regra.virtudes",
  cartasDoDestino: "regra.usando-cartas-do-destino",
  descansos: "regra.descansos",
  descansoCurto: "regra.descanso-curto",
  descansoLongo: "regra.descanso-longo",
  dadosDeVida: "regra.dados-de-vida",
  estadosDeDano: "regra.resistencia-imunidade-e-vulnerabilidade",
  indefensavel: "regra.dano-indefensavel",
  ordemDoDano: "regra.ordem-do-dano",
  recarga: "regra.recarga",
} as const;

/* Sem estas o combate não começa, e a tela diz qual falta revisar. As outras desligam só a parte delas. */
export const REGRAS_COMBATE_OBRIGATORIAS = [
  "iniciativa",
  "desempate",
  "cartasEspeciais",
  "gastandoPa",
  "guardando",
  "ataquesMultiplos",
  "critico",
  "vantagem",
  "testes",
  "passivos",
  "contestado",
  "estadosDeDano",
  "ordemDoDano",
  "recarga",
] as const satisfies readonly (keyof typeof REGRAS_COMBATE)[];

const Reacao = z.looseObject({ custo: z.looseObject({ reacao: z.boolean().optional(), pa: Positivo.optional() }), defesa: z.looseObject({ soma: Atributo }).optional() });
const IntensidadeCrise = z.record(z.string(), z.union([Inteiro, z.string()]));
const LinhaDeCrise = z.looseObject({ nome: z.string(), intensidade: z.array(IntensidadeCrise).length(2) });
const Teste = z.looseObject({ tipo: TipoDeTeste, pericia: z.string().optional(), pericias: z.array(z.string()).optional(), atributo: Atributo.optional(), dt: Positivo });

export const MecanicaCombate = {
  iniciativa: z.looseObject({ baralho: z.looseObject({ coringas: Positivo }), ordem: z.array(z.string()).min(2) }),
  desempate: z.looseObject({
    criterios: z.array(z.string()),
    opcao_da_campanha: z.looseObject({ naipe: z.array(z.string()).length(4) }),
    dois_coringas: z.looseObject({ nova_compra: z.boolean() }),
  }),
  cartasEspeciais: z.looseObject({
    uma_vez_por_combate: z.enum(["por_pessoa", "mesa_inteira"]),
    efeitos: z.looseObject({
      coringa: z.looseObject({}),
      A: z.looseObject({ pa_extra: Positivo }),
      K: z.looseObject({}),
      Q: z.looseObject({}),
      J: z.looseObject({ deslocamento_sem_custo: Positivo }),
    }),
  }),
  redencao: z.looseObject({ iniciativa: z.looseObject({ cartas_extras: Positivo }) }),
  gastandoPa: z.looseObject({
    deslocamento: z.looseObject({ custo_pa: Positivo }),
    mais_de_dois_deslocamentos_na_rodada: z.looseObject({ exaustao: Positivo }),
  }),
  guardando: z.looseObject({ pa_nao_gastos: z.looseObject({ guardados_ate: z.literal("fim_da_rodada") }) }),
  ataquesMultiplos: z.looseObject({ penalidade_por_ataque_anterior: Inteiro }),
  /* "Fazer um ataque com uma arma [...] custam 1 PA" (Seu Turno, Ação Padrão). */
  acaoPadrao: z.looseObject({ acao_padrao: z.looseObject({ ataque_com_arma: z.looseObject({ pa: Positivo }) }) }),
  critico: z.looseObject({ natural: Positivo, acerta_sempre: z.boolean(), falha_critica: z.looseObject({ natural: Positivo }) }),
  alcance: z.looseObject({ alem_do_efetivo: z.looseObject({ desvantagem: z.boolean() }) }),
  inicioCombo: z.looseObject({ combo: z.looseObject({ sem_penalidade_de_ataques_multiplos: z.boolean() }) }),
  oportunidade: Reacao,
  esquiva: Reacao,
  bloqueio: Reacao,
  vantagem: z.looseObject({
    modelos: z.looseObject({
      dados_extras: z.looseObject({ uma_fonte: Positivo, duas_ou_mais: Positivo, maximo_d20: Positivo }),
      cartas: z.looseObject({ uma_fonte: Positivo, duas_ou_mais: Positivo, maximo_cartas: Positivo, modificador: z.record(z.string(), Positivo) }),
    }),
  }),
  testes: z.looseObject({ escala_dt: z.record(z.string(), Positivo) }),
  passivos: z.looseObject({ base: Inteiro, vantagem: Inteiro, desvantagem: Inteiro }),
  contestado: z.looseObject({ contestado: z.looseObject({ empate: z.literal("vence_quem_age") }) }),
  calma: z.looseObject({ d20_vale: Positivo }),
  tentar: z.looseObject({ d20_vale: Positivo }),
  forcar: z.looseObject({ dt: Inteiro }),
  semProficiencia: z.looseObject({ arma_de_fogo_sem_proficiencia: z.looseObject({ ataque: Inteiro }) }),
  estabilizar: z.looseObject({ custo: z.looseObject({ pa: Positivo }), teste: Teste }),
  acalmar: z.looseObject({ custo: z.looseObject({ pa: Positivo }), teste: Teste }),
  morrendo: z.looseObject({
    teste_de_morte: z.looseObject({ sucesso_a_partir_de: Positivo }),
    consequencia: z.array(z.looseObject({ de: Positivo, ate: Positivo, exaustao: Positivo, sequela: z.boolean().optional() })),
  }),
  quedas: z.looseObject({ nova_queda_antes_do_descanso_longo: z.looseObject({ exaustao: Positivo }) }),
  estabilizando: z.looseObject({ dano_em_morrendo: z.looseObject({ falhas: Positivo }) }),
  sequela: z.looseObject({ tabela: z.record(z.string(), z.string()) }),
  imprudente: z.looseObject({ maximo_pendentes: Positivo, opcoes: z.record(z.string(), z.looseObject({})) }),
  ganhandoEstresse: z.looseObject({ ganhos: z.record(z.string(), z.unknown()) }),
  horror: z.looseObject({}),
  aliviandoEstresse: z.looseObject({ alivios: z.record(z.string(), z.unknown()), minimo: Positivo }),
  crise: z.looseObject({ aflicoes: z.record(z.string(), LinhaDeCrise) }),
  virtudes: z.looseObject({ virtudes: z.record(z.string(), LinhaDeCrise) }),
  cartasDoDestino: z.looseObject({ maximo: Positivo }),
  descansos: z.looseObject({ curtos_antes_do_longo: Positivo }),
  descansoCurto: z.looseObject({ recupera_pv: z.looseObject({ atributo: Atributo, minimo: Positivo }) }),
  descansoLongo: z.looseObject({ recupera_pv: z.looseObject({ minimo: Positivo }) }),
  dadosDeVida: z.looseObject({ quantidade: z.looseObject({ primeiro_nivel: Positivo, mais_um_a_cada_niveis: z.number().int().min(1) }) }),
  estadosDeDano: z.looseObject({ resistencia: z.literal("metade"), imunidade: z.literal("zero"), vulnerabilidade: z.literal("dobro") }),
  indefensavel: z.looseObject({ ignora: z.array(z.string()) }),
  ordemDoDano: z.looseObject({ ordem: z.array(z.string()), metade: z.looseObject({ minimo: Positivo }) }),
  recarga: z.looseObject({ rolar: z.string() }),
};

export type RegrasCombate = { [K in keyof typeof MecanicaCombate]: z.infer<(typeof MecanicaCombate)[K]> };

/* ---------- Efeitos ---------- */

const RegraDeTeste = z.looseObject({ em: z.array(z.string()), aplica: z.enum(["vantagem", "desvantagem"]), atributo: Atributo.optional() });
const ContraSi = z.looseObject({ em: z.string(), aplica: z.enum(["vantagem", "desvantagem"]).optional(), ate_m: Positivo.optional(), alem_de_m: Positivo.optional() });
const FalhaAutomatica = z.looseObject({ em: z.string(), atributo: Atributo.optional(), depende_de: z.string().optional() });
const Gatilho = z.looseObject({ quando: z.union([z.string(), z.array(z.string())]), faz: z.looseObject({}).optional(), oferece: z.looseObject({}).optional() });
const AcaoDeEfeito = z.looseObject({ nome: z.string(), custo: z.looseObject({ pa: Positivo.optional(), item: z.string().optional() }).optional(), faz: z.looseObject({}).optional() });

export const MecanicaEfeito = z.looseObject({
  acumulos: z.looseObject({ max: Positivo }).optional(),
  niveis: z.looseObject({ max: Positivo }).optional(),
  testes: z.array(RegraDeTeste).optional(),
  contra_si: z.array(ContraSi).optional(),
  falha_automatica: z.array(FalhaAutomatica).optional(),
  pa_por_turno: Inteiro.optional(),
  implica: z.array(z.string()).optional(),
  deslocamento: z.looseObject({ fixar: Positivo.optional(), metade: z.boolean().optional() }).optional(),
  danos: z.looseObject({ resistencia: z.array(z.string()).optional(), vulnerabilidade: z.array(z.string()).optional() }).optional(),
  gatilhos: z.array(Gatilho).optional(),
  acoes: z.array(AcaoDeEfeito).optional(),
  duracao: z.looseObject({ turnos: z.union([Positivo, z.string()]).optional(), turnos_da_criatura_afetada: Positivo.optional() }).optional(),
  encerra: z.array(z.union([z.string(), z.looseObject({})])).optional(),
  bloqueia_pa: z.array(z.string()).optional(),
  por_nivel: z.array(z.looseObject({ nivel: Positivo })).optional(),
  por_acumulo: z.array(z.looseObject({ em: z.string(), modificador: Inteiro })).optional(),
  testes_por_nivel: z.array(z.looseObject({ nivel: Positivo, atributos: z.partialRecord(Atributo, Inteiro) })).optional(),
});
export type MecanicaEfeito = z.infer<typeof MecanicaEfeito>;

/* Exaustão em particular: o motor lê cada nível. */
export const NivelDeExaustao = z.looseObject({
  nivel: Positivo,
  testes: Inteiro.optional(),
  deslocamento: z.union([Inteiro, z.looseObject({ fixar: Positivo })]).optional(),
  defesa: Inteiro.optional(),
  rd: Inteiro.optional(),
  pv_maximo: z.literal("metade").optional(),
  sem_pv_temporarios: z.boolean().optional(),
  morre: z.boolean().optional(),
});
export type NivelDeExaustao = z.infer<typeof NivelDeExaustao>;
export const ID_EXAUSTAO = "efeito.exaustao";

/* ---------- Ataques ---------- */

export const Dano = z.looseObject({ formula: Formula, tipo: z.string().nullable() });
export type Dano = z.infer<typeof Dano>;

export const MecanicaAtaqueDeCriatura = z.looseObject({
  custo: z.looseObject({ pa: Positivo }).optional(),
  tipo: z.enum(["corpo_a_corpo", "distancia"]),
  acerto: Inteiro,
  alcance_m: Positivo,
  alvos: Positivo,
  dano: Dano,
  propriedade: z.enum(["inicio", "combo"]).optional(),
  elite: z.boolean().optional(),
});
export type MecanicaAtaqueDeCriatura = z.infer<typeof MecanicaAtaqueDeCriatura>;

export const MecanicaArma = z.looseObject({
  ataque: z
    .looseObject({
      categoria: z.string().nullable().optional(),
      tipo: z.enum(["corpo_a_corpo", "distancia"]).nullable().optional(),
      alcance_m: Positivo.nullable().optional(),
      arma_de_fogo: z.boolean().optional(),
      atributo: z.union([Atributo, z.array(Atributo).min(1)]).optional(),
      dano: Dano.optional(),
      versatil: z.looseObject({ duas_maos: Formula }).optional(),
      bonus_desarmado: Inteiro.optional(),
    })
    .optional(),
});
export type MecanicaArma = z.infer<typeof MecanicaArma>;

/* Horda do Zumbi: regras soltas em ações da ficha (ataques-mecanica.yml). */
export const MecanicaHordaPv = z.looseObject({ dano_por_integrante: Positivo, desfaz_com_integrantes: Positivo });
export const MecanicaHordaBonus = z.looseObject({ bonus: z.looseObject({ maximo: Positivo }) });
export const MecanicaFormarHorda = z.looseObject({ requisito: z.looseObject({ minimo_integrantes: Positivo }), pa_por_turno: Positivo });

/* ---------- Situações das habilidades ---------- */

export const ReageA = z.looseObject({
  teste: TipoDeTeste.optional(),
  atributos: z.array(Atributo).optional(),
  ataque: z.enum(["contra_si", "contra_aliado_proximo", "contra_si_em_area"]).optional(),
  so_corpo_a_corpo: z.boolean().optional(),
  momento: z.enum(["antes_de_rolar", "apos_falha", "apos_erro", "apos_acerto", "apos_critico"]),
});
export type ReageA = z.infer<typeof ReageA>;

/* "5–6" (com traço longo ou hífen) vira a faixa do 1d6. */
export function faixaDeRecarga(texto: string | null | undefined): z.infer<typeof Faixa> | null {
  const m = texto?.match(/(\d)\s*[–-]\s*(\d)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
