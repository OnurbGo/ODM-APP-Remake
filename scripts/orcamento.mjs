/* Confere a meta da seção 10: pacote JS inicial do jogador abaixo de 250 kB comprimido.
   Conta só o que a página carrega de cara: o script de entrada e os módulos pré-carregados. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const LIMITE_KB = 250;
const raiz = join(dirname(fileURLToPath(import.meta.url)), "..", "apps", "web", "dist");

const html = readFileSync(join(raiz, "index.html"), "utf8");
const arquivos = [...html.matchAll(/(?:src|href)="\.\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);

if (arquivos.length === 0) {
  console.error("Nenhum script em apps/web/dist/index.html. Rode o build antes.");
  process.exit(1);
}

let total = 0;
for (const arquivo of arquivos) {
  const kb = gzipSync(readFileSync(join(raiz, arquivo))).length / 1024;
  total += kb;
  console.log(`${kb.toFixed(1).padStart(7)} kB  ${arquivo}`);
}
console.log(`${total.toFixed(1).padStart(7)} kB  total (limite: ${LIMITE_KB} kB)`);

const proibidos = arquivos.filter((a) => /D20Tres|PainelMestre/.test(a));
if (proibidos.length) {
  console.error(`Estes pacotes deveriam carregar só sob demanda: ${proibidos.join(", ")}`);
  process.exit(1);
}
process.exit(total > LIMITE_KB ? 1 : 0);
