import { z } from "zod";
import { TAMANHO_CODIGO_MESA, TAMANHO_MAXIMO_NOME } from "./constantes";
import { EventoVisto } from "./eventos";
import { Alvo, EstadoCombate, FonteDeAtaque, OpcoesDeAtaque, Reacao } from "./combate";
import { FichaRascunho, Kit, OpcoesCampanha, opcoesPadrao, Operacao, Personagem } from "./ficha";
import { AlvoDoTeste, ModoRolagem, OpcaoDeTeste, PedidoTeste, RespostaTeste } from "./testes";

const Nome = z.string().trim().min(1).max(TAMANHO_MAXIMO_NOME);
const CodigoMesa = z.string().trim().toUpperCase().length(TAMANHO_CODIGO_MESA);
const Id = z.string().min(1).max(100);
const Token = z.string().min(20).max(200);
const MAX_TOKENS_POR_APARELHO = 20;

export const Credencial = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("visitante") }),
  z.object({ tipo: z.literal("mestre"), token: Token }),
  /* Um token por campanha em que este aparelho foi aprovado: vale o da campanha aberta. */
  z.object({ tipo: z.literal("jogador"), tokens: z.array(Token).min(1).max(MAX_TOKENS_POR_APARELHO) }),
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
    /* De quem é essa contagem: em outra campanha a pessoa é outro participante e recebe tudo. */
    vistosDe: Id.optional(),
  }),
  z.object({ t: z.literal("criar_campanha"), nome: Nome, pacotes: z.array(Id).max(20).default([]), opcoes: OpcoesCampanha.default(opcoesPadrao) }),
  z.object({ t: z.literal("abrir_campanha"), campanhaId: Id }),
  z.object({ t: z.literal("fechar_campanha") }),
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
  /* Combate (fase 5). O servidor valida tudo; o cliente só pede. */
  z.object({
    t: z.literal("combate_criar"),
    personagens: z.array(Id).max(20),
    criaturas: z.array(z.object({ ref: Id, quantidade: z.number().int().min(1).max(20), elite: z.boolean().default(false) })).max(20),
  }),
  /* Sem combatente: o mestre compra para todos que ainda não têm carta. */
  z.object({ t: z.literal("iniciativa_comprar"), combatenteId: Id.optional() }),
  z.object({ t: z.literal("iniciativa_escolher_carta"), combatenteId: Id, cartaId: Id }),
  z.object({ t: z.literal("iniciativa_efeito"), combatenteId: Id, usar: z.boolean(), alvos: z.array(Id).max(2).default([]) }),
  z.object({ t: z.literal("iniciativa_desempatar") }),
  z.object({ t: z.literal("combate_comecar") }),
  z.object({ t: z.literal("turno_encerrar") }),
  z.object({ t: z.literal("rodada_nova") }),
  z.object({ t: z.literal("pa_gastar"), combatenteId: Id, quantos: z.number().int().min(1).max(6), tipo: z.enum(["acao", "deslocamento", "reacao"]) }),
  z.object({ t: z.literal("combate_encerrar") }),
  /* Ataques e dano (especificação 7.1). Criatura: só o mestre; arma do personagem: o dono ou o mestre. */
  z.object({ t: z.literal("atacar"), atacanteId: Id, fonte: FonteDeAtaque, alvos: z.array(Id).min(1).max(20), opcoes: OpcoesDeAtaque.default({ alemDoAlcance: false, bonus: 0, modo: "normal" }) }),
  z.object({ t: z.literal("reagir"), combatenteId: Id, reacao: Reacao }),
  /* Mestre: segue sem esperar quem ainda não escolheu, ou desiste do ataque. */
  z.object({ t: z.literal("ataque_seguir") }),
  z.object({ t: z.literal("ataque_cancelar") }),
  /* "espacos": quantos espaços da Horda a área cobriu (Dano em Área). */
  z.object({ t: z.literal("dano_aplicar"), combatenteId: Id, valor: z.number().int().min(0).max(9999), tipo: z.string().max(40).nullable(), espacos: z.number().int().min(0).max(60).default(0) }),
  /* Horda (ficha do Zumbi): o app não tem mapa, então o mestre escolhe quem forma e quem está na área. */
  z.object({ t: z.literal("horda_formar"), integrantes: z.array(Id).min(2).max(40) }),
  z.object({ t: z.literal("horda_area"), hordaId: Id, marcados: z.array(Id).max(30) }),
  /* Morrendo, Estresse, fichas e descansos (Jogador, "Morrendo e Estresse" e "Descansos"). */
  z.object({ t: z.literal("teste_de_morte"), personagemId: Id, usarCartaDoDestino: z.boolean().default(false) }),
  z.object({ t: z.literal("estabilizar"), personagemId: Id }),
  z.object({ t: z.literal("atitude_imprudente"), combatenteId: Id, opcao: z.enum(["precisao", "potencia", "violencia", "impeto"]) }),
  z.object({ t: z.literal("estresse_ajustar"), personagemId: Id, delta: z.number().int().min(-50).max(50) }),
  z.object({ t: z.literal("ficha_classe_ajustar"), personagemId: Id, recursoId: Id, delta: z.number().int().min(-50).max(50) }),
  z.object({ t: z.literal("habilidade_usar"), personagemId: Id, habilidadeId: Id }),
  z.object({
    t: z.literal("descanso"),
    tipo: z.enum(["curto", "longo"]),
    personagens: z.array(z.object({ personagemId: Id, dadosDeVida: z.number().int().min(0).max(20).default(0) })).min(1).max(20),
    alimentado: z.boolean().default(true),
    cuidadosMedicos: z.boolean().default(false),
  }),
  /* Recarga X–Y: o mestre marca a habilidade usada sem ataque automático, ou devolve à mão. */
  z.object({ t: z.literal("recarga_usar"), combatenteId: Id, acaoId: Id, gasta: z.boolean() }),
  z.object({ t: z.literal("pv_ajustar"), alvo: Alvo, delta: z.number().int().min(-9999).max(9999), temporarios: z.boolean().default(false) }),
  /* Efeitos à mão (mestre) e as ações que o efeito oferece (Levantar, Usar Trapos, Me aqueci). */
  z.object({ t: z.literal("efeito_aplicar"), alvo: Alvo, efeitoId: Id, acumulos: z.number().int().min(1).max(20).optional(), turnos: z.number().int().min(1).max(100).optional() }),
  z.object({ t: z.literal("efeito_editar"), alvo: Alvo, efeitoAtivoId: Id, acumulos: z.number().int().min(1).max(20), turnos: z.number().int().min(1).max(100).nullable() }),
  z.object({ t: z.literal("efeito_encerrar"), alvo: Alvo, efeitoAtivoId: Id }),
  z.object({ t: z.literal("efeito_acao"), alvo: Alvo, efeitoAtivoId: Id, indice: z.number().int().min(0).max(20) }),
  /* Rolagem do mestre para o que não tem mecânica aprovada. Oculta não sai para os jogadores. */
  z.object({ t: z.literal("rolar_livre"), rotulo: z.string().min(1).max(120), formula: z.string().min(1).max(40), oculta: z.boolean().default(true) }),
  z.object({ t: z.literal("combate_desfazer"), eventoId: Id }),
  /* Testes (especificação 8). O servidor rola; o cliente só pede. */
  z.object({ t: z.literal("pedir_teste"), pedido: PedidoTeste }),
  z.object({ t: z.literal("responder_teste"), resposta: RespostaTeste }),
  z.object({ t: z.literal("recusar_teste"), pedidoId: Id, personagemId: Id }),
  /* Mestre, no cartão de resultados: Sucesso, Falha, Rolar por ele ou Cancelar teste. */
  z.object({ t: z.literal("decidir_teste"), pedidoId: Id, personagemId: Id, acao: z.enum(["sucesso", "falha", "rolar", "cancelar"]) }),
  /* Depois de um resultado: Forçar a Rolagem (só teste de habilidade) ou rolar de novo com uma habilidade. */
  z.object({ t: z.literal("forcar_rolagem"), resultadoId: Id }),
  z.object({ t: z.literal("rolar_de_novo"), resultadoId: Id, habilidadeId: Id }),
  /* Teste que o próprio jogador faz pela aba Combate, sem pedido e sem DT. */
  z.object({
    t: z.literal("teste_rapido"),
    personagemId: Id,
    tipo: z.enum(["habilidade", "resistencia"]),
    teste: AlvoDoTeste,
    bonus: z.number().int().min(-99).max(99).default(0),
    modo: ModoRolagem.default("normal"),
    opcao: OpcaoDeTeste.default("rolar"),
    usarCartaDoDestino: z.boolean().default(false),
  }),
  /* "Rolar resistências automaticamente": fica no personagem, para o servidor rolar sem esperar o aparelho. */
  z.object({ t: z.literal("automatico"), personagemId: Id, ligado: z.boolean() }),
  /* Cartas do Destino (opção da campanha): o mestre dá ou tira. */
  z.object({ t: z.literal("carta_do_destino"), personagemId: Id, tem: z.boolean() }),
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

/* Só no npm run dev, em que o node.exe recebe os jogadores. No app, o Electron responde pela ponte dele. */
export const EstadoFirewall = z.enum(["liberado", "bloqueado", "sem_liberacao", "desconhecido"]);

export const RedeMestre = z.object({
  porta: z.number().int(),
  enderecos: z.array(EnderecoRede),
  firewallDev: EstadoFirewall.nullable().default(null),
});
export type RedeMestre = z.infer<typeof RedeMestre>;

/* O que a lista de campanhas do mestre mostra. */
export const ResumoCampanha = z.object({
  id: z.string(),
  nome: z.string(),
  ultimaSessaoEm: z.string().nullable(),
  personagens: z.array(z.string()),
});
export type ResumoCampanha = z.infer<typeof ResumoCampanha>;

/* Pacote de conteúdo instalado, para a escolha da campanha nova. */
export const PacoteDisponivel = z.object({ id: z.string(), nome: z.string(), versao: z.string(), dependencias: z.array(z.string()) });
export type PacoteDisponivel = z.infer<typeof PacoteDisponivel>;

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
  /* deOutraCampanha: este aparelho tem lugar em outra campanha do mestre, e o token dele continua valendo. */
  z.object({ t: z.literal("visitante"), mesaAberta: z.boolean(), deOutraCampanha: z.boolean().default(false) }),
  /* A campanha abriu ou fechou: quem recebe diz "ola" de novo e descobre onde está. */
  z.object({ t: z.literal("mesa_mudou") }),
  z.object({
    t: z.literal("bem_vindo"),
    eu: Participante,
    mesa: z.object({ id: z.string(), nome: z.string(), opcoes: OpcoesCampanha, conteudo: z.boolean() }),
    /* Qual dos tokens do "ola" valeu. Nulo para o mestre. */
    tokenIndice: z.number().int().min(0).nullable(),
    participantes: z.array(Participante),
    eventos: z.array(EventoVisto),
    personagens: z.array(Personagem),
  }),
  /* Só o mestre recebe estas duas: o que o jogador nunca pode ver vai numa mensagem à parte. */
  z.object({ t: z.literal("campanhas"), lista: z.array(ResumoCampanha), pacotes: z.array(PacoteDisponivel) }),
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
  /* O combate como este espectador pode ver: o jogador não recebe PV de criatura nem o baralho. */
  z.object({ t: z.literal("combate"), combate: EstadoCombate.nullable() }),
  z.object({ t: z.literal("erro"), codigo: CodigoErro, mensagem: z.string() }),
]);
export type MensagemServidor = z.infer<typeof MensagemServidor>;
