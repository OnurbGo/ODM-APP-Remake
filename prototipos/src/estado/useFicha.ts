import { useCallback, useMemo, useState } from "react";
import type { Atributo } from "../dados/exemplo";
import {
  ATRIBUTOS_INICIAIS,
  CENARIOS_CARGA,
  ITENS,
  TALENTOS_INICIAIS,
  type Item,
} from "../dados/ficha";

/* Estado simulado da ficha. Em Consagração, a Fibra comprada dá 1 PV máximo por nível de classe,
   até 10 (seção 6.2.1). Os demais números são exemplos e nada aqui é o motor de regras. */

export type Chave = "pv" | "defesa" | "deslocamento" | "proficiencia";

export type Compra = { texto: string; custo: number; antes: EstadoFicha };

export type SubiuNivel = {
  nivel: number;
  automatico: string[];
  escolha?: "talento" | "especializacao";
};

export type EstadoFicha = {
  fase: "escalada" | "consagracao";
  nivel: number;
  xp: number;
  xpProximo: number;
  saldo: number;
  ganhos: number;
  atributos: Record<Atributo, number>;
  pvBase: number;
  vitalidade: number;
  fibraComprada: number;
  avancadas: string[];
  lendarias: string[];
  talentos: string[];
  proficiencias: string[];
  especializacao: string | null;
  polivalencia: { ligada: boolean; pedido: string | null; classe: string | null };
  ajustes: Partial<Record<Chave, number>>;
  compras: Compra[];
  subiu: SubiuNivel | null;
  pendencia: "talento" | "especializacao" | null;
  honra: number;
  passos: boolean[];
  cartaDestino: boolean;
  itens: Item[];
  dinheiro: number;
  cargaAtual: number;
  notas: string;
};

function inicial(fase: EstadoFicha["fase"]): EstadoFicha {
  const consagracao = fase === "consagracao";
  return {
    fase,
    nivel: consagracao ? 10 : 6,
    xp: consagracao ? 112000 : 14300,
    xpProximo: consagracao ? 120000 : 23000,
    saldo: consagracao ? 1 : 0,
    ganhos: consagracao ? 3 : 0,
    atributos: ATRIBUTOS_INICIAIS,
    pvBase: consagracao ? 62 : 42,
    vitalidade: 0,
    fibraComprada: 0,
    avancadas: [],
    lendarias: [],
    talentos: TALENTOS_INICIAIS,
    proficiencias: [],
    especializacao: consagracao ? "Rastreadora" : null,
    polivalencia: { ligada: false, pedido: null, classe: null },
    ajustes: {},
    compras: [],
    subiu: null,
    pendencia: null,
    honra: 13,
    passos: [true, true, true, false, false, false],
    cartaDestino: true,
    itens: ITENS,
    dinheiro: 1240,
    cargaAtual: CENARIOS_CARGA[0].atual,
    notas: "Devo R$ 300 ao armazém de Vila Fictícia.\nO Xerife Bento sabe mais do que diz.",
  };
}

const PASSOS_NIVEL: Record<number, Omit<SubiuNivel, "nivel">> = {
  7: { automatico: ["Instinto de Caçada (característica de exemplo)", "+6 PV máximos"], escolha: "especializacao" },
  8: { automatico: ["+6 PV máximos"], escolha: "talento" },
  9: { automatico: ["Olhos de Coruja (habilidade da especialização)", "+6 PV máximos"] },
  10: { automatico: ["+6 PV máximos", "Daqui em diante o XP vira Pontos de Prestígio"] },
};

export function useFicha(faseInicial: EstadoFicha["fase"] = "escalada") {
  const [estado, definir] = useState(() => inicial(faseInicial));

  const comprar = useCallback((texto: string, custo: number, mudanca: (e: EstadoFicha) => Partial<EstadoFicha>) => {
    definir((e) => ({
      ...e,
      ...mudanca(e),
      saldo: e.saldo - custo,
      compras: [...e.compras, { texto, custo, antes: e }],
    }));
  }, []);

  const desfazerCompra = useCallback(() => {
    definir((e) => e.compras.at(-1)?.antes ?? e);
  }, []);

  const comprarAvancada = useCallback(
    (nome: string) => comprar(`Técnica Avançada: ${nome}`, 1, (e) => ({ avancadas: [...e.avancadas, nome] })),
    [comprar],
  );
  const comprarLendaria = useCallback(
    (nome: string) => comprar(`Técnica Lendária: ${nome}`, 2, (e) => ({ lendarias: [...e.lendarias, nome] })),
    [comprar],
  );
  const comprarTalento = useCallback(
    (nome: string) => comprar(`Talento: ${nome}`, 1, (e) => ({ talentos: [...e.talentos, nome] })),
    [comprar],
  );
  const comprarProficiencia = useCallback(
    (nome: string) => comprar(`Proficiência: ${nome}`, 1, (e) => ({ proficiencias: [...e.proficiencias, nome] })),
    [comprar],
  );
  const comprarTreinamento = useCallback(
    (atributo: Atributo) =>
      comprar(`Treinamento Pesado: +1 ${atributo}`, 1, (e) => ({
        atributos: { ...e.atributos, [atributo]: e.atributos[atributo] + 1 },
        fibraComprada: e.fibraComprada + (atributo === "Fibra" ? 1 : 0),
      })),
    [comprar],
  );
  const comprarVitalidade = useCallback(
    () => comprar("Vitalidade Aprimorada: +5 PV máx.", 1, (e) => ({ vitalidade: e.vitalidade + 1 })),
    [comprar],
  );

  /* Os requisitos o app confere; a justificativa narrativa fica com o mestre, que aprova. */
  const pedirPolivalencia = useCallback((classe: string) => {
    definir((e) => ({ ...e, polivalencia: { ...e.polivalencia, pedido: classe } }));
  }, []);

  const mestreAprova = useCallback(() => {
    definir((e) => {
      const classe = e.polivalencia.pedido;
      if (!classe) return e;
      return {
        ...e,
        saldo: e.saldo - 2,
        polivalencia: { ...e.polivalencia, pedido: null, classe },
        compras: [...e.compras, { texto: `Polivalência: ${classe} 1`, custo: 2, antes: e }],
      };
    });
  }, []);

  const ajustar = useCallback((chave: Chave, valor: number) => {
    definir((e) => ({ ...e, ajustes: { ...e.ajustes, [chave]: valor } }));
  }, []);

  /* O XP só chega pelo app ou pelo mestre; o jogador nunca o edita. */
  const receberXP = useCallback(() => {
    definir((e) => {
      if (e.fase === "consagracao") return { ...e, saldo: e.saldo + 1, ganhos: e.ganhos + 1, xp: e.xp + 8000, xpProximo: e.xpProximo + 8000 };
      const nivel = e.nivel + 1;
      const passo = PASSOS_NIVEL[nivel];
      if (!passo) return { ...e, fase: "consagracao", saldo: 1, ganhos: 1 };
      return {
        ...e,
        nivel,
        xp: e.xpProximo,
        xpProximo: e.xpProximo + 9000,
        pvBase: e.pvBase + 6,
        subiu: { nivel, ...passo },
        pendencia: passo.escolha ?? e.pendencia,
      };
    });
  }, []);

  const fecharSubiu = useCallback(() => definir((e) => ({ ...e, subiu: null })), []);

  const reabrirEscolha = useCallback(() => {
    definir((e) => (e.pendencia ? { ...e, subiu: { nivel: e.nivel, automatico: [], escolha: e.pendencia } } : e));
  }, []);

  const escolherNivel = useCallback((nome: string) => {
    definir((e) =>
      e.pendencia === "talento"
        ? { ...e, talentos: [...e.talentos, nome], pendencia: null, subiu: null }
        : { ...e, especializacao: nome, pendencia: null, subiu: null },
    );
  }, []);

  const alternarPasso = useCallback((i: number) => {
    definir((e) => {
      const passos = e.passos.map((v, j) => (j === i ? !v : v));
      return { ...e, passos, cartaDestino: !e.passos[i] ? true : e.cartaDestino };
    });
  }, []);

  const usarItem = useCallback((id: string) => {
    definir((e) => ({
      ...e,
      itens: e.itens.flatMap((i) => (i.id !== id ? [i] : i.qtd > 1 ? [{ ...i, qtd: i.qtd - 1 }] : [])),
    }));
  }, []);

  const definirNotas = useCallback((notas: string) => definir((e) => ({ ...e, notas })), []);
  const definirSaldo = useCallback((saldo: number) => definir((e) => ({ ...e, saldo })), []);
  const definirCarga = useCallback((cargaAtual: number) => definir((e) => ({ ...e, cargaAtual })), []);
  const definirFase = useCallback((fase: EstadoFicha["fase"]) => definir(() => inicial(fase)), []);
  const alternarPolivalencia = useCallback(
    () => definir((e) => ({ ...e, polivalencia: { ...e.polivalencia, ligada: !e.polivalencia.ligada } })),
    [],
  );
  const alternarAvancada = useCallback(
    () => definir((e) => ({ ...e, avancadas: e.avancadas.length ? [] : ["Tiro no Escuro"] })),
    [],
  );
  const atributoNoMaximo = useCallback(
    () => definir((e) => ({ ...e, atributos: { ...e.atributos, Agilidade: e.atributos.Agilidade === 5 ? 3 : 5 } })),
    [],
  );

  const contas = useMemo(() => {
    const e = estado;
    const pv = [`${e.pvBase} pela classe e pelo nível (exemplo)`];
    if (e.vitalidade) pv.push(`+${e.vitalidade * 5} Vitalidade Aprimorada`);
    if (e.fibraComprada) pv.push(`+${Math.min(e.nivel, 10) * e.fibraComprada} Fibra comprada com Prestígio`);
    const base = e.pvBase + e.vitalidade * 5 + Math.min(e.nivel, 10) * e.fibraComprada;
    return {
      pv: { titulo: "PV máximo", valor: base, linhas: pv },
      defesa: { titulo: "Defesa", valor: 13 + e.atributos.Agilidade - 1, linhas: ["10 base", `+${e.atributos.Agilidade} Agilidade`, "+2 armadura", "−1 Exaustão 1"] },
      deslocamento: { titulo: "Deslocamento", valor: 9, linhas: ["9 m base (exemplo)"], unidade: " m" },
      proficiencia: { titulo: "Bônus de proficiência", valor: 3, linhas: ["Valor de exemplo para este nível"] },
    } satisfies Record<Chave, { titulo: string; valor: number; linhas: string[]; unidade?: string }>;
  }, [estado]);

  return {
    estado,
    contas,
    comprarAvancada,
    comprarLendaria,
    comprarTalento,
    comprarProficiencia,
    comprarTreinamento,
    comprarVitalidade,
    desfazerCompra,
    pedirPolivalencia,
    mestreAprova,
    ajustar,
    receberXP,
    fecharSubiu,
    reabrirEscolha,
    escolherNivel,
    alternarPasso,
    usarItem,
    definirNotas,
    definirSaldo,
    definirCarga,
    definirFase,
    alternarPolivalencia,
    alternarAvancada,
    atributoNoMaximo,
  };
}

export type Ficha = ReturnType<typeof useFicha>;
