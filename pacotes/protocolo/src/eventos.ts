import { z } from "zod";
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
]);
export type EventoVisto = z.infer<typeof EventoVisto>;

/* Antes de receber a posição "n" de quem vai ler. */
export type EventoProjetado = EventoVisto extends infer E ? (E extends { n: number } ? Omit<E, "n"> : never) : never;
