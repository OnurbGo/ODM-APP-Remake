import { z } from "zod";

/* Formato da camada mecânica de ficha. A fonte são os YAML do repositório dos livros (especificação, 4.4):
   aqui só se confere que o que chegou ao pacote tem a forma que o motor de regras espera. */

export const ATRIBUTOS = ["brutalidade", "agilidade", "fibra", "intelecto", "astucia", "presenca"] as const;
export const Atributo = z.enum(ATRIBUTOS);
export type Atributo = z.infer<typeof Atributo>;

const Inteiro = z.number().int();
const Positivo = z.number().int().min(0);

/* Atributo ou o bônus de proficiência. */
const ParcelaDeSoma = z.union([Atributo, z.literal("proficiencia")]);
export type ParcelaDeSoma = z.infer<typeof ParcelaDeSoma>;

const Soma = z.object({ base: Inteiro.default(0), soma: z.array(ParcelaDeSoma) });

/* ---------- Classe ---------- */

const NivelClasse = z.object({
  ganha: z.array(z.string()).optional(),
  especializacao: z.boolean().optional(),
  habilidades_de_especializacao: z.boolean().optional(),
  talento: z.boolean().optional(),
  escolher: z.object({ rotulo: z.string(), quantidade: Positivo, de: z.string() }).optional(),
});
export type NivelClasse = z.infer<typeof NivelClasse>;

const Troca = z.object({
  ganha: z.string(),
  exige: z.string().optional(),
  sacrifica: z.object({ pericias_ou_ferramentas: Positivo }),
});
export type TrocaProficiencia = z.infer<typeof Troca>;

export const MecanicaClasse = z.object({
  dado_de_vida: z.string(),
  pv: z.object({ primeiro_nivel: Inteiro, por_nivel: Inteiro }),
  proficiencias: z.object({
    armaduras: z.array(z.string()).default([]),
    armas: z.array(z.string()).default([]),
    ferramentas: z.array(z.string()).default([]),
    ferramentas_a_escolher: Positivo.default(0),
    trocas: z.array(Troca).default([]),
  }),
  pericias: z.object({ escolher: Positivo, de: z.union([z.literal("qualquer"), z.array(z.string())]) }),
  niveis: z.record(z.string(), NivelClasse),
  listas: z.record(z.string(), z.array(z.string())).optional(),
});
export type MecanicaClasse = z.infer<typeof MecanicaClasse>;

/* ---------- Fichas de classe ---------- */

const Recuperacao = z.object({
  quando: z.enum(["descanso_curto", "descanso_longo"]),
  quantidade: z.union([Positivo, z.literal("todas"), z.literal("metade_do_maximo")]),
  arredonda: z.enum(["baixo", "cima"]).optional(),
  minimo: Positivo.optional(),
});
export type Recuperacao = z.infer<typeof Recuperacao>;

export const MecanicaFicha = z.object({
  maximo: z
    .object({
      valor: Positivo.optional(),
      coluna: z.string().optional(),
      soma: z.array(ParcelaDeSoma).optional(),
      minimo: Positivo.optional(),
      nivel_da_classe: z.boolean().optional(),
      ate: Positivo.optional(),
    })
    .optional(),
  aumenta: z.array(z.object({ com: z.string(), soma: Inteiro })).optional(),
  inicial: Positivo.optional(),
  recupera: z.array(Recuperacao).optional(),
  gera: z.array(z.looseObject({ quando: z.string() })).optional(),
  zera: z.string().optional(),
  dt: Soma.optional(),
});
export type MecanicaFicha = z.infer<typeof MecanicaFicha>;

/* ---------- Habilidades, origens, talentos e itens ---------- */

export const FREQUENCIAS = [
  "descanso_curto",
  "descanso_longo",
  "tres_descansos_longos",
  "combate",
  "sessao",
  "semana",
  "sete_dias",
  "turno",
  "rodada",
] as const;
export const Frequencia = z.enum(FREQUENCIAS);
export type Frequencia = z.infer<typeof Frequencia>;

/* O que muda um valor calculado da ficha. "alvo" é defesa, rd, deslocamento, pv_maximo, carga_kg,
   estresse_maximo ou o id de uma perícia; "enquanto" limita a situações que a ficha enxerga sozinha. */
const Modificacao = z.object({
  alvo: z.string(),
  valor: Inteiro,
  enquanto: z.enum(["sem_armadura", "sem_armadura_nem_escudo"]).optional(),
  /* Vale uma vez por nível de classe, como o Calejado. */
  por_nivel: z.boolean().optional(),
  /* Soma este atributo ao valor. */
  atributo: Atributo.optional(),
});
export type ModificacaoMecanica = z.infer<typeof Modificacao>;

/* O que a origem, o talento ou o item entrega para a ficha. */
const Concede = z.object({
  atributos: z.partialRecord(Atributo, Inteiro).optional(),
  pericias: z.array(z.string()).optional(),
  ferramentas: z.array(z.string()).optional(),
  proficiencias: z.array(z.string()).optional(),
  resistencias: z.array(Atributo).optional(),
  /* Treinamento Pesado: um ponto de atributo à escolha. */
  atributo_a_escolha: z.object({ pontos: Positivo, maximo: Inteiro }).optional(),
  /* Senso de Autopreservação: proficiência na resistência do atributo escolhido. */
  resistencia_a_escolha: z.boolean().optional(),
  escolher: z.object({ rotulo: z.string(), quantidade: Positivo, de: z.union([z.literal("pericias"), z.array(z.string())]) }).optional(),
  /* Rolado ao concluir a criação, como no Magnata. */
  dinheiro_inicial: z.string().optional(),
});
export type ConcedeMecanica = z.infer<typeof Concede>;

export const MecanicaHabilidade = z.looseObject({
  custo: z
    .object({
      pa: Positivo.optional(),
      reacao: z.boolean().optional(),
      fichas: z.object({ recurso: z.string(), quantidade: Positivo }).optional(),
    })
    .optional(),
  usos: z.object({ quantidade: z.union([Positivo, z.string()]), por: Frequencia }).optional(),
  /* Substitui a conta geral da Defesa quando a ficha está sem armadura. */
  defesa_sem_armadura: z.object({ base: Inteiro, soma: z.array(ParcelaDeSoma), permite_escudo: z.boolean().default(false) }).optional(),
  modifica: z.array(Modificacao).optional(),
  concede: Concede.optional(),
  repetivel: z.boolean().optional(),
});
export type MecanicaHabilidade = z.infer<typeof MecanicaHabilidade>;

export const MecanicaItem = z.looseObject({
  peso_kg: z.number().min(0).optional(),
  protecao: z
    .object({
      categoria: z.enum(["armadura_leve", "armadura_media", "armadura_pesada", "escudo"]),
      defesa: Inteiro.optional(),
      /* null = sem limite; ausente = a proteção não soma Agilidade. */
      agilidade_maxima: Inteiro.nullable().optional(),
      soma_agilidade: z.boolean().default(false),
      bonus_defesa: Inteiro.optional(),
      rd: Inteiro.optional(),
      deslocamento: Inteiro.optional(),
      requer_brutalidade: Inteiro.optional(),
    })
    .optional(),
  carga_extra_kg: z.number().min(0).optional(),
});
export type MecanicaItem = z.infer<typeof MecanicaItem>;

/* ---------- Regras gerais: cada uma mora num item de pacote (regras-mecanica.yml) ---------- */

export const REGRAS_FICHA = {
  xp: "tabela.xp-por-nivel",
  proficiencia: "tabela.bonus-de-proficiencia",
  categorias: "tabela.categorias-de-proficiencia",
  atributos: "regra.atribuindo-atributos",
  carga: "regra.regra-de-carga",
  turno: "regra.seu-turno",
  estresse: "regra.estresse-maximo",
  prestigio: "regra.como-gastar-seus-pontos-de-prestigio",
  defesa: "regra.defesa-sem-armadura",
  deslocamento: "regra.deslocamento-base",
} as const;

const OpcaoPrestigio = z.object({
  id: z.enum(["tecnica_avancada", "tecnica_lendaria", "talento_ou_proficiencia", "vitalidade_aprimorada"]),
  custo: Positivo,
  exige: z.object({ tecnicas_avancadas: Positivo }).optional(),
  pv_maximo: Inteiro.optional(),
  repetivel: z.boolean().optional(),
});
export type OpcaoPrestigio = z.infer<typeof OpcaoPrestigio>;

/* Mecânica de cada regra. O motor recebe tudo junto e já conferido. */
export const MecanicaRegras = {
  xp: z.object({ xp_por_nivel: z.record(z.string(), Positivo), nivel_maximo: Positivo }),
  proficiencia: z.object({ faixas: z.array(z.object({ de: Positivo, ate: Positivo, bonus: Inteiro })) }),
  categorias: z.object({ categorias: z.array(z.object({ id: z.string(), grupo: z.enum(["arma", "armadura"]) })) }),
  atributos: z.object({ valores: z.array(Inteiro), apos_modificadores: z.object({ minimo: Inteiro, maximo: Inteiro }) }),
  carga: z.object({ limite_kg: z.object({ base: Positivo, por_fibra: Positivo, minimo: Positivo }) }),
  turno: z.object({ pa_por_turno: Positivo }),
  estresse: z.object({ formula: Soma }),
  prestigio: z.object({
    pontos: z.object({ um_por_nivel_alcancado: z.object({ de: Positivo, ate: Positivo }) }),
    opcoes: z.array(OpcaoPrestigio),
    ponto_de_fibra: z.object({ pv_maximo_por_nivel_de_classe: Positivo, ate_o_nivel: Positivo }),
  }),
  defesa: z.object({ formula: Soma }),
  deslocamento: z.object({ metros: Positivo }),
};

export const ID_REGRA_HONRA = "regra.faixas-de-honra";
export const MecanicaHonra = z.object({ faixas: z.array(z.object({ nome: z.string(), de: Positivo, ate: Positivo })) });

export const ID_REGRA_KITS = "regra.kits-sugeridos";
export const MecanicaKits = z.object({
  kits: z.array(z.object({ nome: z.string(), itens: z.array(z.object({ itemId: z.string().nullable(), nome: z.string(), quantidade: Positivo })) })),
});
