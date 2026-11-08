import { randomUUID } from "node:crypto";
import { Conteudo, type PacoteConteudo } from "@odm/conteudo";
import {
  estadoVivoNovo,
  FichaRascunho,
  fichaVazia,
  type EventoCompleto,
  type FichaDados,
  type Kit,
  type MensagemClienteLida,
  type OpcoesCampanha,
  type Operacao,
  type Personagem,
} from "@odm/protocolo";
import {
  aplicarOperacao,
  comprar,
  dinheiroInicial,
  copiasDaFicha,
  criarContexto,
  errosDaCriacao,
  motivoDoTalentoDeNivel,
  motivoParaNaoDesfazer,
  nivelDoXp,
  recortarConteudoFicha,
  rotuloDaOperacao,
  soDoMestre,
  type Aleatorio,
  type ConteudoFicha,
  type ContextoFicha,
} from "@odm/regras";
import type { Campanha, Repositorio } from "../banco/repositorio";
import type { Espectador } from "./visibilidade";

/* A parte da mesa que cuida dos personagens: quem controla, o que pode mudar e como desfazer.
   O personagem é da campanha (especificação, 3.3); o dono é só quem o controla agora. */

type Hospedeiro = {
  campanha: () => Campanha | undefined;
  registrar: (evento: EventoCompleto) => void;
  novoEvento: <T extends Pick<EventoCompleto, "tipo" | "dados">>(quem: Espectador, corpo: T) => EventoCompleto;
  enviarPersonagem: (personagem: Personagem, antigoDono: string | null) => void;
  avisarRemocao: (personagemId: string, donoId: string | null) => void;
  avisarOpcoes: (opcoes: OpcoesCampanha) => void;
  avisarMestre: () => void;
  /* Compra e venda: o estoque e o caixa mudam junto com a ficha (e voltam juntos no desfazer). */
  ajustarLoja?: (loja: { lojaId: string; caixa: number; estoque: { linhaId: string; delta: number }[] }) => void;
  /* Personagem num combate aberto não pode ser arquivado. */
  emCombate?: (personagemId: string) => boolean;
};

export type Recusa = { recusado: string };
const recusa = (motivo: string): Recusa => ({ recusado: motivo });

type MensagemDeFicha = Extract<
  MensagemClienteLida,
  { t: "personagem_criar" | "personagem_salvar" | "personagem_concluir" | "personagem_apagar" | "personagem_arquivar" | "ficha_operar" | "ficha_desfazer" | "ligar_personagem" }
>;

const IDS_DE_CAMPO_DA_FICHA = new Set(Object.keys(FichaRascunho.shape));

export function juntarConteudo(pacotes: readonly PacoteConteudo[], ativos: readonly string[]): ConteudoFicha | null {
  const escolhidos = pacotes.filter((p) => ativos.includes(p.manifesto.id));
  if (!escolhidos.length) return null;
  const partes = escolhidos.map((p) => recortarConteudoFicha(p.conteudo));
  const juntar = <K extends keyof ConteudoFicha>(chave: K) => partes.flatMap((p) => p[chave] as unknown[]) as ConteudoFicha[K];
  return {
    origens: juntar("origens"),
    talentos: juntar("talentos"),
    classes: juntar("classes"),
    especializacoes: juntar("especializacoes"),
    habilidades: juntar("habilidades"),
    recursos: juntar("recursos"),
    pericias: juntar("pericias"),
    tabelas: juntar("tabelas"),
    regras: juntar("regras"),
    itens: juntar("itens"),
    efeitos: juntar("efeitos"),
    modificadores: juntar("modificadores"),
    municoes: juntar("municoes"),
  };
}

export class Personagens {
  constructor(
    private readonly repo: Repositorio,
    private readonly pacotes: readonly PacoteConteudo[],
    private readonly host: Hospedeiro,
    private readonly aleatorio: Aleatorio,
  ) {}

  conteudo(): ConteudoFicha | null {
    const campanha = this.host.campanha();
    return campanha ? juntarConteudo(this.pacotes, this.repo.pacotesDa(campanha)) : null;
  }

  /* Arte do pacote ativo (corpo ou rosto em WebP), já decodificada; o primeiro pacote que tiver o id vale. */
  private imagens = new Map<string, Buffer>();
  imagem(id: string, tipo: "corpo" | "rosto"): Buffer | null {
    const campanha = this.host.campanha();
    if (!campanha) return null;
    const ativos = this.repo.pacotesDa(campanha);
    const chave = `${ativos.join(",")}|${id}|${tipo}`;
    const pronta = this.imagens.get(chave);
    if (pronta) return pronta;
    const url = this.pacotes.filter((p) => ativos.includes(p.manifesto.id)).map((p) => p.imagens[id]?.[tipo]).find(Boolean);
    if (!url) return null;
    const dados = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
    this.imagens.set(chave, dados);
    return dados;
  }

  /* Tudo dos pacotes ativos, para o combate e para o mestre: criaturas e efeitos ficam aqui no servidor. */
  conteudoCompleto(): Conteudo | null {
    const campanha = this.host.campanha();
    if (!campanha) return null;
    const ativos = this.repo.pacotesDa(campanha);
    const escolhidos = this.pacotes.filter((p) => ativos.includes(p.manifesto.id));
    if (!escolhidos.length) return null;
    const junto: Record<string, unknown[]> = {};
    for (const p of escolhidos) for (const [chave, lista] of Object.entries(p.conteudo)) junto[chave] = [...(junto[chave] ?? []), ...lista];
    return Conteudo.parse(junto);
  }

  contexto(): ContextoFicha | null {
    const campanha = this.host.campanha();
    const conteudo = this.conteudo();
    if (!campanha || !conteudo) return null;
    const r = criarContexto(conteudo, this.repo.opcoesDa(campanha));
    return r.ok ? r.contexto : null;
  }

  visiveisPara(quem: Espectador): Personagem[] {
    const campanha = this.host.campanha();
    if (!campanha) return [];
    const todos = this.repo.personagensDa(campanha.id);
    return quem.papel === "mestre" ? todos : todos.filter((p) => p.participanteId === quem.id && p.situacao !== "arquivado");
  }

  private doMestreOuDono(id: string, quem: Espectador): Personagem | Recusa {
    const p = this.repo.personagem(id);
    if (!p || p.campanhaId !== this.host.campanha()?.id) return recusa("Personagem não encontrado.");
    if (quem.papel !== "mestre" && p.participanteId !== quem.id) return recusa("Este personagem não é seu.");
    return p;
  }

  /* Devolve a recusa, se houver, para a mesa mandar ao cliente. */
  receber(mensagem: MensagemDeFicha, quem: Espectador): Recusa | void {
    switch (mensagem.t) {
      case "personagem_criar":
        return this.criar(quem);
      case "personagem_salvar":
        return this.salvarRascunho(mensagem.personagemId, mensagem.ficha, quem);
      case "personagem_concluir":
        return this.concluir(mensagem.personagemId, quem);
      case "personagem_apagar":
        return this.apagar(mensagem.personagemId, quem);
      case "personagem_arquivar":
        return this.arquivar(mensagem.personagemId, mensagem.arquivado, quem);
      case "ficha_operar":
        return this.operar(mensagem.personagemId, mensagem.operacao, quem);
      case "ficha_desfazer":
        return this.desfazer(mensagem.eventoId, quem);
      case "ligar_personagem":
        return this.ligar(mensagem.personagemId, mensagem.participanteId, quem);
    }
  }

  private criar(quem: Espectador): Recusa | void {
    const campanha = this.host.campanha();
    if (!campanha) return recusa("Sem mesa aberta.");
    const novo: Personagem = {
      id: randomUUID(),
      participanteId: quem.papel === "mestre" ? null : quem.id,
      situacao: "rascunho",
      ficha: fichaVazia(),
      vivo: estadoVivoNovo(),
    };
    this.repo.criarPersonagem(campanha.id, novo, new Date().toISOString());
    this.host.enviarPersonagem(novo, null);
  }

  /* O rascunho só muda os campos da criação: XP, Honra e compras não passam por aqui. */
  private salvarRascunho(id: string, parcial: FichaRascunho, quem: Espectador): Recusa | void {
    const p = this.doMestreOuDono(id, quem);
    if ("recusado" in p) return p;
    if (p.situacao !== "rascunho") return recusa("Só o rascunho muda por aqui.");
    const limpo = Object.fromEntries(Object.entries(parcial).filter(([k]) => IDS_DE_CAMPO_DA_FICHA.has(k)));
    const ficha: FichaDados = { ...p.ficha, ...limpo };
    this.repo.salvarPersonagem(id, { ficha }, new Date().toISOString());
    this.host.enviarPersonagem({ ...p, ficha }, p.participanteId);
  }

  private concluir(id: string, quem: Espectador): Recusa | void {
    const p = this.doMestreOuDono(id, quem);
    if ("recusado" in p) return p;
    if (p.situacao !== "rascunho") return recusa("Este personagem já foi concluído.");
    const ctx = this.contexto();
    if (!ctx) return recusa("O conteúdo da campanha não está disponível.");
    const erros = errosDaCriacao(p.ficha, ctx);
    if (erros.length) return recusa(erros[0]!.mensagem);
    const ficha = { ...p.ficha, copias: copiasDaFicha(p.ficha, ctx), dinheiro: p.ficha.dinheiro + dinheiroInicial(p.ficha, ctx, this.aleatorio) };
    this.repo.salvarPersonagem(id, { ficha, situacao: "ativo" }, new Date().toISOString());
    this.host.enviarPersonagem({ ...p, ficha, situacao: "ativo" }, p.participanteId);
  }

  private apagar(id: string, quem: Espectador): Recusa | void {
    const p = this.doMestreOuDono(id, quem);
    if ("recusado" in p) return p;
    if (p.situacao !== "rascunho") return recusa("Só rascunho pode ser apagado.");
    this.repo.apagarPersonagem(id);
    this.host.avisarRemocao(id, p.participanteId);
  }

  /* Só o mestre arquiva e restaura; o personagem some da mesa e da tela do jogador, mas fica guardado. */
  private arquivar(id: string, arquivado: boolean, quem: Espectador): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre arquiva personagem.");
    const p = this.doMestreOuDono(id, quem);
    if ("recusado" in p) return p;
    if (p.situacao !== (arquivado ? "ativo" : "arquivado")) return recusa(arquivado ? "Só personagem pronto pode ser arquivado; rascunho se apaga." : "Este personagem não está arquivado.");
    if (arquivado && this.host.emCombate?.(id)) return recusa("Tire o personagem do combate antes de arquivar.");
    const situacao = arquivado ? "arquivado" : "ativo";
    this.repo.salvarPersonagem(id, { situacao }, new Date().toISOString());
    this.host.enviarPersonagem({ ...p, situacao }, null);
  }

  private validar(op: Operacao, ficha: FichaDados, ctx: ContextoFicha): string | null {
    switch (op.op) {
      case "comprar": {
        const r = comprar(ficha, op.compra, ctx);
        return r.ok ? null : r.motivo;
      }
      case "especializacao": {
        const classe = ficha.classeId ? ctx.classes.get(ficha.classeId) : undefined;
        const escolhida = op.id ? ctx.especializacoes.get(op.id) : undefined;
        if (op.id && escolhida?.classe !== classe?.nome) return "Especialização de outra classe.";
        return null;
      }
      case "talento_de_nivel":
        return op.escolha ? motivoDoTalentoDeNivel(ficha, op.escolha, ctx) : null;
      case "transacao": {
        if (ficha.dinheiro + op.dinheiro < 0) return `Dinheiro insuficiente: falta R$ ${(-(ficha.dinheiro + op.dinheiro)).toLocaleString("pt-BR")}.`;
        for (const s of op.sai) {
          const atual = ficha.inventario.find((i) => i.id === s.id);
          if (!atual || atual.quantidade < s.quantidade) return `${s.nome}: não há essa quantidade no inventário.`;
        }
        return null;
      }
      default:
        return null;
    }
  }

  /* Usado pelas ações de efeito que gastam item (Usar Trapos): vale como operação de quem agiu, com desfazer. */
  operarPeloSistema(id: string, op: Operacao, quem: Espectador): Recusa | void {
    return this.operar(id, op, quem);
  }

  private operar(id: string, op: Operacao, quem: Espectador): Recusa | void {
    const p = this.doMestreOuDono(id, quem);
    if ("recusado" in p) return p;
    if (p.situacao !== "ativo") return recusa("Conclua a criação antes.");
    if (quem.papel !== "mestre" && soDoMestre(op)) return recusa("Só o mestre faz isso.");
    const ctx = this.contexto();
    if (!ctx) return recusa("O conteúdo da campanha não está disponível.");
    const motivo = this.validar(op, p.ficha, ctx);
    if (motivo) return recusa(motivo);
    /* O id de compra e de item é do servidor: o desfazer depende dele. */
    const segura = comIdDoServidor(op);
    const { ficha, inversa } = aplicarOperacao(p.ficha, segura);
    if (segura.op === "transacao" && segura.loja) this.host.ajustarLoja?.(segura.loja);
    const antes = nivelDoXp(p.ficha.xp, ctx.regras);
    const depois = nivelDoXp(ficha.xp, ctx.regras);
    this.repo.salvarPersonagem(id, { ficha }, new Date().toISOString());
    this.host.registrar(
      this.host.novoEvento(quem, {
        tipo: "ficha_alterada",
        dados: {
          personagemId: id,
          personagemNome: ficha.nome,
          donoId: p.participanteId,
          rotulo: rotuloDaOperacao(segura, ctx),
          inversa,
          subiuPara: depois > antes ? depois : null,
        },
      }),
    );
    this.host.enviarPersonagem({ ...p, ficha }, p.participanteId);
  }

  private desfazer(eventoId: string, quem: Espectador): Recusa | void {
    const campanha = this.host.campanha();
    if (!campanha) return recusa("Sem mesa aberta.");
    const eventos = this.repo.eventosDa(campanha.id);
    const alvo = eventos.find((e) => e.id === eventoId);
    if (alvo?.tipo !== "ficha_alterada") return recusa("Não há o que desfazer aqui.");
    if (eventos.some((e) => e.tipo === "ficha_desfeita" && e.dados.eventoId === eventoId)) return recusa("Isso já foi desfeito.");
    if (quem.papel !== "mestre" && alvo.autorId !== quem.id) return recusa("Só o mestre desfaz ações de outra pessoa.");
    /* Compra e venda em loja: só o mestre desfaz (C3, 07/11/2026). */
    if (quem.papel !== "mestre" && alvo.dados.inversa.op === "transacao") return recusa("Só o mestre desfaz uma compra ou venda.");
    const p = this.doMestreOuDono(alvo.dados.personagemId, quem);
    if ("recusado" in p) return p;
    const ctx = this.contexto();
    const { inversa } = alvo.dados;
    if (ctx && inversa.op === "devolver_compra") {
      const motivo = motivoParaNaoDesfazer(p.ficha, inversa.compra.id, ctx);
      if (motivo) return recusa(motivo);
    }
    const { ficha } = aplicarOperacao(p.ficha, inversa);
    if (inversa.op === "transacao" && inversa.loja) this.host.ajustarLoja?.(inversa.loja);
    this.repo.salvarPersonagem(p.id, { ficha }, new Date().toISOString());
    this.host.registrar(
      this.host.novoEvento(quem, {
        tipo: "ficha_desfeita",
        dados: { eventoId, personagemId: p.id, personagemNome: ficha.nome, donoId: p.participanteId, rotulo: alvo.dados.rotulo },
      }),
    );
    this.host.enviarPersonagem({ ...p, ficha }, p.participanteId);
  }

  /* Um personagem tem no máximo um jogador; um jogador pode ter vários. A coluna única garante o primeiro. */
  private ligar(id: string, participanteId: string | null, quem: Espectador): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre troca quem controla um personagem.");
    const p = this.repo.personagem(id);
    const campanha = this.host.campanha();
    if (!p || !campanha || p.campanhaId !== campanha.id) return recusa("Personagem não encontrado.");
    let nome: string | null = null;
    if (participanteId) {
      const alvo = this.repo.participante(participanteId);
      if (!alvo || alvo.campanhaId !== campanha.id || alvo.papel !== "jogador" || alvo.revogadoEm) return recusa("Jogador não encontrado.");
      nome = alvo.nome;
    }
    if (p.participanteId === participanteId) return;
    this.repo.salvarPersonagem(id, { participanteId }, new Date().toISOString());
    this.host.registrar(
      this.host.novoEvento(quem, {
        tipo: "personagem_ligado",
        dados: { personagemId: id, personagemNome: p.ficha.nome, participanteId, participanteNome: nome, antigoDonoId: p.participanteId },
      }),
    );
    this.host.enviarPersonagem({ ...p, participanteId }, p.participanteId);
  }

  /* ---------- Opções e kits, só do mestre ---------- */

  definirOpcoes(opcoes: OpcoesCampanha): Recusa | void {
    const campanha = this.host.campanha();
    if (!campanha) return recusa("Sem mesa aberta.");
    this.repo.salvarOpcoes(campanha.id, opcoes);
    this.host.avisarOpcoes(opcoes);
  }

  salvarKit(kit: Kit): Recusa | void {
    const campanha = this.host.campanha();
    if (!campanha) return recusa("Sem mesa aberta.");
    this.repo.salvarKit(campanha.id, kit);
    this.host.avisarMestre();
  }

  apagarKit(id: string): Recusa | void {
    const campanha = this.host.campanha();
    if (!campanha) return recusa("Sem mesa aberta.");
    this.repo.apagarKit(campanha.id, id);
    this.host.avisarMestre();
  }

  entregarKit(personagemId: string, kitId: string, quem: Espectador): Recusa | void {
    const campanha = this.host.campanha();
    const kit = campanha && this.repo.kitsDa(campanha.id).find((k) => k.id === kitId);
    if (!kit) return recusa("Kit não encontrado.");
    for (const item of kit.itens) {
      const r = this.operar(personagemId, { op: "dar_item", item: { id: randomUUID(), itemId: item.itemId, nome: item.nome, quantidade: item.quantidade, equipado: false, pesoKg: null } }, quem);
      if (r) return r;
    }
  }
}

function comIdDoServidor(op: Operacao): Operacao {
  if (op.op === "comprar") return { ...op, compra: { ...op.compra, id: randomUUID() } };
  if (op.op === "dar_item") return { ...op, item: { ...op.item, id: randomUUID() } };
  return op;
}
