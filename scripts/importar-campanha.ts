/* npm run campanha:importar -- "<exportação do app antigo>.json" --nome "Boa Esperança" [--dados <pasta>] [--previa] [--nomes <arquivo>.json]
   Cria uma campanha nova a partir da exportação do ODM-App antigo (fase 6, etapa 12). Só no computador do mestre:
   o arquivo e o banco nunca entram no repositório. Antes de gravar, copia o banco para "odm.sqlite.antes-da-importacao-<data>".
   --dados: a pasta do banco. Sem ela, a do app instalado (%APPDATA%\OlhoDaMorte\dados).
   --nomes: JSON {"nome no app antigo": "nome do livro"} para os NPCs (fica fora do repositório, como a exportação).
   Feche o app antes de importar. */
import { randomInt, randomUUID } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { lerPasta, pastaConteudo } from "@odm/conteudo/pasta";
import { Cadastro, opcoesPadrao } from "@odm/protocolo";
import { Repositorio } from "../apps/servidor/src/banco/repositorio";
import { converterExportacao } from "../apps/servidor/src/importar/antigo";

const args = process.argv.slice(2);
const opcao = (nome: string) => {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
};
const arquivo = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const nome = opcao("--nome");
const pastaDados = opcao("--dados") ?? join(process.env.APPDATA ?? "", "OlhoDaMorte", "dados");
const pastaPacotes = args.includes("--previa") ? join(process.env.LOCALAPPDATA ?? "", "ODM-dev", "conteudo-previa") : pastaConteudo();

if (!arquivo || !nome) {
  console.error('Uso: npm run campanha:importar -- "<exportação>.json" --nome "Nome da campanha" [--dados <pasta>]');
  process.exit(1);
}
if (!existsSync(arquivo)) {
  console.error(`Não achei o arquivo ${arquivo}.`);
  process.exit(1);
}
const pacote = lerPasta(pastaPacotes).find((l) => l.pacote?.manifesto.id === "base")?.pacote;
if (!pacote) {
  console.error(`Sem o pacote base em ${pastaPacotes}: exporte o conteúdo dos livros antes.`);
  process.exit(1);
}

mkdirSync(pastaDados, { recursive: true });
const banco = join(pastaDados, "odm.sqlite");
if (existsSync(banco)) {
  const copia = `${banco}.antes-da-importacao-${new Date().toISOString().replace(/[:.]/g, "-")}`;
  copyFileSync(banco, copia);
  if (existsSync(`${banco}-wal`)) copyFileSync(`${banco}-wal`, `${copia}-wal`);
  console.log(`Cópia de segurança: ${copia}`);
}

const arquivoNomes = opcao("--nomes");
const nomesDoLivro = arquivoNomes ? (JSON.parse(readFileSync(arquivoNomes, "utf8")) as Record<string, string>) : {};
const r = converterExportacao(JSON.parse(readFileSync(arquivo, "utf8")), { itens: pacote.conteudo.itens, municoes: pacote.conteudo.municoes }, () => randomUUID(), nomesDoLivro);
const repo = new Repositorio(banco, resolve(import.meta.dirname, "..", "apps", "servidor", "migracoes"));
if (repo.resumoDasCampanhas().some((c) => c.nome === nome) && !args.includes("--repetir")) {
  console.error(`Já existe uma campanha "${nome}" nesse banco. Use outro nome, ou --repetir para criar outra igual.`);
  process.exit(1);
}
const ALFABETO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const codigo = Array.from({ length: 6 }, () => ALFABETO[randomInt(ALFABETO.length)]).join("");
const agora = new Date().toISOString();
const campanha = repo.criarCampanha(nome, codigo, "Mestre", agora, { pacotes: ["base"], opcoes: opcoesPadrao() });
for (const { id, cadastro } of r.cadastros) repo.salvarCadastro(campanha.id, Cadastro.parse({ ...cadastro, id, atualizadoEm: agora }));

console.log(`Campanha "${nome}" criada (da exportação "${r.nomeOriginal}"), em ${banco}.`);
const nomes: Record<string, string> = { nota: "nota", missao: "missões", marco: "marcos", npc: "NPCs", loja: "lojas" };
console.log(Object.entries(r.resumo).map(([t, n]) => `${n} ${nomes[t] ?? t}`).join(", "));
if (r.naoCasados.length) {
  console.log(`\nItens que não casaram com o catálogo (ficaram como linha escrita à mão, com o preço do app antigo):`);
  for (const l of r.naoCasados) console.log(`- ${l}`);
}
