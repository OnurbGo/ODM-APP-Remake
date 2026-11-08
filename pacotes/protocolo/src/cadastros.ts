import { z } from "zod";

/* Cadastros do mestre na campanha (fase 6): encontros, pistas das lendárias e, nas próximas etapas, missões,
   marcos, NPCs, lojas, notas e diário. Uma família só de mensagens; cada tipo valida os próprios dados.
   O servidor decide o que cada jogador recebe: o que é só do mestre nunca sai dele. */

const Id = z.string().min(1).max(80);
const Texto = z.string().max(20_000);

export const TIPOS_CADASTRO = ["encontro", "lendaria", "missao", "marco", "loja", "npc", "nota", "diario"] as const;
export const TipoCadastro = z.enum(TIPOS_CADASTRO);
export type TipoCadastro = z.infer<typeof TipoCadastro>;

/* Encontro salvo (Mestre, "Montando encontros"): criaturas do bestiário, quantidade, Elite e um XP ajustado
   à mão quando a ficha não basta (perfil à parte, estágio do Golem). */
export const DadosEncontro = z.object({
  nome: z.string().min(1).max(120),
  criaturas: z
    .array(z.object({ ref: Id, quantidade: z.number().int().min(1).max(20), elite: z.boolean().default(false), xp: z.number().int().min(0).max(1_000_000).nullable().default(null) }))
    .max(20),
  notas: Texto.default(""),
  missaoId: Id.nullable().default(null),
});
export type DadosEncontro = z.infer<typeof DadosEncontro>;

/* Criatura lendária: as pistas que o grupo já reuniu (recomendado: 3, por caminhos diferentes). */
export const DadosLendaria = z.object({
  ref: Id,
  pistas: z.array(z.object({ texto: z.string().min(1).max(500), de: z.string().max(120).default("") })).max(30),
});
export type DadosLendaria = z.infer<typeof DadosLendaria>;

/* Missão (Mestre, "Fluxo das missões"): as 4 etapas, cada uma com texto para os jogadores, notas do mestre e
   "visível". O jogador só recebe a missão visível e fora de rascunho, sem notas, ligações e etapas ocultas. */
export const ETAPAS_MISSAO = ["inicio", "investigacao", "conflito", "desfecho"] as const;
export type EtapaMissaoId = (typeof ETAPAS_MISSAO)[number];
export const ROTULO_ETAPA: Record<EtapaMissaoId, string> = {
  inicio: "Início",
  investigacao: "Investigação e caçada",
  conflito: "Conflito",
  desfecho: "Desfecho",
};

const EtapaMissao = z.object({ jogadores: Texto.default(""), mestre: Texto.default(""), visivel: z.boolean().default(false) });
export type EtapaMissao = z.infer<typeof EtapaMissao>;
const etapaVazia = () => ({ jogadores: "", mestre: "", visivel: false });

export const DificuldadeMissao = z.enum(["facil", "moderada", "dificil", "morte_certa"]);
export const SituacaoMissao = z.enum(["rascunho", "ativa", "concluida", "falhou"]);
export type SituacaoMissao = z.infer<typeof SituacaoMissao>;

export const DadosMissao = z.object({
  titulo: z.string().min(1).max(160),
  dificuldade: DificuldadeMissao.default("moderada"),
  situacao: SituacaoMissao.default("rascunho"),
  visivel: z.boolean().default(false),
  /* Ordem na lista do mestre e do jogador. */
  ordem: z.number().int().min(0).max(100_000).default(0),
  etapas: z
    .object({ inicio: EtapaMissao, investigacao: EtapaMissao, conflito: EtapaMissao, desfecho: EtapaMissao })
    .default({ inicio: etapaVazia(), investigacao: etapaVazia(), conflito: etapaVazia(), desfecho: etapaVazia() }),
  objetivos: z.array(z.object({ texto: z.string().min(1).max(300), feito: z.boolean().default(false), visivel: z.boolean().default(true) })).max(40).default([]),
  /* Ligações: criaturas do pacote e, a partir da etapa 10, NPCs da campanha. Os encontros apontam para a missão. */
  criaturas: z.array(Id).max(30).default([]),
  npcs: z.array(Id).max(30).default([]),
  recompensas: z
    .object({ texto: Texto.default(""), itens: z.array(z.object({ itemId: Id.nullable(), nome: z.string().min(1).max(120), quantidade: z.number().int().min(1).max(999) })).max(30).default([]) })
    .default({ texto: "", itens: [] }),
  notas: Texto.default(""),
  /* Recompensa já entregue: evita dar duas vezes sem querer. */
  entregue: z.boolean().default(false),
});
export type DadosMissao = z.infer<typeof DadosMissao>;

/* Marco da linha do tempo. O jogador vê só o que está visível e já aconteceu. */
export const DadosMarco = z.object({
  titulo: z.string().min(1).max(160),
  descricao: Texto.default(""),
  /* Data no mundo do jogo, em texto livre ("3º dia da colheita"). */
  quando: z.string().max(80).default(""),
  ordem: z.number().int().min(0).max(100_000).default(0),
  missaoId: Id.nullable().default(null),
  tags: z.array(z.string().min(1).max(40)).max(10).default([]),
  visivel: z.boolean().default(false),
  aconteceu: z.boolean().default(false),
});
export type DadosMarco = z.infer<typeof DadosMarco>;

/* Loja da campanha (Mestre, "Disposição do comércio"; C1, C2 e C3 de 07/11/2026). Preço nulo: linha só de texto,
   que não se compra (item que falta no catálogo). Quantidade nula: sem limite. O caixa paga o que a loja compra. */
export const LinhaDeLoja = z.object({
  id: Id,
  itemId: Id.nullable(),
  nome: z.string().min(1).max(160),
  preco: z.number().int().min(0).max(100_000_000).nullable(),
  quantidade: z.number().int().min(0).max(100_000).nullable(),
});
export type LinhaDeLoja = z.infer<typeof LinhaDeLoja>;
/* Efeito ao pagar o serviço (decisão de 08/11/2026, a partir do app antigo): roda na vida do personagem,
   com desfazer do mestre. Fora de combate. */
export const EfeitoDeServico = z.object({
  curaTotal: z.boolean().default(false),
  dadosDeVida: z.boolean().default(false),
  tiraExaustao: z.boolean().default(false),
  /* Efeito do pacote que o personagem recebe, como Bem Nutrido. */
  condicao: Id.nullable().default(null),
  /* Soma ao preço por nível de Exaustão do personagem (o Tratamento Médico: + R$ 50 por nível). */
  extraPorExaustao: z.number().int().min(0).max(1_000_000).default(0),
});
export type EfeitoDeServico = z.infer<typeof EfeitoDeServico>;
export const ServicoDeLoja = z.object({
  id: Id,
  nome: z.string().min(1).max(160),
  preco: z.number().int().min(0).max(100_000_000),
  descricao: z.string().max(2000).default(""),
  efeito: EfeitoDeServico.nullable().default(null),
});
export type ServicoDeLoja = z.infer<typeof ServicoDeLoja>;

export const DadosLoja = z.object({
  nome: z.string().min(1).max(120),
  cidade: z.string().max(120).default(""),
  /* Aberta: os jogadores veem e compram. */
  aberta: z.boolean().default(false),
  caixa: z.number().int().min(0).max(1_000_000_000).nullable().default(null),
  itens: z.array(LinhaDeLoja).max(2000).default([]),
  servicos: z.array(ServicoDeLoja).max(50).default([]),
  /* Madame Nara: só compra coisas fora do comum (o mestre decide o que conta). */
  compraSoForaDoComum: z.boolean().default(false),
  notas: Texto.default(""),
  /* A loja do livro de onde veio a cópia. */
  origem: Id.nullable().default(null),
});
export type DadosLoja = z.infer<typeof DadosLoja>;

/* Imagem: arte do pacote (id da criatura ou NPC do livro) ou arquivo enviado pelo mestre. */
export const RefImagem = z.object({ origem: z.enum(["pacote", "arquivo"]), id: Id });
export type RefImagem = z.infer<typeof RefImagem>;

/* NPC (Mestre, "Como criar um NPC?": objetivo, segredo e traço). O jogador vê, do NPC visível, só o nome,
   a cidade, a afiliação, o resumo e a imagem. "ref": a ficha do bestiário, para entrar no combate. */
export const DadosNpc = z.object({
  nome: z.string().min(1).max(120),
  cidade: z.string().max(120).default(""),
  afiliacao: z.string().max(120).default(""),
  resumo: Texto.default(""),
  objetivo: z.string().max(500).default(""),
  segredo: z.string().max(500).default(""),
  traco: z.string().max(500).default(""),
  notas: Texto.default(""),
  ref: Id.nullable().default(null),
  imagem: RefImagem.nullable().default(null),
  visivel: z.boolean().default(false),
});
export type DadosNpc = z.infer<typeof DadosNpc>;

/* Nota do mestre: nunca sai dele. */
export const DadosNota = z.object({ titulo: z.string().min(1).max(160), texto: Texto.default(""), fixada: z.boolean().default(false) });
export type DadosNota = z.infer<typeof DadosNota>;

/* Diário da sessão: uma entrada por sessão, escrita pelo mestre; com "visível", os jogadores leem. */
export const DadosDiario = z.object({
  sessao: z.number().int().min(1).max(10_000),
  data: z.string().max(40).default(""),
  titulo: z.string().max(160).default(""),
  texto: Texto.default(""),
  visivel: z.boolean().default(false),
});
export type DadosDiario = z.infer<typeof DadosDiario>;

export const DADOS_POR_TIPO = { encontro: DadosEncontro, lendaria: DadosLendaria, missao: DadosMissao, marco: DadosMarco, loja: DadosLoja, npc: DadosNpc, nota: DadosNota, diario: DadosDiario } satisfies Record<TipoCadastro, z.ZodType>;

/* "Mostrar para os jogadores": imagem e/ou texto por cima da tela deles. "para" vazio = todos. */
export const Mostra = z.object({
  titulo: z.string().max(160).default(""),
  texto: Texto.default(""),
  imagem: RefImagem.nullable().default(null),
  para: z.array(Id).max(20).default([]),
});
export type Mostra = z.infer<typeof Mostra>;

export const Cadastro = z.discriminatedUnion("tipo", [
  z.object({ id: Id, tipo: z.literal("encontro"), dados: DadosEncontro, atualizadoEm: z.string() }),
  z.object({ id: Id, tipo: z.literal("lendaria"), dados: DadosLendaria, atualizadoEm: z.string() }),
  z.object({ id: Id, tipo: z.literal("missao"), dados: DadosMissao, atualizadoEm: z.string() }),
  z.object({ id: Id, tipo: z.literal("marco"), dados: DadosMarco, atualizadoEm: z.string() }),
  z.object({ id: Id, tipo: z.literal("loja"), dados: DadosLoja, atualizadoEm: z.string() }),
  z.object({ id: Id, tipo: z.literal("npc"), dados: DadosNpc, atualizadoEm: z.string() }),
  z.object({ id: Id, tipo: z.literal("nota"), dados: DadosNota, atualizadoEm: z.string() }),
  z.object({ id: Id, tipo: z.literal("diario"), dados: DadosDiario, atualizadoEm: z.string() }),
]);
export type Cadastro = z.infer<typeof Cadastro>;

/* O que o cliente manda: sem id, é novo; o servidor dá o id e a hora. */
export const CadastroNovo = z.discriminatedUnion("tipo", [
  z.object({ id: Id.optional(), tipo: z.literal("encontro"), dados: DadosEncontro }),
  z.object({ id: Id.optional(), tipo: z.literal("lendaria"), dados: DadosLendaria }),
  z.object({ id: Id.optional(), tipo: z.literal("missao"), dados: DadosMissao }),
  z.object({ id: Id.optional(), tipo: z.literal("marco"), dados: DadosMarco }),
  z.object({ id: Id.optional(), tipo: z.literal("loja"), dados: DadosLoja }),
  z.object({ id: Id.optional(), tipo: z.literal("npc"), dados: DadosNpc }),
  z.object({ id: Id.optional(), tipo: z.literal("nota"), dados: DadosNota }),
  z.object({ id: Id.optional(), tipo: z.literal("diario"), dados: DadosDiario }),
]);
export type CadastroDe<T extends TipoCadastro> = Extract<Cadastro, { tipo: T }>;
export type CadastroNovo = z.infer<typeof CadastroNovo>;
