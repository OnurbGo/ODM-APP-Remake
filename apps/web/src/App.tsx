import { Carregando, RolagemD20, useTrocaDeTela, type DadosRolagem } from "@odm/estilo";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { acoes, useLoja, type EventoRolagem, type Fase } from "./conexao/loja";
import { Entrada } from "./telas/Entrada";
import { MesaJogador } from "./telas/MesaJogador";
import { paraRolagem, rolagemDeCombate } from "./telas/testes/comum";

/* O jogador nunca baixa o painel do mestre nem o gerador de QR code. */
const PainelMestre = lazy(() => import("./telas/mestre/PainelMestre"));

function paraDadosRolagem(evento: EventoRolagem): DadosRolagem {
  const { rotulo, natural, modificadores, total } = evento.dados;
  return {
    id: evento.id,
    titulo: rotulo,
    dados: [natural],
    escolhido: 0,
    modificadores,
    total,
    destaqueNatural: natural === 20 ? "alto" : natural === 1 ? "baixo" : undefined,
    notaNatural: natural === 20 ? "20 natural" : natural === 1 ? "1 natural" : undefined,
  };
}

/* De onde a pessoa vem decide a transição: quem acabou de ser aprovado passa pelas portas;
   quem só recarregou a página cai direto na mesa. */
const FASES_DE_ENTRADA = new Set<Fase>(["visitante", "aguardando", "campanhas"]);

export function App() {
  const fase = useLoja((e) => e.fase);
  const papel = useLoja((e) => e.eu?.papel);
  const rolagem = useLoja((e) => e.rolagem);
  const resultadoTeste = useLoja((e) => e.resultadoTeste);
  const ataque = useLoja((e) => e.rolagemCombate);
  const rapida = useLoja((e) => e.rolagemRapida);
  const { trocar, camada } = useTrocaDeTela();

  const dentro = fase === "dentro";
  const [naMesa, definirNaMesa] = useState(dentro);
  const passouPelaEntrada = useRef(false);

  useEffect(() => {
    if (FASES_DE_ENTRADA.has(fase)) passouPelaEntrada.current = true;
  }, [fase]);

  useEffect(() => {
    if (dentro === naMesa) return;
    const usarPortas = dentro && passouPelaEntrada.current;
    passouPelaEntrada.current = false;
    trocar(usarPortas ? "portas" : "nenhuma", () => definirNaMesa(dentro));
  }, [dentro, naMesa, trocar]);

  const dados = useMemo(() => (rolagem ? paraDadosRolagem(rolagem) : null), [rolagem]);
  const dadosTeste = useMemo(() => (resultadoTeste ? paraRolagem(resultadoTeste) : null), [resultadoTeste]);
  const dadosAtaque = useMemo(() => (ataque ? rolagemDeCombate(ataque.id, ataque.rolagem) : null), [ataque]);

  return (
    <>
      {!naMesa ? (
        <Entrada />
      ) : papel === "mestre" ? (
        <Suspense fallback={<Carregando modo="tela" rotulo="Abrindo a mesa" />}>
          <PainelMestre />
        </Suspense>
      ) : (
        <MesaJogador />
      )}
      {dados && <RolagemD20 rolagem={dados} rapida={rapida} aoFechar={acoes.fecharRolagem} />}
      {/* Rolagem automática fecha sozinha: a resistência costuma vir em série (especificação 8.4). */}
      {dadosTeste && !dados && (
        <RolagemD20 rolagem={dadosTeste} rapida={rapida} fecharSozinhoMs={resultadoTeste?.dados.automatico ? 2500 : undefined} aoFechar={acoes.fecharResultadoTeste} />
      )}
      {dadosAtaque && !dados && !dadosTeste && <RolagemD20 rolagem={dadosAtaque} rapida={rapida} aoFechar={acoes.fecharRolagemCombate} />}
      {camada}
    </>
  );
}
