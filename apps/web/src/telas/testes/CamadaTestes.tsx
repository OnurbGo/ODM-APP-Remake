import { Alternador, Botao, CampoNumero, Etiqueta, PopUp, prepararD20, Seletor } from "@odm/estilo";
import type { AlvoDoTeste, ModoRolagem, OpcaoDeTeste, Personagem } from "@odm/protocolo";
import {
  calcularFicha,
  habilidadesDaFicha,
  habilidadesQueServem,
  NOME_ATRIBUTO,
  usosRestantes,
  type ContextoFicha,
  type FichaCalculada,
  type HabilidadeDaFicha,
} from "@odm/regras";
import { useEffect, useMemo, useState } from "react";
import { useContextoFicha } from "../../conexao/conteudo";
import { acoes, useLoja } from "../../conexao/loja";
import { useTelaLarga } from "../useLargura";
import css from "./CamadaTestes.module.css";
import { eUltimo, MODOS, pendentesDoJogador, resultadosDe, sinal, type EventoResultado, type Pendente } from "./comum";

/* Pop-up do teste pedido pelo mestre (especificação 8.4), a partir do protótipo aprovado (CamadaTeste).
   Não fecha sem resposta: tem Rolar e Recusar rolagem. Depois de uma falha, oferece o que o livro deixa fazer. */

const OPCOES: { id: OpcaoDeTeste; rotulo: string }[] = [
  { id: "rolar", rotulo: "Rolar o dado" },
  { id: "fazer_com_calma", rotulo: "Fazer com Calma" },
  { id: "tentar_ate_conseguir", rotulo: "Tentar até Conseguir" },
];

type Situacao = {
  tipo: "habilidade" | "resistencia" | "contestado";
  teste: AlvoDoTeste;
};

function valorDoTeste(s: Situacao, calc: FichaCalculada | null) {
  if (!calc) return null;
  if (s.teste.alvo === "atributo") return (s.tipo === "resistencia" ? calc.resistencias : calc.atributos)[s.teste.atributo].valor;
  const { periciaId } = s.teste;
  return calc.pericias.find((p) => p.id === periciaId)?.total.valor ?? null;
}

function atributoDoTeste(s: Situacao, calc: FichaCalculada | null) {
  if (s.teste.alvo === "atributo") return s.teste.atributo;
  const { periciaId } = s.teste;
  return calc?.pericias.find((p) => p.id === periciaId)?.atributo ?? null;
}

/* Habilidades marcadas para a situação, com o que sobra de uso. Usadas aparecem, mas apagadas. */
function habilidadesPara(p: Personagem, s: Situacao, momento: "antes_de_rolar" | "apos_falha", ctx: ContextoFicha | null, calc: FichaCalculada | null) {
  if (!ctx || !calc) return [];
  const situacao = {
    teste: s.tipo === "resistencia" ? ("resistencia" as const) : ("habilidade" as const),
    atributo: atributoDoTeste(s, calc),
  };
  return habilidadesQueServem(habilidadesDaFicha(p.ficha, ctx), situacao, momento).map((h) => ({ h, restantes: usosRestantes(h, p.vivo, calc) }));
}

/* Recusado pelo servidor: os botões voltam, e o motivo aparece dentro do pop-up (ele cobre o aviso da tela). */
function useEnvio() {
  const [enviado, definirEnviado] = useState(false);
  const erro = useLoja((e) => e.erro);
  useEffect(() => {
    if (erro) definirEnviado(false);
  }, [erro]);
  const enviar = (fazer: () => void) => {
    acoes.limparErro();
    definirEnviado(true);
    fazer();
  };
  return { enviado, enviar, erro };
}

function useFicha(personagemId: string | undefined) {
  const personagem = useLoja((e) => e.personagens.find((p) => p.id === personagemId));
  const contexto = useContextoFicha();
  const ctx = contexto.situacao === "pronto" ? contexto.ctx : null;
  const calc = useMemo(() => (personagem && ctx ? calcularFicha(personagem.ficha, ctx) : null), [personagem, ctx]);
  return { personagem, ctx, calc };
}

function LinhaHabilidade({ h, restantes, ligada, aoMudar }: { h: HabilidadeDaFicha; restantes: number | null; ligada: boolean; aoMudar: (l: boolean) => void }) {
  if (restantes === 0) {
    return (
      <div className={css.indisponivel}>
        <span>{h.nome}</span>
        <span className={css.detalhe}>Já usada</span>
      </div>
    );
  }
  return <Alternador rotulo={h.nome} dica={restantes === null ? undefined : `${restantes} ${restantes === 1 ? "uso" : "usos"}`} ligado={ligada} aoMudar={aoMudar} />;
}

function Formulario({ pendente }: { pendente: Pendente }) {
  const { personagem, ctx, calc } = useFicha(pendente.personagemId);
  const opcoes = useLoja((e) => e.mesa?.opcoes);
  const emCombate = useLoja((e) => !!e.combate && e.combate.fase !== "encerrado" && e.combate.combatentes.some((c) => c.personagemId === pendente.personagemId));
  const [bonus, definirBonus] = useState(0);
  const [modo, definirModo] = useState<ModoRolagem>("normal");
  const [opcao, definirOpcao] = useState<OpcaoDeTeste>("rolar");
  const [habilidade, definirHabilidade] = useState<string | null>(null);
  const [carta, definirCarta] = useState(false);
  const { enviado, enviar, erro } = useEnvio();
  useEffect(() => prepararD20(), []);
  if (!personagem) return null;

  const { pedido } = pendente;
  const situacao: Situacao = { tipo: pedido.tipo, teste: pedido.teste };
  const valor = valorDoTeste(situacao, calc);
  const habilidades = habilidadesPara(personagem, situacao, "antes_de_rolar", ctx, calc);
  const podeCarta = pedido.tipo === "habilidade" && !!opcoes?.cartasDoDestino && personagem.vivo.cartaDoDestino;
  const ajusteDoMestre = [pendente.bonus ? sinal(pendente.bonus) : null, pendente.modo !== "normal" ? pendente.modo : null].filter(Boolean).join(", ");

  const rolar = () =>
    enviar(() =>
      acoes.responderTeste({
        pedidoId: pedido.id,
        personagemId: personagem.id,
        bonus,
        modo,
        opcao,
        usarCartaDoDestino: carta,
        ...(habilidade ? { habilidadeId: habilidade } : {}),
      }),
    );

  return (
    <div className={css.formulario}>
      <div className={css.resumo}>
        <div>
          <p className={css.atributo}>
            {pedido.teste.alvo === "atributo" ? NOME_ATRIBUTO[pedido.teste.atributo] : pedido.rotulo.replace(/^Teste de /, "").replace(/ \(contestado\)$/, "")}
          </p>
          {valor !== null && <p className={`${css.bonus} odm-numero`}>{sinal(valor)}</p>}
        </div>
        {pedido.tipo === "contestado" ? (
          <div className={css.dt}>
            <span className="odm-rotulo">Contra</span>
            <span className={css.oponente}>{pedido.oponenteNome ?? "?"}</span>
          </div>
        ) : (
          <div className={css.dt}>
            <span className="odm-rotulo">DT</span>
            <span className={`${css.dtValor} odm-numero`}>{pendente.dt ?? "?"}</span>
          </div>
        )}
      </div>

      {personagem.vivo.efeitos.length > 0 && (
        <div className={css.condicoes}>
          {personagem.vivo.efeitos.map((e) => (
            <Etiqueta key={e.id} tom="perigo">
              {e.nome}
            </Etiqueta>
          ))}
          {personagem.vivo.exaustao > 0 && <Etiqueta tom="perigo">Exaustão {personagem.vivo.exaustao}</Etiqueta>}
        </div>
      )}
      {personagem.vivo.automatico && pedido.tipo === "resistencia" && <p className={css.nota}>O automático parou para perguntar: há uma habilidade para esta situação.</p>}
      {ajusteDoMestre && <p className={css.nota}>Ajuste do mestre: {ajusteDoMestre}. Ele soma com o seu.</p>}

      <CampoNumero rotulo="Bônus ou penalidade" valor={bonus} aoMudar={definirBonus} />
      <Seletor rotulo="Vantagem ou desvantagem" opcoes={MODOS} valor={modo} aoMudar={definirModo} />
      {pedido.tipo === "habilidade" && !emCombate && <Seletor rotulo="Como fazer" opcoes={OPCOES} valor={opcao} aoMudar={definirOpcao} />}

      {habilidades.length > 0 && (
        <div className={css.habilidades}>
          <h3 className={`${css.subtitulo} odm-rotulo`}>Habilidades para esta situação</h3>
          {habilidades.map(({ h, restantes }) => (
            <LinhaHabilidade key={h.id} h={h} restantes={restantes} ligada={habilidade === h.id} aoMudar={(l) => definirHabilidade(l ? h.id : null)} />
          ))}
          <p className={css.nota}>Usar gasta o custo da habilidade. O efeito dela você combina com o mestre.</p>
        </div>
      )}
      {podeCarta && <Alternador rotulo="Usar a Carta do Destino" dica="Crítico garantido neste teste" ligado={carta} aoMudar={definirCarta} />}

      {erro && (
        <p className={css.erro} role="alert">
          {erro}
        </p>
      )}
      <div className={css.botoes}>
        <Botao variante="primario" grande largo disabled={enviado} onClick={rolar}>
          {opcao === "rolar" ? "Rolar" : "Ver resultado"}
        </Botao>
        <Botao variante="fantasma" largo disabled={enviado} onClick={() => enviar(() => acoes.recusarTeste(pedido.id, personagem.id))}>
          Recusar rolagem
        </Botao>
      </div>
    </div>
  );
}

/* Forçar a Rolagem (só teste de habilidade, uma vez) e as habilidades de "depois de falhar". */
/* Sem nada a oferecer (resistência sem habilidade, por exemplo), não abre nada: a falha só fica no registro. */
function DepoisDaFalha({ r, resultados, variante, aoAceitar }: { r: EventoResultado; resultados: EventoResultado[]; variante: "folha" | "central"; aoAceitar: () => void }) {
  const { personagem, ctx, calc } = useFicha(r.dados.personagemId);
  const { enviado, enviar, erro } = useEnvio();
  if (!personagem) return null;
  const cadeia: EventoResultado[] = [];
  for (let atual: EventoResultado | undefined = r; atual; atual = resultados.find((x) => x.id === atual!.dados.anteriorId)) cadeia.push(atual);
  const podeForcar = r.dados.tipo === "habilidade" && !!r.dados.pedidoId && !r.dados.falhaAutomatica && !cadeia.some((x) => x.dados.forcado);
  const tipo = r.dados.tipo === "passivo" ? "habilidade" : r.dados.tipo;
  const habilidades = habilidadesPara(personagem, { tipo, teste: r.dados.teste }, "apos_falha", ctx, calc).filter((x) => x.restantes !== 0);
  if (!podeForcar && !habilidades.length) return null;
  return (
    <PopUp aberto titulo="Depois da falha" variante={variante} aoFechar={aoAceitar}>
      <div className={css.formulario}>
        <p className={css.pergunta}>
          {r.dados.personagemNome} falhou em {r.dados.rotulo}.
        </p>
        {podeForcar && (
          <>
            <Botao grande largo disabled={enviado} onClick={() => enviar(() => acoes.forcarRolagem(r.id))}>
              Forçar a Rolagem
            </Botao>
            <p className={css.nota}>Rola de novo com a DT menor. Mesmo no sucesso, o mestre aplica uma consequência.</p>
          </>
        )}
        {habilidades.map(({ h, restantes }) => (
          <Botao key={h.id} grande largo disabled={enviado} onClick={() => enviar(() => acoes.rolarDeNovo(r.id, h.id))}>
            Rolar de novo com {h.nome}
            {restantes !== null ? ` (${restantes} ${restantes === 1 ? "uso" : "usos"})` : ""}
          </Botao>
        ))}
        {erro && (
          <p className={css.erro} role="alert">
            {erro}
          </p>
        )}
        <Botao variante="fantasma" largo onClick={aoAceitar}>
          Aceitar a falha
        </Botao>
      </div>
    </PopUp>
  );
}

export default function CamadaTestes() {
  const larga = useTelaLarga();
  const eventos = useLoja((e) => e.eventos);
  const todos = useLoja((e) => e.personagens);
  const eu = useLoja((e) => e.eu);
  const animando = useLoja((e) => e.resultadoTeste !== null);
  const [aceitos, definirAceitos] = useState<ReadonlySet<string>>(() => new Set());

  const meus = useMemo(() => new Set(todos.filter((p) => p.situacao === "ativo" && p.participanteId === eu?.id).map((p) => p.id)), [todos, eu]);
  const pendentes = useMemo(() => pendentesDoJogador(eventos, meus), [eventos, meus]);
  const resultados = useMemo(() => resultadosDe(eventos), [eventos]);
  /* Só a falha mais recente, e só depois da animação dela. */
  const falha = useMemo(() => {
    const ultimo = [...resultados].reverse().find((r) => meus.has(r.dados.personagemId));
    return ultimo && ultimo.dados.estado === "rolado" && ultimo.dados.sucesso === false && eUltimo(resultados, ultimo) && !aceitos.has(ultimo.id) ? ultimo : null;
  }, [resultados, meus, aceitos]);

  if (animando) return null;
  const variante = larga ? "central" : "folha";
  const atual = pendentes[0];
  if (atual) {
    const nome = todos.find((p) => p.id === atual.personagemId)?.ficha.nome;
    return (
      <PopUp aberto obrigatorio titulo={atual.pedido.rotulo} subtitulo={[nome, atual.pedido.origem].filter(Boolean).join(" · ")} variante={variante} aoFechar={() => undefined}>
        <Formulario key={`${atual.pedido.id}-${atual.personagemId}`} pendente={atual} />
      </PopUp>
    );
  }
  if (falha) {
    const aceitar = () => definirAceitos((a) => new Set([...a, falha.id]));
    return <DepoisDaFalha key={falha.id} r={falha} resultados={resultados} variante={variante} aoAceitar={aceitar} />;
  }
  return null;
}
