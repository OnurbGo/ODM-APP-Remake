import { ETAPAS_MISSAO, type Cadastro, type CadastroDe, type DadosMissao } from "@odm/protocolo";

/* O que o jogador recebe dos cadastros do mestre (fase 6). Nada do que é só do mestre sai daqui:
   encontros, pistas, notas, ligações, etapas e objetivos ocultos, marcos ocultos ou que ainda não aconteceram. */

const missaoParaJogador = (m: DadosMissao): DadosMissao => {
  const etapas = Object.fromEntries(
    ETAPAS_MISSAO.map((id) => {
      const e = m.etapas[id];
      return [id, e.visivel ? { jogadores: e.jogadores, mestre: "", visivel: true } : { jogadores: "", mestre: "", visivel: false }];
    }),
  ) as DadosMissao["etapas"];
  return {
    ...m,
    etapas,
    objetivos: m.objetivos.filter((o) => o.visivel),
    criaturas: [],
    npcs: [],
    /* A recompensa aparece com o Desfecho visível. */
    recompensas: m.etapas.desfecho.visivel ? m.recompensas : { texto: "", itens: [] },
    notas: "",
  };
};

export function cadastrosParaJogador(todos: readonly Cadastro[]): Cadastro[] {
  const missoes = todos.filter((c): c is CadastroDe<"missao"> => c.tipo === "missao" && c.dados.visivel && c.dados.situacao !== "rascunho");
  const visiveis = new Set(missoes.map((m) => m.id));
  const saida: Cadastro[] = missoes.map((m) => ({ ...m, dados: missaoParaJogador(m.dados) }));
  /* NPC visível: nome, cidade, afiliação, resumo e imagem. Objetivo, segredo, traço, notas e ficha ficam. */
  for (const c of todos) {
    if (c.tipo !== "npc" || !c.dados.visivel) continue;
    const { nome, cidade, afiliacao, resumo, imagem } = c.dados;
    saida.push({ ...c, dados: { nome, cidade, afiliacao, resumo, imagem, visivel: true, objetivo: "", segredo: "", traco: "", notas: "", ref: null } });
  }
  /* Diário visível: a entrada inteira. Nota do mestre nunca sai. */
  for (const c of todos) if (c.tipo === "diario" && c.dados.visivel) saida.push(c);
  /* Loja aberta: o jogador vê estoque, preços e caixa; as notas do mestre ficam. */
  for (const c of todos) if (c.tipo === "loja" && c.dados.aberta) saida.push({ ...c, dados: { ...c.dados, notas: "" } });
  for (const c of todos) {
    if (c.tipo !== "marco" || !c.dados.visivel || !c.dados.aconteceu) continue;
    saida.push({ ...c, dados: { ...c.dados, missaoId: c.dados.missaoId && visiveis.has(c.dados.missaoId) ? c.dados.missaoId : null } });
  }
  return saida;
}
