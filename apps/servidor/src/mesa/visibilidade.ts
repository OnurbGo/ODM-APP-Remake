import type { DadosResultadoTeste, EventoCompleto, EventoProjetado, Papel, PedidoTeste, PedidoTesteVisto } from "@odm/protocolo";

export type Espectador = { id: string; papel: Papel };

function pedidoParaJogador(pedido: PedidoTeste, donos: Record<string, string | null>, rotulo: string, jogadorId: string): PedidoTesteVisto | null {
  /* O livro usa o passivo para não entregar que há algo escondido: nada sai. */
  if (pedido.tipo === "passivo") return null;
  const meus = pedido.personagens.filter((p) => donos[p.personagemId] === jogadorId);
  if (!meus.length) return null;
  const dtDe = (dt: number | undefined, base: number, visivel: boolean) => (visivel ? (dt ?? base) : null);
  const personagens = meus.map((p) => ({
    personagemId: p.personagemId,
    bonus: p.bonus,
    modo: p.modo,
    dt: pedido.tipo === "contestado" ? null : dtDe(p.dt, pedido.dt, pedido.dtVisivel),
  }));
  const comum = { id: pedido.id, rotulo, ...(pedido.origem ? { origem: pedido.origem } : {}), personagens };
  switch (pedido.tipo) {
    case "habilidade":
      return { ...comum, tipo: "habilidade", teste: pedido.teste };
    case "resistencia":
      return { ...comum, tipo: "resistencia", teste: { alvo: "atributo", atributo: pedido.atributo } };
    case "contestado":
      return { ...comum, tipo: "contestado", teste: pedido.teste, ...(pedido.oponenteVisivel ? { oponenteNome: pedido.oponente.nome } : {}) };
  }
}

/* O resultado vai para todos (o registro é de todos, seção 5.2), sem o que o mestre deixou oculto. */
function resultadoParaJogador(dados: DadosResultadoTeste): DadosResultadoTeste | null {
  if (dados.tipo === "passivo") return null;
  return {
    ...dados,
    dt: dados.dtVisivel ? dados.dt : null,
    /* Oponente oculto: nem o nome, nem a rolagem. */
    oponente: dados.oponente && !dados.oponente.visivel ? { nome: "Oponente", total: null, dados: [], visivel: false } : dados.oponente,
  };
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
    case "combate":
      if (quem.papel === "mestre") return evento;
      return { ...comum, tipo: "combate_visto", dados: { rotulo: evento.dados.rotulo, desfazivelAte: evento.dados.desfazivelAte, rolagem: evento.dados.rolagemJogador } };
    case "rolagem_livre":
      return quem.papel === "mestre" || !evento.dados.oculta ? evento : null;
    case "combate_desfeito":
      return evento;
    case "teste_pedido": {
      if (quem.papel === "mestre") return evento;
      const pedido = pedidoParaJogador(evento.dados.pedido, evento.dados.donos, evento.dados.rotulo, quem.id);
      return pedido ? { ...comum, tipo: "teste_pedido_visto", dados: { pedido } } : null;
    }
    case "teste_resultado": {
      if (quem.papel === "mestre") return evento;
      const dados = resultadoParaJogador(evento.dados);
      return dados ? { ...comum, tipo: "teste_resultado", dados } : null;
    }
    default: {
      /* Tipo novo sem regra aqui não compila; se chegar assim mesmo, não sai. */
      const naoTratado: never = evento;
      void naoTratado;
      return null;
    }
  }
}
