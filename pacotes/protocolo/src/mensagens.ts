import { z } from "zod";
import { TAMANHO_CODIGO_MESA, TAMANHO_MAXIMO_NOME } from "./constantes";
import { EventoVisto } from "./eventos";
import { FichaRascunho, Kit, OpcoesCampanha, Operacao, Personagem } from "./ficha";
import { PedidoTeste, RespostaTeste } from "./testes";

const Nome = z.string().trim().min(1).max(TAMANHO_MAXIMO_NOME);
const CodigoMesa = z.string().trim().toUpperCase().length(TAMANHO_CODIGO_MESA);
const Id = z.string().min(1).max(100);
const Token = z.string().min(20).max(200);

export const Credencial = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("visitante") }),
  z.object({ tipo: z.literal("mestre"), token: Token }),
  z.object({ tipo: z.literal("jogador"), token: Token }),
  /* Celular que bloqueou a tela enquanto esperava a aprovação. */
  z.object({ tipo: z.literal("pedido"), pedidoId: Id, segredo: Token }),
]);
export type Credencial = z.infer<typeof Credencial>;

export const MensagemCliente = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("ola"),
    versao: z.number().int(),
    credencial: Credencial,
    /* Quantos eventos do próprio registro este cliente já tem. */
    vistos: z.number().int().min(0).default(0),
  }),
  z.object({ t: z.literal("criar_mesa"), nome: Nome }),
  z.object({ t: z.literal("pedir_entrada"), nome: Nome, codigo: CodigoMesa }),
  z.object({ t: z.literal("aprovar_entrada"), pedidoId: Id, vincularA: Id.optional() }),
  z.object({ t: z.literal("recusar_entrada"), pedidoId: Id }),
  z.object({ t: z.literal("revogar_acesso"), participanteId: Id }),
  z.object({ t: z.literal("trocar_codigo") }),
  z.object({
    t: z.literal("rolar"),
    rotulo: z.string().trim().max(60).optional(),
    bonus: z.number().int().min(-99).max(99).default(0),
  }),
  /* O personagem é da campanha: o mestre troca quem o controla a qualquer momento (null = sem jogador). */
  z.object({ t: z.literal("ligar_personagem"), personagemId: Id, participanteId: Id.nullable() }),
  z.object({ t: z.literal("personagem_criar") }),
  z.object({ t: z.literal("personagem_salvar"), personagemId: Id, ficha: FichaRascunho }),
  z.object({ t: z.literal("personagem_concluir"), personagemId: Id }),
  z.object({ t: z.literal("personagem_apagar"), personagemId: Id }),
  z.object({ t: z.literal("ficha_operar"), personagemId: Id, operacao: Operacao }),
  z.object({ t: z.literal("ficha_desfazer"), eventoId: Id }),
  z.object({ t: z.literal("opcoes_campanha"), opcoes: OpcoesCampanha }),
  z.object({ t: z.literal("kit_salvar"), kit: Kit }),
  z.object({ t: z.literal("kit_apagar"), kitId: Id }),
  z.object({ t: z.literal("kit_entregar"), personagemId: Id, kitId: Id }),
  /* Formato já definido; o servidor responde "indisponivel" até a fase 5. */
  z.object({ t: z.literal("pedir_teste"), pedido: PedidoTeste }),
  z.object({ t: z.literal("responder_teste"), resposta: RespostaTeste }),
]);
export type MensagemCliente = z.input<typeof MensagemCliente>;
export type MensagemClienteLida = z.output<typeof MensagemCliente>;

export const Papel = z.enum(["mestre", "jogador"]);
export type Papel = z.infer<typeof Papel>;

export const Participante = z.object({ id: z.string(), nome: z.string(), papel: Papel, online: z.boolean() });
export type Participante = z.infer<typeof Participante>;

/* Todo jogador que já passou pela mesa, incluindo quem foi tirado: o personagem dele continua aqui. */
export const JogadorConhecido = z.object({ id: z.string(), nome: z.string(), revogado: z.boolean() });
export type JogadorConhecido = z.infer<typeof JogadorConhecido>;

export const PedidoEntrada = z.object({
  id: z.string(),
  nome: z.string(),
  criadoEm: z.string(),
  /* Jogadores com o mesmo nome: pode ser a mesma pessoa em outro dispositivo. */
  mesmoNomeDe: z.array(JogadorConhecido),
});
export type PedidoEntrada = z.infer<typeof PedidoEntrada>;

export const TipoRede = z.enum(["lan", "hamachi", "radmin", "outra"]);
export type TipoRede = z.infer<typeof TipoRede>;

export const EnderecoRede = z.object({ ip: z.string(), tipo: TipoRede, interface: z.string() });
export type EnderecoRede = z.infer<typeof EnderecoRede>;

export const RedeMestre = z.object({
  porta: z.number().int(),
  enderecos: z.array(EnderecoRede),
});
export type RedeMestre = z.infer<typeof RedeMestre>;

export const CodigoErro = z.enum([
  "versao_incompativel",
  "mensagem_invalida",
  "nao_identificado",
  "nao_autorizado",
  "token_invalido",
  "acesso_revogado",
  "pedido_inexistente",
  "sem_mesa",
  "mesa_ja_existe",
  "codigo_incorreto",
  "muitas_tentativas",
  "indisponivel",
  "recusado",
]);
export type CodigoErro = z.infer<typeof CodigoErro>;

export const MensagemServidor = z.discriminatedUnion("t", [
  z.object({ t: z.literal("visitante"), mesaAberta: z.boolean() }),
  z.object({
    t: z.literal("bem_vindo"),
    eu: Participante,
    mesa: z.object({ nome: z.string(), opcoes: OpcoesCampanha, conteudo: z.boolean() }),
    participantes: z.array(Participante),
    eventos: z.array(EventoVisto),
    personagens: z.array(Personagem),
  }),
  /* Só o mestre recebe estas duas: o que o jogador nunca pode ver vai numa mensagem à parte. */
  z.object({ t: z.literal("sem_mesa") }),
  z.object({
    t: z.literal("estado_mestre"),
    codigo: z.string(),
    pedidos: z.array(PedidoEntrada),
    jogadores: z.array(JogadorConhecido),
    rede: RedeMestre,
    kits: z.array(Kit),
  }),
  z.object({ t: z.literal("entrada_aguardando"), pedidoId: z.string(), segredo: z.string() }),
  z.object({ t: z.literal("entrada_aprovada"), token: z.string() }),
  z.object({ t: z.literal("entrada_recusada") }),
  z.object({ t: z.literal("acesso_revogado") }),
  z.object({ t: z.literal("presenca"), participantes: z.array(Participante) }),
  z.object({ t: z.literal("evento"), evento: EventoVisto }),
  /* Personagem novo ou alterado. Cada um recebe só os que pode ver. */
  z.object({ t: z.literal("personagem"), personagem: Personagem }),
  z.object({ t: z.literal("personagem_removido"), personagemId: z.string() }),
  z.object({ t: z.literal("opcoes_campanha"), opcoes: OpcoesCampanha }),
  z.object({ t: z.literal("erro"), codigo: CodigoErro, mensagem: z.string() }),
]);
export type MensagemServidor = z.infer<typeof MensagemServidor>;
