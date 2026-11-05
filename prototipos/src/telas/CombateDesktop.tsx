import {
  Abas,
  Alternador,
  BarraPV,
  Botao,
  CartaMini,
  Cartao,
  Dica,
  Etiqueta,
  EstrelaTurno,
  FichaClasse,
  Icone,
  MarcadorPA,
  NumeroSaltando,
  type ItemAba,
} from "@odm/estilo";
import { useState, type ReactNode } from "react";
import {
  ARMA,
  ATRIBUTOS,
  ATRIBUTOS_VALOR,
  CONTAS,
  INICIATIVA,
  PERICIAS,
  PERSONAGEM,
  RESISTENCIAS_VALOR,
  TEXTO_EXEMPLO,
  type Efeito,
  type Habilidade,
} from "../dados/exemplo";
import { CARTAS_MESA, type Carta } from "../dados/baralho";
import { atual, paLivres, proximo, useCombate, type Combate, type Estado } from "../estado/useCombate";
import { useFicha, type Ficha } from "../estado/useFicha";
import type { Preferencias } from "../estado/usePreferencias";
import { useTeste } from "../estado/useTeste";
import { Moldura } from "../moldura/Moldura";
import { PainelCombate } from "../moldura/PainelCombate";
import { CamadaTeste } from "./CamadaTeste";
import css from "./CombateDesktop.module.css";
import {
  AvisoNivel,
  BlocoCarga,
  BlocoDinheiro,
  BlocoHabilidades as BlocoHabilidadesFicha,
  BlocoItens,
  BlocoNotas,
} from "./ficha/BlocosFicha";
import { IniciativaJogador, useIniciativaJogador } from "./Iniciativa";

const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

const ABAS_FICHA: ItemAba[] = [
  { id: "personagem", rotulo: "Personagem" },
  { id: "habilidades", rotulo: "Habilidades" },
  { id: "inventario", rotulo: "Inventário" },
  { id: "notas", rotulo: "Notas" },
];

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function CombateDesktop({ preferencias, mudar }: Props) {
  const combate = useCombate();
  const teste = useTeste(combate);
  const ficha = useFicha("escalada");
  const iniciativa = useIniciativaJogador();
  return (
    <Moldura
      desktop
      titulo="Aba Combate, desktop"
      painel={<PainelCombate combate={combate} teste={teste} iniciativa={iniciativa} ficha={ficha} preferencias={preferencias} mudar={mudar} />}
    >
      <CamadaTeste teste={teste} combate={combate} variante="central" />
      <AvisoNivel ficha={ficha} variante="central" />
      <IniciativaJogador ini={iniciativa} combate={combate} variante="central" />
      <div className={css.tela}>
        <FaixaMesa estado={combate.estado} carta={iniciativa.carta} />
        <div className={css.grade}>
          <ColunaFicha combate={{ ...combate, testar: teste.rapido }} ficha={ficha} />
          <main className={css.combate}>
            <div className={css.mesa}>
              {combate.estado.morte ? (
                <BlocoMorrendo combate={combate} />
              ) : (
                <div className={css.linhaVida}>
                  <BlocoVida combate={combate} />
                  <BlocoPA combate={combate} />
                </div>
              )}
              <BlocoFichas combate={combate} />
              <div className={css.linhaListas}>
                <BlocoEfeitos combate={combate} />
                <BlocoHabilidades combate={combate} />
              </div>
              <Alternador
                rotulo="Rolar resistências automaticamente"
                ligado={combate.estado.automatico}
                aoMudar={combate.definirAutomatico}
              />
            </div>
          </main>
          <ColunaRegistro combate={combate} />
        </div>
      </div>
    </Moldura>
  );
}

function FaixaMesa({ estado, carta }: { estado: Estado; carta: Carta }) {
  const seuTurno = estado.vez === "inacia";
  return (
    <header className={`${css.faixa} ${seuTurno ? css.faixaAtiva : ""}`}>
      <div className={css.turno} aria-live="polite">
        {seuTurno ? (
          <>
            <EstrelaTurno key={estado.cenario} tamanho={44} />
            <div>
              <p className={css.seuTurno}>Seu turno</p>
              <p className={css.depois}>Depois: {proximo(estado.vez).nome}</p>
            </div>
          </>
        ) : (
          <div>
            <p className={css.turnoDe}>Turno de {atual(estado.vez).nome}</p>
            <p className={css.depois}>Depois: {proximo(estado.vez).nome}</p>
          </div>
        )}
      </div>
      <ol className={css.ordem} aria-label="Ordem de iniciativa">
        {INICIATIVA.map((c) => (
          <li
            key={c.id}
            className={[css.combatente, c.id === estado.vez ? css.davez : "", c.voce ? css.voce : ""].join(" ")}
            aria-current={c.id === estado.vez ? "true" : undefined}
          >
            <span className={`${css.sinal} ${c.criatura ? css.sinalCriatura : ""}`} aria-hidden="true" />
            <span className={css.combatenteNome}>{c.nome}</span>
            <CartaMini {...(c.voce ? carta : CARTAS_MESA[c.id])} />
          </li>
        ))}
      </ol>
      <p className={`${css.rodada} odm-rotulo`}>Rodada 3</p>
    </header>
  );
}

function ColunaFicha({ combate, ficha }: { combate: Combate; ficha: Ficha }) {
  const [aba, definirAba] = useState("personagem");
  return (
    <aside className={css.ficha} aria-label="Ficha">
      <div className={css.fichaTopo}>
        <h1 className={css.nome}>{PERSONAGEM.nome}</h1>
        <p className={css.classe}>
          {PERSONAGEM.classe} · Nível {ficha.estado.nivel} · <a href="#/ficha-desktop">Ficha completa</a>
        </p>
      </div>
      <Abas rotuloGrupo="Ficha" itens={ABAS_FICHA} ativa={aba} aoEscolher={definirAba} />
      <div className={css.fichaCorpo}>
        {aba === "personagem" && <Testes combate={combate} />}
        {aba === "habilidades" && <BlocoHabilidadesFicha ficha={ficha} />}
        {aba === "notas" && <BlocoNotas ficha={ficha} />}
        {aba === "inventario" && (
          <div className={css.inventario}>
            <BlocoCarga ficha={ficha} />
            <BlocoDinheiro ficha={ficha} />
            <BlocoItens ficha={ficha} />
          </div>
        )}
      </div>
    </aside>
  );
}

function Testes({ combate }: { combate: Combate }) {
  const inconsciente = !!combate.estado.morte;
  return (
    <>
      <button
        type="button"
        className={css.ataque}
        disabled={inconsciente}
        onClick={() => combate.testar(`Ataque com ${ARMA.nome}`, ARMA.acerto)}
      >
        <span>
          <span className={`${css.ataqueRotulo} odm-rotulo`}>Ataque</span>
          <span className={css.ataqueArma}>{ARMA.nome}</span>
        </span>
        <span className={css.ataqueValores}>
          <span className="odm-numero">{sinal(ARMA.acerto)}</span>
          <span className={`${css.ataqueDano} odm-numero`}>{ARMA.dano}</span>
        </span>
      </button>

      <div className={css.tabela}>
        <div className={css.tabelaTopo}>
          <span className="odm-rotulo">Atributo</span>
          <span className="odm-rotulo">Teste</span>
          <span className="odm-rotulo">Resist.</span>
        </div>
        {ATRIBUTOS.map((nome) => (
          <div key={nome} className={css.tabelaLinha}>
            <span>{nome}</span>
            <BotaoTeste nome={nome} valor={ATRIBUTOS_VALOR[nome]} desligado={inconsciente} combate={combate} />
            <BotaoTeste nome={`Resistência de ${nome}`} valor={RESISTENCIAS_VALOR[nome]} desligado={inconsciente} combate={combate} />
          </div>
        ))}
      </div>

      <h2 className={`${css.subtitulo} odm-rotulo`}>Perícias</h2>
      <div className={css.pericias}>
        {PERICIAS.map((p) => (
          <div key={p.nome} className={css.pericia}>
            <span>{p.nome}</span>
            <BotaoTeste nome={p.nome} valor={p.valor} desligado={inconsciente} combate={combate} />
          </div>
        ))}
      </div>
      {inconsciente && <p className={css.nota}>Inconsciente: os testes voltam quando recuperar a consciência.</p>}
    </>
  );
}

function BotaoTeste({ nome, valor, desligado, combate }: { nome: string; valor: number; desligado: boolean; combate: Combate }) {
  return (
    <button
      type="button"
      className={`${css.teste} odm-numero`}
      disabled={desligado}
      onClick={() => combate.testar(nome, valor)}
      aria-label={`Rolar ${nome}, ${sinal(valor)}`}
    >
      {sinal(valor)}
    </button>
  );
}

function BlocoVida({ combate }: { combate: Combate }) {
  const { estado, salto } = combate;
  const tremendo = salto?.tipo === "dano" ? salto.chave : 0;
  return (
    <Cartao key={tremendo} className={`${css.vida} ${tremendo ? css.tremor : ""}`}>
      <div className={css.vidaTopo}>
        <div className={css.pvBloco}>
          <Dica titulo={CONTAS.pv.titulo} linhas={CONTAS.pv.linhas} classeBotao={css.pv}>
            <span className={`${css.pvAtual} odm-numero`}>{estado.pv}</span>
            <span className={`${css.pvMax} odm-numero`}>/{estado.pvMax}</span>
            <span className={`${css.pvRotulo} odm-rotulo`}>PV</span>
          </Dica>
          {estado.pvTemp > 0 && <Etiqueta tom="destaque">+{estado.pvTemp} temp.</Etiqueta>}
          {salto && (
            <span className={css.salto}>
              <NumeroSaltando key={salto.chave} tipo={salto.tipo} valor={salto.valor} aoTerminar={combate.limparSalto} />
            </span>
          )}
        </div>
        <div className={css.minis}>
          <Dica titulo={CONTAS.defesa.titulo} linhas={CONTAS.defesa.linhas} classeBotao={css.mini}>
            <span className="odm-numero">{PERSONAGEM.defesa}</span>
            <span className="odm-rotulo">Defesa</span>
          </Dica>
          <Dica titulo={CONTAS.deslocamento.titulo} linhas={CONTAS.deslocamento.linhas} classeBotao={css.mini} alinhar="fim">
            <span className="odm-numero">{PERSONAGEM.deslocamento}</span>
            <span className="odm-rotulo">Desloc.</span>
          </Dica>
        </div>
      </div>
      <BarraPV atual={estado.pv} maximo={estado.pvMax} temporario={estado.pvTemp} />
      <Nivel rotulo="Exaustão" valor={estado.exaustao} total={6} />
      {estado.estresse && <Nivel rotulo="Estresse" valor={estado.estresse.atual} total={estado.estresse.maximo} />}
    </Cartao>
  );
}

function Nivel({ rotulo, valor, total }: { rotulo: string; valor: number; total: number }) {
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

function BlocoMorrendo({ combate }: { combate: Combate }) {
  const morte = combate.estado.morte;
  if (!morte) return null;
  return (
    <Cartao className={css.morrendo}>
      <div>
        <p className={css.morrendoTitulo}>Morrendo</p>
        <p className={css.nota}>Inconsciente, com 0 PV. Teste de Morte no início do seu turno.</p>
      </div>
      <div className={css.contagens}>
        <Contagem rotulo="Sucessos" total={morte.sucessos} tom="sucesso" />
        <Contagem rotulo="Falhas" total={morte.falhas} tom="perigo" />
      </div>
      {combate.estado.vez === "inacia" && (
        <Botao variante="perigo" grande>
          Rolar Teste de Morte
        </Botao>
      )}
    </Cartao>
  );
}

function Contagem({ rotulo, total, tom }: { rotulo: string; total: number; tom: "sucesso" | "perigo" }) {
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

function BlocoPA({ combate }: { combate: Combate }) {
  const { pa, vez } = combate.estado;
  const disponiveis = pa.filter((v) => v === "disponivel").length;
  const guardados = pa.filter((v) => v === "guardado").length;
  const perdidos = pa.filter((v) => v === "bloqueado").length;

  const partes = [`${disponiveis} ${disponiveis === 1 ? "disponível" : "disponíveis"}`];
  if (guardados) partes.push(`${guardados} ${guardados === 1 ? "guardado" : "guardados"}`);
  if (perdidos) partes.push(`${perdidos} ${perdidos === 1 ? "perdido" : "perdidos"}`);

  return (
    <Cartao titulo="PA" className={css.blocoPA} extra={<span className={css.resumo}>{partes.join(" · ")}</span>}>
      <div className={css.marcadores}>
        {pa.map((estadoPA, i) => (
          <MarcadorPA
            key={i}
            estado={estadoPA}
            aoTocar={estadoPA === "disponivel" || estadoPA === "guardado" ? () => combate.gastarPA(i) : undefined}
          />
        ))}
      </div>
      {vez === "inacia" ? (
        <Botao variante="primario" largo onClick={combate.encerrarTurno}>
          Encerrar turno
        </Botao>
      ) : (
        guardados > 0 && <p className={css.nota}>Guardado serve para Reação até o fim da rodada.</p>
      )}
    </Cartao>
  );
}

function BlocoFichas({ combate }: { combate: Combate }) {
  return (
    <Cartao titulo="Fichas de classe">
      <div className={css.fichas}>
        {combate.estado.fichas.map((f) => (
          <FichaClasse key={f.id} nome={f.nome} atual={f.atual} maximo={f.maximo} aoMudar={(d) => combate.mudarFicha(f.id, d)} />
        ))}
      </div>
    </Cartao>
  );
}

function LinhaAbrivel({
  aberta,
  aoAlternar,
  cabeca,
  children,
}: {
  aberta: boolean;
  aoAlternar: () => void;
  cabeca: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className={aberta ? css.aberta : ""}>
      <button type="button" className={css.linha} onClick={aoAlternar} aria-expanded={aberta}>
        {cabeca}
        <span className={css.seta}>
          <Icone nome="seta" tamanho={16} />
        </span>
      </button>
      {aberta && <div className={css.detalhe}>{children}</div>}
    </li>
  );
}

/* No desktop o detalhe abre na própria lista: o texto fica ao lado da mesa, sem tampar nada. */
function BlocoEfeitos({ combate }: { combate: Combate }) {
  const [aberto, abrir] = useState<string | null>(null);
  const { efeitos, pa } = combate.estado;
  const livres = paLivres(pa);
  return (
    <Cartao titulo="Efeitos ativos">
      {efeitos.length === 0 ? (
        <p className={css.nota}>Nenhum efeito ativo.</p>
      ) : (
        <ul className={css.lista}>
          {efeitos.map((e: Efeito) => (
            <LinhaAbrivel
              key={e.id}
              aberta={aberto === e.id}
              aoAlternar={() => abrir(aberto === e.id ? null : e.id)}
              cabeca={
                <>
                  <span className={`${css.linhaNome} ${css[`tom-${e.tom}`]}`}>{e.nome}</span>
                  <span className={css.linhaDados}>
                    {e.acumulos !== undefined && <Etiqueta tom={e.tom}>×{e.acumulos}</Etiqueta>}
                    {e.turnos !== undefined && (
                      <Etiqueta>
                        {e.turnos} {e.turnos === 1 ? "turno" : "turnos"}
                      </Etiqueta>
                    )}
                  </span>
                </>
              }
            >
              <p className={css.textoLivro}>{TEXTO_EXEMPLO}</p>
              <div className={css.acoes}>
                {e.acao && (
                  <Botao variante="primario" disabled={livres < e.acao.custoPA} onClick={() => combate.usarAcaoEfeito(e)}>
                    {e.acao.nome} · {e.acao.custoPA} PA
                  </Botao>
                )}
                <Botao onClick={() => combate.encerrarEfeito(e)}>Encerrar efeito</Botao>
              </div>
            </LinhaAbrivel>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

function BlocoHabilidades({ combate }: { combate: Combate }) {
  const [aberta, abrir] = useState<string | null>(null);
  const livres = paLivres(combate.estado.pa);
  return (
    <Cartao titulo="Habilidades">
      <ul className={css.lista}>
        {combate.estado.habilidades.map((h: Habilidade) => {
          const faltaPA = livres < (h.pa ?? 0);
          return (
            <LinhaAbrivel
              key={h.id}
              aberta={aberta === h.id}
              aoAlternar={() => abrir(aberta === h.id ? null : h.id)}
              cabeca={
                <span className={`${css.habTextos} ${h.usada ? css.usada : ""}`}>
                  <span className={css.linhaNome}>{h.nome}</span>
                  <span className={css.habDetalhe}>{h.usada ? `Usada — volta ${h.volta}` : `${h.custo} · ${h.frequencia}`}</span>
                </span>
              }
            >
              <p className={css.textoLivro}>{TEXTO_EXEMPLO}</p>
              <div className={css.acoes}>
                <Botao
                  variante="primario"
                  disabled={h.usada || faltaPA}
                  onClick={() => {
                    combate.usarHabilidade(h);
                    abrir(null);
                  }}
                >
                  {h.usada ? `Usada — volta ${h.volta}` : faltaPA ? `Custa ${h.pa} PA, você tem ${livres}` : "Usar"}
                </Botao>
              </div>
            </LinhaAbrivel>
          );
        })}
      </ul>
    </Cartao>
  );
}

function ColunaRegistro({ combate }: { combate: Combate }) {
  return (
    <aside className={css.registro} aria-label="Registro da sessão">
      <h2 className={css.registroTitulo}>Registro da sessão</h2>
      <ol className={css.registroLista} aria-live="polite">
        {combate.registro.map((l) => (
          <li key={l.id} className={`${css.evento} ${l.tipo === "teste" ? css.eventoTeste : ""}`}>
            <span className={l.desfeita ? css.desfeita : ""}>{l.texto}</span>
            {l.id === combate.linhaDesfazivel && (
              <button type="button" className={css.desfazer} onClick={combate.desfazer}>
                <Icone nome="desfazer" tamanho={16} />
                Desfazer
              </button>
            )}
          </li>
        ))}
      </ol>
    </aside>
  );
}
