import { prepararD20, type DadosRolagem, type ModificadorRolagem } from "@odm/estilo";
import { useCallback, useRef, useState } from "react";
import { ARMA, RESISTENCIAS_VALOR, type Efeito } from "../dados/exemplo";
import { CARTAS_TESTE, type CartaTeste } from "../dados/baralho";
import { BONUS_HABILIDADE, DEFESA_OCULTA, type Condicao, type PedidoTeste } from "../dados/testes";
import { paLivres, type Combate } from "./useCombate";

/* Simulação descartável do que o motor de regras fará na fase 5. Segue os dois modelos de
   "Vantagem e Desvantagem" do Livro do Jogador: Dados Extras e Cartas. */

export type ModoRolagem = "normal" | "vantagem" | "desvantagem";
export type ModeloVantagem = "dados" | "cartas";

export type Escolhas = { ajuste: number; modo: ModoRolagem; habilidade: string | null };

const ESCOLHAS_PADRAO: Escolhas = { ajuste: 0, modo: "normal", habilidade: null };

const d20 = () => 1 + Math.floor(Math.random() * 20);

/* Vantagem e desvantagem se anulam em igual quantidade; duas ou mais fontes do que sobrar: 3d20. */
export function resumoDados(condicoes: Condicao[], modo: ModoRolagem, modelo: ModeloVantagem = "dados") {
  const vantagens = condicoes.filter((c) => c.vantagem).length + (modo === "vantagem" ? 1 : 0);
  const desvantagens = condicoes.filter((c) => c.desvantagem).length + (modo === "desvantagem" ? 1 : 0);
  const saldo = vantagens - desvantagens;
  const usaMaior = saldo > 0;
  if (saldo === 0) {
    return { qtd: 1, usaMaior, nota: vantagens > 0 ? "Vantagem e desvantagem se anulam" : undefined, cartas: 0 };
  }
  if (modelo === "cartas") {
    const cartas = Math.abs(saldo) === 1 ? 1 : 2;
    const quantas = cartas === 1 ? "compre 1 carta" : "compre 2 cartas e use a maior";
    return { qtd: 1, usaMaior, nota: `${usaMaior ? "Vantagem" : "Desvantagem"}: ${quantas}`, cartas };
  }
  const qtd = Math.abs(saldo) === 1 ? 2 : 3;
  return { qtd, usaMaior, nota: `${usaMaior ? "Vantagem: maior" : "Desvantagem: menor"} de ${qtd}d20`, cartas: 0 };
}

/* Compra entre as cartas de exemplo; com duas, vale a de maior modificador. */
function comprarCartas(qtd: number): CartaTeste[] {
  return [...CARTAS_TESTE].sort(() => Math.random() - 0.5).slice(0, qtd);
}

function montarRolagem(pedido: PedidoTeste, escolhas: Escolhas, modelo: ModeloVantagem, nomeHabilidade?: string): DadosRolagem {
  const titulo = `Teste de resistência de ${pedido.atributo}`;
  const alvo = { rotulo: "DT", valor: pedido.dtVisivel ? pedido.dt : null };
  const automatica = pedido.condicoes.find((c) => c.falhaAutomatica);

  if (automatica) {
    return {
      titulo,
      subtitulo: pedido.origem,
      dados: [],
      escolhido: 0,
      modificadores: [],
      total: 0,
      alvo,
      resultado: { texto: "Falha", bom: false },
      notaFinal: `Falha automática por ${automatica.nome}`,
    };
  }

  const { qtd, usaMaior, nota, cartas } = resumoDados(pedido.condicoes, escolhas.modo, modelo);
  const compradas = comprarCartas(cartas);
  const melhorCarta = compradas.length ? compradas.reduce((a, b) => (b.mod > a.mod ? b : a)) : null;
  const dados = Array.from({ length: qtd }, (_, i) => pedido.dados?.[i] ?? d20());
  const melhor = usaMaior ? Math.max(...dados) : Math.min(...dados);
  const escolhido = dados.indexOf(melhor);

  const modificadores: ModificadorRolagem[] = [{ rotulo: pedido.atributo, valor: RESISTENCIAS_VALOR[pedido.atributo] }];
  for (const c of pedido.condicoes) if (c.mod) modificadores.push({ rotulo: c.nome, valor: c.mod });
  if (nomeHabilidade) modificadores.push({ rotulo: nomeHabilidade, valor: BONUS_HABILIDADE });
  if (escolhas.ajuste) modificadores.push({ rotulo: "Ajuste", valor: escolhas.ajuste });
  if (melhorCarta) modificadores.push({ rotulo: "Carta", valor: usaMaior ? melhorCarta.mod : -melhorCarta.mod });

  const total = melhor + modificadores.reduce((soma, m) => soma + m.valor, 0);
  const sucesso = total >= pedido.dt;

  return {
    titulo,
    subtitulo: pedido.origem,
    dados,
    escolhido,
    notaDados: nota,
    cartas: compradas.map((c) => ({ valor: c.valor, naipe: c.naipe, valeu: c === melhorCarta })),
    modificadores,
    total,
    alvo,
    resultado: { texto: sucesso ? "Sucesso" : "Falha", bom: sucesso },
    /* Em resistência, 20 e 1 só ganham destaque: quem decide é o total contra a DT. */
    destaqueNatural: melhor === 20 ? "alto" : melhor === 1 ? "baixo" : undefined,
    notaNatural: melhor === 20 ? "20 natural" : melhor === 1 ? "1 natural" : undefined,
  };
}

function montarAtaque(dado: number): DadosRolagem {
  const modificadores = [{ rotulo: "Acerto", valor: ARMA.acerto }];
  const total = dado + ARMA.acerto;
  const critico = dado === 20;
  const acertou = critico || total >= DEFESA_OCULTA;
  return {
    titulo: `Ataque com ${ARMA.nome}`,
    subtitulo: "Contra Andarilho Podre",
    dados: [dado],
    escolhido: 0,
    modificadores,
    total,
    alvo: { rotulo: "Defesa", valor: null },
    resultado: { texto: critico ? "Acerto crítico" : acertou ? "Acertou" : "Errou", bom: acertou },
    destaqueNatural: critico ? "alto" : dado === 1 ? "baixo" : undefined,
    notaNatural: critico ? "20 natural" : dado === 1 ? "Falha crítica" : undefined,
    /* Acerto Crítico: o dobro dos dados, somando os bônus normalmente. */
    notaFinal: critico ? "Dano: 2d8+3 (o dobro dos dados, bônus normal)" : acertou ? `Dano: ${ARMA.dano}` : undefined,
  };
}

function montarRapido(nome: string, bonus: number): DadosRolagem {
  const dado = d20();
  return {
    titulo: nome,
    dados: [dado],
    escolhido: 0,
    modificadores: [{ rotulo: "Bônus", valor: bonus }],
    total: dado + bonus,
    destaqueNatural: dado === 20 ? "alto" : dado === 1 ? "baixo" : undefined,
    notaNatural: dado === 20 ? "20 natural" : dado === 1 ? "1 natural" : undefined,
  };
}

export function useTeste(combate: Combate) {
  const [pedido, definirPedido] = useState<PedidoTeste | null>(null);
  const [fase, definirFase] = useState<"popup" | "pergunta" | null>(null);
  const [rolagem, definirRolagem] = useState<DadosRolagem | null>(null);
  const [fecharSozinho, definirFecharSozinho] = useState(false);
  const [rapida, definirRapida] = useState(false);
  const [semTresD, definirSemTresD] = useState(false);
  const [modelo, definirModelo] = useState<ModeloVantagem>("dados");
  const efeitoPendente = useRef<Efeito | null>(null);

  const habilidadesDo = useCallback(
    (p: PedidoTeste) => combate.estado.habilidades.filter((h) => p.habilidades.includes(h.id)),
    [combate.estado.habilidades],
  );

  const rolar = useCallback(
    (p: PedidoTeste, escolhas: Escolhas, automatico: boolean) => {
      const habilidade = combate.estado.habilidades.find((h) => h.id === escolhas.habilidade);
      if (habilidade) combate.usarHabilidade(habilidade);
      const nova = montarRolagem(p, escolhas, modelo, habilidade?.nome);
      efeitoPendente.current = nova.resultado?.bom ? null : (p.efeitoNaFalha ?? null);
      definirFase(null);
      definirFecharSozinho(automatico);
      definirRolagem(nova);
    },
    [combate, modelo],
  );

  /* Com o automático ligado, só para se houver habilidade disponível para a situação. */
  const pedir = useCallback(
    (p: PedidoTeste) => {
      prepararD20();
      definirPedido(p);
      const automatico = p.automatico || combate.estado.automatico;
      if (!automatico) {
        definirFase("popup");
        return;
      }
      const disponivel = habilidadesDo(p).some((h) => !h.usada && paLivres(combate.estado.pa) >= (h.pa ?? 0));
      if (disponivel) definirFase("pergunta");
      else rolar(p, ESCOLHAS_PADRAO, true);
    },
    [combate.estado.automatico, combate.estado.pa, habilidadesDo, rolar],
  );

  const rapido = useCallback((nome: string, bonus: number) => {
    prepararD20();
    efeitoPendente.current = null;
    definirFecharSozinho(false);
    definirRolagem(nome.startsWith("Ataque") ? montarAtaque(d20()) : montarRapido(nome, bonus));
  }, []);

  const atacar = useCallback((dado: number) => {
    prepararD20();
    efeitoPendente.current = null;
    definirFecharSozinho(false);
    definirRolagem(montarAtaque(dado));
  }, []);

  const fecharRolagem = useCallback(() => {
    if (rolagem) {
      const contra = rolagem.alvo ? ` contra ${rolagem.alvo.rotulo} ${rolagem.alvo.valor ?? "?"}` : "";
      const fim = rolagem.resultado ? `: ${rolagem.resultado.texto}` : "";
      const conta = rolagem.dados.length ? ` (total ${rolagem.total}${contra})` : "";
      combate.anotar(`${rolagem.titulo}${conta}${fim}`);
    }
    definirRolagem(null);
    if (efeitoPendente.current) combate.aplicarEfeito(efeitoPendente.current);
    efeitoPendente.current = null;
  }, [combate, rolagem]);

  return {
    pedido,
    fase,
    rolagem,
    fecharSozinho,
    rapida,
    semTresD,
    modelo,
    definirModelo,
    definirRapida,
    definirSemTresD,
    habilidadesDo,
    pedir,
    rapido,
    atacar,
    rolar,
    cancelar: () => definirFase(null),
    fecharRolagem,
  };
}

export type Teste = ReturnType<typeof useTeste>;
