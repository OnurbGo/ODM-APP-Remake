/* Só para Node: a interface web nunca recebe o pacote inteiro (especificação, 3.1). */
import { readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { conferirPacote, lerPacote, type PacoteConteudo } from "./pacote";

/* Fora dos dois repositórios: o pacote tem o texto dos livros. */
export function pastaConteudo(ambiente: NodeJS.ProcessEnv = process.env) {
  if (ambiente.ODM_CONTEUDO) return ambiente.ODM_CONTEUDO;
  const base = ambiente.LOCALAPPDATA ?? join(homedir(), ".local", "share");
  return join(base, "ODM-dev", "conteudo");
}

export type PacoteLido = { arquivo: string; pacote: PacoteConteudo | null; problemas: string[] };

export function lerPasta(pasta: string): PacoteLido[] {
  let nomes: string[];
  try {
    nomes = readdirSync(pasta).filter((n) => /^odm-.*\.json$/.test(n));
  } catch {
    return [];
  }
  return nomes.map((arquivo) => {
    try {
      const pacote = lerPacote(readFileSync(join(pasta, arquivo), "utf8"));
      return { arquivo, pacote, problemas: conferirPacote(pacote) };
    } catch (erro) {
      return { arquivo, pacote: null, problemas: [erro instanceof Error ? erro.message : String(erro)] };
    }
  });
}
