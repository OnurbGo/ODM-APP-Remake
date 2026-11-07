/* Só para desenvolvimento: no npm run dev quem recebe os jogadores é o node.exe, e o botão Liberar acesso
   só existe no app. Abre a confirmação do Windows; a regra vale para todo programa rodando no Node. */
import { consultarFirewall, liberarFirewall } from "./firewall";

const programa = process.execPath;

console.log(`Situação de ${programa}: ${await consultarFirewall(programa)}`);
console.log("O Windows vai pedir confirmação. Escolha Sim.");

const { estado, motivo } = await liberarFirewall(programa);
if (estado === "liberado") {
  console.log("Pronto: o Windows libera a entrada do node.exe em qualquer rede. Reinicie o npm run dev.");
} else {
  console.error(`Não liberou (${motivo ?? estado}).`);
  process.exitCode = 1;
}
