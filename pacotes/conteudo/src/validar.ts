/* npm run conteudo:validar: confere os pacotes da pasta de desenvolvimento. */
import { lerPasta, pastaConteudo } from "./pasta";

const pasta = pastaConteudo();
const lidos = lerPasta(pasta);

if (lidos.length === 0) {
  console.error(`Nenhum pacote em ${pasta}. Gere com "npm run exportar" no repositório dos livros.`);
  process.exit(1);
}

let falhou = false;
for (const { arquivo, pacote, problemas } of lidos) {
  if (problemas.length > 0) {
    falhou = true;
    console.error(`ERRO ${arquivo}\n${problemas.map((p) => `  ${p}`).join("\n")}`);
    continue;
  }
  const total = pacote ? Object.values(pacote.conteudo).reduce((soma, lista) => soma + lista.length, 0) : 0;
  console.log(`ok   ${arquivo} (${pacote?.manifesto.nome} ${pacote?.manifesto.versao}, ${total} itens)`);
}
process.exit(falhou ? 1 : 0);
