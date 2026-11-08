import { randomUUID } from "node:crypto";
import { ID_JOGO_DO_21, MecanicaJogo21, type Conteudo } from "@odm/conteudo";
import type { CartaDo21, EventoCompleto, Jogo21, MensagemClienteLida } from "@odm/protocolo";
import { asesNaMao, criarBaralho, embaralhar, estourou, faixaDo21, totalNo21, type Aleatorio } from "@odm/regras";
import type { PersonagemBanco } from "../banco/repositorio";
import type { Espectador } from "./visibilidade";

/* Jogo do 21 (Mestre, "Sistema de busca de espólios"; mundo-mecanica.yml; J1, 07/11/2026). O baralho fica aqui,
   para ninguém ver a próxima carta. Os jogos vivem só na memória: um jogo aberto se perde se o app fechar. */

type Recusa = { recusado: string };
const recusa = (recusado: string): Recusa => ({ recusado });

type Host = {
  conteudo: () => Conteudo | null;
  personagem: (id: string) => PersonagemBanco | undefined;
  registrar: (evento: EventoCompleto) => void;
  novoEvento: <T extends Pick<EventoCompleto, "tipo" | "dados">>(quem: Espectador, corpo: T) => EventoCompleto;
  enviar: () => void;
};

type Interno = { jogo: Jogo21; baralho: CartaDo21[]; donoId: string | null };

export type MensagemDoJogo21 = Extract<MensagemClienteLida, { t: "jogo21_abrir" | "jogo21_comprar" | "jogo21_parar" | "jogo21_fechar" }>;

export class Jogos21 {
  private jogos = new Map<string, Interno>();

  constructor(
    private readonly host: Host,
    private readonly aleatorio: Aleatorio,
  ) {}

  regra(): MecanicaJogo21 | null {
    const lido = MecanicaJogo21.safeParse(this.host.conteudo()?.regras.find((r) => r.id === ID_JOGO_DO_21)?.mecanica);
    return lido.success ? lido.data : null;
  }

  listaPara(quem: Espectador): Jogo21[] {
    return [...this.jogos.values()].filter((j) => quem.papel === "mestre" || j.donoId === quem.id).map((j) => j.jogo);
  }

  /* Trocar de campanha descarta os jogos abertos. */
  limpar() {
    this.jogos.clear();
  }

  receber(m: MensagemDoJogo21, quem: Espectador): Recusa | void {
    switch (m.t) {
      case "jogo21_abrir":
        return this.abrir(m.personagemId, m.local, quem);
      case "jogo21_comprar":
        return this.comprar(m.jogoId, quem);
      case "jogo21_parar":
        return this.parar(m.jogoId, m.asesComo11, quem);
      case "jogo21_fechar":
        return this.fechar(m.jogoId, quem);
    }
  }

  private abrir(personagemId: string, local: string, quem: Espectador): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre abre o Jogo do 21.");
    const regra = this.regra();
    if (!regra) return recusa("O Jogo do 21 ainda não foi revisado no pacote de conteúdo.");
    const p = this.host.personagem(personagemId);
    if (!p || p.situacao !== "ativo") return recusa("Escolha um personagem pronto.");
    const baralho = embaralhar(criarBaralho(0), this.aleatorio).map((c) => ({ valor: c.valor, naipe: c.naipe! }));
    const cartas = baralho.splice(0, regra.cartas_iniciais);
    const jogo: Jogo21 = { id: randomUUID(), personagemId, personagemNome: p.ficha.nome || "Sem nome", local, cartas, situacao: "jogando", asesComo11: 0, total: null, faixa: null };
    this.jogos.set(jogo.id, { jogo, baralho, donoId: p.participanteId });
    this.host.enviar();
  }

  private exigir(jogoId: string, quem: Espectador): Interno | Recusa {
    const j = this.jogos.get(jogoId);
    if (!j) return recusa("Esse jogo já foi fechado.");
    if (quem.papel !== "mestre" && j.donoId !== quem.id) return recusa("Esse jogo é de outro personagem.");
    if (j.jogo.situacao !== "jogando") return recusa("Esse jogo já terminou.");
    return j;
  }

  private comprar(jogoId: string, quem: Espectador): Recusa | void {
    const j = this.exigir(jogoId, quem);
    if ("recusado" in j) return j;
    const regra = this.regra();
    if (!regra) return recusa("O Jogo do 21 ainda não foi revisado no pacote de conteúdo.");
    const carta = j.baralho.shift();
    if (!carta) return recusa("O baralho acabou.");
    const cartas = [...j.jogo.cartas, carta];
    j.jogo = { ...j.jogo, cartas };
    if (estourou(cartas, regra.alvo)) this.terminar(j, "estourou", 0, regra, quem);
    this.host.enviar();
  }

  private parar(jogoId: string, asesComo11: number, quem: Espectador): Recusa | void {
    const j = this.exigir(jogoId, quem);
    if ("recusado" in j) return j;
    const regra = this.regra();
    if (!regra) return recusa("O Jogo do 21 ainda não foi revisado no pacote de conteúdo.");
    const ases = Math.min(asesComo11, asesNaMao(j.jogo.cartas));
    if (totalNo21(j.jogo.cartas, ases) > regra.alvo) return recusa(`Com ${ases} Ás valendo 11 passa de ${regra.alvo}: escolha menos.`);
    this.terminar(j, "parou", ases, regra, quem);
    this.host.enviar();
  }

  private terminar(j: Interno, situacao: "parou" | "estourou", asesComo11: number, regra: MecanicaJogo21, quem: Espectador) {
    const total = totalNo21(j.jogo.cartas, asesComo11);
    const faixa = faixaDo21(total, regra);
    j.jogo = { ...j.jogo, situacao, asesComo11, total, faixa: faixa ? { resultado: faixa.resultado, rotulo: faixa.rotulo } : null };
    const resultado = faixa?.rotulo ?? "sem faixa na tabela";
    const rotulo = `${situacao === "estourou" ? "estourou com" : "parou em"} ${total}: ${resultado}`;
    this.host.registrar(
      this.host.novoEvento(quem, {
        tipo: "jogo21",
        dados: { personagemId: j.jogo.personagemId, personagemNome: j.jogo.personagemNome, local: j.jogo.local, cartas: j.jogo.cartas, total, rotulo },
      }),
    );
  }

  private fechar(jogoId: string, quem: Espectador): Recusa | void {
    if (quem.papel !== "mestre") return recusa("Só o mestre fecha o Jogo do 21.");
    this.jogos.delete(jogoId);
    this.host.enviar();
  }
}
