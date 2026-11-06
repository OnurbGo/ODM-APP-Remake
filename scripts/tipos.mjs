/* Confere os tipos de cada projeto. Sem "references": cada pacote expõe o próprio src. */
import { spawnSync } from "node:child_process";

const projetos = [
  "pacotes/regras",
  "pacotes/protocolo",
  "pacotes/conteudo",
  "pacotes/estilo",
  "apps/servidor",
  "apps/web",
  "apps/desktop",
  "prototipos",
];

let falhou = false;
for (const projeto of projetos) {
  const r = spawnSync("npx", ["tsc", "--noEmit", "-p", `${projeto}/tsconfig.json`], { stdio: "inherit", shell: true });
  console.log(`${r.status === 0 ? "ok  " : "ERRO"} ${projeto}`);
  if (r.status !== 0) falhou = true;
}
process.exit(falhou ? 1 : 0);
