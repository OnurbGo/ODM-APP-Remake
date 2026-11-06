/* Uma construção por processo. Juntas, o empacotador reparte o código comum entre os arquivos,
   e o processo principal acabaria carregando o servidor inteiro. */
import { rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const ENTRADAS = ["principal", "servidorFilho", "preloadInicio", "preloadMestre"];

rmSync(join(raiz, "dist"), { recursive: true, force: true });

for (const entrada of ENTRADAS) {
  await build({
    root: raiz,
    configFile: false,
    logLevel: "warn",
    ssr: { noExternal: true, target: "node" },
    build: {
      ssr: true,
      outDir: "dist",
      emptyOutDir: false,
      target: "node24",
      minify: false,
      rollupOptions: {
        input: { [entrada]: join(raiz, "src", `${entrada}.ts`) },
        external: ["electron", /^node:/],
        output: { format: "cjs", entryFileNames: "[name].cjs" },
      },
    },
  });
}

console.log(`Pronto: ${ENTRADAS.join(", ")}`);
