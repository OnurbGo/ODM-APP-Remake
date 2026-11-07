/* Sobe o servidor sem o Electron, para desenvolver. */
import { pastaConteudo } from "@odm/conteudo/pasta";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RedeMestre } from "@odm/protocolo";
import { consultarFirewall } from "./firewall";
import { pacotesDaPasta } from "./pacotes";
import { iniciarServidor, PortaOcupada } from "./servidor";

const aqui = dirname(fileURLToPath(import.meta.url));

/* Fora do repositório: o banco não pode ficar no OneDrive. */
const pastaDados =
  process.env.ODM_PASTA_DADOS ?? join(process.env.LOCALAPPDATA ?? join(homedir(), ".local", "share"), "ODM-dev");
const tokenMestre = process.env.ODM_TOKEN_MESTRE ?? randomBytes(32).toString("base64url");
const porta = process.env.ODM_PORTA ? Number(process.env.ODM_PORTA) : undefined;
const pastaWeb = process.env.ODM_PASTA_WEB;

const portaWeb = process.argv.find((a) => a.startsWith("--porta-web="))?.split("=")[1];

const pacotes = pacotesDaPasta();
let firewall: RedeMestre["firewallDev"] = null;

/* A verificação e o botão do painel só existem no app: aqui quem recebe os jogadores é o node.exe. */
const AVISO_FIREWALL = {
  liberado: "Firewall: o node.exe está liberado nesta rede.",
  bloqueado: "Firewall: o Windows está BLOQUEANDO o node.exe nesta rede. Outros aparelhos ficam carregando sem fim. Rode: npm run firewall:liberar",
  sem_liberacao: "Firewall: falta liberar o node.exe nesta rede, e outros aparelhos podem não entrar. Rode: npm run firewall:liberar",
  desconhecido: "Firewall: não deu para conferir. A verificação do painel e o botão Liberar acesso só existem no app (Electron).",
};

try {
  const servidor = await iniciarServidor({
    porta,
    pastaDados,
    pastaMigracoes: resolve(aqui, "../migracoes"),
    pastaWeb,
    tokenMestre,
    pacotes,
    /* O tsx reinicia a cada arquivo salvo: voltar para a lista de campanhas a cada vez atrapalharia. */
    retomar: true,
    portaWeb: portaWeb ? Number(portaWeb) : undefined,
    firewallDev: () => firewall,
  });
  console.log(`Servidor na porta ${servidor.porta}. Dados em ${pastaDados}`);
  console.log(`Conteúdo em ${pastaConteudo()}: ${pacotes.map((p) => p.manifesto.id).join(", ") || "nenhum pacote"}`);
  console.log(`Mestre (desenvolvimento): http://localhost:5173/?tokenMestre=${tokenMestre}`);

  void consultarFirewall(process.execPath).then((estado) => {
    firewall = estado;
    console.log(AVISO_FIREWALL[estado]);
    servidor.mesa.avisarMestre();
  });

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
