import { Abas, BarraPV, Botao, CampoNumero, CartaMini, Cartao, Etiqueta, Icone, MarcadorPA, type ItemAba } from "@odm/estilo";
import { useState } from "react";
import { ATRIBUTOS_CURTOS, type AcaoCriatura, type Combatente } from "../dados/mesa";
import type { Efeito } from "../dados/exemplo";
import { useEscudo, type Escudo, type TesteAtivo } from "../estado/useEscudo";
import type { Preferencias } from "../estado/usePreferencias";
import { GrupoPainel, Moldura, OpcaoPainel } from "../moldura/Moldura";
import { PainelAparencia } from "../moldura/PainelAparencia";
import css from "./EscudoMestre.module.css";
import { IniciativaMestre } from "./Iniciativa";
import { PedidoTeste, type OrigemPedido } from "./PedidoTeste";

const ABAS: ItemAba[] = [
  { id: "combate", rotulo: "Combate" },
  { id: "encontros", rotulo: "Encontros" },
  { id: "missoes", rotulo: "Missões" },
  { id: "ferramentas", rotulo: "Ferramentas" },
];

const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function EscudoMestre({ preferencias, mudar }: Props) {
  const escudo = useEscudo();
  const [aba, definirAba] = useState("combate");
  const [pedido, abrirPedido] = useState<OrigemPedido | null>(null);
  const [iniciativa, abrirIniciativa] = useState(false);
  const jogadores = escudo.combatentes.filter((c) => c.tipo === "jogador");
  const selecionado = escudo.combatentes.find((c) => c.id === escudo.selecionado);

  return (
    <Moldura
      desktop
      titulo="Escudo do Mestre"
      painel={
        <>
          <GrupoPainel titulo="Abrir">
            <OpcaoPainel aoTocar={() => escudo.selecionar("carnicas")}>Horda</OpcaoPainel>
            <OpcaoPainel aoTocar={() => escudo.selecionar("bento")}>NPC</OpcaoPainel>
            <OpcaoPainel aoTocar={() => escudo.selecionar("inacia")}>Jogador</OpcaoPainel>
          </GrupoPainel>
          <GrupoPainel titulo="Campanha">
            <OpcaoPainel
              ativa={escudo.modelo === "cartas"}
              aoTocar={() => escudo.definirModelo(escudo.modelo === "cartas" ? "dados" : "cartas")}
            >
              Vantagem por cartas
            </OpcaoPainel>
          </GrupoPainel>
          <GrupoPainel titulo="Cenário">
            <OpcaoPainel ativa={escudo.lotada} aoTocar={escudo.alternarLotada}>
              Mesa lotada
            </OpcaoPainel>
          </GrupoPainel>
          <PainelAparencia preferencias={preferencias} mudar={mudar} />
        </>
      }
    >
      <div className={css.tela}>
        <header className={css.faixa}>
          <h1 className={css.marca}>Escudo do Mestre</h1>
          <Abas rotuloGrupo="Áreas do mestre" itens={ABAS} ativa={aba} aoEscolher={definirAba} />
          <p className={`${css.rodada} odm-rotulo`}>Rodada {escudo.rodada}</p>
          <div className={css.faixaAcoes}>
            <Botao onClick={() => abrirIniciativa(true)}>Nova iniciativa</Botao>
            <Botao onClick={() => abrirPedido({ origem: "Pedido do mestre" })}>Pedir teste</Botao>
            <Botao variante="primario" onClick={escudo.proximoTurno}>
              Próximo turno
            </Botao>
          </div>
        </header>

        {aba === "combate" ? (
          <div className={css.grade}>
            <ColunaIniciativa escudo={escudo} />
            <main className={css.centro}>
              <div className={css.centroInterno}>
                {escudo.teste && <TesteEmAndamento teste={escudo.teste} aoFechar={escudo.fecharTeste} />}
                {selecionado &&
                  (selecionado.tipo === "jogador" ? (
                    <FichaJogador key={selecionado.id} jogador={selecionado} escudo={escudo} aoPedir={abrirPedido} />
                  ) : (
                    <FichaCriatura key={selecionado.id} criatura={selecionado} escudo={escudo} aoPedir={abrirPedido} />
                  ))}
              </div>
            </main>
            <aside className={css.direita} aria-label="Mesa ao vivo">
              <JogadoresAoVivo jogadores={jogadores} escudo={escudo} />
              <Registro escudo={escudo} />
            </aside>
          </div>
        ) : (
          <p className={css.vazio}>Esta área entra na fase 6. A fase 1 cobre só o combate do Escudo.</p>
        )}
      </div>

      <IniciativaMestre
        aberta={iniciativa}
        aoFechar={() => abrirIniciativa(false)}
        aoComecar={(ordem) => {
          escudo.aplicarIniciativa(ordem);
          abrirIniciativa(false);
        }}
      />

      <PedidoTeste
        aberto={pedido}
        jogadores={jogadores}
        aoFechar={() => abrirPedido(null)}
        aoEnviar={(config) => {
          escudo.enviarPedido(config);
          abrirPedido(null);
        }}
      />
    </Moldura>
  );
}

function Sinal({ tipo }: { tipo: Combatente["tipo"] }) {
  const classe = tipo === "criatura" ? css.sinalCriatura : tipo === "npc" ? css.sinalNpc : "";
  return <span className={`${css.sinal} ${classe}`} aria-hidden="true" />;
}

function ColunaIniciativa({ escudo }: { escudo: Escudo }) {
  return (
    <nav className={css.iniciativa} aria-label="Ordem de iniciativa">
      <ol className={css.ordem}>
        {escudo.combatentes.map((c, i) => (
          <li key={c.id}>
            <button
              type="button"
              className={[css.combatente, i === escudo.vez ? css.davez : "", c.id === escudo.selecionado ? css.selecionado : ""].join(" ")}
              aria-current={i === escudo.vez ? "true" : undefined}
              aria-pressed={c.id === escudo.selecionado}
              onClick={() => escudo.selecionar(c.id)}
            >
              <span className={css.combatenteTopo}>
                {escudo.cartas[c.id] && <CartaMini {...escudo.cartas[c.id]} />}
                <Sinal tipo={c.tipo} />
                <span className={css.combatenteNome}>{c.nome}</span>
                <span className={`${css.combatentePv} odm-numero`}>
                  {c.pv}/{c.pvMax}
                </span>
              </span>
              <BarraPV atual={c.pv} maximo={c.pvMax} temporario={c.pvTemp} />
              {c.efeitos.length > 0 && <span className={css.combatenteEfeitos}>{c.efeitos.map((e) => e.nome).join(", ")}</span>}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function TesteEmAndamento({ teste, aoFechar }: { teste: TesteAtivo; aoFechar: () => void }) {
  const faltam = teste.resultados.filter((r) => r.estado === "aguardando").length;
  const falhas = teste.resultados.filter((r) => r.sucesso === false).length;
  return (
    <Cartao className={css.teste}>
      <header className={css.testeTopo}>
        <div>
          <h2 className={css.testeTitulo}>
            Teste de {teste.atributo} · DT {teste.dt}
          </h2>
          <p className={css.nota}>
            {teste.origem} · DT {teste.dtVisivel ? "visível" : "oculta"} para os jogadores
            {teste.efeito ? ` · ${teste.efeito.nome} em quem falhar` : ""}
          </p>
        </div>
        <button type="button" className={css.fechar} onClick={aoFechar} aria-label="Fechar teste">
          <Icone nome="fechar" tamanho={18} />
        </button>
      </header>
      <ul className={css.resultados}>
        {teste.resultados.map((r) => (
          <li key={r.id} className={css.resultado}>
            <span className={css.resultadoNome}>{r.nome}</span>
            {r.estado === "aguardando" ? (
              <span className={css.aguardando}>{r.responde === "manual" ? "Aguardando resposta no pop-up" : "Rolando…"}</span>
            ) : (
              <>
                <span className={css.resultadoConta}>
                  {r.conta}
                  {r.dt !== teste.dt ? ` (DT ${r.dt})` : ""}
                </span>
                <Etiqueta tom={r.sucesso ? "sucesso" : "perigo"}>{r.sucesso ? "Sucesso" : "Falha"}</Etiqueta>
                {r.efeitoAplicado && teste.efeito && <Etiqueta tom="perigo">{teste.efeito.nome}</Etiqueta>}
              </>
            )}
          </li>
        ))}
      </ul>
      {faltam === 0 && falhas > 0 && teste.efeito && <p className={css.nota}>Efeito aplicado. Para reverter, use Desfazer no registro.</p>}
    </Cartao>
  );
}

function ControleVida({ alvo, escudo }: { alvo: Combatente; escudo: Escudo }) {
  const [valor, definirValor] = useState(5);
  return (
    <div className={css.controleVida}>
      <CampoNumero rotulo="Valor" rotuloOculto semSinal valor={valor} minimo={1} maximo={99} aoMudar={definirValor} />
      <Botao variante="perigo" onClick={() => escudo.aplicarDano(alvo.id, valor)}>
        Dano
      </Botao>
      <Botao onClick={() => escudo.aplicarCura(alvo.id, valor)}>Cura</Botao>
    </div>
  );
}

function ListaEfeitos({ alvo, escudo }: { alvo: Combatente; escudo: Escudo }) {
  if (alvo.efeitos.length === 0) return <p className={css.nota}>Nenhum efeito ativo.</p>;
  return (
    <ul className={css.efeitos}>
      {alvo.efeitos.map((e: Efeito) => (
        <li key={e.id} className={css.efeito}>
          <span className={css[`tom-${e.tom}`]}>{e.nome}</span>
          {e.acumulos !== undefined && <Etiqueta tom={e.tom}>×{e.acumulos}</Etiqueta>}
          {e.turnos !== undefined && (
            <Etiqueta>
              {e.turnos} {e.turnos === 1 ? "turno" : "turnos"}
            </Etiqueta>
          )}
          <button type="button" className={css.encerrar} onClick={() => escudo.encerrarEfeito(alvo.id, e)}>
            Encerrar
          </button>
        </li>
      ))}
    </ul>
  );
}

function Cabecalho({ alvo, oculto }: { alvo: Combatente; oculto: boolean }) {
  return (
    <div className={css.cabecalho}>
      <div className={css.identidade}>
        <h2 className={css.nome}>{alvo.nome}</h2>
        <p className={css.nota}>{alvo.detalhe}</p>
      </div>
      <div className={css.vidaLinha}>
        <span className={`${css.pvAtual} odm-numero`}>{alvo.pv}</span>
        <span className={`${css.pvMax} odm-numero`}>/{alvo.pvMax}</span>
        <span className={`${css.pvRotulo} odm-rotulo`}>PV</span>
        {oculto && <Etiqueta>Só o mestre vê</Etiqueta>}
      </div>
      <div className={css.minis}>
        <div className={css.mini}>
          <span className="odm-numero">{alvo.defesa}</span>
          <span className="odm-rotulo">Defesa</span>
        </div>
        <div className={css.mini}>
          <span className="odm-numero">{alvo.deslocamento}</span>
          <span className="odm-rotulo">Desloc.</span>
        </div>
      </div>
    </div>
  );
}

function FichaCriatura({ criatura, escudo, aoPedir }: { criatura: Combatente; escudo: Escudo; aoPedir: (o: OrigemPedido) => void }) {
  const [acaoAberta, abrirAcao] = useState<string | null>(null);
  const alvos = escudo.combatentes.filter((c) => c.id !== criatura.id && (criatura.tipo === "npc" ? c.tipo === "criatura" : c.tipo !== "criatura"));

  function usar(acao: AcaoCriatura) {
    if (acao.teste) {
      aoPedir({
        origem: `${acao.nome}, de ${criatura.nome}`,
        atributo: acao.teste.atributo,
        dt: acao.teste.dt,
        efeito: acao.teste.efeito,
      });
      return;
    }
    abrirAcao(acaoAberta === acao.id ? null : acao.id);
  }

  return (
    <>
      <Cartao className={css.ficha}>
        <Cabecalho alvo={criatura} oculto={criatura.tipo === "criatura"} />
        <BarraPV atual={criatura.pv} maximo={criatura.pvMax} />
        <div className={css.fichaBase}>
          <ul className={css.atributos} aria-label="Atributos">
            {(criatura.atributos ?? []).map((v, i) => (
              <li key={ATRIBUTOS_CURTOS[i]} className={css.atributo}>
                <span className="odm-rotulo">{ATRIBUTOS_CURTOS[i]}</span>
                <span className="odm-numero">{sinal(v)}</span>
              </li>
            ))}
          </ul>
          <ControleVida alvo={criatura} escudo={escudo} />
        </div>
        {(criatura.extras ?? []).length > 0 && <p className={css.nota}>{criatura.extras?.join(" · ")}</p>}
      </Cartao>

      {criatura.horda && (
        <Cartao titulo="Horda" className={css.horda}>
          <div className={css.hordaLinha}>
            <div className={css.integrantes} role="img" aria-label={`${criatura.horda.integrantes} integrantes`}>
              {Array.from({ length: criatura.horda.integrantes }, (_, i) => (
                <span key={i} className={css.integrante} />
              ))}
            </div>
            <div className={css.mini}>
              <span className="odm-numero">{criatura.horda.integrantes}</span>
              <span className="odm-rotulo">Integrantes</span>
            </div>
            <div className={css.mini}>
              <span className="odm-numero">{sinal(criatura.horda.bonus)}</span>
              <span className="odm-rotulo">Bônus de Horda</span>
            </div>
            <div className={css.mini}>
              <span className="odm-numero">{criatura.horda.pa}</span>
              <span className="odm-rotulo">PA</span>
            </div>
          </div>
          <p className={css.nota}>Só visual nesta fase: formar, somar PV e remover integrantes entram na fase 5.</p>
        </Cartao>
      )}

      <div className={css.colunas}>
        <Cartao titulo="Ações">
          <ul className={css.acoes}>
            {(criatura.acoes ?? []).map((a) => (
              <li key={a.id}>
                <button type="button" className={css.acao} onClick={() => usar(a)} aria-expanded={a.ataque ? acaoAberta === a.id : undefined}>
                  <span className={css.acaoNome}>{a.nome}</span>
                  <span className={css.acaoDetalhe}>
                    {a.custo}
                    {a.ataque && ` · ${sinal(a.ataque.acerto)} · ${a.ataque.dano} ${a.ataque.tipo}`}
                    {a.teste && ` · Teste de ${a.teste.atributo}, DT ${a.teste.dt} · ${a.teste.efeito.nome} na falha`}
                  </span>
                </button>
                {acaoAberta === a.id && (
                  <div className={css.alvos}>
                    <span className="odm-rotulo">Alvo</span>
                    {alvos.map((alvo) => (
                      <Botao
                        key={alvo.id}
                        onClick={() => {
                          escudo.usarAtaque(criatura, a, alvo.id);
                          abrirAcao(null);
                        }}
                      >
                        {alvo.nome}
                      </Botao>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo="Efeitos">
          <ListaEfeitos alvo={criatura} escudo={escudo} />
        </Cartao>
      </div>
    </>
  );
}

function FichaJogador({ jogador, escudo, aoPedir }: { jogador: Combatente; escudo: Escudo; aoPedir: (o: OrigemPedido) => void }) {
  return (
    <>
      <Cartao className={css.ficha}>
        <Cabecalho alvo={jogador} oculto={false} />
        <BarraPV atual={jogador.pv} maximo={jogador.pvMax} temporario={jogador.pvTemp} />
        <div className={css.fichaBase}>
          <div className={css.paLinha}>
            <span className="odm-rotulo">PA</span>
            {(jogador.pa ?? []).map((e, i) => (
              <MarcadorPA key={i} estado={e} pequeno />
            ))}
            {jogador.pvTemp ? <Etiqueta tom="destaque">+{jogador.pvTemp} temp.</Etiqueta> : null}
          </div>
          <ControleVida alvo={jogador} escudo={escudo} />
        </div>
      </Cartao>
      <div className={css.colunas}>
        <Cartao titulo="Fichas de classe">
          <ul className={css.fichasClasse}>
            {(jogador.fichas ?? []).map((f) => (
              <li key={f.nome}>
                <span>{f.nome}</span>
                <span className="odm-numero">
                  {f.atual}/{f.maximo}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
        <Cartao titulo="Efeitos">
          <ListaEfeitos alvo={jogador} escudo={escudo} />
        </Cartao>
      </div>
      <Botao onClick={() => aoPedir({ origem: `Pedido do mestre para ${jogador.nome}` })}>Pedir teste</Botao>
    </>
  );
}

function JogadoresAoVivo({ jogadores, escudo }: { jogadores: Combatente[]; escudo: Escudo }) {
  return (
    <section className={css.aoVivo}>
      <h2 className={css.direitaTitulo}>Jogadores ao vivo</h2>
      <ul>
        {jogadores.map((j) => (
          <li key={j.id}>
            <button type="button" className={css.jogador} onClick={() => escudo.selecionar(j.id)}>
              <span className={css.jogadorTopo}>
                <span className={css.jogadorNome}>{j.nome}</span>
                <span className={css.jogadorPa} aria-label={`${(j.pa ?? []).filter((p) => p === "disponivel" || p === "guardado").length} PA livres`}>
                  {(j.pa ?? []).map((e, i) => (
                    <span key={i} className={`${css.ponto} ${css[`pa-${e}`]}`} />
                  ))}
                </span>
                <span className={`${css.combatentePv} odm-numero`}>
                  {j.pv}/{j.pvMax}
                </span>
              </span>
              <BarraPV atual={j.pv} maximo={j.pvMax} temporario={j.pvTemp} />
              <span className={css.jogadorBase}>
                <span>Defesa {j.defesa}</span>
                {j.efeitos.length > 0 && <span className={css.jogadorEfeitos}>{j.efeitos.map((e) => e.nome).join(", ")}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Registro({ escudo }: { escudo: Escudo }) {
  return (
    <section className={css.registro} aria-label="Registro da sessão">
      <h2 className={css.direitaTitulo}>Registro da sessão</h2>
      <ol className={css.registroLista} aria-live="polite">
        {escudo.registro.map((l) => (
          <li key={l.id} className={css.evento}>
            <span className={l.desfeita ? css.desfeita : ""}>{l.texto}</span>
            {l.podeDesfazer && (
              <button type="button" className={css.desfazer} onClick={() => escudo.desfazer(l.id)}>
                <Icone nome="desfazer" tamanho={14} />
                Desfazer
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
