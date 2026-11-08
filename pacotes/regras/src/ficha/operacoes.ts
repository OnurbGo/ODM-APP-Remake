import type { AjusteManual, CompraPrestigio, FichaDados, ItemFicha, Operacao, TalentoDeNivel } from "@odm/protocolo";

/* Aplica uma operação e devolve a ficha nova com a operação que a desfaz. Tudo no registro passa por aqui,
   então desfazer uma compra antiga não apaga o que veio depois dela. */
export function aplicarOperacao(ficha: FichaDados, op: Operacao): { ficha: FichaDados; inversa: Operacao } {
  switch (op.op) {
    case "xp":
      return { ficha: { ...ficha, xp: Math.max(0, ficha.xp + op.delta) }, inversa: { op: "xp", delta: -op.delta } };
    case "prestigio":
      return { ficha: { ...ficha, prestigioDoMestre: ficha.prestigioDoMestre + op.delta }, inversa: { op: "prestigio", delta: -op.delta } };
    case "honra": {
      const honra = Math.min(20, Math.max(0, ficha.honra + op.delta));
      return { ficha: { ...ficha, honra }, inversa: { op: "honra", delta: ficha.honra - honra } };
    }
    case "dinheiro":
      return { ficha: { ...ficha, dinheiro: ficha.dinheiro + op.delta }, inversa: { op: "dinheiro", delta: -op.delta } };
    case "comprar":
      return { ficha: { ...ficha, compras: [...ficha.compras, op.compra] }, inversa: { op: "devolver_compra", compra: op.compra } };
    case "devolver_compra":
      return { ficha: { ...ficha, compras: ficha.compras.filter((c: CompraPrestigio) => c.id !== op.compra.id) }, inversa: { op: "comprar", compra: op.compra } };
    case "especializacao":
      return { ficha: { ...ficha, especializacaoId: op.id }, inversa: { op: "especializacao", id: ficha.especializacaoId } };
    case "talento_de_nivel": {
      const anterior = ficha.talentos.find((t) => t.nivel === op.nivel) ?? null;
      const resto = ficha.talentos.filter((t: TalentoDeNivel) => t.nivel !== op.nivel);
      return {
        ficha: { ...ficha, talentos: op.escolha ? [...resto, op.escolha] : resto },
        inversa: { op: "talento_de_nivel", nivel: op.nivel, escolha: anterior },
      };
    }
    case "escolhas_de_nivel": {
      const chave = String(op.nivel);
      const anterior = ficha.escolhasDeNivel[chave] ?? [];
      return {
        ficha: { ...ficha, escolhasDeNivel: { ...ficha.escolhasDeNivel, [chave]: op.ids } },
        inversa: { op: "escolhas_de_nivel", nivel: op.nivel, ids: anterior },
      };
    }
    case "dar_item":
      return { ficha: { ...ficha, inventario: [...ficha.inventario, op.item] }, inversa: { op: "tirar_item", item: op.item } };
    case "tirar_item":
      return { ficha: { ...ficha, inventario: ficha.inventario.filter((i: ItemFicha) => i.id !== op.item.id) }, inversa: { op: "dar_item", item: op.item } };
    case "equipar":
      return {
        ficha: { ...ficha, inventario: ficha.inventario.map((i) => (i.id === op.itemFichaId ? { ...i, equipado: op.equipado } : i)) },
        inversa: { op: "equipar", itemFichaId: op.itemFichaId, equipado: !op.equipado },
      };
    case "item_ajustar": {
      const anterior = ficha.inventario.find((i) => i.id === op.itemFichaId)?.[op.campo] ?? null;
      return {
        ficha: { ...ficha, inventario: ficha.inventario.map((i) => (i.id === op.itemFichaId ? { ...i, [op.campo]: op.valor } : i)) },
        inversa: { op: "item_ajustar", itemFichaId: op.itemFichaId, campo: op.campo, valor: anterior },
      };
    }
    case "dar_habilidade":
      return { ficha: { ...ficha, habilidadesDoMestre: [...ficha.habilidadesDoMestre, op.id] }, inversa: { op: "tirar_habilidade", id: op.id } };
    case "tirar_habilidade":
      return { ficha: { ...ficha, habilidadesDoMestre: ficha.habilidadesDoMestre.filter((id) => id !== op.id) }, inversa: { op: "dar_habilidade", id: op.id } };
    case "ajuste": {
      const anterior: AjusteManual | null = ficha.ajustes[op.campo] ?? null;
      const { [op.campo]: _fora, ...resto } = ficha.ajustes;
      return {
        ficha: { ...ficha, ajustes: op.ajuste ? { ...resto, [op.campo]: op.ajuste } : resto },
        inversa: { op: "ajuste", campo: op.campo, ajuste: anterior },
      };
    }
    case "passo_redencao": {
      const passos = ficha.redencao.passos.map((p, i) => (i === op.indice ? { ...p, feito: op.feito } : p));
      return {
        ficha: { ...ficha, redencao: { ...ficha.redencao, passos } },
        inversa: { op: "passo_redencao", indice: op.indice, feito: !op.feito },
      };
    }
    case "notas":
      return { ficha: { ...ficha, notas: op.texto }, inversa: { op: "notas", texto: ficha.notas } };
    case "retrato":
      return { ficha: { ...ficha, retrato: op.retrato }, inversa: { op: "retrato", retrato: ficha.retrato ?? null } };
    case "transacao": {
      /* Sai: tira a quantidade da pilha (ou a pilha toda). Entra: soma na pilha de mesmo id ou acrescenta. */
      let inventario = [...ficha.inventario];
      for (const s of op.sai) {
        const atual = inventario.find((i) => i.id === s.id);
        if (!atual) continue;
        inventario = atual.quantidade > s.quantidade ? inventario.map((i) => (i.id === s.id ? { ...i, quantidade: i.quantidade - s.quantidade } : i)) : inventario.filter((i) => i.id !== s.id);
      }
      for (const e of op.entra) {
        const atual = inventario.find((i) => i.id === e.id);
        inventario = atual ? inventario.map((i) => (i.id === e.id ? { ...i, quantidade: i.quantidade + e.quantidade } : i)) : [...inventario, e];
      }
      const loja = op.loja ? { ...op.loja, caixa: -op.loja.caixa, estoque: op.loja.estoque.map((x) => ({ ...x, delta: -x.delta })) } : null;
      return {
        ficha: { ...ficha, dinheiro: ficha.dinheiro + op.dinheiro, inventario },
        inversa: { op: "transacao", rotulo: op.rotulo, dinheiro: -op.dinheiro, entra: op.sai, sai: op.entra, loja },
      };
    }
  }
}

/* O que só o mestre pode fazer (especificação, 6.2.1). */
export function soDoMestre(op: Operacao) {
  return ["xp", "prestigio", "honra", "dar_item", "dar_habilidade", "tirar_habilidade", "transacao"].includes(op.op);
}
