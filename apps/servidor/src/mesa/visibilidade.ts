import type { EventoCompleto, EventoProjetado, Papel, PedidoTeste, PedidoTesteVisto } from "@odm/protocolo";

export type Espectador = { id: string; papel: Papel };

function pedidoParaJogador(pedido: PedidoTeste, jogadorId: string): PedidoTesteVisto | null {
  /* O livro usa o passivo para não entregar que há algo escondido: nada sai. */
  if (pedido.tipo === "passivo") return null;
  const meu = pedido.jogadores.find((j) => j.jogadorId === jogadorId);
  if (!meu) return null;

  const comum = { id: pedido.id, origem: pedido.origem, bonus: meu.bonus, modo: meu.modo };
  switch (pedido.tipo) {
    case "habilidade":
      return { ...comum, tipo: "habilidade", teste: pedido.teste, dt: pedido.dtVisivel ? (meu.dt ?? pedido.dt) : null };
    case "resistencia":
      return {
        ...comum,
        tipo: "resistencia",
        teste: { alvo: "atributo", atributo: pedido.atributo },
        dt: pedido.dtVisivel ? (meu.dt ?? pedido.dt) : null,
      };
    case "contestado":
      return {
        ...comum,
        tipo: "contestado",
        teste: pedido.teste,
        dt: null,
        ...(pedido.oponenteVisivel ? { oponenteNome: pedido.oponente.nome } : {}),
      };
  }
}

/* Único caminho de um evento para fora do servidor. Devolve o que este espectador pode ver,
   ou null para nada. O jogador recebe uma cópia montada campo a campo, nunca o original. */
export function projetarEvento(evento: EventoCompleto, quem: Espectador): EventoProjetado | null {
  const comum = {
    id: evento.id,
    autorId: evento.autorId,
    autorNome: evento.autorNome,
    criadoEm: evento.criadoEm,
  };

  switch (evento.tipo) {
    case "rolagem":
    case "participante_entrou":
    case "participante_revogado":
      return evento;
    case "pv_criatura":
      return quem.papel === "mestre" ? evento : null;
    case "ficha_alterada":
    case "ficha_desfeita":
      return quem.papel === "mestre" || quem.id === evento.dados.donoId ? evento : null;
    case "personagem_ligado":
      return quem.papel === "mestre" || quem.id === evento.dados.participanteId || quem.id === evento.dados.antigoDonoId ? evento : null;
    case "teste_pedido": {
      if (quem.papel === "mestre") return evento;
      const pedido = pedidoParaJogador(evento.dados.pedido, quem.id);
      return pedido ? { ...comum, tipo: "teste_pedido_visto", dados: { pedido } } : null;
    }
    default: {
      /* Tipo novo sem regra aqui não compila; se chegar assim mesmo, não sai. */
      const naoTratado: never = evento;
      void naoTratado;
      return null;
    }
  }
}
