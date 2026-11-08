import { randomUUID } from "node:crypto";
import { ID_VENDA_AO_MERCADOR, type Conteudo } from "@odm/conteudo";
import { DadosLoja, type CadastroDe, type EfeitoDeServico, type MensagemClienteLida, type Operacao } from "@odm/protocolo";
import { precoEmReais, valorDeVenda } from "@odm/regras";
import type { PersonagemBanco } from "../banco/repositorio";
import type { Espectador } from "./visibilidade";

/* Compra, venda e serviço nas lojas da campanha (fase 6, etapa 10; Mestre, "Disposição do comércio").
   C3 (07/11/2026): sai na hora; só o mestre desfaz, pelo registro, e o estoque e o caixa voltam juntos. */

type Recusa = { recusado: string };
const recusa = (recusado: string): Recusa => ({ recusado });

type Loja = CadastroDe<"loja">;
type Transacao = Extract<Operacao, { op: "transacao" }>;

type Host = {
  conteudo: () => Conteudo | null;
  loja: (id: string) => Loja | undefined;
  salvarLoja: (loja: Loja) => void;
  personagem: (id: string) => PersonagemBanco | undefined;
  operar: (personagemId: string, op: Operacao, quem: Espectador) => Recusa | void;
  /* Serviço com efeito: a Exaustão entra no preço, o efeito roda na vida do personagem depois do pagamento. */
  servico?: {
    exaustao: (personagemId: string) => number;
    pode: (personagemId: string) => Recusa | void;
    aplicar: (personagemId: string, efeito: EfeitoDeServico, rotulo: string, quem: Espectador) => Recusa | void;
  };
};

export type MensagemDeLoja = Extract<MensagemClienteLida, { t: "loja_comprar" | "loja_vender" | "loja_servico" }>;

const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;

/* Preço do serviço com o extra por nível de Exaustão do personagem. */
export const precoDoServico = (preco: number, efeito: EfeitoDeServico | null, exaustao: number) => preco + (efeito?.extraPorExaustao ?? 0) * exaustao;

export class Lojas {
  constructor(private readonly host: Host) {}

  receber(m: MensagemDeLoja, quem: Espectador): Recusa | void {
    const loja = this.host.loja(m.lojaId);
    if (!loja) return recusa("Essa loja não existe mais.");
    if (!loja.dados.aberta && quem.papel !== "mestre") return recusa("Essa loja está fechada.");
    const p = this.host.personagem(m.personagemId);
    if (!p || p.situacao !== "ativo") return recusa("Escolha um personagem pronto.");
    if (quem.papel !== "mestre" && p.participanteId !== quem.id) return recusa("Este personagem não é seu.");
    const servico = m.t === "loja_servico" ? loja.dados.servicos.find((x) => x.id === m.servicoId) : undefined;
    if (servico?.efeito) {
      const pode = this.host.servico?.pode(p.id);
      if (pode) return pode;
    }
    const op = m.t === "loja_comprar" ? this.compra(loja, m.linhaId, m.quantidade) : m.t === "loja_vender" ? this.venda(loja, p, m.itemFichaId, m.quantidade) : this.servico(loja, m.servicoId, p.id);
    if ("recusado" in op) return op;
    /* Quem pediu fica como autor; o servidor monta a operação, que o jogador não pode mandar sozinho. */
    const pago = this.host.operar(p.id, op, { ...quem, papel: "mestre" });
    if (pago || !servico?.efeito) return pago;
    return this.host.servico?.aplicar(p.id, servico.efeito, servico.nome, { ...quem, papel: "mestre" });
  }

  private compra(loja: Loja, linhaId: string, quantidade: number): Transacao | Recusa {
    const linha = loja.dados.itens.find((l) => l.id === linhaId);
    if (!linha) return recusa("Esse item saiu da loja.");
    if (linha.preco === null) return recusa(`${linha.nome} está sem preço: combine com o mestre.`);
    if (linha.quantidade !== null && linha.quantidade < quantidade) return recusa(`Só há ${linha.quantidade} de ${linha.nome}.`);
    const total = linha.preco * quantidade;
    return {
      op: "transacao",
      rotulo: `Comprou ${quantidade} × ${linha.nome} em ${loja.dados.nome} por ${reais(total)}`,
      dinheiro: -total,
      entra: [{ id: randomUUID(), itemId: linha.itemId, nome: linha.nome, quantidade, equipado: false, pesoKg: null }],
      sai: [],
      loja: { lojaId: loja.id, caixa: loja.dados.caixa === null ? 0 : total, estoque: linha.quantidade === null ? [] : [{ linhaId: linha.id, delta: -quantidade }] },
    };
  }

  private venda(loja: Loja, p: PersonagemBanco, itemFichaId: string, quantidade: number): Transacao | Recusa {
    if (loja.dados.compraSoForaDoComum) return recusa(`${loja.dados.nome} só compra coisas fora do comum: combine com o mestre.`);
    const item = p.ficha.inventario.find((i) => i.id === itemFichaId);
    if (!item) return recusa("Esse item não está no inventário.");
    if (item.quantidade < quantidade) return recusa(`Só há ${item.quantidade} de ${item.nome}.`);
    const conteudo = this.host.conteudo();
    const doCatalogo = item.itemId ? [...(conteudo?.itens ?? []), ...(conteudo?.municoes ?? [])].find((i) => i.id === item.itemId) : undefined;
    const regra = conteudo?.regras.find((r) => r.id === ID_VENDA_AO_MERCADOR);
    const total = valorDeVenda(precoEmReais(doCatalogo?.preco), regra, quantidade);
    if (total === null) return recusa(regra?.mecanica ? `${item.nome} não tem preço no catálogo: combine com o mestre.` : "A regra de venda ainda não foi revisada no pacote: combine com o mestre.");
    if (loja.dados.caixa !== null && loja.dados.caixa < total) return recusa(`${loja.dados.nome} só tem ${reais(loja.dados.caixa)} em caixa.`);
    const linha = item.itemId ? loja.dados.itens.find((l) => l.itemId === item.itemId && l.quantidade !== null) : undefined;
    return {
      op: "transacao",
      rotulo: `Vendeu ${quantidade} × ${item.nome} para ${loja.dados.nome} por ${reais(total)}`,
      dinheiro: total,
      entra: [],
      sai: [{ ...item, quantidade }],
      loja: { lojaId: loja.id, caixa: loja.dados.caixa === null ? 0 : -total, estoque: linha ? [{ linhaId: linha.id, delta: quantidade }] : [] },
    };
  }

  private servico(loja: Loja, servicoId: string, personagemId: string): Transacao | Recusa {
    const s = loja.dados.servicos.find((x) => x.id === servicoId);
    if (!s) return recusa("Esse serviço saiu da loja.");
    const total = precoDoServico(s.preco, s.efeito, this.host.servico?.exaustao(personagemId) ?? 0);
    return {
      op: "transacao",
      rotulo: `Pagou ${s.nome} em ${loja.dados.nome} (${reais(total)})`,
      dinheiro: -total,
      entra: [],
      sai: [],
      loja: { lojaId: loja.id, caixa: loja.dados.caixa === null ? 0 : total, estoque: [] },
    };
  }

  /* Chamado pela ficha ao aplicar ou desfazer uma transação: estoque e caixa andam junto. */
  ajustar(ajuste: NonNullable<Transacao["loja"]>) {
    const loja = this.host.loja(ajuste.lojaId);
    if (!loja) return;
    const itens = loja.dados.itens.map((l) => {
      const d = ajuste.estoque.find((x) => x.linhaId === l.id);
      return d && l.quantidade !== null ? { ...l, quantidade: Math.max(0, l.quantidade + d.delta) } : l;
    });
    const caixa = loja.dados.caixa === null ? null : Math.max(0, loja.dados.caixa + ajuste.caixa);
    this.host.salvarLoja({ ...loja, dados: DadosLoja.parse({ ...loja.dados, itens, caixa }) });
  }
}
