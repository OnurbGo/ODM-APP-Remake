/* Gera o app em pasta, fora do OneDrive e sem instalador. O NSIS entra na fase 7. */
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";

const saida = join(process.env.LOCALAPPDATA ?? join(homedir(), ".cache"), "ODM-build", "remake");

const r = spawnSync(
  "npx",
  ["electron-builder", "--dir", "--win", "--x64", "--config", "electron-builder.yml", `-c.directories.output="${saida}"`],
  { stdio: "inherit", shell: true },
);

if (r.status === 0) console.log(`Pronto em ${saida}`);
process.exit(r.status ?? 1);
