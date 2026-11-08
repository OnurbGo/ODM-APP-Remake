import { z } from "zod";

/* Modificadores de mundo e Jogo do 21 (Mestre; mundo-mecanica.yml, lote 10). Modificador sem mecânica
   aprovada fica só como carta de texto. */

export const ID_JOGO_DO_21 = "regra.o-jogo-do-21";

const Bonus = z.number().int().min(-20).max(20);

export const MecanicaModificador = z.looseObject({
  testes: z.array(z.looseObject({ pericia: z.string(), bonus: Bonus })).optional(),
  passivos: z.array(z.looseObject({ pericia: z.string(), bonus: Bonus })).optional(),
  alcance_armas_de_fogo: z.looseObject({ fator: z.number().positive().max(1), arredonda: z.literal("baixo"), minimo: z.number().int().min(0) }).optional(),
  deslocamento: z.looseObject({ menos_m: z.number().positive(), so_acima_de_m: z.number().min(0), campo_aberto: z.literal("marcado_pelo_mestre") }).optional(),
  disparada: z
    .looseObject({ teste: z.looseObject({ pericia: z.string(), dt: z.number().int().min(1).max(40) }), falha: z.looseObject({ efeito: z.string() }) })
    .optional(),
});
export type MecanicaModificador = z.infer<typeof MecanicaModificador>;

export const MecanicaJogo21 = z.looseObject({
  baralho: z.looseObject({ cartas: z.literal(52), coringas: z.literal(false) }),
  cartas_iniciais: z.number().int().min(1).max(5),
  alvo: z.number().int().min(1),
  faixas: z
    .array(z.looseObject({ de: z.number().int(), ate: z.number().int().nullable(), resultado: z.string(), rotulo: z.string() }))
    .min(1),
});
export type MecanicaJogo21 = z.infer<typeof MecanicaJogo21>;

/* "Categorias de Espólio" (Mestre, 23-recompensas.md; lote 11, 08/11/2026): lugares com o peso de cada
   categoria e a faixa do 21 em raridade, para o "Sugerir item" do Jogo do 21. Sem aprovação, o botão não aparece. */
export const ID_CATEGORIAS_DE_ESPOLIO = "regra.categorias-de-espolio";

export const MecanicaEspolios = z.looseObject({
  categorias: z
    .array(z.looseObject({ id: z.string().min(1), nome: z.string().min(1), departamentos: z.array(z.string()).default([]), municoes: z.boolean().optional() }))
    .min(1),
  faixas: z.record(
    z.string(),
    z.looseObject({
      raridades: z.array(z.string()).default([]),
      sem_raridade: z.enum(["todos", "metade_mais_barata", "metade_mais_cara", "quinto_mais_caro"]).optional(),
      nada: z.boolean().optional(),
      nota: z.string().optional(),
    }),
  ),
  lugares: z.array(z.looseObject({ nome: z.string().min(1), pesos: z.record(z.string(), z.number().int().min(0)) })).min(1),
});
export type MecanicaEspolios = z.infer<typeof MecanicaEspolios>;
