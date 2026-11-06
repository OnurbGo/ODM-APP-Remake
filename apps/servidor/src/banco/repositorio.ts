import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { EventoCompleto, type Papel } from "@odm/protocolo";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-sqlite";
import { migrate } from "drizzle-orm/node-sqlite/migrator";
import { campanhas, dispositivos, eventos, participantes } from "./esquema";

export type Campanha = typeof campanhas.$inferSelect;
export type ParticipanteBanco = typeof participantes.$inferSelect;

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

  campanhaAtual(): Campanha | undefined {
    return this.db.select().from(campanhas).orderBy(desc(campanhas.criadaEm)).limit(1).get();
  }

  criarCampanha(nome: string, codigo: string, nomeMestre: string, agora: string) {
    const campanha: Campanha = { id: randomUUID(), nome, codigo, criadaEm: agora };
    return this.db.transaction((tx) => {
      tx.insert(campanhas).values(campanha).run();
      tx.insert(participantes)
        .values({ id: randomUUID(), campanhaId: campanha.id, nome: nomeMestre, papel: "mestre", criadoEm: agora })
        .run();
      return campanha;
    });
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
