/* Sobe o servidor sem o Electron, para desenvolver. */
import { lerPasta, pastaConteudo } from "@odm/conteudo/pasta";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { iniciarServidor, PortaOcupada } from "./servidor";

const aqui = dirname(fileURLToPath(import.meta.url));

/* Fora do repositório: o banco não pode ficar no OneDrive. */
const pastaDados =
  process.env.ODM_PASTA_DADOS ?? join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "ODM-dev");
const tokenMestre = process.env.ODM_TOKEN_MESTRE ?? randomBytes(32).toString("base64url");
const porta = process.env.ODM_PORTA ? Number(process.env.ODM_PORTA) : undefined;
const pastaWeb = process.env.ODM_PASTA_WEB;

try {
  const servidor = await iniciarServidor({
    porta,
    pastaDados,
    pastaMigracoes: resolve(aqui, "../migracoes"),
    pastaWeb,
    tokenMestre,
  });
  console.log(`Servidor na porta ${servidor.porta}. Dados em ${pastaDados}`);
  const pacotes = lerPasta(pastaConteudo()).filter((l) => l.pacote && l.problemas.length === 0);
  console.log(`Conteúdo em ${pastaConteudo()}: ${pacotes.map((l) => l.arquivo).join(", ") || "nenhum pacote"}`);
  console.log(`Mestre (desenvolvimento): http://localhost:5173/?tokenMestre=${tokenMestre}`);

  const parar = async () => {
    await servidor.encerrar();
    process.exit(0);
  };
  process.on("SIGINT", parar);
  process.on("SIGTERM", parar);
} catch (erro) {
  console.error(erro instanceof PortaOcupada ? erro.message : erro);
  process.exit(1);
}
