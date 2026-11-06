import { z } from "zod";
import { Operacao } from "./ficha";
import { PedidoTeste, PedidoTesteVisto } from "./testes";

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
  z.object({ ...Comum, tipo: z.literal("teste_pedido"), dados: z.object({ pedido: PedidoTeste }) }),
  z.object({ ...Comum, tipo: z.literal("pv_criatura"), dados: DadosPvCriatura }),
  z.object({ ...Comum, tipo: z.literal("ficha_alterada"), dados: DadosFichaAlterada }),
  z.object({ ...Comum, tipo: z.literal("ficha_desfeita"), dados: DadosFichaDesfeita }),
  z.object({ ...Comum, tipo: z.literal("personagem_ligado"), dados: DadosPersonagemLigado }),
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
  z.object({ ...Visto, tipo: z.literal("teste_pedido"), dados: z.object({ pedido: PedidoTeste }) }),
  z.object({ ...Visto, tipo: z.literal("pv_criatura"), dados: DadosPvCriatura }),
  /* Só o mestre e quem controla o personagem recebem estes. */
  z.object({ ...Visto, tipo: z.literal("ficha_alterada"), dados: DadosFichaAlterada }),
  z.object({ ...Visto, tipo: z.literal("ficha_desfeita"), dados: DadosFichaDesfeita }),
  z.object({ ...Visto, tipo: z.literal("personagem_ligado"), dados: DadosPersonagemLigado }),
]);
export type EventoVisto = z.infer<typeof EventoVisto>;

/* Antes de receber a posição "n" de quem vai ler. */
export type EventoProjetado = EventoVisto extends infer E ? (E extends { n: number } ? Omit<E, "n"> : never) : never;
