import { z } from "zod";
import { ATRIBUTOS } from "./constantes";

export const Atributo = z.enum(ATRIBUTOS);
export type Atributo = z.infer<typeof Atributo>;

/* Inteiro livre: a escala de 5 a 30 é só atalho na tela, porque o livro usa valores fora dela. */
export const Dt = z.number().int().min(0).max(100);

export const ModoRolagem = z.enum(["normal", "vantagem", "desvantagem"]);
export type ModoRolagem = z.infer<typeof ModoRolagem>;

const Bonus = z.number().int().min(-99).max(99);

/* O que é testado: um atributo ou uma perícia, por id do pacote de conteúdo. */
export const AlvoDoTeste = z.discriminatedUnion("alvo", [
  z.object({ alvo: z.literal("atributo"), atributo: Atributo }),
  z.object({ alvo: z.literal("pericia"), periciaId: z.string().min(1).max(80) }),
]);
export type AlvoDoTeste = z.infer<typeof AlvoDoTeste>;

export const AjusteDoJogador = z.object({
  jogadorId: z.string().min(1),
  /* Outra DT só para este jogador. Sem ela, vale a DT do pedido. */
  dt: Dt.optional(),
  bonus: Bonus.default(0),
  modo: ModoRolagem.default("normal"),
});
export type AjusteDoJogador = z.infer<typeof AjusteDoJogador>;

const Base = {
  id: z.string().min(1),
  /* De onde veio: o ataque ou o efeito que pediu o teste. */
  origem: z.string().max(120).optional(),
  jogadores: z.array(AjusteDoJogador).min(1),
};

export const Oponente = z.object({
  nome: z.string().min(1).max(80),
  /* Id da criatura ou NPC, quando vier do bestiário. */
  ref: z.string().min(1).optional(),
  teste: AlvoDoTeste,
  bonus: Bonus,
  modo: ModoRolagem.default("normal"),
});

/* Livro do Jogador, Progressão ("Testes de Habilidade", "Testes Passivos") e Ações ("Esconder-se").
   A interface completa e a resolução ficam para a fase 5; o formato já vale. */
export const PedidoTeste = z.discriminatedUnion("tipo", [
  z.object({ ...Base, tipo: z.literal("habilidade"), teste: AlvoDoTeste, dt: Dt, dtVisivel: z.boolean().default(false) }),
  z.object({ ...Base, tipo: z.literal("resistencia"), atributo: Atributo, dt: Dt, dtVisivel: z.boolean().default(false) }),
  /* Sem dtVisivel: o jogador não recebe nada de um teste passivo. */
  z.object({ ...Base, tipo: z.literal("passivo"), teste: AlvoDoTeste, dt: Dt }),
  z.object({
    ...Base,
    tipo: z.literal("contestado"),
    teste: AlvoDoTeste,
    oponente: Oponente,
    oponenteVisivel: z.boolean().default(false),
  }),
]);
export type PedidoTeste = z.infer<typeof PedidoTeste>;

/* O pedido como o jogador o recebe: DT oculta vira null e não há ajuste de outros jogadores.
   Não existe versão do teste passivo: ele nunca sai do servidor para um jogador. */
export const PedidoTesteVisto = z.object({
  id: z.string(),
  tipo: z.enum(["habilidade", "resistencia", "contestado"]),
  teste: AlvoDoTeste,
  origem: z.string().optional(),
  dt: z.number().int().nullable(),
  bonus: z.number().int(),
  modo: ModoRolagem,
  oponenteNome: z.string().optional(),
});
export type PedidoTesteVisto = z.infer<typeof PedidoTesteVisto>;

/* Resposta do jogador (fase 5). "opcao" reserva Fazer com Calma, Tentar até Conseguir e
   Forçar a Rolagem (Jogador, Progressão), que mudam a resolução do teste. */
export const RespostaTeste = z.object({
  pedidoId: z.string().min(1),
  bonus: Bonus.default(0),
  modo: ModoRolagem.default("normal"),
  habilidadeId: z.string().min(1).optional(),
  opcao: z.enum(["rolar", "fazer_com_calma", "tentar_ate_conseguir", "forcar_rolagem"]).default("rolar"),
});
export type RespostaTeste = z.infer<typeof RespostaTeste>;
