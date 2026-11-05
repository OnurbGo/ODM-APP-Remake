import { useCallback, useEffect, useRef, useState } from "react";
import type { Atributo, Efeito } from "../dados/exemplo";
import { CARTAS_MESA, CARTAS_TESTE, type Carta, type Participante } from "../dados/baralho";
import { montarMesa, type AcaoCriatura, type Combatente } from "../dados/mesa";
import { resumoDados, type ModeloVantagem, type ModoRolagem } from "./useTeste";

/* Estado simulado do mestre: sem servidor e sem motor de regras. */

export type LinhaEscudo = { id: number; texto: string; desfeita?: boolean; podeDesfazer: boolean };

export type ConfigJogador = { id: string; dt: number; bonus: number; modo: ModoRolagem };

export type ConfigPedido = {
  origem: string;
  atributo: Atributo;
  dt: number;
  dtVisivel: boolean;
  efeito: Efeito | null;
  jogadores: ConfigJogador[];
};

export type ResultadoJogador = {
  id: string;
  nome: string;
  dt: number;
  estado: "aguardando" | "pronto";
  responde: "automatico" | "manual";
  sucesso?: boolean;
  conta?: string;
  efeitoAplicado?: boolean;
};

export type TesteAtivo = Omit<ConfigPedido, "jogadores"> & { resultados: ResultadoJogador[] };

const dado = (lados: number) => 1 + Math.floor(Math.random() * lados);

function rolarFormula(formula: string, dobrar: boolean) {
  const m = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(formula);
  if (!m) return 0;
  const qtd = Number(m[1]) * (dobrar ? 2 : 1);
  let soma = Number(m[3] ?? 0);
  for (let i = 0; i < qtd; i++) soma += dado(Number(m[2]));
  return soma;
}

const sinal = (n: number) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);

function resolver(j: Combatente, atributo: Atributo, cfg: ConfigJogador, modelo: ModeloVantagem) {
  const condicoes = j.condicoes ?? [];
  const automatica = condicoes.find((c) => c.falhaAutomatica);
  if (automatica && (atributo === "Brutalidade" || atributo === "Agilidade")) {
    return { sucesso: false, conta: `Falha automática por ${automatica.nome}` };
  }
  const { qtd, usaMaior, nota, cartas } = resumoDados(condicoes, cfg.modo, modelo);
  const dados = Array.from({ length: qtd }, () => dado(20));
  const natural = usaMaior ? Math.max(...dados) : Math.min(...dados);
  const mods = [j.resistencias?.[atributo] ?? 0, ...condicoes.flatMap((c) => (c.mod ? [c.mod] : [])), ...(cfg.bonus ? [cfg.bonus] : [])];
  if (cartas > 0) {
    const compradas = [...CARTAS_TESTE].sort(() => Math.random() - 0.5).slice(0, cartas);
    const maior = Math.max(...compradas.map((c) => c.mod));
    mods.push(usaMaior ? maior : -maior);
  }
  const total = natural + mods.reduce((a, b) => a + b, 0);
  const conta = `${natural} ${mods.map(sinal).join(" ")} = ${total}${nota ? ` · ${nota}` : ""}`;
  return { sucesso: total >= cfg.dt, conta };
}

export function useEscudo() {
  const [combatentes, definirCombatentes] = useState(() => montarMesa(false));
  const [vez, definirVez] = useState(1);
  const [rodada, definirRodada] = useState(3);
  const [selecionado, selecionar] = useState("andarilho");
  const [lotada, definirLotada] = useState(false);
  const [registro, definirRegistro] = useState<LinhaEscudo[]>([
    { id: 2, texto: "Zeca Tropeiro ficou Atordoado", podeDesfazer: false },
    { id: 1, texto: "Rodada 3 começou", podeDesfazer: false },
  ]);
  const [teste, definirTeste] = useState<TesteAtivo | null>(null);
  const [cartas, definirCartas] = useState<Record<string, Carta>>(CARTAS_MESA);
  const [modelo, definirModelo] = useState<ModeloVantagem>("dados");

  const contador = useRef(10);
  const inversos = useRef(new Map<number, { texto: string; desfazer: () => void }>());
  const atuais = useRef(combatentes);
  atuais.current = combatentes;
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const lista = timers.current;
    return () => lista.forEach(clearTimeout);
  }, []);

  const registrar = useCallback((texto: string, desfazer?: () => void) => {
    contador.current += 1;
    const id = contador.current;
    if (desfazer) inversos.current.set(id, { texto, desfazer });
    definirRegistro((r) => [{ id, texto, podeDesfazer: !!desfazer }, ...r]);
    return id;
  }, []);

  /* Cada evento guarda a própria reversão: o mestre desfaz qualquer um, em qualquer ordem. */
  const desfazer = useCallback(
    (id: number) => {
      const evento = inversos.current.get(id);
      if (!evento) return;
      evento.desfazer();
      inversos.current.delete(id);
      definirRegistro((r) => r.map((l) => (l.id === id ? { ...l, desfeita: true, podeDesfazer: false } : l)));
      registrar(`Desfeito pelo mestre: ${evento.texto}`);
    },
    [registrar],
  );

  const ajustarPV = useCallback((id: string, diferenca: number) => {
    definirCombatentes((lista) =>
      lista.map((c) => (c.id === id ? { ...c, pv: Math.max(0, Math.min(c.pvMax, c.pv + diferenca)) } : c)),
    );
  }, []);

  const mudarPV = useCallback(
    (id: string, diferenca: number, texto: string) => {
      const c = atuais.current.find((x) => x.id === id);
      if (!c) return;
      const real = Math.max(0, Math.min(c.pvMax, c.pv + diferenca)) - c.pv;
      ajustarPV(id, real);
      registrar(texto, () => ajustarPV(id, -real));
    },
    [ajustarPV, registrar],
  );

  const tirarEfeito = useCallback((id: string, efeitoId: string) => {
    definirCombatentes((lista) =>
      lista.map((c) => (c.id === id ? { ...c, efeitos: c.efeitos.filter((e) => e.id !== efeitoId) } : c)),
    );
  }, []);

  const porEfeito = useCallback((id: string, efeito: Efeito) => {
    definirCombatentes((lista) =>
      lista.map((c) => (c.id === id && !c.efeitos.some((e) => e.id === efeito.id) ? { ...c, efeitos: [...c.efeitos, efeito] } : c)),
    );
  }, []);

  const encerrarEfeito = useCallback(
    (id: string, efeito: Efeito) => {
      const nome = atuais.current.find((x) => x.id === id)?.nome;
      tirarEfeito(id, efeito.id);
      registrar(`${efeito.nome} encerrado em ${nome}`, () => porEfeito(id, efeito));
    },
    [porEfeito, registrar, tirarEfeito],
  );

  const proximoTurno = useCallback(() => {
    const lista = atuais.current;
    const anterior = vez;
    const rodadaAnterior = rodada;
    const proximo = (vez + 1) % lista.length;
    const virou = proximo === 0;
    const quem = lista[proximo];
    definirVez(proximo);
    selecionar(quem.id);
    if (virou) definirRodada((r) => r + 1);
    registrar(`Turno de ${quem.nome}`, () => {
      definirVez(anterior);
      definirRodada(rodadaAnterior);
    });
    /* Avançar o turno dispara os gatilhos de início de turno dos efeitos (seção 7.1). */
    const hemorragia = quem.efeitos.find((e) => e.id === "hemorragia");
    if (hemorragia) {
      const acumulos = hemorragia.acumulos ?? 1;
      let dano = 0;
      for (let i = 0; i < acumulos; i++) dano += dado(4);
      mudarPV(quem.id, -dano, `Início do turno de ${quem.nome}: Hemorragia causou ${dano} (${acumulos}d4)`);
    }
  }, [mudarPV, registrar, rodada, vez]);

  const usarAtaque = useCallback(
    (atacante: Combatente, acao: AcaoCriatura, alvoId: string) => {
      const ataque = acao.ataque;
      const alvo = atuais.current.find((x) => x.id === alvoId);
      if (!ataque || !alvo) return;
      const natural = dado(20);
      const total = natural + ataque.acerto;
      const critico = natural === 20;
      const acertou = critico || total >= alvo.defesa;
      const base = `${atacante.nome}: ${acao.nome} em ${alvo.nome}, ${total} contra Defesa ${alvo.defesa}`;
      const marca = critico ? ", acerto crítico" : natural === 1 ? ", falha crítica" : "";
      if (!acertou) {
        registrar(`${base}${marca}, errou`);
        return;
      }
      const dano = rolarFormula(ataque.dano, critico);
      mudarPV(alvoId, -dano, `${base}${marca}, ${dano} de dano ${ataque.tipo}`);
    },
    [mudarPV, registrar],
  );

  const aplicarDano = useCallback(
    (id: string, valor: number) => {
      const nome = atuais.current.find((x) => x.id === id)?.nome;
      mudarPV(id, -valor, `${nome} sofreu ${valor} de dano`);
    },
    [mudarPV],
  );

  const aplicarCura = useCallback(
    (id: string, valor: number) => {
      const nome = atuais.current.find((x) => x.id === id)?.nome;
      mudarPV(id, valor, `${nome} recuperou ${valor} PV`);
    },
    [mudarPV],
  );

  const enviarPedido = useCallback(
    ({ jogadores, ...resto }: ConfigPedido) => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      const resultados = jogadores.flatMap((cfg): ResultadoJogador[] => {
        const j = atuais.current.find((x) => x.id === cfg.id);
        return j ? [{ id: j.id, nome: j.nome, dt: cfg.dt, estado: "aguardando", responde: j.responde ?? "automatico" }] : [];
      });
      definirTeste({ ...resto, resultados });
      registrar(`Mestre pediu ${resto.atributo} a ${resultados.map((r) => r.nome).join(", ")}`);

      jogadores.forEach((cfg, i) => {
        const j = atuais.current.find((x) => x.id === cfg.id);
        if (!j) return;
        /* Sem esperar a animação do jogador; quem joga no manual responde depois, no pop-up. */
        const espera = j.responde === "manual" ? 4200 : 500 + i * 350;
        timers.current.push(
          window.setTimeout(() => {
            const r = resolver(j, resto.atributo, cfg, modelo);
            const aplicar = !r.sucesso && !!resto.efeito;
            definirTeste((t) =>
              t && {
                ...t,
                resultados: t.resultados.map((x) =>
                  x.id === cfg.id ? { ...x, estado: "pronto", sucesso: r.sucesso, conta: r.conta, efeitoAplicado: aplicar } : x,
                ),
              },
            );
            registrar(`${j.nome}: ${resto.atributo} (${r.conta}), ${r.sucesso ? "sucesso" : "falha"} contra DT ${cfg.dt}`);
            if (aplicar && resto.efeito) {
              const efeito = resto.efeito;
              porEfeito(j.id, efeito);
              registrar(`${j.nome} recebeu ${efeito.nome}`, () => tirarEfeito(j.id, efeito.id));
            }
          }, espera),
        );
      });
    },
    [modelo, porEfeito, registrar, tirarEfeito],
  );

  /* A compra de cartas define a ordem e recomeça a contagem de rodadas. */
  const aplicarIniciativa = useCallback(
    (ordem: Participante[]) => {
      const listaAntes = atuais.current;
      const vezAntes = vez;
      const rodadaAntes = rodada;
      const cartasAntes = cartas;
      const ids = ordem.map((p) => p.id);
      definirCombatentes((lista) => [
        ...ids.flatMap((id) => lista.filter((c) => c.id === id)),
        ...lista.filter((c) => !ids.includes(c.id)),
      ]);
      definirCartas(Object.fromEntries(ordem.map((p) => [p.id, p.carta])));
      definirVez(0);
      definirRodada(1);
      selecionar(ids[0]);
      registrar(`Iniciativa: ${ordem.map((p) => p.nome).join(", ")}`, () => {
        definirCombatentes(listaAntes);
        definirCartas(cartasAntes);
        definirVez(vezAntes);
        definirRodada(rodadaAntes);
      });
      ordem.filter((p) => p.usaEfeito).forEach((p) => registrar(`${p.nome} usou o efeito da carta e foi para o fim da ordem`));
    },
    [cartas, registrar, rodada, vez],
  );

  const alternarLotada = useCallback(() => {
    const nova = !lotada;
    definirLotada(nova);
    definirCombatentes(montarMesa(nova));
    definirVez(1);
    selecionar("andarilho");
  }, [lotada]);

  return {
    combatentes,
    vez,
    rodada,
    selecionado,
    selecionar,
    lotada,
    registro,
    teste,
    cartas,
    modelo,
    definirModelo,
    aplicarIniciativa,
    fecharTeste: () => definirTeste(null),
    desfazer,
    proximoTurno,
    usarAtaque,
    aplicarDano,
    aplicarCura,
    encerrarEfeito,
    enviarPedido,
    alternarLotada,
  };
}

export type Escudo = ReturnType<typeof useEscudo>;
