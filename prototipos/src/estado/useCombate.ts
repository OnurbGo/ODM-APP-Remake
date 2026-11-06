import type { EstadoPA } from "@odm/estilo";
import { useCallback, useRef, useState } from "react";
import { EFEITOS, EFEITOS_EXTRAS, FICHAS, HABILIDADES, INICIATIVA, type Efeito, type Habilidade } from "../dados/exemplo";

/* Estado simulado, sem servidor e sem motor de regras. Só existe para mostrar o fluxo. */

export type Cenario = "turno" | "fora" | "pa-perdido" | "pa-extra" | "estresse" | "morrendo" | "lotado";

export const CENARIOS: { id: Cenario; rotulo: string }[] = [
  { id: "turno", rotulo: "Seu turno" },
  { id: "fora", rotulo: "Fora do turno" },
  { id: "pa-perdido", rotulo: "Efeito tirou 1 PA" },
  { id: "pa-extra", rotulo: "PA a mais" },
  { id: "estresse", rotulo: "Estresse ativo" },
  { id: "morrendo", rotulo: "Morrendo" },
  { id: "lotado", rotulo: "Tudo lotado" },
];

export type LinhaRegistro = { id: number; texto: string; tipo?: "acao" | "teste"; desfeita?: boolean };

export type Estado = {
  cenario: Cenario;
  vez: string;
  pv: number;
  pvMax: number;
  pvTemp: number;
  exaustao: number;
  estresse: { atual: number; maximo: number } | null;
  morte: { sucessos: number; falhas: number } | null;
  pa: EstadoPA[];
  fichas: typeof FICHAS;
  efeitos: Efeito[];
  habilidades: Habilidade[];
  automatico: boolean;
};

export type Salto = { chave: number; tipo: "dano" | "cura"; valor: number };

function montar(cenario: Cenario): Estado {
  const base: Estado = {
    cenario,
    vez: "inacia",
    pv: 27,
    pvMax: 42,
    pvTemp: 5,
    exaustao: 1,
    estresse: null,
    morte: null,
    pa: ["disponivel", "disponivel", "disponivel"],
    fichas: FICHAS,
    efeitos: EFEITOS,
    habilidades: HABILIDADES,
    automatico: false,
  };
  switch (cenario) {
    case "fora":
      return { ...base, vez: "lucia", pa: ["gasto", "guardado", "guardado"] };
    case "pa-perdido":
      return { ...base, pa: ["disponivel", "disponivel", "bloqueado"] };
    case "pa-extra":
      return { ...base, pa: ["disponivel", "disponivel", "disponivel", "disponivel"] };
    case "estresse":
      return { ...base, estresse: { atual: 4, maximo: 8 } };
    case "morrendo":
      return { ...base, pv: 0, pvTemp: 0, exaustao: 2, morte: { sucessos: 1, falhas: 2 }, pa: [] };
    case "lotado":
      return {
        ...base,
        exaustao: 4,
        estresse: { atual: 7, maximo: 8 },
        pa: ["disponivel", "disponivel", "disponivel", "guardado", "guardado"],
        fichas: [...FICHAS, { id: "mana", nome: "Ficha de Mana", atual: 11, maximo: 14 }],
        efeitos: [...EFEITOS, ...EFEITOS_EXTRAS],
      };
    default:
      return base;
  }
}

export function useCombate() {
  const [estado, definir] = useState<Estado>(() => montar("turno"));
  const [registro, definirRegistro] = useState<LinhaRegistro[]>([
    { id: 7, texto: "Inácia Brasa sofreu 5 de dano" },
    { id: 6, texto: "Andarilho Podre atacou Inácia Brasa" },
    { id: 5, texto: "Zeca Tropeiro usou Ficha de Adrenalina" },
    { id: 4, texto: "Rodada 3 começou" },
    { id: 3, texto: "Bando de Carniças avançou" },
    { id: 2, texto: "Irmã Lúcia passou o turno" },
    { id: 1, texto: "Inácia Brasa ficou Envenenada" },
  ]);
  const [aviso, definirAviso] = useState<{ chave: number; texto: string; desfazivel: boolean } | null>(null);
  const [salto, definirSalto] = useState<Salto | null>(null);
  const historico = useRef<{ estado: Estado; texto: string; linha: number }[]>([]);
  const contador = useRef(10);
  const estadoAtual = useRef(estado);
  estadoAtual.current = estado;

  const registrar = useCallback((texto: string, tipo?: LinhaRegistro["tipo"]) => {
    contador.current += 1;
    const id = contador.current;
    definirRegistro((r) => [{ id, texto, tipo }, ...r]);
    return id;
  }, []);

  const avisar = useCallback((texto: string, desfazivel: boolean) => {
    definirAviso({ chave: Date.now(), texto, desfazivel });
  }, []);

  /* Toda ação passa por aqui: entra no registro e pode ser desfeita até o fim do turno. */
  const aplicar = useCallback(
    (texto: string, mudanca: (e: Estado) => Estado) => {
      const linha = registrar(texto, "acao");
      historico.current.push({ estado: estadoAtual.current, texto, linha });
      definir(mudanca);
      avisar(texto, true);
    },
    [avisar, registrar],
  );

  const desfazer = useCallback(() => {
    const ultimo = historico.current.pop();
    if (!ultimo) return;
    definir(ultimo.estado);
    /* Nada é apagado: a linha fica riscada e o desfazer vira um evento novo (seção 5.2). */
    definirRegistro((r) => r.map((l) => (l.id === ultimo.linha ? { ...l, desfeita: true } : l)));
    registrar(`Desfeito por Inácia Brasa: ${ultimo.texto}`);
    avisar("Ação desfeita", false);
  }, [avisar, registrar]);

  const escolherCenario = useCallback((cenario: Cenario) => {
    historico.current = [];
    definir((e) => ({ ...montar(cenario), automatico: e.automatico }));
    definirAviso(null);
  }, []);

  const gastarPA = useCallback(
    (indice: number) => {
      aplicar("Gastou 1 PA", (e) => ({ ...e, pa: e.pa.map((v, i) => (i === indice ? "gasto" : v)) }));
    },
    [aplicar],
  );

  const encerrarTurno = useCallback(() => {
    definir((e) => ({
      ...e,
      vez: "lucia",
      pa: e.pa.map((v) => (v === "disponivel" ? "guardado" : v)),
    }));
    historico.current = [];
    registrar("Inácia Brasa encerrou o turno");
    avisar("Turno encerrado. PA restantes ficam guardados até o fim da rodada.", false);
  }, [avisar, registrar]);

  const mudarFicha = useCallback(
    (id: string, diferenca: 1 | -1) => {
      const nome = FICHAS.find((f) => f.id === id)?.nome ?? "Ficha";
      aplicar(`${diferenca < 0 ? "Gastou" : "Recuperou"} 1 ${nome}`, (e) => ({
        ...e,
        fichas: e.fichas.map((f) => (f.id === id ? { ...f, atual: f.atual + diferenca } : f)),
      }));
    },
    [aplicar],
  );

  const usarAcaoEfeito = useCallback(
    (efeito: Efeito) => {
      const acao = efeito.acao;
      if (!acao) return;
      aplicar(`Usou ${acao.nome} em ${efeito.nome}`, (e) => ({
        ...e,
        pa: gastarDe(e.pa, acao.custoPA),
        efeitos: e.efeitos.flatMap((x) => {
          if (x.id !== efeito.id) return [x];
          const acumulos = (x.acumulos ?? 1) - 1;
          return acumulos > 0 ? [{ ...x, acumulos }] : [];
        }),
      }));
    },
    [aplicar],
  );

  const encerrarEfeito = useCallback(
    (efeito: Efeito) => {
      aplicar(`Encerrou ${efeito.nome}`, (e) => ({ ...e, efeitos: e.efeitos.filter((x) => x.id !== efeito.id) }));
    },
    [aplicar],
  );

  const usarHabilidade = useCallback(
    (habilidade: Habilidade) => {
      aplicar(`Usou ${habilidade.nome}`, (e) => ({
        ...e,
        pa: gastarDe(e.pa, habilidade.pa ?? 0),
        habilidades: e.habilidades.map((h) => (h.id === habilidade.id ? { ...h, usada: true } : h)),
      }));
    },
    [aplicar],
  );

  const aplicarEfeito = useCallback(
    (efeito: Efeito) => {
      aplicar(`Recebeu ${efeito.nome}`, (e) =>
        e.efeitos.some((x) => x.id === efeito.id) ? e : { ...e, efeitos: [...e.efeitos, efeito] },
      );
    },
    [aplicar],
  );

  const anotar = useCallback((texto: string) => registrar(texto, "teste"), [registrar]);

  const definirAutomatico = useCallback((automatico: boolean) => {
    definir((e) => ({ ...e, automatico }));
  }, []);

  const simularVida = useCallback(
    (tipo: "dano" | "cura", valor: number) => {
      contador.current += 1;
      definirSalto({ chave: contador.current, tipo, valor });
      definir((e) => {
        if (tipo === "cura") return { ...e, pv: Math.min(e.pvMax, e.pv + valor) };
        const absorvido = Math.min(e.pvTemp, valor);
        return { ...e, pvTemp: e.pvTemp - absorvido, pv: Math.max(0, e.pv - (valor - absorvido)) };
      });
      registrar(tipo === "dano" ? `Sofreu ${valor} de dano (simulado)` : `Recuperou ${valor} PV (simulado)`);
    },
    [registrar],
  );

  const testar = useCallback(
    (nome: string, bonus: number) => {
      const dado = 1 + Math.floor(Math.random() * 20);
      const sinal = bonus < 0 ? "−" : "+";
      const texto = `${nome}: ${dado} ${sinal} ${Math.abs(bonus)} = ${dado + bonus} (simulado)`;
      registrar(texto, "teste");
      avisar(texto, false);
    },
    [avisar, registrar],
  );

  return {
    estado,
    registro,
    aviso,
    salto,
    ultimaDesfazivel: historico.current.at(-1)?.texto,
    linhaDesfazivel: historico.current.at(-1)?.linha,
    limparAviso: () => definirAviso(null),
    limparSalto: () => definirSalto(null),
    desfazer,
    escolherCenario,
    gastarPA,
    encerrarTurno,
    mudarFicha,
    usarAcaoEfeito,
    encerrarEfeito,
    usarHabilidade,
    aplicarEfeito,
    anotar,
    definirAutomatico,
    simularVida,
    testar,
  };
}

export type Combate = ReturnType<typeof useCombate>;

function gastarDe(pa: EstadoPA[], quantos: number) {
  const saida = [...pa];
  for (let n = 0; n < quantos; n++) {
    let i = saida.indexOf("disponivel");
    if (i < 0) i = saida.indexOf("guardado");
    if (i >= 0) saida[i] = "gasto";
  }
  return saida;
}

export function paLivres(pa: EstadoPA[]) {
  return pa.filter((v) => v === "disponivel" || v === "guardado").length;
}

export function proximo(vez: string) {
  const i = INICIATIVA.findIndex((c) => c.id === vez);
  return INICIATIVA[(i + 1) % INICIATIVA.length];
}

export function atual(vez: string) {
  return INICIATIVA.find((c) => c.id === vez) ?? INICIATIVA[0];
}
