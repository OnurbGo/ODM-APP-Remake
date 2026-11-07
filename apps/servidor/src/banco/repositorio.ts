import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { EstadoCombate, EstadoVivo, EventoCompleto, FichaDados, Kit, OpcoesCampanha, type Papel, type Personagem, type ResumoCampanha, type SituacaoPersonagem } from "@odm/protocolo";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { z } from "zod";
import { campanhas, combates, dispositivos, eventos, kits, participantes, personagens } from "./esquema";

export type Campanha = typeof campanhas.$inferSelect;
export type ParticipanteBanco = typeof participantes.$inferSelect;
export type PersonagemBanco = Personagem & { campanhaId: string };

const ListaDePacotes = z.array(z.string());
const NOME_EM_BRANCO = "Sem nome";

function lerPersonagem(l: typeof personagens.$inferSelect): PersonagemBanco {
  return {
    id: l.id,
    campanhaId: l.campanhaId,
    participanteId: l.participanteId,
    situacao: l.situacao,
    ficha: FichaDados.parse(JSON.parse(l.ficha)),
    vivo: EstadoVivo.parse(JSON.parse(l.estado)),
  };
}

/* Único ponto que conhece o node:sqlite, ainda em release candidate no Node 24:
   se a API dele mudar, o ajuste fica aqui. */
export class Repositorio {
  private readonly cliente: DatabaseSync;
  private readonly db;

  constructor(caminho: string, pastaMigracoes: string) {
    this.cliente = new DatabaseSync(caminho);
    this.cliente.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;");
    this.db = drizzle({ client: this.cliente });
    migrate(this.db, { migrationsFolder: pastaMigracoes });
  }

  fechar() {
    this.cliente.close();
  }

  campanhaAberta(): Campanha | undefined {
    return this.db.select().from(campanhas).where(eq(campanhas.aberta, true)).get();
  }

  campanha(id: string): Campanha | undefined {
    return this.db.select().from(campanhas).where(eq(campanhas.id, id)).get();
  }

  /* Da sessão mais recente para a mais antiga. */
  resumoDasCampanhas(): ResumoCampanha[] {
    const lista = this.db.select().from(campanhas).orderBy(desc(campanhas.ultimaSessaoEm), desc(campanhas.criadaEm)).all();
    return lista.map((c) => ({
      id: c.id,
      nome: c.nome,
      ultimaSessaoEm: c.ultimaSessaoEm,
      personagens: this.personagensDa(c.id).map((p) => p.ficha.nome || NOME_EM_BRANCO),
    }));
  }

  criarCampanha(nome: string, codigo: string, nomeMestre: string, agora: string, config: { pacotes: readonly string[]; opcoes: OpcoesCampanha }) {
    const campanha: Campanha = {
      id: randomUUID(),
      nome,
      codigo,
      criadaEm: agora,
      opcoes: JSON.stringify(config.opcoes),
      pacotes: JSON.stringify(config.pacotes),
      ultimaSessaoEm: agora,
      aberta: false,
    };
    return this.db.transaction((tx) => {
      tx.insert(campanhas).values(campanha).run();
      tx.insert(participantes)
        .values({ id: randomUUID(), campanhaId: campanha.id, nome: nomeMestre, papel: "mestre", criadoEm: agora })
        .run();
      return campanha;
    });
  }

  /* Marca a sessão de agora: é a data que a lista de campanhas mostra. */
  abrirCampanha(id: string, agora: string): Campanha | undefined {
    this.db.transaction((tx) => {
      tx.update(campanhas).set({ aberta: false }).run();
      tx.update(campanhas).set({ aberta: true, ultimaSessaoEm: agora }).where(eq(campanhas.id, id)).run();
    });
    return this.campanha(id);
  }

  fecharCampanhas() {
    this.db.update(campanhas).set({ aberta: false }).run();
  }

  trocarCodigo(campanhaId: string, codigo: string) {
    this.db.update(campanhas).set({ codigo }).where(eq(campanhas.id, campanhaId)).run();
  }

  participantesDa(campanhaId: string): ParticipanteBanco[] {
    return this.db
      .select()
      .from(participantes)
      .where(eq(participantes.campanhaId, campanhaId))
      .orderBy(asc(participantes.criadoEm))
      .all();
  }

  participante(id: string): ParticipanteBanco | undefined {
    return this.db.select().from(participantes).where(eq(participantes.id, id)).get();
  }

  mestreDa(campanhaId: string): ParticipanteBanco | undefined {
    const papel: Papel = "mestre";
    return this.db
      .select()
      .from(participantes)
      .where(and(eq(participantes.campanhaId, campanhaId), eq(participantes.papel, papel)))
      .get();
  }

  criarJogador(campanhaId: string, nome: string, agora: string): ParticipanteBanco {
    const novo: ParticipanteBanco = {
      id: randomUUID(),
      campanhaId,
      nome,
      papel: "jogador",
      criadoEm: agora,
      revogadoEm: null,
    };
    this.db.insert(participantes).values(novo).run();
    return novo;
  }

  participantePorToken(tokenHash: string): ParticipanteBanco | undefined {
    const linha = this.db
      .select({ participante: participantes })
      .from(dispositivos)
      .innerJoin(participantes, eq(dispositivos.participanteId, participantes.id))
      .where(and(eq(dispositivos.tokenHash, tokenHash), isNull(participantes.revogadoEm)))
      .get();
    return linha?.participante;
  }

  adicionarDispositivo(participanteId: string, tokenHash: string, agora: string) {
    this.db.insert(dispositivos).values({ id: randomUUID(), participanteId, tokenHash, criadoEm: agora }).run();
  }

  /* Revogar apaga os tokens: voltar exige nova aprovação do mestre. */
  revogar(participanteId: string, agora: string) {
    this.db.transaction((tx) => {
      tx.delete(dispositivos).where(eq(dispositivos.participanteId, participanteId)).run();
      tx.update(participantes).set({ revogadoEm: agora }).where(eq(participantes.id, participanteId)).run();
    });
  }

  restaurar(participanteId: string) {
    this.db.update(participantes).set({ revogadoEm: null }).where(eq(participantes.id, participanteId)).run();
  }

  opcoesDa(campanha: Campanha): OpcoesCampanha {
    return OpcoesCampanha.parse(JSON.parse(this.db.select({ opcoes: campanhas.opcoes }).from(campanhas).where(eq(campanhas.id, campanha.id)).get()?.opcoes ?? campanha.opcoes));
  }

  pacotesDa(campanha: Campanha): string[] {
    return ListaDePacotes.parse(JSON.parse(campanha.pacotes));
  }

  salvarOpcoes(campanhaId: string, opcoes: OpcoesCampanha) {
    this.db.update(campanhas).set({ opcoes: JSON.stringify(opcoes) }).where(eq(campanhas.id, campanhaId)).run();
  }

  personagensDa(campanhaId: string): PersonagemBanco[] {
    return this.db.select().from(personagens).where(eq(personagens.campanhaId, campanhaId)).orderBy(asc(personagens.criadoEm)).all().map(lerPersonagem);
  }

  personagem(id: string): PersonagemBanco | undefined {
    const linha = this.db.select().from(personagens).where(eq(personagens.id, id)).get();
    return linha ? lerPersonagem(linha) : undefined;
  }

  criarPersonagem(campanhaId: string, p: Personagem, agora: string) {
    this.db
      .insert(personagens)
      .values({ id: p.id, campanhaId, participanteId: p.participanteId, situacao: p.situacao, ficha: JSON.stringify(p.ficha), estado: JSON.stringify(p.vivo), criadoEm: agora, alteradoEm: agora })
      .run();
  }

  salvarPersonagem(id: string, mudanca: { ficha?: FichaDados; vivo?: EstadoVivo; situacao?: SituacaoPersonagem; participanteId?: string | null }, agora: string) {
    const { ficha, vivo, ...resto } = mudanca;
    this.db
      .update(personagens)
      .set({ ...resto, ...(ficha ? { ficha: JSON.stringify(ficha) } : {}), ...(vivo ? { estado: JSON.stringify(vivo) } : {}), alteradoEm: agora })
      .where(eq(personagens.id, id))
      .run();
  }

  apagarPersonagem(id: string) {
    this.db.delete(personagens).where(eq(personagens.id, id)).run();
  }

  kitsDa(campanhaId: string): Kit[] {
    return this.db
      .select()
      .from(kits)
      .where(eq(kits.campanhaId, campanhaId))
      .orderBy(asc(kits.nome))
      .all()
      .map((l) => Kit.parse({ id: l.id, nome: l.nome, itens: JSON.parse(l.itens) }));
  }

  salvarKit(campanhaId: string, kit: Kit) {
    const itens = JSON.stringify(kit.itens);
    this.db
      .insert(kits)
      .values({ id: kit.id, campanhaId, nome: kit.nome, itens })
      .onConflictDoUpdate({ target: kits.id, set: { nome: kit.nome, itens } })
      .run();
  }

  apagarKit(campanhaId: string, id: string) {
    this.db.delete(kits).where(and(eq(kits.id, id), eq(kits.campanhaId, campanhaId))).run();
  }

  /* O combate em curso da campanha, se houver. */
  combateAberto(campanhaId: string): EstadoCombate | null {
    const linha = this.db.select().from(combates).where(and(eq(combates.campanhaId, campanhaId), isNull(combates.encerradoEm))).get();
    return linha ? EstadoCombate.parse(JSON.parse(linha.estado)) : null;
  }

  /* Grava o estado do combate; "encerrar" marca a data e tira da lista de abertos (desfazer reabre). */
  salvarCombate(campanhaId: string, estado: EstadoCombate, encerrado: boolean, agora: string) {
    const valor = JSON.stringify(estado);
    this.db
      .insert(combates)
      .values({ id: estado.id, campanhaId, estado: valor, criadoEm: agora, encerradoEm: encerrado ? agora : null })
      .onConflictDoUpdate({ target: combates.id, set: { estado: valor, encerradoEm: encerrado ? agora : null } })
      .run();
  }

  acrescentarEvento(campanhaId: string, evento: EventoCompleto) {
    this.db
      .insert(eventos)
      .values({
        id: evento.id,
        campanhaId,
        tipo: evento.tipo,
        autorId: evento.autorId,
        autorNome: evento.autorNome,
        dados: JSON.stringify(evento.dados),
        criadoEm: evento.criadoEm,
      })
      .run();
  }

  eventosDa(campanhaId: string): EventoCompleto[] {
    const linhas = this.db.select().from(eventos).where(eq(eventos.campanhaId, campanhaId)).orderBy(asc(eventos.seq)).all();
    return linhas.map((l) =>
      EventoCompleto.parse({
        id: l.id,
        tipo: l.tipo,
        autorId: l.autorId,
        autorNome: l.autorNome,
        dados: JSON.parse(l.dados),
        criadoEm: l.criadoEm,
      }),
    );
  }
}
