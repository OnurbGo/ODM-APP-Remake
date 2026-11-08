import { z } from "zod";

/* Comércio (Mestre, 09-comercio.md; comercio-mecanica.yml, lote 10). Decisões de 07/11/2026: C1, C2 e as linhas
   por categoria. Sem a mecânica aprovada, a loja do livro aparece só como texto e o mestre monta a dele à mão. */

export const ID_VENDA_AO_MERCADOR = "regra.disposicao-do-comercio";

const Quantidade = z.number().int().min(0).max(100_000);

const EntradaDeEstoque = z.union([z.looseObject({ item: z.string(), quantidade: Quantidade }), z.looseObject({ texto: z.string(), quantidade: Quantidade })]);

const Grupo = z.discriminatedUnion("grupo", [
  z.looseObject({ grupo: z.literal("armas_a_distancia"), raridade_ate: z.string(), quantidade: Quantidade }),
  z.looseObject({ grupo: z.literal("armas_corpo_a_corpo"), departamentos: z.array(z.string()).min(1), quantidade: Quantidade }),
  z.looseObject({ grupo: z.literal("equipamentos"), quantidade: Quantidade }),
  z.looseObject({ grupo: z.literal("departamento"), departamento: z.string(), quantidade: Quantidade }),
]);

export const EntradaDeLoja = z.looseObject({
  nome: z.string().min(1),
  caixa: z.number().int().min(0).nullable(),
  estoque: z.array(EntradaDeEstoque).default([]),
  grupos: z.array(Grupo).default([]),
  catalogo_inteiro: z.looseObject({ municao_normal: Quantidade, municao_especial: Quantidade }).optional(),
  itens_do_mestre: z.boolean().optional(),
  so_compra_fora_do_comum: z.boolean().optional(),
  /* Serviços padrão da loja, com o efeito ao pagar (decisão de 08/11/2026). */
  servicos: z
    .array(
      z.looseObject({
        nome: z.string().min(1),
        preco: z.number().int().min(0),
        descricao: z.string().default(""),
        efeito: z
          .looseObject({
            cura_total: z.boolean().optional(),
            dados_de_vida: z.boolean().optional(),
            tira_exaustao: z.boolean().optional(),
            condicao: z.string().optional(),
            extra_por_exaustao: z.number().int().min(0).optional(),
          })
          .optional(),
      }),
    )
    .default([]),
});
export type EntradaDeLoja = z.infer<typeof EntradaDeLoja>;

export const MecanicaLoja = z.looseObject({ lojas: z.array(EntradaDeLoja).min(1) });
export const MecanicaVenda = z.looseObject({ venda_ao_mercador: z.number().positive().max(1), arredonda: z.literal("baixo") });
