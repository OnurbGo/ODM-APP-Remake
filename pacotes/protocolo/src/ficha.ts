import { z } from "zod";

/* A ficha guarda ids e escolhas, nunca valor calculado (especificação, 5.1). Nível, PV e Defesa saem do motor de regras. */

const Id = z.string().min(1).max(160);
const TextoCurto = z.string().trim().max(120);

const ATRIBUTOS = ["brutalidade", "agilidade", "fibra", "intelecto", "astucia", "presenca"] as const;
const AtributoFicha = z.enum(ATRIBUTOS);

export const AjusteManual = z.object({ valor: z.number().int().min(-999).max(999), motivo: TextoCurto.optional() });
export type AjusteManual = z.infer<typeof AjusteManual>;

/* Tudo o que a loja de prestígio vende. O id identifica a compra para o desfazer. */
export const CompraPrestigio = z.discriminatedUnion("tipo", [
  z.object({ id: Id, tipo: z.literal("tecnica_avancada"), habilidadeId: Id }),
  z.object({ id: Id, tipo: z.literal("tecnica_lendaria"), habilidadeId: Id }),
  z.object({ id: Id, tipo: z.literal("talento"), talentoId: Id, atributo: AtributoFicha.optional(), escolhas: z.array(Id).max(4).optional() }),
  z.object({ id: Id, tipo: z.literal("proficiencia"), genero: z.enum(["categoria", "pericia", "ferramenta"]), valor: TextoCurto.min(1) }),
  z.object({ id: Id, tipo: z.literal("vitalidade_aprimorada") }),
]);
export type CompraPrestigio = z.infer<typeof CompraPrestigio>;

/* Talento escolhido num nível da tabela. */
export const TalentoDeNivel = z.object({
  nivel: z.number().int().min(1).max(20),
  talentoId: Id,
  atributo: AtributoFicha.optional(),
  /* O que o talento pede para escolher: perícias, proficiências. */
  escolhas: z.array(Id).max(4).optional(),
});
export type TalentoDeNivel = z.infer<typeof TalentoDeNivel>;

export const ItemFicha = z.object({
  id: Id,
  /* Nulo em item escrito à mão pelo mestre. */
  itemId: Id.nullable(),
  nome: TextoCurto.min(1),
  quantidade: z.number().int().min(1).max(9999),
  equipado: z.boolean().default(false),
  pesoKg: z.number().min(0).max(9999).nullable().default(null),
});
export type ItemFicha = z.infer<typeof ItemFicha>;

/* Cópia do que o personagem tem, para o aviso "não está mais no livro" (especificação, 4.2). */
const CopiaConteudo = z.object({ nome: z.string(), texto: z.string() });

export const FichaDados = z.object({
  nome: TextoCurto,
  conceito: z.string().max(2000),
  origemId: Id.nullable(),
  classeId: Id.nullable(),
  /* Valores distribuídos na criação, antes de origem e talentos. */
  atributos: z.partialRecord(AtributoFicha, z.number().int().min(-5).max(10)),
  pericias: z.array(Id).max(20),
  ferramentas: z.array(TextoCurto).max(10),
  trocas: z.array(z.string().max(40)).max(4),
  /* Escolhas que a origem pede, como a perícia de uma lista. */
  escolhasDaOrigem: z.array(Id).max(10),
  especializacaoId: Id.nullable(),
  talentos: z.array(TalentoDeNivel).max(20),
  /* Escolhas de nível que não são talento nem especialização: as Posturas do Marcial. */
  escolhasDeNivel: z.record(z.string(), z.array(Id)),
  xp: z.number().int().min(0).max(100_000_000),
  /* Pontos dados ou tirados pelo mestre, além dos que vêm do XP. */
  prestigioDoMestre: z.number().int().min(-100).max(100),
  compras: z.array(CompraPrestigio).max(200),
  habilidadesDoMestre: z.array(Id).max(100),
  inventario: z.array(ItemFicha).max(500),
  dinheiro: z.number().int().min(-1_000_000_000).max(1_000_000_000),
  honra: z.number().int().min(0).max(20),
  redencao: z.object({ titulo: TextoCurto, passos: z.array(z.object({ texto: z.string().max(400), feito: z.boolean() })).length(6) }),
  notas: z.string().max(20_000),
  ajustes: z.record(z.string(), AjusteManual),
  copias: z.record(z.string(), CopiaConteudo),
});
export type FichaDados = z.infer<typeof FichaDados>;

export const SituacaoPersonagem = z.enum(["rascunho", "ativo"]);
export type SituacaoPersonagem = z.infer<typeof SituacaoPersonagem>;

export const Personagem = z.object({
  id: z.string(),
  participanteId: z.string().nullable(),
  situacao: SituacaoPersonagem,
  ficha: FichaDados,
});
export type Personagem = z.infer<typeof Personagem>;

export function fichaVazia(): FichaDados {
  return {
    nome: "",
    conceito: "",
    origemId: null,
    classeId: null,
    atributos: {},
    pericias: [],
    ferramentas: [],
    trocas: [],
    escolhasDaOrigem: [],
    especializacaoId: null,
    talentos: [],
    escolhasDeNivel: {},
    xp: 0,
    prestigioDoMestre: 0,
    compras: [],
    habilidadesDoMestre: [],
    inventario: [],
    dinheiro: 0,
    /* Sistema de Honra: "10 = neutro". */
    honra: 10,
    redencao: { titulo: "", passos: Array.from({ length: 6 }, () => ({ texto: "", feito: false })) },
    notas: "",
    ajustes: {},
    copias: {},
  };
}

export const OpcoesCampanha = z.object({
  cartasDoDestino: z.boolean().default(true),
  estresse: z.boolean().default(false),
  modeloVantagem: z.enum(["dados_extras", "cartas"]).default("dados_extras"),
  empateIniciativa: z.enum(["naipe", "nova_compra"]).default("naipe"),
  polivalencia: z.boolean().default(false),
});
export type OpcoesCampanha = z.infer<typeof OpcoesCampanha>;

export const opcoesPadrao = (): OpcoesCampanha => OpcoesCampanha.parse({});

const Delta = z.number().int().min(-100_000_000).max(100_000_000);

/* Toda mudança numa ficha ativa é uma operação: vira evento no registro e sabe se desfazer. */
export const Operacao = z.discriminatedUnion("op", [
  z.object({ op: z.literal("xp"), delta: Delta }),
  z.object({ op: z.literal("prestigio"), delta: Delta }),
  z.object({ op: z.literal("honra"), delta: Delta }),
  z.object({ op: z.literal("dinheiro"), delta: Delta }),
  z.object({ op: z.literal("comprar"), compra: CompraPrestigio }),
  z.object({ op: z.literal("devolver_compra"), compra: CompraPrestigio }),
  z.object({ op: z.literal("especializacao"), id: Id.nullable() }),
  z.object({ op: z.literal("talento_de_nivel"), nivel: z.number().int().min(1).max(20), escolha: TalentoDeNivel.nullable() }),
  z.object({ op: z.literal("escolhas_de_nivel"), nivel: z.number().int().min(1).max(20), ids: z.array(Id).max(10) }),
  z.object({ op: z.literal("dar_item"), item: ItemFicha }),
  z.object({ op: z.literal("tirar_item"), item: ItemFicha }),
  z.object({ op: z.literal("equipar"), itemFichaId: Id, equipado: z.boolean() }),
  z.object({ op: z.literal("dar_habilidade"), id: Id }),
  z.object({ op: z.literal("tirar_habilidade"), id: Id }),
  z.object({ op: z.literal("ajuste"), campo: z.string().min(1).max(200), ajuste: AjusteManual.nullable() }),
  z.object({ op: z.literal("passo_redencao"), indice: z.number().int().min(0).max(5), feito: z.boolean() }),
  z.object({ op: z.literal("notas"), texto: z.string().max(20_000) }),
]);
export type Operacao = z.infer<typeof Operacao>;

/* O que o jogador pode mudar enquanto o personagem é rascunho. XP, Honra e compras ficam de fora. */
export const FichaRascunho = FichaDados.pick({
  nome: true,
  conceito: true,
  origemId: true,
  classeId: true,
  atributos: true,
  pericias: true,
  ferramentas: true,
  trocas: true,
  escolhasDaOrigem: true,
  redencao: true,
  notas: true,
}).partial();
export type FichaRascunho = z.infer<typeof FichaRascunho>;

export const Kit = z.object({
  id: Id,
  nome: TextoCurto.min(1),
  itens: z.array(z.object({ itemId: Id.nullable(), nome: TextoCurto.min(1), quantidade: z.number().int().min(1).max(999) })).max(50),
});
export type Kit = z.infer<typeof Kit>;
