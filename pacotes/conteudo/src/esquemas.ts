import { z } from "zod";
import { Atributo, MecanicaClasse, MecanicaFicha, MecanicaHabilidade, MecanicaItem } from "./mecanica";

/* Especificação, 4.2: id fixo no formato tipo.nome. */
export const IdConteudo = z.string().regex(/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/);

const Fonte = z.object({ arquivo: z.string().min(1) });

/* A estrutura da mecânica é conferida pelo motor de regras na fase 5. Aqui só vale ser um objeto. */
const Mecanica = z.record(z.string(), z.unknown());

const Item = {
  id: IdConteudo,
  nome: z.string().min(1),
  fonte: Fonte,
  texto: z.string(),
  mecanica: Mecanica.optional(),
};

export const Efeito = z.object({
  ...Item,
  tipo: z.literal("efeito"),
  /* Grafia para a tela: o título do livro às vezes vem em caixa alta só pela diagramação. */
  exibir: z.string().min(1).optional(),
  apelido: z.string().optional(),
});
export type Efeito = z.infer<typeof Efeito>;

export const Acao = z.object({
  ...Item,
  tipo: z.literal("acao"),
  rotulo: z.string(),
  custoPa: z.number().int().nullable(),
  recargaCriatura: z.string().nullable(),
  elite: z.boolean(),
  inicio: z.boolean(),
  combo: z.boolean(),
  /* Nula em seção de continuação, que no livro não tem título. */
  secao: z.string().nullable(),
});
export type Acao = z.infer<typeof Acao>;

/* Texto solto da ficha, sem nome de ação. */
const NotaFicha = z.object({ nota: z.string() });

const Atributos = z.object({
  brutalidade: z.number().int().nullable(),
  agilidade: z.number().int().nullable(),
  fibra: z.number().int().nullable(),
  intelecto: z.number().int().nullable(),
  astucia: z.number().int().nullable(),
  presenca: z.number().int().nullable(),
});

const Ficha = {
  ...Item,
  categoria: z.string().nullable(),
  descricao: z.string().nullable(),
  /* Nulos quando a ficha é variável (ex.: "Depende"); o texto original fica ao lado. */
  defesa: z.number().int().nullable(),
  defesaTexto: z.string().nullable(),
  pv: z.number().int().nullable(),
  pvTexto: z.string().nullable(),
  deslocamentoM: z.number().nullable(),
  atributos: Atributos,
  extras: z.array(z.string()),
  nd: z.string().nullable(),
  xp: z.number().int().nullable(),
  secoes: z.array(z.object({ titulo: z.string().nullable(), itens: z.array(z.union([Acao, NotaFicha])) })),
};

export const Criatura = z.object({ ...Ficha, tipo: z.literal("criatura") });
export type Criatura = z.infer<typeof Criatura>;

export const Ameaca = z.object({ ...Ficha, tipo: z.literal("ameaca") });
export type Ameaca = z.infer<typeof Ameaca>;

export const Classe = z.object({
  ...Item,
  tipo: z.literal("classe"),
  descricao: z.string(),
  tabela: z.array(
    z.object({
      nivel: z.number().int().min(1).max(20),
      caracteristicas: z.string(),
      /* Colunas próprias da classe, como Fichas de Fúria e Dado do Caçador. */
      colunas: z.record(z.string(), z.string()).optional(),
    }),
  ),
  caracteristicas: z.record(z.string(), z.string()),
  mecanica: MecanicaClasse.optional(),
});
export type Classe = z.infer<typeof Classe>;

export const Especializacao = z.object({
  ...Item,
  tipo: z.literal("especializacao"),
  classe: z.string(),
  descricao: z.string(),
});
export type Especializacao = z.infer<typeof Especializacao>;

export const Habilidade = z.object({
  ...Item,
  tipo: z.literal("habilidade"),
  tituloLivro: z.string(),
  classe: z.string(),
  especializacao: z.string().nullable(),
  nivel: z.number().int().optional(),
  tecnica: z.enum(["avancada", "lendaria"]).optional(),
  requisito: z.string().optional(),
  requisitoNivel: z.number().int().optional(),
  inicio: z.boolean().optional(),
  combo: z.boolean().optional(),
  mecanica: MecanicaHabilidade.optional(),
});
export type Habilidade = z.infer<typeof Habilidade>;

/* Fichas de classe: Ficha de Olho da Morte, Ficha de Mana etc. */
export const Recurso = z.object({
  ...Item,
  tipo: z.literal("recurso"),
  classe: z.string(),
  especializacao: z.string().nullable(),
  mecanica: MecanicaFicha.optional(),
});
export type Recurso = z.infer<typeof Recurso>;

export const Origem = z.object({
  ...Item,
  tipo: z.literal("origem"),
  pericias: z.string().nullable(),
  ferramentas: z.string().nullable(),
  mecanica: MecanicaHabilidade.optional(),
});
export type Origem = z.infer<typeof Origem>;

export const Talento = z.object({ ...Item, tipo: z.literal("talento"), mecanica: MecanicaHabilidade.optional() });
export type Talento = z.infer<typeof Talento>;

const Catalogo = {
  ...Item,
  departamento: z.string().nullable(),
  preco: z.string().nullable(),
  campos: z.record(z.string(), z.string()),
};

export const ItemCatalogo = z.object({
  ...Catalogo,
  tipo: z.literal("item"),
  categoria: z.enum(["arma", "protecao", "equipamento"]),
  mecanica: MecanicaItem.optional(),
});
export type ItemCatalogo = z.infer<typeof ItemCatalogo>;

export const Modificacao = z.object({ ...Catalogo, tipo: z.literal("modificacao"), grupo: z.string().nullable() });
export type Modificacao = z.infer<typeof Modificacao>;

export const Municao = z.object({ ...Catalogo, tipo: z.literal("municao"), grupo: z.string().nullable() });
export type Municao = z.infer<typeof Municao>;

export const Propriedade = z.object({ ...Item, tipo: z.literal("propriedade") });
export type Propriedade = z.infer<typeof Propriedade>;

export const Tabela = z.object({
  ...Item,
  tipo: z.literal("tabela"),
  cabecalho: z.array(z.string()),
  linhas: z.array(z.array(z.string())),
});
export type Tabela = z.infer<typeof Tabela>;

export const Pericia = z.object({
  ...Item,
  tipo: z.literal("pericia"),
  exibir: z.string().min(1),
  atributo: Atributo,
});
export type Pericia = z.infer<typeof Pericia>;

/* Regra em prosa que o app calcula: carga, atributos iniciais, loja de prestígio. */
export const Regra = z.object({ ...Item, tipo: z.literal("regra") });
export type Regra = z.infer<typeof Regra>;

/* Tudo opcional: um complemento só traz o que acrescenta. Chave desconhecida é erro, para o exportador e o app não divergirem. */
export const Conteudo = z.strictObject({
  efeitos: z.array(Efeito).default([]),
  origens: z.array(Origem).default([]),
  talentos: z.array(Talento).default([]),
  classes: z.array(Classe).default([]),
  especializacoes: z.array(Especializacao).default([]),
  habilidades: z.array(Habilidade).default([]),
  recursos: z.array(Recurso).default([]),
  criaturas: z.array(Criatura).default([]),
  ameacas: z.array(Ameaca).default([]),
  itens: z.array(ItemCatalogo).default([]),
  modificacoes: z.array(Modificacao).default([]),
  municoes: z.array(Municao).default([]),
  propriedades: z.array(Propriedade).default([]),
  tabelas: z.array(Tabela).default([]),
  pericias: z.array(Pericia).default([]),
  regras: z.array(Regra).default([]),
});
export type Conteudo = z.infer<typeof Conteudo>;
