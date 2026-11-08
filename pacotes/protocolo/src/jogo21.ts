import { z } from "zod";
import { Naipe, ValorCarta } from "./combate";

/* Jogo do 21 (Mestre, "Sistema de busca de espólios"; J1, 07/11/2026): o mestre abre o jogo para um personagem,
   que começa com 2 cartas e compra até parar ou estourar. O baralho fica no servidor. */

const Id = z.string().min(1).max(80);

export const CartaDo21 = z.object({ valor: ValorCarta, naipe: Naipe });
export type CartaDo21 = z.infer<typeof CartaDo21>;

export const Jogo21 = z.object({
  id: Id,
  personagemId: Id,
  personagemNome: z.string().max(120),
  /* O que o mestre disse que é (baú da gangue, cofre do chefe). */
  local: z.string().max(120).default(""),
  cartas: z.array(CartaDo21).max(21),
  situacao: z.enum(["jogando", "parou", "estourou"]),
  asesComo11: z.number().int().min(0).max(4).default(0),
  total: z.number().int().nullable().default(null),
  faixa: z.object({ resultado: z.string(), rotulo: z.string() }).nullable().default(null),
});
export type Jogo21 = z.infer<typeof Jogo21>;

/* Registro: o resultado fica para todos. */
export const DadosJogo21 = z.object({
  personagemId: Id,
  personagemNome: z.string(),
  local: z.string().default(""),
  cartas: z.array(CartaDo21),
  total: z.number().int(),
  rotulo: z.string(),
});
