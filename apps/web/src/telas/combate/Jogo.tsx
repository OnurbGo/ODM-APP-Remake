import { Abas, Alternador, BarraPV, Botao, CampoNumero, Cartao, EstrelaTurno, Etiqueta, FichaClasse, Icone, IconeCondicao, MarcadorPA, PopUp, prepararD20, Seletor, type EstadoPA, type ItemAba, TextoDoLivro } from "@odm/estilo";
import { ATRIBUTOS, type AlvoDoTeste, type Combatente, type EstadoCombate, type FonteDeAtaque, type ModoRolagem, type Personagem } from "@odm/protocolo";
import {
  calcularFicha,
  criarContextoCombate,
  ataqueComArma,
  ataqueDesarmado,
  bonusDesarmado,
  disparoDaArma,
  alcanceComMundo,
  efeitoDaDistancia,
  fichasAtuais,
  habilidadesContraAtaque,
  habilidadesDaFicha,
  usosRestantes,
  NOME_ATRIBUTO,
  proficienciasDaFicha,
  situacaoDoVivo,
  type ConteudoFicha,
  type ContextoCombate,
  type ContextoFicha,
  type FichaCalculada,
  type ValorContado,
} from "@odm/regras";
import { useMemo, useRef, useState } from "react";
import { acoes, useLoja } from "../../conexao/loja";
import { Registro } from "../Blocos";
import { BlocoAtributos, BlocoCalculados, BlocoHabilidades, BlocoNotas, BlocoPericias, type FichaVista } from "../ficha/Blocos";
import { AvisoNivel, CabecalhoClasse, ConteudoCelular } from "../ficha/TelaFicha";
import { MODOS, sinal } from "../testes/comum";
import { useTelaLarga } from "../useLargura";
import celular from "./Celular.module.css";
import { daVez, JanelaConta, Mini, posicoes, proximoDaVez, RostoOuSinal } from "./comum";
import comum from "./Comum.module.css";
import desktop from "./Desktop.module.css";
import { CampanhaJogador } from "../campanha/CampanhaJogador";
import { TelaPersonagem } from "../ficha/personagem/TelaPersonagem";
import { IniciativaJogador } from "./IniciativaJogador";

/* Aba Combate do jogador (especificação 6.3; paradas 1 e 2). Etapa 5: turno, vida, PA, fichas e efeitos.
   Etapa 6: testes rápidos e as preferências de rolagem. Etapa 7: ataque com a arma equipada, reação e ações de efeito. */

const NAVEGACAO: ItemAba[] = [
  { id: "combate", rotulo: "Combate", icone: "combate" },
  { id: "personagem", rotulo: "Personagem", icone: "personagem" },
  { id: "habilidades", rotulo: "Habilidades", icone: "habilidades" },
  { id: "inventario", rotulo: "Inventário", icone: "inventario" },
  { id: "notas", rotulo: "Notas", icone: "notas" },
  { id: "campanha", rotulo: "Campanha", icone: "campanha" },
];

const ABAS_FICHA: ItemAba[] = NAVEGACAO.filter((n) => n.id !== "combate").map(({ id, rotulo }) => ({ id, rotulo }));

type Jogo = {
  ficha: FichaVista;
  personagem: Personagem;
  combate: EstadoCombate | null;
  meu: Combatente | null;
  ctxCombate: ContextoCombate | null;
  paPorTurno: number;
};

function useJogo(personagem: Personagem, ctx: ContextoFicha, conteudo: ConteudoFicha, variante: "folha" | "central"): Jogo {
  const combate = useLoja((e) => e.combate);
  const opcoes = useLoja((e) => e.mesa?.opcoes);
  const ctxCombate = useMemo(() => {
    const r = criarContextoCombate({ regras: conteudo.regras, tabelas: conteudo.tabelas, efeitos: conteudo.efeitos, modificadores: conteudo.modificadores }, opcoes);
    return r.ok ? r.contexto : null;
  }, [conteudo, opcoes]);
  const calc = useMemo(() => calcularFicha(personagem.ficha, ctx, ctxCombate ? situacaoDoVivo(personagem.vivo, ctxCombate) : {}), [personagem, ctx, ctxCombate]);
  const ficha: FichaVista = { personagem, dados: personagem.ficha, calc, ctx, variante, operar: (op) => acoes.operar(personagem.id, op) };
  const meu = combate?.combatentes.find((c) => c.personagemId === personagem.id) ?? null;
  return { ficha, personagem, combate, meu, ctxCombate, paPorTurno: ctx.regras.turno.pa_por_turno };
}

/* ---------- Turno ---------- */

function TextoDoTurno({ jogo }: { jogo: Jogo }) {
  const { combate, meu } = jogo;
  const css = celular;
  if (!combate) return <p className={css.turnoDe}>Fora de combate</p>;
  if (combate.fase === "iniciativa") {
    const decidindo = !!meu?.carta && meu.usaEfeito === null;
    return <p className={css.turnoDe}>Iniciativa: {!meu?.carta ? "compre sua carta" : decidindo ? "decida a sua carta" : "aguardando o mestre começar"}</p>;
  }
  if (combate.fase === "fim_da_rodada") return <p className={css.turnoDe}>Fim da rodada {combate.rodada}: quem guardou PA ainda pode agir</p>;
  const vez = daVez(combate);
  const depois = proximoDaVez(combate);
  if (vez && meu && vez.id === meu.id) {
    return (
      <>
        <EstrelaTurno key={`${combate.rodada}-${combate.vez}`} tamanho={38} />
        <div>
          <p className={css.seuTurno}>Seu turno</p>
          {depois && <p className={css.depois}>Depois: {depois === "oculto" ? "?" : depois.nome}</p>}
        </div>
      </>
    );
  }
  return (
    <div>
      <p className={css.turnoDe}>Turno de {vez?.nome}</p>
      {depois && <p className={css.depois}>Depois: {depois === "oculto" ? "?" : depois.nome}</p>}
    </div>
  );
}

function FaixaTurnoCelular({ jogo, aoAbrirRegistro, aoAbrirIniciativa }: { jogo: Jogo; aoAbrirRegistro: () => void; aoAbrirIniciativa: () => void }) {
  const { combate, meu } = jogo;
  const seuTurno = !!meu && daVez(combate)?.id === meu.id;
  const css = celular;
  return (
    <header className={`${css.faixa} ${seuTurno ? css.faixaAtiva : ""}`}>
      <div className={css.faixaTopo}>
        <div className={css.faixaTexto} aria-live="polite">
          <TextoDoTurno jogo={jogo} />
        </div>
        {combate?.fase === "iniciativa" && meu && (
          <Botao variante="fantasma" className={css.botaoCarta} onClick={aoAbrirIniciativa}>
            Carta
          </Botao>
        )}
        <button type="button" className={css.botaoRegistro} onClick={aoAbrirRegistro} aria-label="Abrir registro da sessão">
          <Icone nome="registro" />
        </button>
      </div>
      {combate && combate.fase !== "iniciativa" && (
        <ol className={css.ordem} aria-label="Ordem de iniciativa">
          {posicoes(combate).map(({ id, c }) =>
            !c ? (
              <li key={id} className={`${css.ficha} ${css.oculta}`}>
                <span className={css.fichaInterna} aria-hidden="true">
                  ?
                </span>
                <span className="odm-oculto">Posição ainda não revelada</span>
              </li>
            ) : (
              <li
                key={c.id}
                className={[css.ficha, c.tipo !== "personagem" ? css.criatura : "", c.id === meu?.id ? css.voce : "", c.id === daVez(combate)?.id ? css.davez : ""].join(" ")}
                data-letra={c.nome.charAt(0)}
                aria-current={c.id === daVez(combate)?.id ? "true" : undefined}
              >
                <span className={css.fichaInterna}><RostoOuSinal c={c} alternativa={c.nome.charAt(0)} /></span>
                <span className="odm-oculto">{c.nome}</span>
              </li>
            ),
          )}
          {meu?.carta && (
            <li className={css.suaCarta}>
              <Mini carta={meu.carta} />
            </li>
          )}
          <li className={css.rodada}>Rodada {combate.rodada}</li>
        </ol>
      )}
    </header>
  );
}

function FaixaTurnoDesktop({ jogo }: { jogo: Jogo }) {
  const { combate, meu } = jogo;
  const css = desktop;
  const vez = daVez(combate);
  return (
    <header className={`${css.faixa} ${meu && vez?.id === meu.id ? css.faixaAtiva : ""}`}>
      <div className={css.turno} aria-live="polite">
        <TextoDoTurno jogo={jogo} />
      </div>
      {combate && (
        <ol className={css.ordem} aria-label="Ordem de iniciativa">
          {posicoes(combate).map(({ id, c }) =>
            !c ? (
              <li key={id} className={`${css.combatente} ${css.oculta}`}>
                <span aria-hidden="true">?</span>
                <span className="odm-oculto">Posição ainda não revelada</span>
              </li>
            ) : (
              <li key={c.id} className={[css.combatente, c.id === vez?.id ? css.davez : "", c.id === meu?.id ? css.voce : ""].join(" ")} aria-current={c.id === vez?.id ? "true" : undefined}>
                <span className={css.rostoFaixa}>
                  <RostoOuSinal c={c} />
                </span>
                <span className={css.combatenteNome}>{c.nome}</span>
                {c.carta && <Mini carta={c.carta} />}
              </li>
            ),
          )}
        </ol>
      )}
      {combate && combate.fase !== "iniciativa" && <p className={`${css.rodada} odm-rotulo`}>Rodada {combate.rodada}</p>}
    </header>
  );
}

/* ---------- Vida ---------- */

function Nivel({ rotulo, valor, total, css }: { rotulo: string; valor: number; total: number; css: Record<string, string> }) {
  return (
    <div className={css.nivel} role="img" aria-label={`${rotulo}: ${valor} de ${total}`}>
      <span className="odm-rotulo">{rotulo}</span>
      <span className={css.marcas}>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`${css.marca} ${i < valor ? css.marcaCheia : ""}`} />
        ))}
      </span>
      <span className={`${css.nivelValor} odm-numero`}>{valor}</span>
    </div>
  );
}

function Contagem({ rotulo, total, tom, css }: { rotulo: string; total: number; tom: "sucesso" | "perigo"; css: Record<string, string> }) {
  return (
    <div className={css.contagem} role="img" aria-label={`${rotulo}: ${total} de 3`}>
      <span className="odm-rotulo">{rotulo}</span>
      <span className={css.contagemMarcas}>
        {[0, 1, 2].map((i) => (
          <span key={i} className={`${css.contagemMarca} ${i < total ? css[tom] : ""}`} />
        ))}
      </span>
    </div>
  );
}

/* Teste de Morte (Jogador, Morrendo): no início do turno, 1d20; a Carta do Destino vale um 20 natural. */
function TesteDeMorte({ jogo }: { jogo: Jogo }) {
  const [carta, definirCarta] = useState(false);
  const cartas = useLoja((e) => e.mesa?.opcoes.cartasDoDestino ?? false);
  const { meu, personagem, combate } = jogo;
  const naVez = !!meu && !!combate && daVez(combate)?.id === meu.id;
  /* Inconsciente não age: feito o teste (ou estável), só resta passar a vez. */
  if (!meu?.marcas.testeDeMortePendente || personagem.vivo.morrendo?.estavel) {
    return naVez ? (
      <Botao variante="primario" largo onClick={acoes.encerrarTurno}>
        Encerrar turno
      </Botao>
    ) : null;
  }
  return (
    <div className={comum.reacao}>
      {cartas && personagem.vivo.cartaDoDestino && <Alternador rotulo="Usar a Carta do Destino" dica="Vale um 20 natural: acorda com 1 PV" ligado={carta} aoMudar={definirCarta} />}
      <Botao variante="primario" grande largo onClick={() => acoes.testeDeMorte(personagem.id, carta)}>
        Fazer o Teste de Morte
      </Botao>
    </div>
  );
}

function BlocoVida({ jogo, larga }: { jogo: Jogo; larga: boolean }) {
  const css = larga ? desktop : celular;
  const { calc } = jogo.ficha;
  const vivo = jogo.personagem.vivo;
  const pv = vivo.pv ?? calc.pvMaximo.valor;
  const [conta, abrirConta] = useState<{ titulo: string; valor: ValorContado } | null>(null);
  const estresse = calc.estresseMaximo;

  if (vivo.morrendo) {
    return (
      <Cartao className={larga ? css.morrendo : css.vidaMorrendo}>
        <p className={css.morrendoTitulo}>Morrendo</p>
        <p className={larga ? css.nota : css.morrendoSub}>{vivo.morrendo.estavel ? "Estável e inconsciente." : "Inconsciente, com 0 PV. Teste de Morte no início do seu turno."}</p>
        <Contagem rotulo="Sucessos" total={vivo.morrendo.sucessos} tom="sucesso" css={css} />
        <Contagem rotulo="Falhas" total={vivo.morrendo.falhas} tom="perigo" css={css} />
        <TesteDeMorte jogo={jogo} />
      </Cartao>
    );
  }

  return (
    <Cartao className={css.vida}>
      <div className={css.vidaTopo}>
        <button type="button" className={css.pv} onClick={() => abrirConta({ titulo: "PV máximos", valor: calc.pvMaximo })} aria-label={`${pv} de ${calc.pvMaximo.valor} PV. Ver a conta`}>
          <span className={`${css.pvAtual} odm-numero`}>{pv}</span>
          <span className={`${css.pvMax} odm-numero`}>/{calc.pvMaximo.valor}</span>
          <span className={`${css.pvRotulo} odm-rotulo`}>PV</span>
          {vivo.pvTemporarios > 0 && (
            <span className={css.pvTemp}>
              <Etiqueta tom="destaque">+{vivo.pvTemporarios} temp.</Etiqueta>
            </span>
          )}
        </button>
        <div className={larga ? css.minis : css.atributosVida}>
          <button type="button" className={larga ? css.mini : css.miniValor} onClick={() => abrirConta({ titulo: "Defesa", valor: calc.defesa })}>
            <span className="odm-numero">{calc.defesa.valor}</span>
            <span className="odm-rotulo">Defesa</span>
          </button>
          <button type="button" className={larga ? css.mini : css.miniValor} onClick={() => abrirConta({ titulo: "Deslocamento", valor: calc.deslocamento })}>
            <span className="odm-numero">{calc.deslocamento.valor}</span>
            <span className="odm-rotulo">Desloc.</span>
          </button>
        </div>
      </div>
      <BarraPV atual={pv} maximo={calc.pvMaximo.valor} temporario={vivo.pvTemporarios} />
      <div className={css.vidaBase}>
        <Nivel rotulo="Exaustão" valor={vivo.exaustao} total={6} css={css} />
        {estresse && <Nivel rotulo="Estresse" valor={vivo.estresse} total={estresse.valor} css={css} />}
      </div>
      <JanelaConta titulo={conta?.titulo ?? ""} valor={conta?.valor ?? null} variante={larga ? "central" : "folha"} aoFechar={() => abrirConta(null)} />
    </Cartao>
  );
}

/* ---------- PA ---------- */

function estadosDePa(meu: Combatente, naVez: boolean, paPorTurno: number): EstadoPA[] {
  const { disponiveis, guardados, bloqueados } = meu.pa;
  const base = paPorTurno + (meu.jaAgiu ? 0 : meu.marcas.paExtraNoPrimeiroTurno);
  const gastos = naVez ? Math.max(0, base - disponiveis - bloqueados) : 0;
  return [
    ...Array<EstadoPA>(disponiveis).fill("disponivel"),
    ...Array<EstadoPA>(gastos).fill("gasto"),
    ...Array<EstadoPA>(guardados).fill("guardado"),
    ...Array<EstadoPA>(bloqueados).fill("bloqueado"),
  ];
}

function BlocoPA({ jogo, larga }: { jogo: Jogo; larga: boolean }) {
  const css = larga ? desktop : celular;
  const { combate, meu } = jogo;
  if (!combate || !meu || combate.fase === "iniciativa") return null;
  const naVez = daVez(combate)?.id === meu.id;
  const fimDaRodada = combate.fase === "fim_da_rodada";
  const pa = estadosDePa(meu, naVez, jogo.paPorTurno);
  const { disponiveis, guardados, bloqueados } = meu.pa;
  const partes = [`${disponiveis} ${disponiveis === 1 ? "disponível" : "disponíveis"}`];
  if (guardados) partes.push(`${guardados} ${guardados === 1 ? "guardado" : "guardados"}`);
  if (bloqueados) partes.push(`${bloqueados} ${bloqueados === 1 ? "perdido" : "perdidos"}`);
  /* No próprio turno, gasta do turno; fora dele, o guardado serve para reação; no fim da rodada, para agir. */
  const tocar = (estado: EstadoPA) => {
    if (estado === "disponivel" && naVez) return () => acoes.gastarPa(meu.id, "acao");
    if (estado === "guardado") return () => acoes.gastarPa(meu.id, fimDaRodada ? "acao" : "reacao");
    return undefined;
  };
  const podeMover = naVez ? disponiveis > 0 || meu.marcas.deslocamentoSemCusto > 0 : fimDaRodada && guardados > 0;
  return (
    <Cartao titulo="PA" className={larga ? css.blocoPA : undefined} extra={<span className={css.resumo}>{partes.join(" · ")}</span>}>
      {larga ? (
        <div className={css.marcadores}>
          {pa.map((estado, i) => (
            <MarcadorPA key={i} estado={estado} aoTocar={tocar(estado)} />
          ))}
        </div>
      ) : (
        <div className={css.paLinha}>
          <div className={css.pa}>
            {pa.map((estado, i) => (
              <MarcadorPA key={i} estado={estado} aoTocar={tocar(estado)} />
            ))}
          </div>
        </div>
      )}
      <div className={comum.acoesPa}>
        <Botao disabled={!podeMover} onClick={() => acoes.gastarPa(meu.id, "deslocamento")}>
          Deslocar (1 PA)
        </Botao>
        {naVez && (
          <Botao variante="primario" className={css.encerrar} onClick={acoes.encerrarTurno}>
            Encerrar turno
          </Botao>
        )}
      </div>
      {guardados > 0 && !naVez && <p className={css.nota}>{fimDaRodada ? "Fim da rodada: o guardado ainda serve para agir agora." : "Guardado serve para Reação até o fim da rodada."}</p>}
      {meu.marcas.deslocamentoSemCusto > 0 && naVez && <p className={css.nota}>Valete: o próximo deslocamento não custa PA.</p>}
      {meu.marcas.reacaoSemCusto && <p className={css.nota}>Rainha: sua primeira reação não custa PA.</p>}
      {meu.marcas.vantagemNoProximo && <p className={css.nota}>Rei: vantagem no próximo ataque ou teste de habilidade.</p>}
    </Cartao>
  );
}

/* ---------- Fichas de classe e efeitos ---------- */

function BlocoFichasDeClasse({ calc, jogo, larga }: { calc: FichaCalculada; jogo: Jogo; larga: boolean }) {
  const css = larga ? desktop : celular;
  if (!calc.fichasDeClasse.length) return null;
  return (
    <Cartao titulo="Fichas de classe">
      <ul className={css.fichas}>
        {calc.fichasDeClasse.map((f) => (
          <li key={f.id}>
            <FichaClasse nome={f.nome} atual={fichasAtuais(jogo.personagem.vivo, f)} maximo={f.maximo.valor} aoMudar={(d) => acoes.ajustarFichaDeClasse(jogo.personagem.id, f.id, d)} />
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

function BlocoEfeitos({ jogo, larga }: { jogo: Jogo; larga: boolean }) {
  const css = larga ? desktop : celular;
  const [aberto, abrir] = useState<string | null>(null);
  const efeitos = jogo.personagem.vivo.efeitos;
  const atual = efeitos.find((e) => e.id === aberto);
  return (
    <Cartao titulo="Efeitos ativos">
      {efeitos.length === 0 ? (
        <p className={css.nota}>Nenhum efeito ativo.</p>
      ) : (
        <ul className={css.lista}>
          {efeitos.map((e) => (
            <li key={e.id}>
              <button type="button" className={css.linha} onClick={() => abrir(e.id)}>
                <span className={css.linhaNome}>
                  <IconeCondicao efeitoId={e.efeitoId} className={comum.iconeEfeito} /> {e.nome}
                </span>
                <span className={css.linhaDados}>
                  {e.acumulos > 1 && <Etiqueta>×{e.acumulos}</Etiqueta>}
                  {e.nivel !== null && <Etiqueta>Nível {e.nivel}</Etiqueta>}
                  {e.turnosRestantes !== null && (
                    <Etiqueta>
                      {e.turnosRestantes} {e.turnosRestantes === 1 ? "turno" : "turnos"}
                    </Etiqueta>
                  )}
                </span>
                <Icone nome="seta" tamanho={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <PopUp aberto={!!atual} titulo={atual?.nome ?? ""} variante={larga ? "central" : "folha"} aoFechar={() => abrir(null)}>
        <p className={comum.efeitoTexto}><TextoDoLivro texto={(atual && jogo.ctxCombate?.efeitos.get(atual.efeitoId)?.texto) || "Sem texto do livro para este efeito."} /></p>
        {/* Ações que o próprio efeito oferece (Levantar, Usar Trapos, Me aqueci). */}
        {atual && (jogo.ctxCombate?.efeitos.get(atual.efeitoId)?.mecanica?.acoes ?? []).length > 0 && (
          <div className={comum.acoesPa}>
            {(jogo.ctxCombate?.efeitos.get(atual.efeitoId)?.mecanica?.acoes ?? []).map((a, i) => (
              <Botao
                key={i}
                onClick={() => {
                  acoes.acaoDeEfeito({ tipo: "personagem", id: jogo.personagem.id }, atual.id, i);
                  abrir(null);
                }}
              >
                {a.nome}
                {a.custo?.pa ? ` (${a.custo.pa} PA)` : ""}
              </Botao>
            ))}
          </div>
        )}
      </PopUp>
    </Cartao>
  );
}

/* ---------- Ataque e reação ---------- */

/* Arma equipada com mecânica revisada: o jogador escolhe o alvo e o servidor rola (especificação 7.1).
   O jogador vê acertou ou errou; a Defesa e os PV da criatura não chegam a ele. */
function BlocoAtaque({ jogo }: { jogo: Jogo }) {
  const css = celular;
  const { combate, meu, ficha, ctxCombate, personagem } = jogo;
  const [marcados, definirMarcados] = useState<string[]>([]);
  const [alem, definirAlem] = useState(false);
  /* Distância até o alvo, opcional (decisão de 07/11/2026): vazia, nada muda. */
  const [distancia, definirDistancia] = useState("");
  const armas = useMemo(() => {
    if (!ctxCombate) return [];
    const categorias = proficienciasDaFicha(ficha.dados, ficha.ctx).categorias;
    const comArma = ficha.dados.inventario.flatMap((i) => {
      const doPacote = i.equipado && i.itemId ? ficha.ctx.itens.get(i.itemId) : undefined;
      const item = { nome: i.nome, mecanica: doPacote?.mecanica, atributo: i.atributo, modo: i.modo };
      const montado = doPacote ? ataqueComArma(item, { atributos: ficha.calc.atributos, proficiencia: ficha.calc.proficiencia, categorias }, ctxCombate, 1) : null;
      const lido = doPacote ? disparoDaArma(item) : null;
      const fonte: FonteDeAtaque = { tipo: "arma", itemFichaId: i.id };
      return montado ? [{ id: i.id, fonte, montado, modos: lido?.arma.modos?.map((m) => m.nome) ?? [], modoAtual: lido?.modo?.nome ?? null, trocar: lido?.arma.trocar_modo?.pa ?? null }] : [];
    });
    /* Ataque Desarmado, com o que as armas equipadas somam no dano (Soqueira +2). */
    const itens = ficha.dados.inventario.map((i) => ({ nome: i.nome, equipado: i.equipado, mecanica: i.itemId ? ficha.ctx.itens.get(i.itemId)?.mecanica : undefined }));
    const desarmado = ataqueDesarmado({ atributos: ficha.calc.atributos, proficiencia: ficha.calc.proficiencia, categorias }, ctxCombate, bonusDesarmado(itens));
    const fonteDesarmado: FonteDeAtaque = { tipo: "desarmado" };
    return [...comArma, ...(desarmado ? [{ id: "desarmado", fonte: fonteDesarmado, montado: desarmado, modos: [] as string[], modoAtual: null, trocar: null }] : [])];
  }, [ficha, ctxCombate]);
  if (!combate || !meu || combate.fase === "iniciativa" || combate.fase === "encerrado") return null;
  const naVez = daVez(combate)?.id === meu.id;
  const podeAgir = naVez || (combate.fase === "fim_da_rodada" && meu.pa.guardados > 0);
  const inimigos = combate.combatentes.filter((c) => c.tipo !== "personagem" && !c.derrotado);
  const metros = distancia.trim() === "" ? null : Math.max(0, Math.floor(Number(distancia)));
  const escolhidos = inimigos.filter((c) => marcados.includes(c.id));
  const alvos = escolhidos.length ? escolhidos : inimigos.slice(0, 1);
  const algumCone = armas.some((a) => a.montado.alcance?.cone);
  const alternar = (id: string) => definirMarcados((m) => (algumCone ? (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]) : [id]));
  return (
    <Cartao titulo="Atacar">
      {armas.length === 0 ? (
        <p className={css.nota}>Nenhum ataque disponível. Equipe uma arma no Inventário.</p>
      ) : (
        <>
          {inimigos.length > 1 && (
            <fieldset className={comum.alvosAtaque}>
              <legend className="odm-rotulo">{algumCone ? "Alvos (o cone atinge a área)" : "Alvo"}</legend>
              {inimigos.map((c) => (
                <label key={c.id} className={comum.alvoOpcao}>
                  <input type={algumCone ? "checkbox" : "radio"} name="alvo-ataque" checked={alvos.some((a) => a.id === c.id)} onChange={() => alternar(c.id)} />
                  {c.nome}
                </label>
              ))}
            </fieldset>
          )}
          <label className={comum.distancia}>
            <span className="odm-rotulo">Distância até o alvo (m)</span>
            <input type="number" inputMode="numeric" min={0} value={distancia} placeholder="—" onChange={(e) => definirDistancia(e.target.value)} />
          </label>
          {armas.map(({ id, fonte, montado, modos, modoAtual, trocar }) => {
            const efeito = efeitoDaDistancia(ctxCombate ? alcanceComMundo(montado, ctxCombate).alcance : montado.alcance, metros);
            const fora = efeito.faixa === "fora_de_alcance";
            const demais = efeito.maximoDeAlvos !== null && alvos.length > efeito.maximoDeAlvos;
            return (
              <div key={id} className={comum.arma}>
                <button
                  type="button"
                  className={css.ataque}
                  disabled={!podeAgir || !alvos.length || !!combate.ataquePendente || fora || demais || (!montado.alcance?.cone && alvos.length > 1)}
                  onClick={() =>
                    acoes.atacar(meu.id, fonte, alvos.map((a) => a.id), { alemDoAlcance: alem, bonus: 0, modo: "normal", distancia: metros })
                  }
                >
                  <span>
                    <span className={`${css.ataqueRotulo} odm-rotulo`}>Ataque{alvos.length ? ` em ${alvos.map((a) => a.nome).join(", ")}` : ""}</span>
                    <span className={css.ataqueArma}>{montado.nome}</span>
                  </span>
                  <span className={css.ataqueValores}>
                    <span className="odm-numero">{sinal(montado.acerto.reduce((s, p) => s + p.valor, 0))}</span>
                    <span className={`${css.ataqueDano} odm-numero`}>
                      {montado.dano.formula}
                      {montado.dano.bonus.length ? sinal(montado.dano.bonus.reduce((s, p) => s + p.valor, 0)) : ""}
                    </span>
                  </span>
                </button>
                {efeito.texto && <p className={`${css.nota} ${fora ? comum.alerta : ""}`}>{efeito.texto}{demais ? `: escolha ${efeito.maximoDeAlvos === 1 ? "um alvo" : `até ${efeito.maximoDeAlvos} alvos`}` : ""}</p>}
                {montado.alcance?.impactoPesado && metros !== null && metros <= 1 && <p className={css.nota}>Impacto Pesado: quem você acertar faz um teste de resistência.</p>}
                {modos.length > 1 && (
                  <div className={comum.modos} role="group" aria-label="Modo de disparo">
                    {modos.map((nome) => (
                      <Botao
                        key={nome}
                        variante={nome === modoAtual ? "primario" : "fantasma"}
                        aria-pressed={nome === modoAtual}
                        disabled={nome === modoAtual || (!!trocar && (!naVez || meu.pa.disponiveis < trocar))}
                        onClick={() => {
                          if (trocar) acoes.gastarPa(meu.id, "acao", trocar);
                          acoes.operar(personagem.id, { op: "item_ajustar", itemFichaId: id, campo: "modo", valor: nome });
                        }}
                      >
                        Modo {nome}
                        {trocar && nome !== modoAtual ? ` (${trocar} PA)` : ""}
                      </Botao>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          {ctxCombate?.regras.alcance && metros === null && (
            <Alternador rotulo="Entre o alcance efetivo e o máximo" dica="Sem a distância: desvantagem e, se acertar, metade do dano" ligado={alem} aoMudar={definirAlem} />
          )}
          {!podeAgir && <p className={css.nota}>Ataque no seu turno, ou no fim da rodada com PA guardado.</p>}
        </>
      )}
    </Cartao>
  );
}

/* Depois de um ataque contra você: as habilidades marcadas para o momento (Rito da Lua Sangrenta depois do
   acerto, decisão de 07/11/2026). Usar paga o custo dela e 1 PA guardado; o efeito é combinado com o mestre. */
function OfertaDeReacao({ jogo }: { jogo: Jogo }) {
  const { meu, ficha, personagem } = jogo;
  const oferta = meu?.marcas.ofertaDeReacao;
  if (!meu || !oferta) return null;
  const habilidades = habilidadesDaFicha(ficha.dados, ficha.ctx).filter((h) => oferta.habilidades.includes(h.id));
  const quando = { apos_acerto: "acertou você", apos_erro: "errou você", apos_critico: "acertou você com um crítico" }[oferta.momento];
  return (
    <Cartao titulo="Reação depois do ataque">
      <p className={celular.nota}>
        {oferta.ataque} {quando}
        {oferta.dano !== null ? ` (${oferta.dano} de dano)` : ""}. Você pode usar, com {meu.marcas.reacaoSemCusto ? "a Rainha" : "1 PA guardado"}:
      </p>
      <div className={comum.reacao}>
        {habilidades.map((h) => (
          <details key={h.id} className={comum.ofertaHabilidade}>
            <summary>{h.nome}</summary>
            <p className={comum.efeitoTexto}><TextoDoLivro texto={h.texto} /></p>
            <Botao variante="primario" onClick={() => acoes.usarHabilidade(personagem.id, h.id, true)}>
              Usar {h.nome}
            </Botao>
          </details>
        ))}
        <Botao variante="fantasma" onClick={() => acoes.dispensarOferta(meu.id)}>
          Agora não
        </Botao>
      </div>
    </Cartao>
  );
}

/* Janela de reação (decisão de 06/11/2026): com PA guardado, o alvo escolhe antes da rolagem. */
function JanelaDeReacao({ jogo, larga }: { jogo: Jogo; larga: boolean }) {
  const { combate, meu, ficha, ctxCombate, personagem } = jogo;
  const p = combate?.ataquePendente;
  /* Habilidades marcadas para antes da rolagem de um ataque contra você (situacoes-mecanica.yml). */
  const habilidades = useMemo(() => habilidadesContraAtaque(habilidadesDaFicha(ficha.dados, ficha.ctx), { corpoACorpo: true }, "antes_de_rolar"), [ficha]);
  if (!combate || !meu || !p || !p.aguardando.includes(meu.id)) return null;
  const atacante = combate.combatentes.find((c) => c.id === p.atacanteId);
  const opcoes = (["esquiva", "bloqueio"] as const).filter((r) => ctxCombate?.regras[r]?.defesa);
  return (
    <PopUp aberto obrigatorio titulo="Você vai ser atacado" subtitulo={`${atacante?.nome ?? "Alguém"}: ${p.rotulo}`} variante={larga ? "central" : "folha"} aoFechar={() => undefined}>
      <div className={comum.reacao}>
        <p className={comum.efeitoTexto}>
          Reagir gasta {meu.marcas.reacaoSemCusto ? "nada (Rainha)" : "1 PA guardado"} e soma o atributo na sua Defesa contra este ataque. Você tem {meu.pa.guardados} guardado{meu.pa.guardados === 1 ? "" : "s"}.
        </p>
        {combate.combatentes.some((h) => h.horda?.naArea.includes(meu.id)) && <p className={comum.efeitoTexto}>Você está na área de uma Horda: a Ameaça de Massa tira da reação.</p>}
        {opcoes.map((r) => {
          const atributo = ctxCombate!.regras[r]!.defesa!.soma;
          return (
            <Botao key={r} variante="primario" grande largo onClick={() => acoes.reagir(meu.id, r)}>
              {r === "esquiva" ? "Esquiva" : "Bloqueio"} ({NOME_ATRIBUTO[atributo]} {sinal(ficha.calc.atributos[atributo].valor)})
            </Botao>
          );
        })}
        {habilidades.map((h) => (
          <details key={h.id} className={comum.ofertaHabilidade}>
            <summary>{h.nome}</summary>
            <p className={comum.efeitoTexto}><TextoDoLivro texto={h.texto} /></p>
            <Botao onClick={() => acoes.usarHabilidade(personagem.id, h.id, true)}>Usar {h.nome} (reação)</Botao>
          </details>
        ))}
        <Botao variante="fantasma" largo onClick={() => acoes.reagir(meu.id, "nenhuma")}>
          Não reagir
        </Botao>
      </div>
    </PopUp>
  );
}

/* Atitude Imprudente (Jogador, Morrendo): uma vez por turno, consciente; cada opção deixa uma falha pendente. */
const IMPRUDENTE = [
  { id: "precisao", nome: "Precisão", texto: "Vantagem no próximo ataque" },
  { id: "potencia", nome: "Potência", texto: "+1 dado de dano no próximo ataque" },
  { id: "violencia", nome: "Violência", texto: "Rola o dano do próximo ataque duas vezes e fica com o maior" },
  { id: "impeto", nome: "Ímpeto", texto: "+1 PA neste turno" },
] as const;

function BlocoImprudente({ jogo }: { jogo: Jogo }) {
  const { combate, meu, personagem, ctxCombate } = jogo;
  const regra = ctxCombate?.regras.imprudente;
  if (!regra || !combate || !meu || combate.fase !== "em_curso" || personagem.vivo.morrendo) return null;
  const naVez = daVez(combate)?.id === meu.id;
  const pendentes = personagem.vivo.falhasPendentes;
  const bloqueado = !naVez || meu.marcas.imprudenteNoTurno || pendentes >= regra.maximo_pendentes;
  return (
    <Cartao titulo="Atitude Imprudente" extra={<span className={celular.resumo}>{pendentes} de {regra.maximo_pendentes} falhas pendentes</span>}>
      <div className={comum.reacao}>
        {IMPRUDENTE.map((o) => (
          <Botao key={o.id} disabled={bloqueado} onClick={() => acoes.atitudeImprudente(meu.id, o.id)}>
            {o.nome}: {o.texto}
          </Botao>
        ))}
        {meu.marcas.imprudente && <p className={celular.nota}>Vale no próximo ataque: {IMPRUDENTE.find((o) => o.id === meu.marcas.imprudente)?.nome}.</p>}
        <p className={celular.nota}>Uma vez por turno. Se cair a 0 PV, cada falha pendente vira uma falha no Morrendo; o descanso apaga as pendentes.</p>
      </div>
    </Cartao>
  );
}

/* Habilidades com usos ou custo em fichas: o botão Usar gasta pelo servidor, com desfazer. */
function BlocoUsos({ jogo }: { jogo: Jogo }) {
  const { ficha, personagem } = jogo;
  const lista = useMemo(() => habilidadesDaFicha(ficha.dados, ficha.ctx).filter((h) => h.mecanica?.usos || h.mecanica?.custo?.fichas), [ficha]);
  if (!lista.length) return null;
  return (
    <Cartao titulo="Habilidades com uso">
      <ul className={celular.lista}>
        {lista.map((h) => {
          const restantes = usosRestantes(h, personagem.vivo, ficha.calc);
          const fichas = h.mecanica?.custo?.fichas;
          return (
            <li key={h.id} className={comum.linhaFicha}>
              <span>
                {h.nome}
                <span className={celular.nota}>
                  {[restantes !== null ? `${restantes} ${restantes === 1 ? "uso" : "usos"}` : null, fichas ? `${fichas.quantidade} ficha${fichas.quantidade > 1 ? "s" : ""}` : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <Botao variante="fantasma" disabled={restantes === 0} onClick={() => acoes.usarHabilidade(personagem.id, h.id)}>
                Usar
              </Botao>
            </li>
          );
        })}
      </ul>
    </Cartao>
  );
}

const ABAS_TESTE: ItemAba[] = [
  { id: "atributos", rotulo: "Atributos" },
  { id: "pericias", rotulo: "Perícias" },
  { id: "resistencias", rotulo: "Resistências" },
];

/* Teste que o jogador faz sem pedido, sem DT (protótipo: "Testes rápidos"). O servidor rola e registra para todos. */
function BlocoTestes({ jogo }: { jogo: Jogo }) {
  const css = celular;
  const [aba, definirAba] = useState("atributos");
  const [bonus, definirBonus] = useState(0);
  const [modo, definirModo] = useState<ModoRolagem>("normal");
  const rapida = useLoja((e) => e.rolagemRapida);
  const { calc } = jogo.ficha;
  const { personagem } = jogo;
  const itens: { id: string; nome: string; valor: number; teste: AlvoDoTeste }[] =
    aba === "pericias"
      ? calc.pericias.map((p) => ({ id: p.id, nome: p.nome, valor: p.total.valor, teste: { alvo: "pericia", periciaId: p.id } }))
      : ATRIBUTOS.map((a) => ({ id: a, nome: NOME_ATRIBUTO[a], valor: (aba === "resistencias" ? calc.resistencias : calc.atributos)[a].valor, teste: { alvo: "atributo", atributo: a } }));
  const testar = (teste: AlvoDoTeste) => {
    prepararD20();
    acoes.testeRapido({ personagemId: personagem.id, tipo: aba === "resistencias" ? "resistencia" : "habilidade", teste, bonus, modo, opcao: "rolar", usarCartaDoDestino: false });
  };
  return (
    <Cartao titulo="Testes rápidos">
      <Abas rotuloGrupo="Tipo de teste" itens={ABAS_TESTE} ativa={aba} aoEscolher={definirAba} />
      <div className={css.grade}>
        {itens.map((t) => (
          <button key={t.id} type="button" className={css.teste} onClick={() => testar(t.teste)}>
            <span className={css.testeNome}>{t.nome}</span>
            <span className={`${css.testeValor} odm-numero`}>{sinal(t.valor)}</span>
          </button>
        ))}
      </div>
      <div className={comum.ajusteRapido}>
        <CampoNumero rotulo="Bônus ou penalidade" valor={bonus} aoMudar={definirBonus} />
        <Seletor rotulo="Vantagem ou desvantagem" opcoes={MODOS} valor={modo} aoMudar={definirModo} />
      </div>
      <Alternador
        rotulo="Rolar resistências automaticamente"
        dica="Para se houver habilidade para a situação"
        ligado={personagem.vivo.automatico}
        aoMudar={(l) => acoes.definirAutomatico(personagem.id, l)}
      />
      <Alternador rotulo="Rolagem rápida" dica="Neste aparelho: o d20 mostra o resultado sem a animação longa" ligado={rapida} aoMudar={acoes.definirRolagemRapida} />
    </Cartao>
  );
}

function BlocosDeCombate({ jogo, larga }: { jogo: Jogo; larga: boolean }) {
  return (
    <>
      <OfertaDeReacao jogo={jogo} />
      {!jogo.personagem.vivo.morrendo && <BlocoAtaque jogo={jogo} />}
      <BlocoImprudente jogo={jogo} />
      <BlocoFichasDeClasse calc={jogo.ficha.calc} jogo={jogo} larga={larga} />
      <BlocoUsos jogo={jogo} />
      <BlocoEfeitos jogo={jogo} larga={larga} />
      {!jogo.personagem.vivo.morrendo && <BlocoTestes jogo={jogo} />}
      <JanelaDeReacao jogo={jogo} larga={larga} />
    </>
  );
}

/* ---------- Telas ---------- */

function Celular({ jogo, aoAbrirMesa }: { jogo: Jogo; aoAbrirMesa: () => void }) {
  const css = celular;
  const [aba, definirAba] = useState("combate");
  const [registro, abrirRegistro] = useState(false);
  const [iniciativa, abrirIniciativa] = useState(true);
  const rolagem = useRef<HTMLElement>(null);
  const seuTurno = !!jogo.meu && daVez(jogo.combate)?.id === jogo.meu.id;
  const itens = NAVEGACAO.map((n) => ({ ...n, aviso: n.id === "combate" && seuTurno && aba !== "combate" }));
  return (
    <div className={`${css.tela} odm-grao`} style={{ height: "100dvh" }}>
      <FaixaTurnoCelular jogo={jogo} aoAbrirRegistro={() => abrirRegistro(true)} aoAbrirIniciativa={() => abrirIniciativa(true)} />
      <main ref={rolagem} className={css.rolagem}>
        <div className={css.coluna}>
          {aba === "combate" ? (
            <>
              <div className={comum.semCombate}>
                <p className="odm-rotulo">
                  {jogo.ficha.dados.nome} · <CabecalhoClasse ficha={jogo.ficha} />
                </p>
                <Botao variante="fantasma" className={css.voltar} onClick={aoAbrirMesa}>
                  ← Mesa e personagens
                </Botao>
              </div>
              <BlocoVida jogo={jogo} larga={false} />
              {!jogo.personagem.vivo.morrendo && <BlocoPA jogo={jogo} larga={false} />}
              <BlocosDeCombate jogo={jogo} larga={false} />
            </>
          ) : aba === "campanha" ? (
            <CampanhaJogador />
          ) : (
            <ConteudoCelular aba={aba} ficha={jogo.ficha} aoEscolher={() => undefined} aoAbrirLoja={() => undefined} />
          )}
        </div>
      </main>
      <nav className={css.nav}>
        <Abas variante="inferior" rotuloGrupo="Navegação da ficha" itens={itens} ativa={aba} aoEscolher={(a) => { definirAba(a); rolagem.current?.scrollTo({ top: 0 }); /* cada aba abre do topo */ }} />
      </nav>
      <PopUp aberto={registro} titulo="Registro da sessão" aoFechar={() => abrirRegistro(false)}>
        <Registro />
      </PopUp>
      <IniciativaJogador jogo={jogo} variante="folha" aberta={iniciativa} aoFechar={() => abrirIniciativa(false)} />
    </div>
  );
}

function Desktop({ jogo, aoAbrirMesa }: { jogo: Jogo; aoAbrirMesa: () => void }) {
  const css = desktop;
  const [aba, definirAba] = useState("personagem");
  const [iniciativa, abrirIniciativa] = useState(true);
  const { ficha } = jogo;
  return (
    <div className={`${css.tela} odm-grao`} style={{ height: "100dvh" }}>
      <FaixaTurnoDesktop jogo={jogo} />
      <div className={css.grade}>
        <aside className={css.ficha} aria-label="Ficha">
          <div className={css.fichaTopo}>
            <h1 className={css.nome}>{ficha.dados.nome}</h1>
            <p className={css.classe}>
              <CabecalhoClasse ficha={ficha} /> ·{" "}
              <button type="button" className={css.seta} onClick={aoAbrirMesa}>
                Mesa e personagens
              </button>
            </p>
          </div>
          <Abas rotuloGrupo="Ficha" itens={ABAS_FICHA} ativa={aba} aoEscolher={definirAba} quebrar />
          <div className={css.fichaCorpo}>
            {aba === "personagem" && (
              <>
                <BlocoAtributos ficha={ficha} />
                <BlocoCalculados ficha={ficha} />
                <BlocoPericias ficha={ficha} />
              </>
            )}
            {aba === "habilidades" && <BlocoHabilidades ficha={ficha} />}
            {aba === "notas" && <BlocoNotas ficha={ficha} />}
            {aba === "campanha" && <CampanhaJogador />}
            {aba === "inventario" && <p className={comum.vazio}>O personagem e o inventário abriram no centro. Escolha outra aba para voltar ao combate.</p>}
          </div>
        </aside>
        <main className={css.combate}>
          {aba === "inventario" ? (
            <div className={css.mesa}>
              <TelaPersonagem ficha={ficha} ctxCombate={jogo.ctxCombate} />
            </div>
          ) : (
          <div className={css.mesa}>
            {jogo.combate?.fase === "iniciativa" && jogo.meu && (
              <Botao variante="primario" onClick={() => abrirIniciativa(true)}>
                Iniciativa
              </Botao>
            )}
            <div className={css.linhaVida}>
              <BlocoVida jogo={jogo} larga />
              {!jogo.personagem.vivo.morrendo && <BlocoPA jogo={jogo} larga />}
            </div>
            <BlocosDeCombate jogo={jogo} larga />
          </div>
          )}
        </main>
        <aside className={css.registro} aria-label="Registro da sessão">
          <Registro />
        </aside>
      </div>
      <IniciativaJogador jogo={jogo} variante="central" aberta={iniciativa} aoFechar={() => abrirIniciativa(false)} />
    </div>
  );
}

export type JogoProps = { personagem: Personagem; ctx: ContextoFicha; conteudo: ConteudoFicha; aoAbrirMesa: () => void };

export default function TelaJogo({ personagem, ctx, conteudo, aoAbrirMesa }: JogoProps) {
  const larga = useTelaLarga();
  const jogo = useJogo(personagem, ctx, conteudo, larga ? "central" : "folha");
  return (
    <>
      {larga ? <Desktop jogo={jogo} aoAbrirMesa={aoAbrirMesa} /> : <Celular jogo={jogo} aoAbrirMesa={aoAbrirMesa} />}
      <AvisoNivel ficha={jogo.ficha} />
    </>
  );
}

export type { Jogo };
