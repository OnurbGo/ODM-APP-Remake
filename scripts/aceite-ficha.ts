/* npm run ficha:aceite: monta um personagem de cada classe no nível 1 e um no nível 11 com a loja de prestígio,
   usando o pacote real da pasta de desenvolvimento. O relatório fica fora dos repositórios, porque traz nomes do livro. */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { lerPasta, pastaConteudo } from "@odm/conteudo/pasta";
import { ATRIBUTOS, type Classe } from "@odm/conteudo";
import { fichaVazia, type CompraPrestigio, type FichaDados, type OpcoesCampanha } from "@odm/protocolo";
import {
  calcularFicha,
  comprar,
  criarContexto,
  errosDaCriacao,
  habilidadesDaFicha,
  motivoParaNaoDesfazer,
  opcoesDaLoja,
  opcoesDoTalento,
  pedeAtributo,
  pendenciasDeNivel,
  pontosDePrestigio,
  recortarConteudoFicha,
  talentosDaLoja,
  tecnicasDaLoja,
  vagasDeProficiencia,
  type ContextoFicha,
  type FichaCalculada,
} from "@odm/regras";

const opcoes: OpcoesCampanha = { cartasDoDestino: true, estresse: true, modeloVantagem: "dados_extras", empateIniciativa: "naipe", polivalencia: false };

const pasta = pastaConteudo();
const pacote = lerPasta(pasta).find((l) => l.pacote?.manifesto.id === "base")?.pacote;
if (!pacote) throw new Error(`Sem pacote base em ${pasta}`);
const r = criarContexto(recortarConteudoFicha(pacote.conteudo), opcoes);
if (!r.ok) throw new Error(`Regras sem aprovação: ${r.faltando.join(", ")}`);
const ctx: ContextoFicha = r.contexto;

const linhas: string[] = ["# Aceite da ficha", "", `Pacote: ${pacote.manifesto.nome} ${pacote.manifesto.versao}, livros em ${pacote.manifesto.origem?.commit ?? "?"}.`, ""];
const falhas: string[] = [];
const conferir = (ok: boolean, texto: string) => {
  if (!ok) falhas.push(texto);
};

/* Cada classe recebe a distribuição em ordem diferente, para exercitar as contas. */
function distribuir(indice: number): FichaDados["atributos"] {
  const valores = [...ctx.regras.atributos.valores];
  const giro = [...valores.slice(indice % valores.length), ...valores.slice(0, indice % valores.length)];
  return Object.fromEntries(ATRIBUTOS.map((a, i) => [a, giro[i]]));
}

function criar(classe: Classe, indice: number): FichaDados {
  const origem = [...ctx.origens.values()][indice * 5];
  const ficha: FichaDados = { ...fichaVazia(), nome: `Teste ${classe.nome}`, classeId: classe.id, origemId: origem?.id ?? null, atributos: distribuir(indice) };
  const vagas = vagasDeProficiencia(ficha, ctx);
  if (!vagas) throw new Error(`Classe sem mecânica: ${classe.nome}`);
  const pedido = origem?.mecanica?.concede?.escolher;
  return {
    ...ficha,
    pericias: vagas.lista.slice(0, vagas.pericias),
    ferramentas: Array.from({ length: vagas.ferramentas }, (_, i) => `Ferramenta ${i + 1}`),
    escolhasDaOrigem: pedido && pedido.de !== "pericias" ? pedido.de.slice(0, pedido.quantidade) : [],
  };
}

function resumo(c: FichaCalculada) {
  return [
    `Nível ${c.nivel}, proficiência +${c.proficiencia}, ${c.dadoDeVida}`,
    `PV ${c.pvMaximo.valor} (${c.pvMaximo.conta.map((p) => `${p.rotulo}: ${p.valor}`).join("; ")})`,
    `Defesa ${c.defesa.valor} (${c.defesa.conta.map((p) => `${p.rotulo}: ${p.valor}`).join("; ")})`,
    `RD ${c.rd.valor}, deslocamento ${c.deslocamento.valor} m, carga ${c.carga.limite.valor} kg, Estresse ${c.estresseMaximo?.valor}`,
    `Fichas: ${c.fichasDeClasse.map((f) => `${f.nome} ${f.maximo.valor}`).join("; ") || "nenhuma neste nível"}`,
  ];
}

const classes = [...ctx.classes.values()].filter((c) => c.mecanica);
conferir(classes.length === 6, `Esperava 6 classes com mecânica, achei ${classes.length}`);

classes.forEach((classe, i) => {
  const ficha = criar(classe, i);
  const erros = errosDaCriacao(ficha, ctx);
  conferir(erros.length === 0, `${classe.nome}: ${erros.map((e) => e.mensagem).join("; ")}`);
  const c = calcularFicha(ficha, ctx);
  conferir(c.pvMaximo.valor > 0, `${classe.nome}: PV não calculado`);
  linhas.push(`## ${classe.nome}, nível 1`, "", `Origem: ${ficha.origemId}`, "", ...resumo(c).map((l) => `- ${l}`), `- Habilidades: ${habilidadesDaFicha(ficha, ctx).map((h) => h.nome).join(", ")}`, "");
});

/* ---------- Nível 11 ou mais, com a loja ---------- */

function escolherTudo(inicial: FichaDados): FichaDados {
  let ficha = inicial;
  for (let volta = 0; volta < 30; volta++) {
    const [p] = pendenciasDeNivel(ficha, ctx);
    if (!p) return ficha;
    if (p.tipo === "especializacao") {
      const classe = ctx.classes.get(ficha.classeId!);
      ficha = { ...ficha, especializacaoId: [...ctx.especializacoes.values()].find((e) => e.classe === classe?.nome)?.id ?? null };
    } else if (p.tipo === "talento") {
      const t = talentosDaLoja(ficha, ctx).find((a) => !a.motivo && !pedeAtributo(a.id, ctx) && !opcoesDoTalento(a.id, ctx));
      if (!t) throw new Error("Sem talento disponível");
      ficha = { ...ficha, talentos: [...ficha.talentos, { nivel: p.nivel, talentoId: t.id }] };
    } else {
      const atuais = ficha.escolhasDeNivel[String(p.nivel)] ?? [];
      ficha = { ...ficha, escolhasDeNivel: { ...ficha.escolhasDeNivel, [String(p.nivel)]: [...atuais, ...p.opcoes.slice(0, p.quantidade)] } };
    }
  }
  throw new Error("Escolhas não terminam");
}

function comprarTudo(inicial: FichaDados): FichaDados {
  let ficha = inicial;
  const pedir = (compra: CompraPrestigio) => {
    const r2 = comprar(ficha, compra, ctx);
    if (!r2.ok) throw new Error(`Loja recusou: ${r2.motivo}`);
    ficha = r2.ficha;
  };
  const motivoLendaria = opcoesDaLoja(ficha, ctx).find((o) => o.id === "tecnica_lendaria")?.motivo;
  conferir(motivoLendaria === "Exige uma Técnica Avançada", `Lendária sem Avançada: ${motivoLendaria}`);

  const avancada = tecnicasDaLoja(ficha, ctx, "avancada")[0];
  if (avancada) pedir({ id: "a", tipo: "tecnica_avancada", habilidadeId: avancada.id });
  const lendaria = tecnicasDaLoja(ficha, ctx, "lendaria")[0];
  if (lendaria) pedir({ id: "l", tipo: "tecnica_lendaria", habilidadeId: lendaria.id });
  conferir(motivoParaNaoDesfazer(ficha, "a", ctx) !== null, "Avançada que sustenta Lendária deveria ficar presa");
  pedir({ id: "v", tipo: "vitalidade_aprimorada" });
  const treino = [...ctx.talentos.values()].find((t) => t.mecanica?.concede?.atributo_a_escolha);
  if (treino) pedir({ id: "t", tipo: "talento", talentoId: treino.id, atributo: "fibra" });
  return ficha;
}

const veterano = classes[1];
if (veterano) {
  const base = escolherTudo({ ...criar(veterano, 1), xp: ctx.regras.xp.xp_por_nivel["16"] ?? 0 });
  const antes = calcularFicha(base, ctx);
  const depois = comprarTudo(base);
  const c = calcularFicha(depois, ctx);
  conferir(antes.nivel === 16, `Nível esperado 16, veio ${antes.nivel}`);
  conferir(pendenciasDeNivel(depois, ctx).length === 0, "Sobrou escolha pendente");
  conferir(c.pvMaximo.valor - antes.pvMaximo.valor === 15, `Vitalidade + Fibra deveriam dar 15 PV, deram ${c.pvMaximo.valor - antes.pvMaximo.valor}`);
  const pontos = pontosDePrestigio(depois, ctx);
  conferir(pontos.ganhos === 6, `Pontos ganhos: ${pontos.ganhos}`);
  linhas.push(
    `## ${veterano.nome}, Consagração`,
    "",
    `Compras: ${depois.compras.map((x) => x.tipo).join(", ")}. Saldo ${pontos.saldo} de ${pontos.ganhos}.`,
    "",
    ...resumo(c).map((l) => `- ${l}`),
    `- Habilidades: ${habilidadesDaFicha(depois, ctx).length}`,
    "",
  );
}

linhas.push(falhas.length ? `## Falhas\n\n${falhas.map((f) => `- ${f}`).join("\n")}` : "Tudo certo.", "");
const destino = join(pasta, "..", "aceite-ficha.md");
writeFileSync(destino, linhas.join("\n"));
console.log(`${classes.length} classes no nível 1 e 1 veterano. Relatório: ${destino}`);
if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
