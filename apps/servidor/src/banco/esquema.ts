import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campanhas = sqliteTable("campanhas", {
  id: text().primaryKey(),
  nome: text().notNull(),
  codigo: text().notNull(),
  criadaEm: text("criada_em").notNull(),
});

export const participantes = sqliteTable(
  "participantes",
  {
    id: text().primaryKey(),
    campanhaId: text("campanha_id")
      .notNull()
      .references(() => campanhas.id),
    nome: text().notNull(),
    papel: text({ enum: ["mestre", "jogador"] }).notNull(),
    criadoEm: text("criado_em").notNull(),
    revogadoEm: text("revogado_em"),
  },
  (t) => [index("participantes_campanha").on(t.campanhaId)],
);

/* Um participante pode ter vários dispositivos. Do token, só o hash fica guardado. */
export const dispositivos = sqliteTable("dispositivos", {
  id: text().primaryKey(),
  participanteId: text("participante_id")
    .notNull()
    .references(() => participantes.id),
  tokenHash: text("token_hash").notNull().unique(),
  criadoEm: text("criado_em").notNull(),
});

/* Só recebe linhas novas: desfazer, nas fases seguintes, é um evento novo. */
export const eventos = sqliteTable(
  "eventos",
  {
    seq: integer().primaryKey({ autoIncrement: true }),
    id: text().notNull().unique(),
    campanhaId: text("campanha_id")
      .notNull()
      .references(() => campanhas.id),
    tipo: text().notNull(),
    autorId: text("autor_id"),
    autorNome: text("autor_nome"),
    dados: text().notNull(),
    criadoEm: text("criado_em").notNull(),
  },
  (t) => [index("eventos_campanha").on(t.campanhaId, t.seq)],
);
