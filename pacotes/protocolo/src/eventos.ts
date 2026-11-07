import { z } from "zod";
import { Mudanca, RolagemDeCombate } from "./combate";
import { Operacao } from "./ficha";
import { DadosResultadoTeste, PedidoTeste, PedidoTesteVisto } from "./testes";

export const ModificadorVisto = z.object({ rotulo: z.string(), valor: z.number().int() });

const DadosRolagem = z.object({
  rotulo: z.string(),
  natural: z.number().int().min(1).max(20),
  modificadores: z.array(ModificadorVisto),
  total: z.number().int(),
});

const DadosParticipante = z.object({ participanteId: z.string(), nome: z.string() });

const DadosPvCriatura = z.object({
  criaturaId: z.string(),
  nome: z.string(),
  atual: z.number().int(),
  maximo: z.number().int(),
});

const DadosFichaAlterada = z.object({
  personagemId: z.string(),
  personagemNome: z.string(),
  /* Quem controlava o personagem na hora: só ele e o mestre veem a linha. */
  donoId: z.string().nullable(),
  rotulo: z.string(),
  inversa: Operacao,
  subiuPara: z.number().int().nullable(),
});

const DadosFichaDesfeita = z.object({
  eventoId: z.string(),
  personagemId: z.string(),
  personagemNome: z.string(),
  donoId: z.string().nullable(),
  rotulo: z.string(),
});

const DadosPersonagemLigado = z.object({
  personagemId: z.string(),
  personagemNome: z.string(),
  participanteId: z.string().nullable(),
  participanteNome: z.string().nullable(),
  antigoDonoId: z.string().nullable(),
});

/* Até quando o jogador desfaz o que fez (especificação 5.2): até o fim do turno dele. Nulo fora de combate. */
const DesfazivelAte = z.object({ rodada: z.number().int().min(0), combatenteId: z.string(), noTurnoDele: z.boolean() }).nullable();

const DadosCombate = z.object({
  rotulo: z.string(),
  /* Com o que só o mestre vê, como o PV de criatura. */
  rotuloMestre: z.string().nullable(),
  inversas: z.array(Mudanca),
  desfazivelAte: DesfazivelAte,
  personagens: z.array(z.string()),
  /* Ataque: a rolagem inteira para o mestre e a do jogador, já sem a Defesa da criatura. */
  rolagem: RolagemDeCombate.nullable().default(null),
  rolagemJogador: RolagemDeCombate.nullable().default(null),
});

const DadosCombateVisto = z.object({ rotulo: z.string(), desfazivelAte: DesfazivelAte, rolagem: RolagemDeCombate.nullable().default(null) });

/* Rolagem do mestre por fórmula, para o que não tem mecânica aprovada. Oculta fica só com ele. */
const DadosRolagemLivre = z.object({ rotulo: z.string(), formula: z.string(), dados: z.array(z.number().int()), total: z.number().int(), oculta: z.boolean() });

const DadosCombateDesfeito = z.object({ eventoId: z.string(), rotulo: z.string() });

/* O oponente do contestado rola uma vez para todos (decisão de 06/11/2026) e fica guardado no pedido. */
const RolagemDoOponente = z.object({ dados: z.array(z.number().int()), natural: z.number().int(), total: z.number().int() });
/* "donos": quem controlava cada personagem no pedido. A projeção usa isso, e não o dono de agora,
   para o registro de cada um sair igual toda vez que for refeito. */
const DadosPedido = z.object({
  pedido: PedidoTeste,
  oponente: RolagemDoOponente.nullable().default(null),
  donos: z.record(z.string(), z.string().nullable()).default({}),
  /* "Resistência de Fibra", já com o nome da perícia, para o registro. */
  rotulo: z.string().default(""),
});

const Comum = {
  id: z.string(),
  autorId: z.string().nullable(),
  autorNome: z.string().nullable(),
  criadoEm: z.string(),
};

/* Evento como fica no banco, com tudo. Nunca sai do servidor sem passar pela projeção. */
export const EventoCompleto = z.discriminatedUnion("tipo", [
  z.object({ ...Comum, tipo: z.literal("rolagem"), dados: DadosRolagem }),
  z.object({ ...Comum, tipo: z.literal("participante_entrou"), dados: DadosParticipante }),
  z.object({ ...Comum, tipo: z.literal("participante_revogado"), dados: DadosParticipante }),
  z.object({ ...Comum, tipo: z.literal("teste_pedido"), dados: DadosPedido }),
  z.object({ ...Comum, tipo: z.literal("teste_resultado"), dados: DadosResultadoTeste }),
  z.object({ ...Comum, tipo: z.literal("pv_criatura"), dados: DadosPvCriatura }),
  z.object({ ...Comum, tipo: z.literal("ficha_alterada"), dados: DadosFichaAlterada }),
  z.object({ ...Comum, tipo: z.literal("ficha_desfeita"), dados: DadosFichaDesfeita }),
  z.object({ ...Comum, tipo: z.literal("personagem_ligado"), dados: DadosPersonagemLigado }),
  z.object({ ...Comum, tipo: z.literal("combate"), dados: DadosCombate }),
  z.object({ ...Comum, tipo: z.literal("combate_desfeito"), dados: DadosCombateDesfeito }),
  z.object({ ...Comum, tipo: z.literal("rolagem_livre"), dados: DadosRolagemLivre }),
]);
export type EventoCompleto = z.infer<typeof EventoCompleto>;

/* "n" é a posição do evento no registro de quem recebe, sem lacunas. Um número global
   mostraria o buraco de cada evento oculto, entregando que há algo escondido. */
const Visto = { ...Comum, n: z.number().int().min(1) };

export const EventoVisto = z.discriminatedUnion("tipo", [
  z.object({ ...Visto, tipo: z.literal("rolagem"), dados: DadosRolagem }),
  z.object({ ...Visto, tipo: z.literal("participante_entrou"), dados: DadosParticipante }),
  z.object({ ...Visto, tipo: z.literal("participante_revogado"), dados: DadosParticipante }),
  z.object({ ...Visto, tipo: z.literal("teste_pedido_visto"), dados: z.object({ pedido: PedidoTesteVisto }) }),
  /* Só o mestre recebe estes dois. */
  z.object({ ...Visto, tipo: z.literal("teste_pedido"), dados: DadosPedido }),
  /* Mestre: o resultado inteiro. Jogador: sem DT oculta nem o total oculto do oponente; passivo, nunca. */
  z.object({ ...Visto, tipo: z.literal("teste_resultado"), dados: DadosResultadoTeste }),
  z.object({ ...Visto, tipo: z.literal("pv_criatura"), dados: DadosPvCriatura }),
  /* Só o mestre e quem controla o personagem recebem estes. */
  z.object({ ...Visto, tipo: z.literal("ficha_alterada"), dados: DadosFichaAlterada }),
  z.object({ ...Visto, tipo: z.literal("ficha_desfeita"), dados: DadosFichaDesfeita }),
  z.object({ ...Visto, tipo: z.literal("personagem_ligado"), dados: DadosPersonagemLigado }),
  /* O mestre recebe o evento inteiro, com as inversas; o jogador, só o texto. */
  z.object({ ...Visto, tipo: z.literal("combate"), dados: DadosCombate }),
  z.object({ ...Visto, tipo: z.literal("combate_visto"), dados: DadosCombateVisto }),
  z.object({ ...Visto, tipo: z.literal("combate_desfeito"), dados: DadosCombateDesfeito }),
  z.object({ ...Visto, tipo: z.literal("rolagem_livre"), dados: DadosRolagemLivre }),
]);
export type EventoVisto = z.infer<typeof EventoVisto>;

/* Antes de receber a posição "n" de quem vai ler. */
export type EventoProjetado = EventoVisto extends infer E ? (E extends { n: number } ? Omit<E, "n"> : never) : never;
