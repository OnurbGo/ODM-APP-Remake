import type { DadosRolagem } from "@odm/estilo";
import type { DadosResultadoTeste, EventoVisto, ModoRolagem, PedidoTesteVisto, RolagemDeCombate } from "@odm/protocolo";

/* Peças leves dos testes (especificação 8), sem o motor de regras: entram no pacote inicial do jogador
   porque o registro e a animação da rolagem precisam delas. */

export type EventoResultado = Extract<EventoVisto, { tipo: "teste_resultado" }>;
export type EventoPedidoMestre = Extract<EventoVisto, { tipo: "teste_pedido" }>;
export type EventoPedidoVisto = Extract<EventoVisto, { tipo: "teste_pedido_visto" }>;

export const MODOS: { id: ModoRolagem; rotulo: string }[] = [
  { id: "normal", rotulo: "Normal" },
  { id: "vantagem", rotulo: "Vantagem" },
  { id: "desvantagem", rotulo: "Desvantagem" },
];

export const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export const resultadosDe = (eventos: readonly EventoVisto[]) => eventos.filter((e): e is EventoResultado => e.tipo === "teste_resultado");

/* O que vale agora para um personagem num pedido: o último resultado dele. */
export function ultimoDoPedido(resultados: readonly EventoResultado[], pedidoId: string, personagemId: string) {
  let ultimo: EventoResultado | undefined;
  for (const r of resultados) if (r.dados.pedidoId === pedidoId && r.dados.personagemId === personagemId) ultimo = r;
  return ultimo;
}

/* Resultado que nenhum outro substituiu (Forçar, Rolar de novo, decisão do mestre). */
export function eUltimo(resultados: readonly EventoResultado[], r: EventoResultado) {
  return !resultados.some((x) => x.dados.anteriorId === r.id) && (!r.dados.pedidoId || ultimoDoPedido(resultados, r.dados.pedidoId, r.dados.personagemId)?.id === r.id);
}

export type Pendente = { pedido: PedidoTesteVisto; personagemId: string; dt: number | null; bonus: number; modo: ModoRolagem };

/* Pedidos que esperam resposta deste aparelho: um por personagem dele, o mais antigo primeiro. */
export function pendentesDoJogador(eventos: readonly EventoVisto[], meus: ReadonlySet<string>): Pendente[] {
  const resultados = resultadosDe(eventos);
  const lista: Pendente[] = [];
  for (const e of eventos) {
    if (e.tipo !== "teste_pedido_visto") continue;
    for (const p of e.dados.pedido.personagens) {
      if (!meus.has(p.personagemId) || ultimoDoPedido(resultados, e.dados.pedido.id, p.personagemId)) continue;
      lista.push({ pedido: e.dados.pedido, personagemId: p.personagemId, dt: p.dt, bonus: p.bonus, modo: p.modo });
    }
  }
  return lista;
}

const OPCAO: Record<DadosResultadoTeste["opcao"], string | null> = {
  rolar: null,
  fazer_com_calma: "Fazer com Calma",
  tentar_ate_conseguir: "Tentar até Conseguir",
};

/* "14 contra DT 13", "14 contra DT ?", "14 contra 12 (Vigia)". */
export function contaDoResultado(d: DadosResultadoTeste) {
  if (d.estado === "recusado") return "Recusou a rolagem";
  if (d.estado === "cancelado") return "Teste cancelado";
  if (d.estado === "decidido") return "Decidido pelo mestre";
  if (d.falhaAutomatica) return `Falha automática (${d.falhaAutomatica})`;
  const total = d.total ?? "?";
  if (d.tipo === "contestado") return `${total} contra ${d.oponente?.nome ?? "Oponente"} ${d.oponente?.total ?? "?"}`;
  if (d.dt !== null) return `${total} contra DT ${d.dt}`;
  return d.pedidoId ? `${total} contra DT ?` : `${total}`;
}

export const textoDoSucesso = (d: DadosResultadoTeste) => (d.sucesso === null ? null : d.sucesso ? "Sucesso" : "Falha");

/* Ataque: a rolagem chega pronta do servidor, já sem o que o jogador não vê. */
export function rolagemDeCombate(id: string, r: RolagemDeCombate): DadosRolagem {
  const natural = r.natural;
  return {
    id,
    titulo: r.titulo,
    ...(r.subtitulo ? { subtitulo: r.subtitulo } : {}),
    dados: r.dados,
    escolhido: r.escolhido,
    notaDados: r.dados.length > 1 ? (r.dados[r.escolhido] === Math.max(...r.dados) ? "Vantagem: vale o maior" : "Desvantagem: vale o menor") : undefined,
    cartas: r.cartas,
    modificadores: r.modificadores,
    total: r.total,
    ...(r.alvo ? { alvo: r.alvo } : {}),
    ...(r.resultado ? { resultado: r.resultado } : {}),
    destaqueNatural: natural === 20 ? "alto" : natural === 1 ? "baixo" : undefined,
    notaNatural: natural === 20 ? "20 natural" : natural === 1 ? "Falha crítica" : undefined,
    ...(r.notaFinal ? { notaFinal: r.notaFinal } : {}),
  };
}

/* A animação mostra o que o servidor rolou: nada é recalculado aqui. */
export function paraRolagem(e: EventoResultado): DadosRolagem {
  const d = e.dados;
  const natural = d.natural;
  const alvo =
    d.tipo === "contestado"
      ? { rotulo: d.oponente?.visivel ? (d.oponente.nome ?? "Oponente") : "Oponente", valor: d.oponente?.total ?? null }
      : d.pedidoId
        ? { rotulo: "DT", valor: d.dt }
        : undefined;
  const sucesso = textoDoSucesso(d);
  const notas = [
    OPCAO[d.opcao] && `${OPCAO[d.opcao]}: o d20 vale ${natural}`,
    d.habilidades.length ? `Usou ${d.habilidades.join(", ")}` : null,
    d.cartaDoDestino ? "Carta do Destino: crítico garantido" : null,
    d.consequencia ? "Rolagem forçada: o mestre aplica uma consequência" : null,
    d.falhaAutomatica ? `Falha automática por ${d.falhaAutomatica}` : null,
  ].filter(Boolean);
  return {
    id: e.id,
    titulo: d.rotulo,
    subtitulo: d.personagemNome,
    dados: d.falhaAutomatica ? [] : d.dados.length ? d.dados : natural !== null ? [natural] : [],
    escolhido: d.escolhido,
    notaDados: d.dados.length > 1 ? (d.dados[d.escolhido] === Math.max(...d.dados) ? "Vantagem: vale o maior" : "Desvantagem: vale o menor") : undefined,
    cartas: d.cartas.map((c) => ({ valor: c.valor, naipe: c.naipe, valeu: c.valeu })),
    modificadores: d.modificadores,
    total: d.total ?? 0,
    alvo,
    resultado: sucesso ? { texto: sucesso, bom: d.sucesso === true } : undefined,
    destaqueNatural: natural === 20 ? "alto" : natural === 1 ? "baixo" : undefined,
    notaNatural: d.opcao !== "rolar" ? undefined : natural === 20 ? "20 natural" : natural === 1 ? "1 natural" : undefined,
    notaFinal: notas.length ? notas.join(" · ") : undefined,
  };
}
