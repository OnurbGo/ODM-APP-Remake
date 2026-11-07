/* Roda em utilityProcess: o SQLite síncrono não trava a janela, e uma queda aqui não derruba o app. */
import { iniciarServidor, pacotesDaPasta, PortaOcupada, type ServidorOdm } from "@odm/servidor";

export type MensagemFilho =
  | { tipo: "pronto"; porta: number }
  | { tipo: "porta_ocupada"; porta: number }
  | { tipo: "falha"; mensagem: string };

const { ODM_PORTA, ODM_PASTA_DADOS, ODM_PASTA_WEB, ODM_PASTA_MIGRACOES, ODM_TOKEN_MESTRE, ODM_RETOMAR } = process.env;
const pai = process.parentPort;
const avisar = (mensagem: MensagemFilho) => pai.postMessage(mensagem);

let servidor: ServidorOdm | undefined;

pai.on("message", (e: Electron.MessageEvent) => {
  if ((e.data as { tipo?: string })?.tipo !== "encerrar") return;
  void (servidor?.encerrar() ?? Promise.resolve()).finally(() => process.exit(0));
});

async function subir() {
  try {
    servidor = await iniciarServidor({
      porta: Number(ODM_PORTA),
      pastaDados: ODM_PASTA_DADOS ?? "",
      pastaWeb: ODM_PASTA_WEB,
      pastaMigracoes: ODM_PASTA_MIGRACOES ?? "",
      tokenMestre: ODM_TOKEN_MESTRE ?? "",
      pacotes: pacotesDaPasta(),
      retomar: ODM_RETOMAR === "1",
    });
    avisar({ tipo: "pronto", porta: servidor.porta });
  } catch (erro) {
    if (erro instanceof PortaOcupada) avisar({ tipo: "porta_ocupada", porta: erro.porta });
    else avisar({ tipo: "falha", mensagem: erro instanceof Error ? erro.message : String(erro) });
    process.exit(0);
  }
}

void subir();
