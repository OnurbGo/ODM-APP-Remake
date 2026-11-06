import {
  Abas,
  Alternador,
  BarraPV,
  Botao,
  CartaMini,
  Cartao,
  Etiqueta,
  EstrelaTurno,
  FichaClasse,
  Icone,
  MarcadorPA,
  NumeroSaltando,
  PopUp,
  type ItemAba,
} from "@odm/estilo";
import { useEffect, useState } from "react";
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
  type ChaveConta,
  type Efeito,
  type Habilidade,
} from "../dados/exemplo";
import type { Carta } from "../dados/baralho";
import { atual, paLivres, proximo, useCombate, type Combate, type Estado } from "../estado/useCombate";
import { useFicha, type Ficha } from "../estado/useFicha";
import type { Preferencias } from "../estado/usePreferencias";
import { useTeste } from "../estado/useTeste";
import { Moldura } from "../moldura/Moldura";
import { PainelCombate } from "../moldura/PainelCombate";
import { CamadaTeste } from "./CamadaTeste";
import css from "./CombateCelular.module.css";
import {
  AvisoNivel,
  BlocoAtributos,
  BlocoCalculados,
  BlocoCarga,
  BlocoDinheiro,
  BlocoHabilidades as BlocoHabilidadesFicha,
  BlocoHonra,
  BlocoItens,
  BlocoNotas,
  BlocoPericias,
  BlocoProgressao,
  BlocoRedencao,
} from "./ficha/BlocosFicha";
import { LojaPrestigio } from "./ficha/LojaPrestigio";
import { IniciativaJogador, useIniciativaJogador } from "./Iniciativa";

const NAVEGACAO: ItemAba[] = [
  { id: "combate", rotulo: "Combate", icone: "combate" },
  { id: "personagem", rotulo: "Personagem", icone: "personagem" },
  { id: "habilidades", rotulo: "Habilidades", icone: "habilidades" },
  { id: "inventario", rotulo: "Inventário", icone: "inventario" },
  { id: "notas", rotulo: "Notas", icone: "notas" },
];

const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
  abaInicial?: string;
};

export function CombateCelular({ preferencias, mudar, abaInicial }: Props) {
  const combate = useCombate();
  const teste = useTeste(combate);
  const ficha = useFicha(abaInicial ? "consagracao" : "escalada");
  const iniciativa = useIniciativaJogador();

  return (
    <Moldura
      titulo={abaInicial ? "Ficha, celular" : "Aba Combate, celular"}
      painel={<PainelCombate combate={combate} teste={teste} iniciativa={iniciativa} ficha={ficha} preferencias={preferencias} mudar={mudar} />}
    >
      <TelaCombate combate={{ ...combate, testar: teste.rapido }} ficha={ficha} abaInicial={abaInicial} carta={iniciativa.carta} />
      <CamadaTeste teste={teste} combate={combate} variante="folha" />
      <IniciativaJogador ini={iniciativa} combate={combate} variante="folha" />
      <AvisoNivel ficha={ficha} variante="folha" />
    </Moldura>
  );
}

function ConteudoFicha({ aba, ficha, aoAbrirLoja }: { aba: string; ficha: Ficha; aoAbrirLoja: () => void }) {
  if (aba === "habilidades") return <BlocoHabilidadesFicha ficha={ficha} />;
  if (aba === "notas") return <BlocoNotas ficha={ficha} />;
  if (aba === "inventario") {
    return (
      <>
        <BlocoCarga ficha={ficha} />
        <BlocoDinheiro ficha={ficha} />
        <BlocoItens ficha={ficha} />
      </>
    );
  }
  return (
    <>
      <BlocoProgressao ficha={ficha} aoAbrirLoja={aoAbrirLoja} />
      <BlocoAtributos ficha={ficha} />
      <BlocoCalculados ficha={ficha} variante="folha" />
      <BlocoPericias />
      <BlocoHonra ficha={ficha} />
      <BlocoRedencao ficha={ficha} />
    </>
  );
}

function TelaCombate({ combate, ficha, abaInicial, carta }: { combate: Combate; ficha: Ficha; abaInicial?: string; carta: Carta }) {
  const { estado } = combate;
  const seuTurno = estado.vez === "inacia";
  const [aba, definirAba] = useState(abaInicial ?? "combate");
  const [loja, abrirLoja] = useState(false);
  const [efeitoAberto, abrirEfeito] = useState<Efeito | null>(null);
  const [habilidadeAberta, abrirHabilidade] = useState<Habilidade | null>(null);
  const [contaAberta, abrirConta] = useState<ChaveConta | null>(null);
  const [registroAberto, abrirRegistro] = useState(false);

  const itensNav = NAVEGACAO.map((n) => ({ ...n, aviso: n.id === "combate" && seuTurno && aba !== "combate" }));

  return (
    <div className={css.tela}>
      <FaixaTurno estado={estado} carta={carta} aoAbrirRegistro={() => abrirRegistro(true)} />

      <main className={css.rolagem}>
        {aba === "combate" ? (
          <div className={css.coluna}>
            <BlocoVida combate={combate} aoAbrirConta={abrirConta} />
            {!estado.morte && <BlocoPA combate={combate} seuTurno={seuTurno} />}
            <BlocoFichas combate={combate} />
            <BlocoEfeitos efeitos={estado.efeitos} aoAbrir={abrirEfeito} />
            {!estado.morte && <BlocoTestes combate={combate} />}
            <BlocoHabilidades habilidades={estado.habilidades} aoAbrir={abrirHabilidade} />
            <Alternador
              rotulo="Rolar resistências automaticamente"
              ligado={estado.automatico}
              aoMudar={combate.definirAutomatico}
            />
          </div>
        ) : loja && ficha.estado.fase === "consagracao" ? (
          <div className={css.coluna}>
            <Botao variante="fantasma" className={css.voltar} onClick={() => abrirLoja(false)}>
              ← Voltar à ficha
            </Botao>
            <LojaPrestigio ficha={ficha} variante="folha" />
          </div>
        ) : (
          <div className={css.coluna}>
            <ConteudoFicha aba={aba} ficha={ficha} aoAbrirLoja={() => abrirLoja(true)} />
          </div>
        )}
      </main>

      {combate.aviso && <Aviso combate={combate} />}

      <nav className={css.nav}>
        <Abas
          variante="inferior"
          rotuloGrupo="Navegação da ficha"
          itens={itensNav}
          ativa={aba}
          aoEscolher={(id) => {
            definirAba(id);
            abrirLoja(false);
          }}
        />
      </nav>

      <FolhaEfeito efeito={efeitoAberto} combate={combate} aoFechar={() => abrirEfeito(null)} />
      <FolhaHabilidade habilidade={habilidadeAberta} combate={combate} aoFechar={() => abrirHabilidade(null)} />
      <FolhaConta chave={contaAberta} aoFechar={() => abrirConta(null)} />
      <PopUp aberto={registroAberto} titulo="Registro da sessão" aoFechar={() => abrirRegistro(false)}>
        {combate.ultimaDesfazivel && (
          <Botao largo className={css.desfazerRegistro} onClick={combate.desfazer}>
            <Icone nome="desfazer" tamanho={18} />
            Desfazer: {combate.ultimaDesfazivel}
          </Botao>
        )}
        <ul className={css.registro}>
          {combate.registro.map((linha) => (
            <li key={linha.id}>{linha.texto}</li>
          ))}
        </ul>
      </PopUp>
    </div>
  );
}

function FaixaTurno({ estado, carta, aoAbrirRegistro }: { estado: Estado; carta: Carta; aoAbrirRegistro: () => void }) {
  const seuTurno = estado.vez === "inacia";
  const depois = proximo(estado.vez);
  return (
    <header className={`${css.faixa} ${seuTurno ? css.faixaAtiva : ""}`}>
      <div className={css.faixaTopo}>
        <div className={css.faixaTexto} aria-live="polite">
          {seuTurno ? (
            <>
              <EstrelaTurno key={estado.cenario} tamanho={38} />
              <div>
                <p className={css.seuTurno}>Seu turno</p>
                <p className={css.depois}>Depois: {depois.nome}</p>
              </div>
            </>
          ) : (
            <div>
              <p className={css.turnoDe}>Turno de {atual(estado.vez).nome}</p>
              <p className={css.depois}>Depois: {depois.nome}</p>
            </div>
          )}
        </div>
        <button type="button" className={css.botaoRegistro} onClick={aoAbrirRegistro} aria-label="Abrir registro da sessão">
          <Icone nome="registro" />
        </button>
      </div>
      <ol className={css.ordem} aria-label="Ordem de iniciativa">
        {INICIATIVA.map((c) => (
          <li
            key={c.id}
            className={[css.ficha, c.criatura ? css.criatura : "", c.voce ? css.voce : "", c.id === estado.vez ? css.davez : ""].join(" ")}
            aria-current={c.id === estado.vez ? "true" : undefined}
            data-letra={c.nome.charAt(0)}
          >
            <span className={css.fichaInterna}>{c.nome.charAt(0)}</span>
            <span className="odm-oculto">{c.nome}</span>
          </li>
        ))}
        <li className={css.suaCarta}>
          <CartaMini valor={carta.valor} naipe={carta.naipe} />
        </li>
        <li className={css.rodada}>Rodada 3</li>
      </ol>
    </header>
  );
}

function BlocoVida({ combate, aoAbrirConta }: { combate: Combate; aoAbrirConta: (c: ChaveConta) => void }) {
  const { estado, salto } = combate;
  const [tremendo, definirTremendo] = useState(0);

  useEffect(() => {
    if (salto?.tipo === "dano") definirTremendo(salto.chave);
  }, [salto]);

  if (estado.morte) {
    return (
      <Cartao className={css.vidaMorrendo}>
        <p className={css.morrendoTitulo}>Morrendo</p>
        <p className={css.morrendoSub}>Inconsciente, com 0 PV. Teste de Morte no início do seu turno.</p>
        <Contagem rotulo="Sucessos" total={estado.morte.sucessos} tom="sucesso" />
        <Contagem rotulo="Falhas" total={estado.morte.falhas} tom="perigo" />
        {estado.vez === "inacia" && (
          <Botao variante="perigo" grande largo>
            Rolar Teste de Morte
          </Botao>
        )}
      </Cartao>
    );
  }

  return (
    <Cartao key={tremendo} className={`${css.vida} ${tremendo ? css.tremor : ""}`}>
      <div className={css.vidaTopo}>
        <button type="button" className={css.pv} onClick={() => aoAbrirConta("pv")} aria-label={`${estado.pv} de ${estado.pvMax} PV. Ver a conta`}>
          <span className={`${css.pvAtual} odm-numero`}>{estado.pv}</span>
          <span className={`${css.pvMax} odm-numero`}>/{estado.pvMax}</span>
          <span className={`${css.pvRotulo} odm-rotulo`}>PV</span>
          {estado.pvTemp > 0 && (
            <span className={css.pvTemp}>
              <Etiqueta tom="destaque">+{estado.pvTemp} temp.</Etiqueta>
            </span>
          )}
          {salto && (
            <span className={css.salto}>
              <NumeroSaltando key={salto.chave} tipo={salto.tipo} valor={salto.valor} aoTerminar={combate.limparSalto} />
            </span>
          )}
        </button>
        <div className={css.atributosVida}>
          <button type="button" className={css.miniValor} onClick={() => aoAbrirConta("defesa")}>
            <span className="odm-numero">{PERSONAGEM.defesa}</span>
            <span className="odm-rotulo">Defesa</span>
          </button>
          <button type="button" className={css.miniValor} onClick={() => aoAbrirConta("deslocamento")}>
            <span className="odm-numero">{PERSONAGEM.deslocamento}</span>
            <span className="odm-rotulo">Desloc.</span>
          </button>
        </div>
      </div>
      <BarraPV atual={estado.pv} maximo={estado.pvMax} temporario={estado.pvTemp} />
      <div className={css.vidaBase}>
        <Nivel rotulo="Exaustão" atual={estado.exaustao} total={6} />
        {estado.estresse && <Nivel rotulo="Estresse" atual={estado.estresse.atual} total={estado.estresse.maximo} />}
      </div>
    </Cartao>
  );
}

function Nivel({ rotulo, atual: valor, total }: { rotulo: string; atual: number; total: number }) {
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

function BlocoPA({ combate, seuTurno }: { combate: Combate; seuTurno: boolean }) {
  const { pa } = combate.estado;
  const disponiveis = pa.filter((v) => v === "disponivel").length;
  const guardados = pa.filter((v) => v === "guardado").length;
  const perdidos = pa.filter((v) => v === "bloqueado").length;

  const partes = [`${disponiveis} ${disponiveis === 1 ? "disponível" : "disponíveis"}`];
  if (guardados) partes.push(`${guardados} ${guardados === 1 ? "guardado" : "guardados"}`);
  if (perdidos) partes.push(`${perdidos} ${perdidos === 1 ? "perdido" : "perdidos"}`);

  return (
    <Cartao titulo="PA" extra={<span className={css.resumo}>{partes.join(" · ")}</span>}>
      <div className={css.paLinha}>
        <div className={css.pa}>
          {pa.map((estadoPA, i) => (
            <MarcadorPA
              key={i}
              estado={estadoPA}
              aoTocar={estadoPA === "disponivel" || estadoPA === "guardado" ? () => combate.gastarPA(i) : undefined}
            />
          ))}
        </div>
        {seuTurno && (
          <Botao variante="primario" className={css.encerrar} onClick={combate.encerrarTurno}>
            Encerrar turno
          </Botao>
        )}
      </div>
      {guardados > 0 && <p className={css.nota}>Guardado serve para Reação até o fim da rodada.</p>}
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

function BlocoEfeitos({ efeitos, aoAbrir }: { efeitos: Efeito[]; aoAbrir: (e: Efeito) => void }) {
  return (
    <Cartao titulo="Efeitos ativos">
      {efeitos.length === 0 ? (
        <p className={css.nota}>Nenhum efeito ativo.</p>
      ) : (
        <ul className={css.lista}>
          {efeitos.map((e) => (
            <li key={e.id}>
              <button type="button" className={css.linha} onClick={() => aoAbrir(e)}>
                <span className={`${css.linhaNome} ${css[`tom-${e.tom}`]}`}>{e.nome}</span>
                <span className={css.linhaDados}>
                  {e.acumulos !== undefined && <Etiqueta tom={e.tom === "neutro" ? "neutro" : e.tom}>×{e.acumulos}</Etiqueta>}
                  {e.turnos !== undefined && <Etiqueta>{e.turnos} {e.turnos === 1 ? "turno" : "turnos"}</Etiqueta>}
                </span>
                <Icone nome="seta" tamanho={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Cartao>
  );
}

const ABAS_TESTE: ItemAba[] = [
  { id: "atributos", rotulo: "Atributos" },
  { id: "pericias", rotulo: "Perícias" },
  { id: "resistencias", rotulo: "Resistências" },
];

function BlocoTestes({ combate }: { combate: Combate }) {
  const [aba, definirAba] = useState("atributos");
  const itens =
    aba === "pericias"
      ? PERICIAS
      : ATRIBUTOS.map((nome) => ({ nome, valor: (aba === "resistencias" ? RESISTENCIAS_VALOR : ATRIBUTOS_VALOR)[nome] }));

  return (
    <Cartao titulo="Testes rápidos">
      <button type="button" className={css.ataque} onClick={() => combate.testar(`Ataque com ${ARMA.nome}`, ARMA.acerto)}>
        <span>
          <span className={`${css.ataqueRotulo} odm-rotulo`}>Ataque</span>
          <span className={css.ataqueArma}>{ARMA.nome}</span>
        </span>
        <span className={css.ataqueValores}>
          <span className="odm-numero">{sinal(ARMA.acerto)}</span>
          <span className={`${css.ataqueDano} odm-numero`}>{ARMA.dano}</span>
        </span>
      </button>
      <Abas rotuloGrupo="Tipo de teste" itens={ABAS_TESTE} ativa={aba} aoEscolher={definirAba} />
      <div className={css.grade}>
        {itens.map((t) => (
          <button key={t.nome} type="button" className={css.teste} onClick={() => combate.testar(t.nome, t.valor)}>
            <span className={css.testeNome}>{t.nome}</span>
            <span className={`${css.testeValor} odm-numero`}>{sinal(t.valor)}</span>
          </button>
        ))}
      </div>
    </Cartao>
  );
}

function BlocoHabilidades({ habilidades, aoAbrir }: { habilidades: Habilidade[]; aoAbrir: (h: Habilidade) => void }) {
  return (
    <Cartao titulo="Habilidades">
      <ul className={css.lista}>
        {habilidades.map((h) => (
          <li key={h.id}>
            <button type="button" className={`${css.linha} ${h.usada ? css.usada : ""}`} onClick={() => aoAbrir(h)}>
              <span className={css.habTextos}>
                <span className={css.linhaNome}>{h.nome}</span>
                <span className={css.habDetalhe}>{h.usada ? `Usada — volta ${h.volta}` : `${h.custo} · ${h.frequencia}`}</span>
              </span>
              <Icone nome="seta" tamanho={16} />
            </button>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

function Aviso({ combate }: { combate: Combate }) {
  const { aviso, limparAviso } = combate;
  const chave = aviso?.chave;

  useEffect(() => {
    if (chave === undefined) return;
    const id = setTimeout(limparAviso, 4000);
    return () => clearTimeout(id);
    // limparAviso muda a cada render; o que importa é a chave do aviso
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave]);

  if (!aviso) return null;
  return (
    <div key={aviso.chave} className={css.aviso} role="status">
      <span>{aviso.texto}</span>
      {aviso.desfazivel && (
        <button type="button" className={css.avisoDesfazer} onClick={combate.desfazer}>
          <Icone nome="desfazer" tamanho={18} />
          Desfazer
        </button>
      )}
    </div>
  );
}

function FolhaEfeito({ efeito, combate, aoFechar }: { efeito: Efeito | null; combate: Combate; aoFechar: () => void }) {
  const livres = paLivres(combate.estado.pa);
  const acao = efeito?.acao;
  return (
    <PopUp aberto={!!efeito} titulo={efeito?.nome ?? ""} subtitulo={subtituloEfeito(efeito)} aoFechar={aoFechar}>
      <p className={css.textoLivro}>{TEXTO_EXEMPLO}</p>
      <div className={css.acoes}>
        {acao && efeito && (
          <Botao
            variante="primario"
            largo
            disabled={livres < acao.custoPA}
            onClick={() => {
              combate.usarAcaoEfeito(efeito);
              aoFechar();
            }}
          >
            {acao.nome} · {acao.custoPA} PA
          </Botao>
        )}
        {efeito && (
          <Botao
            largo
            onClick={() => {
              combate.encerrarEfeito(efeito);
              aoFechar();
            }}
          >
            Encerrar efeito
          </Botao>
        )}
      </div>
    </PopUp>
  );
}

function subtituloEfeito(efeito: Efeito | null) {
  if (!efeito) return undefined;
  const partes = [];
  if (efeito.acumulos !== undefined) partes.push(`${efeito.acumulos} ${efeito.acumulos === 1 ? "acúmulo" : "acúmulos"}`);
  if (efeito.turnos !== undefined) partes.push(`${efeito.turnos} ${efeito.turnos === 1 ? "turno restante" : "turnos restantes"}`);
  return partes.join(" · ") || undefined;
}

function FolhaHabilidade({ habilidade, combate, aoFechar }: { habilidade: Habilidade | null; combate: Combate; aoFechar: () => void }) {
  const livres = paLivres(combate.estado.pa);
  const faltaPA = !!habilidade && livres < (habilidade.pa ?? 0);
  return (
    <PopUp aberto={!!habilidade} titulo={habilidade?.nome ?? ""} subtitulo={habilidade ? `${habilidade.custo} · ${habilidade.frequencia}` : undefined} aoFechar={aoFechar}>
      <p className={css.textoLivro}>{TEXTO_EXEMPLO}</p>
      {habilidade && (
        <div className={css.acoes}>
          <Botao
            variante="primario"
            largo
            disabled={habilidade.usada || faltaPA}
            onClick={() => {
              combate.usarHabilidade(habilidade);
              aoFechar();
            }}
          >
            {habilidade.usada ? `Usada — volta ${habilidade.volta}` : faltaPA ? `Custa ${habilidade.pa} PA, você tem ${livres}` : "Usar"}
          </Botao>
        </div>
      )}
    </PopUp>
  );
}

function FolhaConta({ chave, aoFechar }: { chave: ChaveConta | null; aoFechar: () => void }) {
  const conta = chave ? CONTAS[chave] : null;
  return (
    <PopUp aberto={!!conta} titulo={conta?.titulo ?? ""} aoFechar={aoFechar}>
      <ul className={css.conta}>
        {conta?.linhas.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </PopUp>
  );
}
