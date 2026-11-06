import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const caminho = (arquivo: string) => fileURLToPath(new URL(arquivo, import.meta.url));

export default defineConfig({
  plugins: [react()],
  /* Relativo: a mesma construção é servida pelo servidor do mestre e pela tela inicial do Electron. */
  base: "./",
  build: {
    /* O d20 passa do limite padrão, mas só baixa quando alguém vai rolar (três, em pacote próprio). */
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: { index: caminho("index.html"), inicio: caminho("inicio.html") },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    host: true,
    proxy: {
      "/ws": { target: "ws://127.0.0.1:47821", ws: true },
      "/api": "http://127.0.0.1:47821",
    },
  },
});
