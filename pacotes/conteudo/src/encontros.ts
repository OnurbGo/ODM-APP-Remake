import { z } from "zod";

/* Mecânica dos encontros e das recompensas (Mestre, "Recompensas e Encontros"), vinda de encontros-mecanica.yml.
   Sem a regra aprovada, o montador mostra só o XP de cada ficha, sem grau. */

export const REGRAS_ENCONTRO = {
  montando: "regra.montando-encontros",
  lendarias: "regra.criaturas-lendarias",
  xpDeCriaturas: "regra.xp-de-criaturas",
  divisao: "regra.divisao-das-recompensas",
  xpDeMissao: "regra.xp-de-missao",
} as const;

const Positivo = z.number().positive();

export const MecanicaEncontro = {
  montando: z.looseObject({
    tabela: z.string(),
    xp_por_nd: z.string(),
    grupo_base: z.number().int().min(1),
    multiplicador: z.looseObject({ por_jogador: Positivo, livro: z.record(z.string(), Positivo).default({}) }),
    nivel_medio: z.looseObject({ arredonda: z.literal("baixo"), minimo: z.number().int().min(1), maximo: z.number().int().min(1) }),
    grau: z.literal("maior_coluna_alcancada"),
    mais_inimigos_que_personagens: z.looseObject({ sobe: z.number().int().min(0), teto: z.literal("morte_certa") }),
    elite: z.literal("xp_do_nd_elite_quando_indicado"),
  }),
  lendarias: z.looseObject({ fora_do_calculo: z.boolean(), pistas_recomendadas: z.number().int().min(0) }),
  xpDeCriaturas: z.looseObject({ conta: z.array(z.string()).min(1) }),
  divisao: z.looseObject({ participantes: z.literal("todos_do_combate"), parte: z.looseObject({ arredonda: z.literal("baixo") }), sobra: z.literal("descarta") }),
  xpDeMissao: z.looseObject({
    tabela: z.string(),
    fracao_da_coluna: Positivo,
    multiplicador_do_grupo: z.boolean().default(false),
    dinheiro_sugerido: z.string(),
    dinheiro_com_multiplicador: z.boolean().default(false),
  }),
};

export type RegrasEncontroLidas = { [K in keyof typeof MecanicaEncontro]?: z.infer<(typeof MecanicaEncontro)[K]> };
