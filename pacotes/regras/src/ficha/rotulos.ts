import type { CompraPrestigio, Operacao } from "@odm/protocolo";
import type { ContextoFicha } from "./contexto";

const comSinal = (n: number) => (n > 0 ? `+${n}` : String(n));

function rotuloDaCompra(compra: CompraPrestigio, ctx: ContextoFicha) {
  switch (compra.tipo) {
    case "tecnica_avancada":
      return `Técnica Avançada: ${ctx.habilidades.get(compra.habilidadeId)?.nome ?? compra.habilidadeId}`;
    case "tecnica_lendaria":
      return `Técnica Lendária: ${ctx.habilidades.get(compra.habilidadeId)?.nome ?? compra.habilidadeId}`;
    case "talento":
      return `Talento: ${ctx.talentos.get(compra.talentoId)?.nome ?? compra.talentoId}`;
    case "proficiencia":
      return `Proficiência: ${ctx.pericias.get(compra.valor)?.exibir ?? compra.valor}`;
    case "vitalidade_aprimorada":
      return "Vitalidade Aprimorada";
  }
}

/* A linha do registro da sessão. */
export function rotuloDaOperacao(op: Operacao, ctx: ContextoFicha): string {
  switch (op.op) {
    case "xp":
      return `XP ${comSinal(op.delta)}`;
    case "prestigio":
      return `Pontos de Prestígio ${comSinal(op.delta)}`;
    case "honra":
      return `Honra ${comSinal(op.delta)}`;
    case "dinheiro":
      return `Dinheiro ${comSinal(op.delta)}`;
    case "comprar":
      return rotuloDaCompra(op.compra, ctx);
    case "devolver_compra":
      return `Devolveu ${rotuloDaCompra(op.compra, ctx)}`;
    case "especializacao":
      return op.id ? `Especialização: ${ctx.especializacoes.get(op.id)?.nome ?? op.id}` : "Tirou a especialização";
    case "talento_de_nivel":
      return op.escolha ? `Talento: ${ctx.talentos.get(op.escolha.talentoId)?.nome ?? op.escolha.talentoId}` : "Tirou o talento";
    case "escolhas_de_nivel":
      return `Escolheu: ${op.ids.map((id) => ctx.habilidades.get(id)?.nome ?? id).join(", ")}`;
    case "dar_item":
      return `Recebeu ${op.item.nome}`;
    case "tirar_item":
      return `Perdeu ${op.item.nome}`;
    case "equipar":
      return op.equipado ? "Equipou um item" : "Guardou um item";
    case "dar_habilidade":
      return `Recebeu ${ctx.habilidades.get(op.id)?.nome ?? op.id}`;
    case "tirar_habilidade":
      return `Perdeu ${ctx.habilidades.get(op.id)?.nome ?? op.id}`;
    case "ajuste":
      return op.ajuste ? `Ajuste manual em ${op.campo}` : `Tirou o ajuste de ${op.campo}`;
    case "passo_redencao":
      return `Redenção: passo ${op.indice + 1} ${op.feito ? "marcado" : "desmarcado"}`;
    case "notas":
      return "Notas";
  }
}
