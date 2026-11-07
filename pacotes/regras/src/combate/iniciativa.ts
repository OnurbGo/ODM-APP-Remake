import type { Carta, Combatente, OpcoesCampanha } from "@odm/protocolo";
import { posicaoDaCarta } from "./baralho";
import type { RegrasDoCombate } from "./contexto";

/* Jogador, Combate: "Iniciativa", "Desempate" e "Cartas especiais e seus efeitos". */

export type MotivoDoDesempate = "agilidade" | "naipe" | "nova_compra";
export type Empate = { ids: string[]; motivo: MotivoDoDesempate };

type Inscrito = Pick<Combatente, "id" | "carta" | "agilidade" | "usaEfeito" | "desempate">;

export type ResultadoIniciativa = {
  ordem: string[];
  /* Quem empatou e o que decidiu. */
  empates: Empate[];
  /* Grupos que ainda precisam comprar nova carta para desempatar. */
  pendentes: string[][];
};

function comparadores(regras: RegrasDoCombate, empate: OpcoesCampanha["empateIniciativa"]) {
  const ordem = regras.iniciativa.ordem;
  const naipes = regras.desempate.opcao_da_campanha.naipe;
  const carta = (a: Inscrito, b: Inscrito) => posicaoDaCarta(a.carta!.valor, ordem) - posicaoDaCarta(b.carta!.valor, ordem);
  const agilidade = (a: Inscrito, b: Inscrito) => b.agilidade - a.agilidade;
  const naipe = (a: Inscrito, b: Inscrito) => {
    const x = a.carta!.naipe ? naipes.indexOf(a.carta!.naipe) : -1;
    const y = b.carta!.naipe ? naipes.indexOf(b.carta!.naipe) : -1;
    return x < 0 || y < 0 ? 0 : x - y;
  };
  /* Nova compra: as cartas extras decidem, na ordem em que saíram. Sem carta ainda, empata. */
  const novaCompra = (a: Inscrito, b: Inscrito) => {
    for (let i = 0; i < Math.min(a.desempate.length, b.desempate.length); i++) {
      const d = posicaoDaCarta(a.desempate[i]!.valor, ordem) - posicaoDaCarta(b.desempate[i]!.valor, ordem);
      if (d) return d;
    }
    return 0;
  };
  /* Dois Coringas com a mesma Agilidade não têm naipe: nova compra, mantendo o Coringa. */
  const ultimo = (a: Inscrito, b: Inscrito) => {
    const coringas = a.carta!.naipe === null && b.carta!.naipe === null;
    return empate === "naipe" && !coringas ? naipe(a, b) : novaCompra(a, b);
  };
  return { carta, agilidade, ultimo, motivoFinal: (a: Inscrito, b: Inscrito): MotivoDoDesempate => (empate === "naipe" && !(a.carta!.naipe === null && b.carta!.naipe === null) ? "naipe" : "nova_compra") };
}

function ordenarGrupo(lista: Inscrito[], regras: RegrasDoCombate, empate: OpcoesCampanha["empateIniciativa"]) {
  const c = comparadores(regras, empate);
  const ordenada = [...lista].sort((a, b) => c.carta(a, b) || c.agilidade(a, b) || c.ultimo(a, b));
  const empates: Empate[] = [];
  const pendentes: string[][] = [];
  for (let i = 0; i < ordenada.length; ) {
    let j = i + 1;
    while (j < ordenada.length && c.carta(ordenada[i]!, ordenada[j]!) === 0) j++;
    const mesmaCarta = ordenada.slice(i, j);
    if (mesmaCarta.length > 1) {
      /* Dentro da mesma carta, cada grupo de mesma Agilidade vai ao último critério. */
      const agilidadesDiferentes = new Set(mesmaCarta.map((p) => p.agilidade)).size > 1;
      if (agilidadesDiferentes) empates.push({ ids: mesmaCarta.map((p) => p.id), motivo: "agilidade" });
      for (let k = 0; k < mesmaCarta.length; ) {
        let l = k + 1;
        while (l < mesmaCarta.length && mesmaCarta[l]!.agilidade === mesmaCarta[k]!.agilidade) l++;
        const grupo = mesmaCarta.slice(k, l);
        if (grupo.length > 1) {
          const motivo = c.motivoFinal(grupo[0]!, grupo[1]!);
          empates.push({ ids: grupo.map((p) => p.id), motivo });
          const aindaEmpatados = grupo.some((p, n) => n > 0 && c.ultimo(grupo[n - 1]!, p) === 0);
          if (aindaEmpatados) pendentes.push(grupo.map((p) => p.id));
        }
        k = l;
      }
    }
    i = j;
  }
  return { ids: ordenada.map((p) => p.id), empates, pendentes };
}

/* Quem usa o efeito da carta especial vai para o fim; entre esses, a carta maior age primeiro. */
export function ordenarIniciativa(inscritos: readonly Inscrito[], regras: RegrasDoCombate, empate: OpcoesCampanha["empateIniciativa"]): ResultadoIniciativa {
  const comCarta = inscritos.filter((p) => p.carta);
  const prioridade = ordenarGrupo(comCarta.filter((p) => !p.usaEfeito), regras, empate);
  const efeito = ordenarGrupo(comCarta.filter((p) => p.usaEfeito), regras, empate);
  return {
    ordem: [...prioridade.ids, ...efeito.ids],
    empates: [...prioridade.empates, ...efeito.empates],
    pendentes: [...prioridade.pendentes, ...efeito.pendentes],
  };
}

/* O que falta antes de "Começar combate": carta, escolha da carta especial e desempate por nova compra. */
export function pendenciasDaIniciativa(combatentes: readonly Combatente[], resultado: ResultadoIniciativa, ehEspecial: (c: Carta) => boolean) {
  const semCarta = combatentes.filter((c) => !c.carta && !c.cartasParaEscolher.length).map((c) => c.id);
  const escolhendoCarta = combatentes.filter((c) => !c.carta && c.cartasParaEscolher.length).map((c) => c.id);
  const decidindoEfeito = combatentes.filter((c) => c.carta && ehEspecial(c.carta) && c.usaEfeito === null).map((c) => c.id);
  return { semCarta, escolhendoCarta, decidindoEfeito, desempate: resultado.pendentes };
}

/* Coringa: troca a posição de dois alvos que não sejam quem usou, antes de quem usou ir para o fim. */
export function trocarPosicoes(ordem: readonly string[], a: string, b: string) {
  const copia = [...ordem];
  const i = copia.indexOf(a);
  const j = copia.indexOf(b);
  if (i < 0 || j < 0) return copia;
  [copia[i], copia[j]] = [copia[j]!, copia[i]!];
  return copia;
}
