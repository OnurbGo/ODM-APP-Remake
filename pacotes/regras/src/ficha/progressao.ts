import type { Classe, Habilidade, MecanicaClasse, NivelClasse, Recurso } from "@odm/conteudo";
import type { CompraPrestigio, FichaDados } from "@odm/protocolo";
import type { ContextoFicha, RegrasFicha } from "./contexto";

/* Escalada: níveis 1 a 10. Consagração: daí em diante o XP só dá Pontos de Prestígio (Jogador, Progressão). */
export const NIVEL_MAXIMO_DE_CLASSE = 10;

export function nivelDoXp(xp: number, regras: RegrasFicha) {
  let nivel = 1;
  for (const [n, necessario] of Object.entries(regras.xp.xp_por_nivel)) {
    if (xp >= necessario && Number(n) > nivel) nivel = Number(n);
  }
  return Math.min(nivel, regras.xp.nivel_maximo);
}

export function xpDoProximoNivel(nivel: number, regras: RegrasFicha) {
  return regras.xp.xp_por_nivel[String(nivel + 1)] ?? null;
}

export function bonusDeProficiencia(nivel: number, regras: RegrasFicha) {
  const faixa = regras.proficiencia.faixas.find((f) => nivel >= f.de && nivel <= f.ate);
  if (!faixa) throw new RangeError(`Nível sem bônus de proficiência: ${nivel}`);
  return faixa.bonus;
}

export const nivelDeClasse = (nivel: number) => Math.min(nivel, NIVEL_MAXIMO_DE_CLASSE);

export function mecanicaDaClasse(ficha: FichaDados, ctx: ContextoFicha): MecanicaClasse | null {
  return (ficha.classeId && ctx.classes.get(ficha.classeId)?.mecanica) || null;
}

/* Linhas da tabela da classe alcançadas, em ordem. */
export function niveisAlcancados(mecanica: MecanicaClasse, nivel: number): [number, NivelClasse][] {
  return Object.entries(mecanica.niveis)
    .map(([n, dados]): [number, NivelClasse] => [Number(n), dados])
    .filter(([n]) => n <= nivelDeClasse(nivel))
    .sort(([a], [b]) => a - b);
}

/* ---------- Prestígio ---------- */

export function custoDaCompra(compra: CompraPrestigio, regras: RegrasFicha) {
  const id = compra.tipo === "talento" || compra.tipo === "proficiencia" ? "talento_ou_proficiencia" : compra.tipo;
  const opcao = regras.prestigio.opcoes.find((o) => o.id === id);
  if (!opcao) throw new Error(`Compra sem preço: ${compra.tipo}`);
  return opcao.custo;
}

export function pontosDePrestigio(ficha: FichaDados, ctx: ContextoFicha) {
  const { de, ate } = ctx.regras.prestigio.pontos.um_por_nivel_alcancado;
  const nivel = nivelDoXp(ficha.xp, ctx.regras);
  const peloXp = Math.max(0, Math.min(nivel, ate) - de + 1);
  const ganhos = peloXp + ficha.prestigioDoMestre;
  const gastos = ficha.compras.reduce((soma, c) => soma + custoDaCompra(c, ctx.regras), 0);
  return { ganhos, gastos, saldo: ganhos - gastos, totalPossivel: ate - de + 1 };
}

/* ---------- O que falta escolher ---------- */

export type Pendencia =
  | { tipo: "especializacao"; nivel: number }
  | { tipo: "talento"; nivel: number }
  | { tipo: "escolha"; nivel: number; rotulo: string; quantidade: number; opcoes: string[] };

export function pendenciasDeNivel(ficha: FichaDados, ctx: ContextoFicha): Pendencia[] {
  const mecanica = mecanicaDaClasse(ficha, ctx);
  if (!mecanica) return [];
  const nivel = nivelDoXp(ficha.xp, ctx.regras);
  const pendencias: Pendencia[] = [];
  for (const [n, dados] of niveisAlcancados(mecanica, nivel)) {
    if (dados.especializacao && !ficha.especializacaoId) pendencias.push({ tipo: "especializacao", nivel: n });
    if (dados.talento && !ficha.talentos.some((t) => t.nivel === n)) pendencias.push({ tipo: "talento", nivel: n });
    if (dados.escolher) {
      const feitas = ficha.escolhasDeNivel[String(n)]?.length ?? 0;
      if (feitas < dados.escolher.quantidade) {
        const lista = mecanica.listas?.[dados.escolher.de] ?? [];
        const jaTem = new Set(Object.values(ficha.escolhasDeNivel).flat());
        pendencias.push({
          tipo: "escolha",
          nivel: n,
          rotulo: dados.escolher.rotulo,
          quantidade: dados.escolher.quantidade - feitas,
          opcoes: lista.filter((id) => !jaTem.has(id)),
        });
      }
    }
  }
  return pendencias;
}

/* ---------- O que cada nível entrega ---------- */

export type EntregaDeNivel = {
  nivel: number;
  automatico: { id: string; nome: string }[];
  pedeEspecializacao: boolean;
  pedeTalento: boolean;
  pedeEscolha: string | null;
  pontoDePrestigio: boolean;
  pvPorNivel: number | null;
};

function nomeDe(id: string, habilidades: ReadonlyMap<string, Habilidade>, recursos: ReadonlyMap<string, Recurso>) {
  return habilidades.get(id)?.nome ?? recursos.get(id)?.nome ?? id;
}

/* Para o aviso "Subiu de nível". O PV sai da conta da ficha; aqui vai só a parte da classe, sem o modificador. */
export function entregaDoNivel(classe: Classe, nivel: number, especializacaoId: string | null, ctx: ContextoFicha): EntregaDeNivel {
  const mecanica = classe.mecanica;
  const dados = mecanica?.niveis[String(nivel)] ?? {};
  const escolhida = especializacaoId ? ctx.especializacoes.get(especializacaoId)?.nome : null;
  const daEspecializacao = dados.habilidades_de_especializacao
    ? [...ctx.habilidades.values()].filter((h) => h.classe === classe.nome && h.especializacao === escolhida && h.nivel === nivel && !h.tecnica)
    : [];
  return {
    nivel,
    automatico: [
      ...(dados.ganha ?? []).map((id) => ({ id, nome: nomeDe(id, ctx.habilidades, ctx.recursos) })),
      ...daEspecializacao.map((h) => ({ id: h.id, nome: h.nome })),
    ],
    pedeEspecializacao: !!dados.especializacao && !especializacaoId,
    pedeTalento: !!dados.talento,
    pedeEscolha: dados.escolher?.rotulo ?? null,
    pontoDePrestigio: nivel > NIVEL_MAXIMO_DE_CLASSE,
    pvPorNivel: nivel > 1 && nivel <= NIVEL_MAXIMO_DE_CLASSE ? (mecanica?.pv.por_nivel ?? null) : null,
  };
}
