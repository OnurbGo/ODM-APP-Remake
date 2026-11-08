import { BarraPV, Botao, Carregando, Cartao, Etiqueta, MarcadorPA, Seletor, type EstadoPA } from "@odm/estilo";
import type { Combatente, EstadoCombate, Personagem } from "@odm/protocolo";
import { calcularFicha, ordenarIniciativa, situacaoDoVivo, trocarPosicoes, type ContextoCombate, type ContextoFicha } from "@odm/regras";
import { useMemo, useState } from "react";
import { useContextoFicha } from "../../../conexao/conteudo";
import { useConteudoMestre, type ConteudoMestre } from "../../../conexao/conteudoMestre";
import { acoes, useLoja } from "../../../conexao/loja";
import { Registro } from "../../Blocos";
import { daVez, eEspecial, Grande, Mini, NOME_CARTA, ordenados, RESUMO_DO_EFEITO, Sinal } from "../../combate/comum";
import comum from "../../combate/Comum.module.css";
import ini from "../../combate/Iniciativa.module.css";
import css from "./Escudo.module.css";
import { AcoesDaCriatura, AtaqueEsperando, CartaoDaHorda, ControleVida, Descanso, EfeitosDoCombatente, FormarHorda, RolagemManual, VidaDoPersonagem } from "./AcoesDoEscudo";
import { FimDoCombate, MontarEncontro } from "./Encontros";
import { PedirTeste, type OpcoesDoPedido } from "./PedirTeste";
import { TestesEmAndamento, useTestesAbertos } from "./TestesEmAndamento";
import { salvos } from "../../../conexao/armazenamento";

/* Escudo do Mestre (especificação 7.1, parada 4). Etapa 5: montar o combate, iniciativa, turnos, rodadas e PA.
   Etapa 6: pedir testes e o cartão de resultados. Etapa 7: ataques, reação, dano, efeitos e rolagem manual. */

type Vivos = { personagens: Personagem[]; ctxFicha: ContextoFicha | null; ctx: ContextoCombate | null };

function pvDoPersonagem(c: Combatente, v: Vivos) {
  const p = v.personagens.find((x) => x.id === c.personagemId);
  if (!p || !v.ctxFicha) return null;
  const calc = calcularFicha(p.ficha, v.ctxFicha, v.ctx ? situacaoDoVivo(p.vivo, v.ctx) : {});
  return { pv: p.vivo.pv ?? calc.pvMaximo.valor, maximo: calc.pvMaximo.valor, temporarios: p.vivo.pvTemporarios, defesa: calc.defesa.valor, efeitos: p.vivo.efeitos, personagem: p, estresseMaximo: calc.estresseMaximo?.valor ?? null };
}

/* ---------- Iniciativa ---------- */

const OPCOES = [
  { id: "prioridade", rotulo: "Prioridade" },
  { id: "efeito", rotulo: "Usar efeito" },
];

function DecisaoEspecial({ c, combate }: { c: Combatente; combate: EstadoCombate }) {
  const [alvos, definirAlvos] = useState<[string, string]>(["", ""]);
  const [aliado, definirAliado] = useState(c.id);
  const [escolha, definirEscolha] = useState("");
  const valor = c.carta!.valor;
  const outros = combate.combatentes.filter((x) => x.id !== c.id);
  const precisaAlvo = escolha === "efeito" && (valor === "coringa" || valor === "K" || valor === "Q");
  const confirmar = () => acoes.decidirEfeito(c.id, true, valor === "coringa" ? alvos : [aliado]);
  return (
    <>
      <p className={ini.nota}>{RESUMO_DO_EFEITO[valor]}</p>
      <Seletor
        rotulo={`Decisão de ${c.nome}`}
        opcoes={OPCOES}
        valor={escolha}
        aoMudar={(v) => {
          definirEscolha(v);
          if (v === "prioridade") acoes.decidirEfeito(c.id, false);
          if (v === "efeito" && (valor === "A" || valor === "J")) acoes.decidirEfeito(c.id, true);
        }}
      />
      {c.tipo === "personagem" && !escolha && <p className={ini.nota}>O jogador pode decidir no aparelho dele.</p>}
      {precisaAlvo && valor === "coringa" && (
        <div className={ini.alvos}>
          {[0, 1].map((i) => (
            <select key={i} className={ini.alvo} aria-label={i === 0 ? "Primeiro alvo" : "Segundo alvo"} value={alvos[i]} onChange={(e) => definirAlvos((a) => (i === 0 ? [e.target.value, a[1]] : [a[0], e.target.value]))}>
              <option value="">{i === 0 ? "Primeiro alvo" : "Segundo alvo"}</option>
              {outros.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          ))}
        </div>
      )}
      {precisaAlvo && valor !== "coringa" && (
        <select className={ini.alvo} aria-label="Quem recebe" value={aliado} onChange={(e) => definirAliado(e.target.value)}>
          {combate.combatentes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.id === c.id ? `${o.nome} (ele mesmo)` : o.nome}
            </option>
          ))}
        </select>
      )}
      {precisaAlvo && (
        <Botao disabled={valor === "coringa" && (!alvos[0] || !alvos[1] || alvos[0] === alvos[1])} onClick={confirmar}>
          Confirmar
        </Botao>
      )}
    </>
  );
}

function Iniciativa({ combate, ctx, fichas }: { combate: EstadoCombate; ctx: ContextoCombate; fichas: (ConteudoMestre["criaturas"][number] | ConteudoMestre["ameacas"][number])[] }) {
  const opcoes = useLoja((e) => e.mesa?.opcoes);
  /* A mesma conta do servidor ao começar: ordem do baralho e, depois, as trocas do Coringa. */
  const resultado = useMemo(() => {
    const r = ordenarIniciativa(combate.combatentes, ctx.regras, opcoes?.empateIniciativa ?? "naipe");
    let ordem = r.ordem;
    for (const c of combate.combatentes) {
      if (c.usaEfeito && c.carta?.valor === "coringa" && c.alvosDoEfeito.length === 2) ordem = trocarPosicoes(ordem, c.alvosDoEfeito[0]!, c.alvosDoEfeito[1]!);
    }
    return { ...r, ordem };
  }, [combate, ctx, opcoes]);
  const porId = new Map(combate.combatentes.map((c) => [c.id, c]));
  const semCarta = combate.combatentes.filter((c) => !c.carta && !c.cartasParaEscolher.length);
  const faltam =
    semCarta.length +
    combate.combatentes.filter((c) => !c.carta && c.cartasParaEscolher.length).length +
    combate.combatentes.filter((c) => eEspecial(c.carta) && c.usaEfeito === null).length;
  const empatado = (id: string) => resultado.empates.find((e) => e.ids.includes(id))?.motivo;
  return (
    <div className={css.centroInterno}>
      <div className={ini.mestre}>
        <ul className={ini.participantes}>
          {combate.combatentes.map((c, i) => (
            <li key={c.id} className={ini.participante}>
              {c.carta ? <Grande carta={c.carta} tamanho="p" /> : <span className={ini.carta}>Sem carta</span>}
              <div className={ini.detalhes}>
                <p className={ini.nome}>
                  <Sinal tipo={c.tipo} /> {c.nome}
                </p>
                {c.carta && <p className={ini.carta}>{NOME_CARTA[c.carta.valor]}</p>}
                {c.desempate.length > 0 && (
                  <p className={ini.nota}>
                    Desempate: {c.desempate.map((d) => NOME_CARTA[d.valor]).join(", ")}
                  </p>
                )}
                {!c.carta && c.cartasParaEscolher.length > 0 && (
                  <div className={ini.alvos}>
                    {c.cartasParaEscolher.map((carta) => (
                      <Botao key={carta.id} variante="fantasma" onClick={() => acoes.escolherCarta(c.id, carta.id)}>
                        <Mini carta={carta} /> Ficar com {NOME_CARTA[carta.valor]}
                      </Botao>
                    ))}
                  </div>
                )}
                {eEspecial(c.carta) && c.usaEfeito === null && <DecisaoEspecial key={`${c.id}-${i}`} c={c} combate={combate} />}
                {c.usaEfeito && <Etiqueta tom="tecnica">Efeito</Etiqueta>}
              </div>
            </li>
          ))}
        </ul>
        <aside className={ini.lateral} aria-label="Ordem resultante">
          <h3 className={`${ini.subtitulo} odm-rotulo`}>Ordem</h3>
          {semCarta.length === combate.combatentes.length ? (
            <p className={ini.nota}>A ordem aparece quando as cartas forem compradas.</p>
          ) : (
            <ol className={ini.ordem}>
              {resultado.ordem.map((id, i) => {
                const c = porId.get(id)!;
                const motivo = empatado(id);
                return (
                  <li key={id} className={ini.ordemLinha}>
                    <span className={`${ini.posicao} odm-numero`}>{i + 1}</span>
                    {c.carta && <Mini carta={c.carta} />}
                    <span className={ini.ordemNome}>{c.nome}</span>
                    {c.usaEfeito && <Etiqueta tom="tecnica">Efeito</Etiqueta>}
                    {motivo && <Etiqueta>{motivo === "agilidade" ? "Agilidade" : motivo === "naipe" ? "Naipe" : "Nova compra"}</Etiqueta>}
                  </li>
                );
              })}
            </ol>
          )}
          <FormarHorda combate={combate} fichas={fichas} />
          <div className={ini.acao}>
            {semCarta.length > 0 && (
              <Botao variante="primario" grande largo onClick={() => acoes.comprarIniciativa()}>
                Comprar para quem falta ({semCarta.length})
              </Botao>
            )}
            {resultado.pendentes.length > 0 && faltam === 0 && (
              <Botao grande largo onClick={acoes.desempatar}>
                Desempatar por nova compra
              </Botao>
            )}
            <Botao variante="primario" grande largo disabled={faltam > 0 || resultado.pendentes.length > 0} onClick={acoes.comecarCombate}>
              {faltam > 0 ? (faltam === 1 ? "Falta 1 escolha" : `Faltam ${faltam} escolhas`) : resultado.pendentes.length ? "Empate pendente" : "Começar combate"}
            </Botao>
            <Botao variante="fantasma" largo onClick={acoes.encerrarCombate}>
              Cancelar combate
            </Botao>
          </div>
        </aside>
      </div>
    </div>
  );
}

/* ---------- Combate em curso ---------- */

function pontosDePa(c: Combatente, naVez: boolean, base: number): EstadoPA[] {
  const total = base + (c.jaAgiu ? 0 : c.marcas.paExtraNoPrimeiroTurno);
  const gastos = naVez ? Math.max(0, total - c.pa.disponiveis - c.pa.bloqueados) : 0;
  return [
    ...Array<EstadoPA>(c.pa.disponiveis).fill("disponivel"),
    ...Array<EstadoPA>(gastos).fill("gasto"),
    ...Array<EstadoPA>(c.pa.guardados).fill("guardado"),
    ...Array<EstadoPA>(c.pa.bloqueados).fill("bloqueado"),
  ];
}

function ColunaIniciativa({ combate, selecionado, selecionar, vivos }: { combate: EstadoCombate; selecionado: string | null; selecionar: (id: string) => void; vivos: Vivos }) {
  const vez = daVez(combate);
  return (
    <nav className={css.iniciativa} aria-label="Ordem de iniciativa">
      <ol className={css.ordem}>
        {ordenados(combate).map((c) => {
          const vida = c.tipo === "personagem" ? pvDoPersonagem(c, vivos) : c.pv !== null ? { pv: c.pv, maximo: c.pvMaximo ?? 0, temporarios: c.pvTemporarios } : null;
          return (
            <li key={c.id}>
              <button
                type="button"
                className={[css.combatente, c.id === vez?.id ? css.davez : "", c.id === selecionado ? css.selecionado : ""].join(" ")}
                aria-current={c.id === vez?.id ? "true" : undefined}
                aria-pressed={c.id === selecionado}
                onClick={() => selecionar(c.id)}
              >
                <span className={css.combatenteTopo}>
                  {c.carta && <Mini carta={c.carta} />}
                  <Sinal tipo={c.tipo} />
                  <span className={css.combatenteNome}>{c.nome}</span>
                  {vida && (
                    <span className={`${css.combatentePv} odm-numero`}>
                      {vida.pv}/{vida.maximo}
                    </span>
                  )}
                </span>
                {vida && <BarraPV atual={vida.pv} maximo={vida.maximo} temporario={vida.temporarios} />}
                {c.derrotado && <Etiqueta tom="perigo">Derrotado</Etiqueta>}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CartaDoDestino({ personagemId, vivos }: { personagemId: string; vivos: Vivos }) {
  const ligada = useLoja((e) => e.mesa?.opcoes.cartasDoDestino ?? false);
  const p = vivos.personagens.find((x) => x.id === personagemId);
  if (!ligada || !p) return null;
  const tem = p.vivo.cartaDoDestino;
  return (
    <div className={css.cartaDestino}>
      <span>{tem ? "Tem a Carta do Destino" : "Sem Carta do Destino"}</span>
      <Botao variante="fantasma" onClick={() => acoes.darCartaDoDestino(personagemId, !tem)}>
        {tem ? "Tirar" : "Dar a carta"}
      </Botao>
    </div>
  );
}

function FichaCombatente({ c, combate, conteudo, vivos, base, aoPedirTeste, ctx }: { c: Combatente; combate: EstadoCombate; conteudo: ConteudoMestre; vivos: Vivos; base: number; aoPedirTeste: (ids: string[]) => void; ctx: ContextoCombate }) {
  const naVez = daVez(combate)?.id === c.id;
  const fimDaRodada = combate.fase === "fim_da_rodada";
  const ficha = c.ref ? [...conteudo.criaturas, ...conteudo.ameacas].find((f) => f.id === c.ref) : undefined;
  const vida = c.tipo === "personagem" ? pvDoPersonagem(c, vivos) : null;
  const efeitos = vida ? vida.efeitos : c.efeitos;
  const tocar = (estado: EstadoPA) => {
    if (estado === "disponivel" && naVez) return () => acoes.gastarPa(c.id, "acao");
    if (estado === "guardado") return () => acoes.gastarPa(c.id, fimDaRodada ? "acao" : "reacao");
    return undefined;
  };
  return (
    <div className={css.ficha}>
      <div className={css.cabecalho}>
        <div className={css.identidade}>
          <h2 className={css.nome}>
            <Sinal tipo={c.tipo} /> {c.nome}
          </h2>
          {ficha && <p className={css.nota}>{[ficha.categoria, ficha.nd ? `ND ${ficha.nd}` : null].filter(Boolean).join(" · ")}</p>}
        </div>
        <div className={css.vidaLinha}>
          <span className={`${css.pvAtual} odm-numero`}>{vida ? vida.pv : (c.pv ?? "?")}</span>
          <span className={`${css.pvMax} odm-numero`}>/{vida ? vida.maximo : (c.pvMaximo ?? "?")}</span>
          <span className={`${css.pvRotulo} odm-rotulo`}>PV</span>
          {c.tipo !== "personagem" && <Etiqueta>Só o mestre vê</Etiqueta>}
        </div>
        <div className={css.minis}>
          <div className={css.mini}>
            <span className="odm-numero">{vida ? vida.defesa : (ficha?.defesa ?? "?")}</span>
            <span className="odm-rotulo">Defesa</span>
          </div>
        </div>
        {c.personagemId && (
          <div className={css.acoesFicha}>
            <Botao onClick={() => aoPedirTeste([c.personagemId!])}>Pedir teste</Botao>
            <CartaDoDestino personagemId={c.personagemId} vivos={vivos} />
          </div>
        )}
        <ControleVida c={c} comArea={!!c.horda} />
        {c.derrotado && <Etiqueta tom="perigo">Derrotado</Etiqueta>}
      </div>
      <Cartao titulo="PA">
        <div className={css.paLinha}>
          {pontosDePa(c, naVez, base).map((estado, i) => (
            <MarcadorPA key={i} estado={estado} aoTocar={tocar(estado)} />
          ))}
        </div>
        <div className={comum.acoesPa}>
          <Botao disabled={!(naVez ? c.pa.disponiveis > 0 || c.marcas.deslocamentoSemCusto > 0 : fimDaRodada && c.pa.guardados > 0)} onClick={() => acoes.gastarPa(c.id, "deslocamento")}>
            Deslocar (1 PA)
          </Botao>
        </div>
        {c.marcas.reacaoSemCusto && <p className={css.nota}>Rainha: a primeira reação não custa PA.</p>}
        {c.marcas.vantagemNoProximo && <p className={css.nota}>Rei: vantagem no próximo ataque ou teste de habilidade.</p>}
      </Cartao>
      {vida && <VidaDoPersonagem c={c} personagem={vida.personagem} estresseMaximo={vida.estresseMaximo} />}
      <CartaoDaHorda key={`${c.id}-${c.horda?.naArea.join()}`} c={c} ficha={ficha} combate={combate} />
      <EfeitosDoCombatente c={c} efeitos={efeitos} ctx={ctx} />
      {ficha && <AcoesDaCriatura c={c} ficha={ficha} combate={combate} />}
      {ficha && ficha.extras.length > 0 && <p className={css.nota}>{ficha.extras.join(" · ")}</p>}
    </div>
  );
}

function JogadoresAoVivo({ combate, vivos, selecionar }: { combate: EstadoCombate; vivos: Vivos; selecionar: (id: string) => void }) {
  const jogadores = combate.combatentes.filter((c) => c.tipo === "personagem");
  return (
    <section className={css.aoVivo}>
      <h2 className={css.direitaTitulo}>Jogadores ao vivo</h2>
      <ul>
        {jogadores.map((j) => {
          const vida = pvDoPersonagem(j, vivos);
          return (
            <li key={j.id}>
              <button type="button" className={css.jogador} onClick={() => selecionar(j.id)}>
                <span className={css.jogadorTopo}>
                  <span className={css.jogadorNome}>{j.nome}</span>
                  <span className={css.jogadorPa} aria-label={`${j.pa.disponiveis + j.pa.guardados} PA livres`}>
                    {[...Array<string>(j.pa.disponiveis).fill("disponivel"), ...Array<string>(j.pa.guardados).fill("guardado"), ...Array<string>(j.pa.bloqueados).fill("bloqueado")].map((e, i) => (
                      <span key={i} className={`${css.ponto} ${css[`pa-${e}`]}`} />
                    ))}
                  </span>
                  {vida && (
                    <span className={`${css.combatentePv} odm-numero`}>
                      {vida.pv}/{vida.maximo}
                    </span>
                  )}
                </span>
                {vida && <BarraPV atual={vida.pv} maximo={vida.maximo} temporario={vida.temporarios} />}
                {vida && (
                  <span className={css.jogadorBase}>
                    <span>Defesa {vida.defesa}</span>
                    {vida.efeitos.length > 0 && <span className={css.jogadorEfeitos}>{vida.efeitos.map((e) => e.nome).join(", ")}</span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function Escudo() {
  const combate = useLoja((e) => e.combate);
  const personagens = useLoja((e) => e.personagens);
  const doMestre = useConteudoMestre();
  const contextoFicha = useContextoFicha();
  const [selecionado, selecionar] = useState<string | null>(null);
  /* Pedido aberto: a lista de quem já vem marcado (vazia = ninguém). */
  const [pedindo, definirPedindo] = useState<string[] | null>(null);
  const [descansando, definirDescansando] = useState(false);
  const [encerrando, definirEncerrando] = useState(false);
  const [fechados, definirFechados] = useState<ReadonlySet<string>>(() => new Set(salvos.janelasFechadas("teste")));
  const abertos = useTestesAbertos(fechados);
  const efeitosDoPacote = doMestre.situacao === "pronto" ? doMestre.conteudo.efeitos : null;
  const efeitosPorId = useMemo(() => new Map<string, string>((efeitosDoPacote ?? []).map((e) => [e.id, e.exibir ?? e.nome])), [efeitosDoPacote]);

  if (doMestre.situacao === "carregando" || contextoFicha.situacao === "carregando") return <Carregando rotulo="Abrindo o Escudo" />;
  if (doMestre.situacao === "falhou") return <p className={css.vazio}>{doMestre.mensagem}</p>;
  if (!doMestre.ctx) {
    return (
      <div className={css.centroInterno}>
        <Cartao titulo="Regras de combate em revisão">
          <p className={css.nota}>O combate precisa destas regras aprovadas no pacote: {doMestre.faltando.join(", ")}.</p>
        </Cartao>
      </div>
    );
  }
  const vivos: Vivos = { personagens, ctxFicha: contextoFicha.situacao === "pronto" ? contextoFicha.ctx : null, ctx: doMestre.ctx };
  const base = vivos.ctxFicha?.regras.turno.pa_por_turno ?? 0;
  const vez = daVez(combate);
  const atual = combate?.combatentes.find((c) => c.id === (selecionado ?? vez?.id ?? combate.ordem[0])) ?? null;
  const opcoesDoPedido: OpcoesDoPedido = {
    personagens: personagens.filter((p) => p.situacao === "ativo"),
    pericias: vivos.ctxFicha ? [...vivos.ctxFicha.pericias.values()].map((p) => ({ id: p.id, nome: p.exibir ?? p.nome })) : [],
    efeitos: doMestre.conteudo.efeitos.map((e) => ({ id: e.id, nome: e.exibir ?? e.nome })),
    escala: doMestre.ctx.regras.testes?.escala_dt ?? {},
    oponentes: [...new Set((combate?.combatentes ?? []).filter((c) => c.tipo !== "personagem").map((c) => c.nome))],
  };
  const cartoes = <TestesEmAndamento pedidos={abertos} efeitos={efeitosPorId} aoFechar={(id) =>
        definirFechados((f) => {
          const novos = new Set([...f, id]);
          salvos.guardarJanelasFechadas("teste", [...novos]);
          return novos;
        })
      } />;

  return (
    <div className={css.tela}>
      <header className={css.faixa}>
        <h1 className={css.marca}>Escudo do Mestre</h1>
        <span />
        <p className={`${css.rodada} odm-rotulo`}>{!combate ? "Sem combate" : combate.fase === "iniciativa" ? "Iniciativa" : combate.fase === "fim_da_rodada" ? `Fim da rodada ${combate.rodada}` : `Rodada ${combate.rodada}`}</p>
        <div className={css.faixaAcoes}>
          <Botao onClick={() => definirPedindo([])}>Pedir teste</Botao>
          {!combate && <Botao onClick={() => definirDescansando(true)}>Descanso</Botao>}
          {combate?.fase === "em_curso" && (
            <Botao variante="primario" onClick={acoes.encerrarTurno}>
              Encerrar turno{vez ? ` de ${vez.nome}` : ""}
            </Botao>
          )}
          {combate?.fase === "fim_da_rodada" && (
            <Botao variante="primario" onClick={acoes.novaRodada}>
              Nova rodada
            </Botao>
          )}
          {combate && combate.fase !== "iniciativa" && <Botao onClick={() => definirEncerrando(true)}>Encerrar combate</Botao>}
        </div>
      </header>
      <PedirTeste aberto={pedindo !== null} marcados={pedindo ?? []} opcoes={opcoesDoPedido} aoFechar={() => definirPedindo(null)} />
      {encerrando && combate && <FimDoCombate combate={combate} conteudo={doMestre.conteudo} aoFechar={() => definirEncerrando(false)} />}
      <Descanso aberto={descansando} personagens={opcoesDoPedido.personagens} limite={doMestre.ctx.regras.descansos?.curtos_antes_do_longo ?? null} aoFechar={() => definirDescansando(false)} />
      {!combate ? (
        <>
          {abertos.length > 0 && <div className={css.centroInterno}>{cartoes}</div>}
          <div className={css.centroInterno}>
            <MontarEncontro conteudo={doMestre.conteudo} ctxFicha={vivos.ctxFicha} />
          </div>
        </>
      ) : combate.fase === "iniciativa" ? (
        <Iniciativa combate={combate} ctx={doMestre.ctx} fichas={[...doMestre.conteudo.criaturas, ...doMestre.conteudo.ameacas]} />
      ) : (
        <div className={css.grade}>
          <ColunaIniciativa combate={combate} selecionado={atual?.id ?? null} selecionar={selecionar} vivos={vivos} />
          <main className={css.centro}>
            <div className={css.centroInterno}>
              <AtaqueEsperando combate={combate} />
              {cartoes}
              {atual && <FichaCombatente key={atual.id} c={atual} combate={combate} conteudo={doMestre.conteudo} vivos={vivos} base={base} aoPedirTeste={definirPedindo} ctx={doMestre.ctx} />}
              <FormarHorda combate={combate} fichas={[...doMestre.conteudo.criaturas, ...doMestre.conteudo.ameacas]} />
              <RolagemManual />
            </div>
          </main>
          <aside className={css.direita} aria-label="Mesa ao vivo">
            <JogadoresAoVivo combate={combate} vivos={vivos} selecionar={selecionar} />
            <Registro className={css.registro} />
          </aside>
        </div>
      )}
    </div>
  );
}
