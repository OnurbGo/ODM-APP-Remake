import type { Ameaca, Criatura } from "@odm/conteudo";
import type { EstadoCombate } from "@odm/protocolo";
import { xpDaCriatura, type RegrasEncontro } from "@odm/regras";
import type { LinhaEmUso } from "../../../conexao/armazenamento";

type Ficha = Criatura | Ameaca;

export type Grupo = { chave: string; ref: string | null; nome: string; elite: boolean; presentes: number; derrotados: number; iniciais: number; xp: number | null };

/* Agrupa por ficha. Os zumbis que saem da Horda pelo dano somem do combate: o encontro montado diz quantos entraram. */
export function gruposDoCombate(combate: EstadoCombate, fichas: ReadonlyMap<string, Ficha>, regras: RegrasEncontro, emUso: readonly LinhaEmUso[]): Grupo[] {
  const grupos = new Map<string, Grupo>();
  const somar = (ref: string | null, nome: string, elite: boolean, presentes: number, derrotados: number) => {
    const chave = `${ref ?? nome}|${elite ? "elite" : ""}`;
    const f = ref ? fichas.get(ref) : undefined;
    const ajuste = emUso.find((l) => l.ref === ref && l.elite === elite)?.xp ?? null;
    const g = grupos.get(chave) ?? { chave, ref, nome: f?.nome ?? nome, elite, presentes: 0, derrotados: 0, iniciais: 0, xp: f ? xpDaCriatura(f, elite, regras, ajuste).xp : ajuste };
    g.presentes += presentes;
    g.derrotados += derrotados;
    grupos.set(chave, g);
  };
  for (const c of combate.combatentes) {
    if (c.tipo === "personagem") continue;
    if (c.horda) for (const i of c.horda.integrantes) somar(c.ref, c.nome, i.elite, 1, c.derrotado ? 1 : 0);
    else somar(c.ref, c.nome, c.elite, 1, c.derrotado ? 1 : 0);
  }
  for (const l of emUso) {
    const g = [...grupos.values()].find((x) => x.ref === l.ref && x.elite === l.elite);
    if (g) g.iniciais += l.quantidade;
  }
  return [...grupos.values()].map((g) => ({ ...g, iniciais: Math.max(g.iniciais, g.presentes) }));
}

