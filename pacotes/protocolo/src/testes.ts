import { z } from "zod";
import { Naipe, ValorCarta } from "./combate";
import { ATRIBUTOS } from "./constantes";

export const Atributo = z.enum(ATRIBUTOS);
export type Atributo = z.infer<typeof Atributo>;

/* Inteiro livre: a escala de 5 a 30 é só atalho na tela, porque o livro usa valores fora dela. */
export const Dt = z.number().int().min(0).max(100);

export const ModoRolagem = z.enum(["normal", "vantagem", "desvantagem"]);
export type ModoRolagem = z.infer<typeof ModoRolagem>;

const Bonus = z.number().int().min(-99).max(99);
const Id = z.string().min(1).max(160);

/* O que é testado: um atributo ou uma perícia, por id do pacote de conteúdo. */
export const AlvoDoTeste = z.discriminatedUnion("alvo", [
  z.object({ alvo: z.literal("atributo"), atributo: Atributo }),
  z.object({ alvo: z.literal("pericia"), periciaId: z.string().min(1).max(80) }),
]);
export type AlvoDoTeste = z.infer<typeof AlvoDoTeste>;

/* O teste é do personagem, não do jogador: um jogador pode controlar dois (especificação 3.3). */
export const AjusteDoPersonagem = z.object({
  personagemId: Id,
  /* Outra DT só para este personagem. Sem ela, vale a DT do pedido. */
  dt: Dt.optional(),
  bonus: Bonus.default(0),
  modo: ModoRolagem.default("normal"),
});
export type AjusteDoPersonagem = z.infer<typeof AjusteDoPersonagem>;

/* Efeito aplicado em quem falhar (especificação 8.3, passo 5), com desfazer. */
export const EfeitoNaFalha = z.object({
  efeitoId: Id,
  acumulos: z.number().int().min(1).max(20).optional(),
  turnos: z.number().int().min(1).max(100).optional(),
});
export type EfeitoNaFalha = z.infer<typeof EfeitoNaFalha>;

const Base = {
  id: Id,
  /* De onde veio: o ataque ou o efeito que pediu o teste. */
  origem: z.string().max(120).optional(),
  personagens: z.array(AjusteDoPersonagem).min(1).max(20),
  efeitoNaFalha: EfeitoNaFalha.optional(),
  /* Teste que vem de um efeito (Hemorragia no fim do turno, Apagar o fogo): no sucesso, o efeito diminui ou sai. */
  efeitoNoSucesso: z.object({ efeitoAtivoId: Id, remover: z.union([z.number().int().min(1).max(20), z.literal("todos")]) }).optional(),
  /* Marcado pelo mestre: Cego e Surdo falham sozinhos no que depende de visão ou audição. */
  dependeDe: z.enum(["visao", "audicao"]).optional(),
};

export const Oponente = z.object({
  nome: z.string().min(1).max(80),
  /* Id da criatura ou NPC, quando vier do bestiário. */
  ref: z.string().min(1).optional(),
  teste: AlvoDoTeste,
  bonus: Bonus,
  modo: ModoRolagem.default("normal"),
});

/* Livro do Jogador, Progressão ("Testes de Habilidade", "Testes Passivos") e Ações ("Esconder-se"). */
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
    /* No empate vence quem age (decisão de 06/11/2026). Por padrão, o personagem. */
    quemAge: z.enum(["personagem", "oponente"]).default("personagem"),
  }),
]);
export type PedidoTeste = z.infer<typeof PedidoTeste>;
export type PedidoTesteEntrada = z.input<typeof PedidoTeste>;

/* O pedido como o jogador o recebe: DT oculta vira null, e só os personagens dele aparecem.
   Não existe versão do teste passivo: ele nunca sai do servidor para um jogador. */
export const PedidoTesteVisto = z.object({
  id: z.string(),
  tipo: z.enum(["habilidade", "resistencia", "contestado"]),
  teste: AlvoDoTeste,
  rotulo: z.string(),
  origem: z.string().optional(),
  personagens: z.array(z.object({ personagemId: z.string(), dt: z.number().int().nullable(), bonus: z.number().int(), modo: ModoRolagem })),
  oponenteNome: z.string().optional(),
});
export type PedidoTesteVisto = z.infer<typeof PedidoTesteVisto>;

/* "Fazer com Calma" e "Tentar até Conseguir" trocam o d20 por 10 ou 20 (Jogador, Progressão). */
export const OpcaoDeTeste = z.enum(["rolar", "fazer_com_calma", "tentar_ate_conseguir"]);
export type OpcaoDeTeste = z.infer<typeof OpcaoDeTeste>;

/* Resposta do jogador ao pop-up (especificação 8.4). */
export const RespostaTeste = z.object({
  pedidoId: Id,
  personagemId: Id,
  bonus: Bonus.default(0),
  modo: ModoRolagem.default("normal"),
  opcao: OpcaoDeTeste.default("rolar"),
  /* Habilidade da situação usada antes de rolar: gasta o custo e fica anotada no resultado. */
  habilidadeId: Id.optional(),
  usarCartaDoDestino: z.boolean().default(false),
});
export type RespostaTeste = z.infer<typeof RespostaTeste>;

/* ---------- Resultado ---------- */

const Parcela = z.object({ rotulo: z.string(), valor: z.number().int() });

export const CartaDoTeste = z.object({ valor: ValorCarta, naipe: Naipe.nullable(), modificador: z.number().int(), valeu: z.boolean() });

export const EstadoDoResultado = z.enum(["rolado", "passivo", "recusado", "decidido", "cancelado"]);

export const DadosResultadoTeste = z.object({
  /* Nulo no teste rápido, que o jogador faz sem pedido. */
  pedidoId: z.string().nullable(),
  personagemId: z.string(),
  personagemNome: z.string(),
  /* Quem controlava o personagem na hora. */
  donoId: z.string().nullable(),
  tipo: z.enum(["habilidade", "resistencia", "passivo", "contestado"]),
  teste: AlvoDoTeste,
  rotulo: z.string(),
  estado: EstadoDoResultado,
  dados: z.array(z.number().int()),
  escolhido: z.number().int(),
  natural: z.number().int().nullable(),
  cartas: z.array(CartaDoTeste),
  modificadores: z.array(Parcela),
  total: z.number().int().nullable(),
  dt: z.number().int().nullable(),
  dtVisivel: z.boolean(),
  sucesso: z.boolean().nullable(),
  critico: z.enum(["acerto", "falha"]).nullable(),
  opcao: OpcaoDeTeste,
  /* O ajuste usado, para Forçar e Rolar de novo repetirem a mesma conta. */
  bonus: z.number().int(),
  modo: ModoRolagem,
  /* O resultado que este substitui (Forçar, Rolar de novo, decisão depois de recusar). */
  anteriorId: z.string().nullable(),
  falhaAutomatica: z.string().nullable(),
  /* Habilidades usadas neste resultado (antes de rolar ou para rolar de novo). */
  habilidades: z.array(z.string()),
  forcado: z.boolean(),
  cartaDoDestino: z.boolean(),
  automatico: z.boolean(),
  oponente: z.object({ nome: z.string(), total: z.number().int().nullable(), dados: z.array(z.number().int()), visivel: z.boolean() }).nullable(),
  /* Forçar a Rolagem: o mestre aplica uma consequência, mesmo no sucesso (Jogador, Progressão). */
  consequencia: z.boolean(),
  efeitoAplicado: z.string().nullable(),
});
export type DadosResultadoTeste = z.infer<typeof DadosResultadoTeste>;
