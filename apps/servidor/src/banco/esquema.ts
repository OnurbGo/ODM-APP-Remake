import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const campanhas = sqliteTable("campanhas", {
  id: text().primaryKey(),
  nome: text().notNull(),
  codigo: text().notNull(),
  criadaEm: text("criada_em").notNull(),
  opcoes: text().notNull().default("{}"),
  pacotes: text().notNull().default('["base"]'),
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

/* O personagem é da campanha: participante_id é só quem o controla agora, e pode ficar vazio. */
export const personagens = sqliteTable(
  "personagens",
  {
    id: text().primaryKey(),
    campanhaId: text("campanha_id")
      .notNull()
      .references(() => campanhas.id),
    participanteId: text("participante_id").references(() => participantes.id),
    situacao: text({ enum: ["rascunho", "ativo"] }).notNull(),
    ficha: text().notNull(),
    criadoEm: text("criado_em").notNull(),
    alteradoEm: text("alterado_em").notNull(),
  },
  (t) => [index("personagens_campanha").on(t.campanhaId)],
);

export const kits = sqliteTable(
  "kits",
  {
    id: text().primaryKey(),
    campanhaId: text("campanha_id")
      .notNull()
      .references(() => campanhas.id),
    nome: text().notNull(),
    itens: text().notNull(),
  },
  (t) => [index("kits_campanha").on(t.campanhaId)],
);

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
