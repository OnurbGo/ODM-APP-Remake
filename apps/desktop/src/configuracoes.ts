import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PORTA_PADRAO } from "@odm/protocolo/constantes";
import { portaValida } from "./endereco";

export type Configuracoes = { porta: number };

const PADRAO: Configuracoes = { porta: PORTA_PADRAO };

/* Arquivo ausente ou estragado não impede o app de abrir: volta para o padrão. */
export function lerConfiguracoes(pasta: string): Configuracoes {
  try {
    const salvo = JSON.parse(readFileSync(join(pasta, "configuracoes.json"), "utf8")) as Partial<Configuracoes>;
    return { porta: portaValida(salvo.porta) ? salvo.porta : PADRAO.porta };
  } catch {
    return { ...PADRAO };
  }
}

/* Escreve em arquivo temporário e renomeia: uma queda no meio não deixa o JSON pela metade. */
export function salvarConfiguracoes(pasta: string, configuracoes: Configuracoes) {
  const destino = join(pasta, "configuracoes.json");
  mkdirSync(dirname(destino), { recursive: true });
  writeFileSync(`${destino}.tmp`, JSON.stringify(configuracoes, null, 2));
  renameSync(`${destino}.tmp`, destino);
}
