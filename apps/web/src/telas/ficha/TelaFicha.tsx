import { Abas, Botao, Etiqueta, PopUp, useTrocaDeTela, type ItemAba } from "@odm/estilo";
import type { Operacao, Personagem } from "@odm/protocolo";
import { calcularFicha, entregaDoNivel, opcoesDoTalento, pedeAtributo, pendenciasDeNivel, talentosDaLoja, type ContextoFicha, type Pendencia } from "@odm/regras";
import { useEffect, useMemo, useState } from "react";
import { salvos } from "../../conexao/armazenamento";
import { acoes, useLoja } from "../../conexao/loja";
import { useTelaLarga } from "../useLargura";
import {
  BlocoAtributos,
  BlocoCalculados,
  BlocoCarga,
  BlocoDinheiro,
  BlocoFichasDeClasse,
  BlocoHabilidades,
  BlocoHonra,
  BlocoItens,
  BlocoNotas,
  BlocoPericias,
  BlocoProgressao,
  BlocoRedencao,
  type FichaVista,
} from "./Blocos";
import css from "./Ficha.module.css";
import desktop from "./FichaDesktop.module.css";
import { EscolherAtributo, EscolherOpcoes, LojaPrestigio } from "./Loja";

/* Sobe sozinho o que a tabela dá; só especialização, talento e listas pedem escolha (seção 6.2.1). */
function Escolha({ ficha, pendencia, aoFechar }: { ficha: FichaVista; pendencia: Pendencia; aoFechar: () => void }) {
  const { ctx, dados } = ficha;
  const [talento, definirTalento] = useState<string | null>(null);
  const classe = dados.classeId ? ctx.classes.get(dados.classeId) : undefined;
  const titulo = pendencia.tipo === "talento" ? "Escolha um Talento" : pendencia.tipo === "especializacao" ? "Escolha a Especialização" : pendencia.rotulo;
  const concluir = (op: Operacao) => {
    ficha.operar(op);
    aoFechar();
  };
  return (
    <PopUp aberto titulo={titulo} subtitulo={`Nível ${pendencia.nivel}`} variante={ficha.variante} aoFechar={aoFechar}>
      <div className={css.janela}>
        {pendencia.tipo === "especializacao" &&
          [...ctx.especializacoes.values()]
            .filter((e) => e.classe === classe?.nome)
            .map((e) => (
              <details key={e.id} className={css.habilidade}>
                <summary className={css.linhaTexto}>{e.nome}</summary>
                <p className={css.habilidadeTexto}>{e.descricao}</p>
                <Botao largo onClick={() => concluir({ op: "especializacao", id: e.id })}>
                  Escolher
                </Botao>
              </details>
            ))}
        {pendencia.tipo === "talento" && !talento &&
          talentosDaLoja(dados, ctx).map((t) => (
            <details key={t.id} className={css.habilidade}>
              <summary className={css.linhaTexto}>{t.nome}</summary>
              <p className={css.habilidadeTexto}>{t.texto}</p>
              <Botao
                largo
                disabled={!!t.motivo}
                onClick={() => {
                  if (pedeAtributo(t.id, ctx) || opcoesDoTalento(t.id, ctx)) definirTalento(t.id);
                  else concluir({ op: "talento_de_nivel", nivel: pendencia.nivel, escolha: { nivel: pendencia.nivel, talentoId: t.id } });
                }}
              >
                {t.motivo ?? "Escolher"}
              </Botao>
            </details>
          ))}
        {talento && pedeAtributo(talento, ctx) && (
          <EscolherAtributo
            ficha={ficha}
            talentoId={talento}
            aoEscolher={(atributo) => concluir({ op: "talento_de_nivel", nivel: pendencia.nivel, escolha: { nivel: pendencia.nivel, talentoId: talento, atributo } })}
          />
        )}
        {talento && !pedeAtributo(talento, ctx) && (
          <EscolherOpcoes
            ficha={ficha}
            talentoId={talento}
            aoEscolher={(escolhas) => concluir({ op: "talento_de_nivel", nivel: pendencia.nivel, escolha: { nivel: pendencia.nivel, talentoId: talento, escolhas } })}
          />
        )}
        {pendencia.tipo === "escolha" && (
          <>
            <p className={css.nota}>Escolha {pendencia.quantidade === 1 ? "mais 1" : `${pendencia.quantidade}, uma de cada vez`}.</p>
            {pendencia.opcoes.map((id) => {
              const h = ctx.habilidades.get(id);
              return (
                <details key={id} className={css.habilidade}>
                  <summary className={css.linhaTexto}>{h?.nome ?? id}</summary>
                  <p className={css.habilidadeTexto}>{h?.texto}</p>
                  <Botao
                    largo
                    onClick={() =>
                      concluir({ op: "escolhas_de_nivel", nivel: pendencia.nivel, ids: [...(dados.escolhasDeNivel[String(pendencia.nivel)] ?? []), id] })
                    }
                  >
                    Escolher
                  </Botao>
                </details>
              );
            })}
          </>
        )}
      </div>
    </PopUp>
  );
}

/* Mostra uma vez por nível, neste aparelho: quem recebe o XP é o mestre, e o jogador pode nem estar olhando. */
function AvisoNivel({ ficha }: { ficha: FichaVista }) {
  const { personagem, calc, ctx, dados } = ficha;
  const { trocar, camada } = useTrocaDeTela();
  const [visto, definirVisto] = useState(() => salvos.nivelVisto(personagem.id) ?? calc.nivel);
  const [aberto, abrir] = useState(false);

  useEffect(() => {
    if (salvos.nivelVisto(personagem.id) === null) salvos.guardarNivelVisto(personagem.id, calc.nivel);
    if (calc.nivel > visto && !aberto) trocar("cartaz", () => abrir(true));
  }, [calc.nivel, visto, aberto, personagem.id, trocar]);

  const fechar = () => {
    salvos.guardarNivelVisto(personagem.id, calc.nivel);
    definirVisto(calc.nivel);
    abrir(false);
  };

  const classe = dados.classeId ? ctx.classes.get(dados.classeId) : undefined;
  const pontosDe = (lista: { pontoDePrestigio: boolean }[]) => lista.filter((e) => e.pontoDePrestigio).length;
  const entregas = classe ? Array.from({ length: Math.max(0, calc.nivel - visto) }, (_, i) => entregaDoNivel(classe, visto + i + 1, dados.especializacaoId, ctx)) : [];
  const pontos = pontosDe(entregas);
  return (
    <>
      <PopUp aberto={aberto} titulo="Subiu de nível" subtitulo={`Nível ${calc.nivel}`} variante={ficha.variante} aoFechar={fechar}>
        <h3 className={`${css.subtitulo} odm-rotulo`}>Já aplicado</h3>
        <ul className={css.conta}>
          {entregas.flatMap((e) => e.automatico.map((a) => <li key={`${e.nivel}-${a.id}`}>{a.nome}</li>))}
          {pontos > 0 && <li>{pontos === 1 ? "1 Ponto de Prestígio" : `${pontos} Pontos de Prestígio`}</li>}
        </ul>
        <p className={css.nota}>PV máximos agora: {calc.pvMaximo.valor}. O que pede escolha fica pendente até você escolher.</p>
        <Botao variante="primario" largo onClick={fechar}>
          Continuar
        </Botao>
      </PopUp>
      {camada}
    </>
  );
}

function CabecalhoClasse({ ficha }: { ficha: FichaVista }) {
  const { dados, ctx, calc } = ficha;
  const classe = dados.classeId ? (ctx.classes.get(dados.classeId)?.nome ?? ctx.classes.get(dados.classeId)?.id) : null;
  const especializacao = dados.especializacaoId ? ctx.especializacoes.get(dados.especializacaoId)?.nome : null;
  return (
    <>
      {classe}
      {especializacao ? ` · ${especializacao}` : ""} · Nível {calc.nivel}
    </>
  );
}

function ConteudoCelular({ aba, ficha, aoEscolher, aoAbrirLoja }: { aba: string; ficha: FichaVista; aoEscolher: () => void; aoAbrirLoja: () => void }) {
  if (aba === "habilidades") return <BlocoHabilidades ficha={ficha} />;
  if (aba === "notas") return <BlocoNotas ficha={ficha} />;
  if (aba === "inventario") {
    return (
      <div className={css.grupos}>
        <BlocoCarga ficha={ficha} />
        <BlocoDinheiro ficha={ficha} />
        <BlocoItens ficha={ficha} />
      </div>
    );
  }
  return (
    <div className={css.grupos}>
      <BlocoProgressao ficha={ficha} aoEscolher={aoEscolher} aoAbrirLoja={aoAbrirLoja} />
      <BlocoAtributos ficha={ficha} />
      <BlocoCalculados ficha={ficha} />
      <BlocoFichasDeClasse ficha={ficha} />
      <BlocoPericias ficha={ficha} />
      <BlocoHonra ficha={ficha} />
      <BlocoRedencao ficha={ficha} />
    </div>
  );
}

const ABAS_CELULAR: ItemAba[] = [
  { id: "personagem", rotulo: "Personagem" },
  { id: "habilidades", rotulo: "Habilidades" },
  { id: "inventario", rotulo: "Inventário" },
  { id: "notas", rotulo: "Notas" },
];

function Celular({ ficha, aoEscolher, aoVoltar }: { ficha: FichaVista; aoEscolher: () => void; aoVoltar: () => void }) {
  const [aba, definirAba] = useState("personagem");
  const [loja, abrirLoja] = useState(false);
  return (
    <div className={`${css.celular} odm-grao`}>
      <header className={css.topoCelular}>
        <button type="button" className={css.voltar} onClick={loja ? () => abrirLoja(false) : aoVoltar}>
          ← {loja ? "Voltar à ficha" : "Voltar à mesa"}
        </button>
        <h1 className={css.nomeCelular}>{ficha.dados.nome}</h1>
        <p className={css.detalhe}>
          <CabecalhoClasse ficha={ficha} />
        </p>
      </header>
      <main className={css.corpoCelular}>{loja ? <LojaPrestigio ficha={ficha} /> : <ConteudoCelular aba={aba} ficha={ficha} aoEscolher={aoEscolher} aoAbrirLoja={() => abrirLoja(true)} />}</main>
      {!loja && (
        <nav className={css.navegacao}>
          <Abas rotuloGrupo="Navegação da ficha" itens={ABAS_CELULAR} ativa={aba} aoEscolher={definirAba} />
        </nav>
      )}
    </div>
  );
}

function Desktop({ ficha, aoEscolher, aoVoltar, temPendencia }: { ficha: FichaVista; aoEscolher: () => void; aoVoltar: () => void; temPendencia: boolean }) {
  const [aba, definirAba] = useState("personagem");
  const itens: ItemAba[] = [
    { id: "personagem", rotulo: "Personagem" },
    { id: "habilidades", rotulo: "Habilidades e talentos" },
    { id: "inventario", rotulo: "Inventário" },
    { id: "notas", rotulo: "Notas" },
    ...(ficha.calc.consagracao ? [{ id: "prestigio", rotulo: "Prestígio" }] : []),
  ];
  return (
    <div className={`${desktop.tela} odm-grao`}>
      <header className={desktop.faixa}>
        <div>
          <h1 className={desktop.nome}>{ficha.dados.nome}</h1>
          <p className={desktop.classe}>
            <CabecalhoClasse ficha={ficha} />
          </p>
        </div>
        <Abas rotuloGrupo="Ficha" itens={itens} ativa={aba} aoEscolher={definirAba} />
        <div className={desktop.direita}>
          {temPendencia && <Etiqueta tom="destaque">Escolha pendente</Etiqueta>}
          <button type="button" className={desktop.voltar} onClick={aoVoltar}>
            Voltar à mesa
          </button>
        </div>
      </header>
      <main className={desktop.corpo}>
        {aba === "personagem" && (
          <div className={`${desktop.personagem} ${css.largo}`}>
            <div className={desktop.coluna}>
              <BlocoAtributos ficha={ficha} />
              <BlocoCalculados ficha={ficha} />
              <BlocoFichasDeClasse ficha={ficha} />
            </div>
            <BlocoPericias ficha={ficha} />
            <div className={desktop.coluna}>
              <BlocoProgressao ficha={ficha} aoEscolher={aoEscolher} aoAbrirLoja={() => definirAba("prestigio")} />
              <BlocoHonra ficha={ficha} />
              <BlocoRedencao ficha={ficha} />
            </div>
          </div>
        )}
        {aba === "habilidades" && (
          <div className={desktop.colunasHabilidades}>
            <BlocoHabilidades ficha={ficha} />
          </div>
        )}
        {aba === "inventario" && (
          <div className={desktop.inventario}>
            <BlocoItens ficha={ficha} />
            <div className={desktop.coluna}>
              <BlocoCarga ficha={ficha} />
              <BlocoDinheiro ficha={ficha} />
            </div>
          </div>
        )}
        {aba === "notas" && (
          <div className={desktop.notas}>
            <BlocoNotas ficha={ficha} />
          </div>
        )}
        {aba === "prestigio" && ficha.calc.consagracao && (
          <div className={desktop.prestigio}>
            <LojaPrestigio ficha={ficha} larga />
          </div>
        )}
      </main>
    </div>
  );
}

export function TelaFicha({ personagem, ctx, aoVoltar }: { personagem: Personagem; ctx: ContextoFicha; aoVoltar: () => void }) {
  const larga = useTelaLarga();
  const erro = useLoja((e) => e.erro);
  const [escolhendo, definirEscolhendo] = useState(false);
  const dados = personagem.ficha;
  const calc = useMemo(() => calcularFicha(dados, ctx), [dados, ctx]);
  const ficha: FichaVista = { personagem, dados, calc, ctx, variante: larga ? "central" : "folha", operar: (op) => acoes.operar(personagem.id, op) };
  const pendencias = pendenciasDeNivel(dados, ctx);
  const pendencia = pendencias[0];

  return (
    <>
      {erro && (
        <p className={css.erroFicha} role="alert">
          {erro}
          <Botao variante="fantasma" onClick={acoes.limparErro}>
            Fechar
          </Botao>
        </p>
      )}
      {larga ? (
        <Desktop ficha={ficha} aoEscolher={() => definirEscolhendo(true)} aoVoltar={aoVoltar} temPendencia={pendencias.length > 0} />
      ) : (
        <Celular ficha={ficha} aoEscolher={() => definirEscolhendo(true)} aoVoltar={aoVoltar} />
      )}
      {escolhendo && pendencia && <Escolha key={`${pendencia.tipo}-${pendencia.nivel}`} ficha={ficha} pendencia={pendencia} aoFechar={() => definirEscolhendo(false)} />}
      <AvisoNivel ficha={ficha} />
    </>
  );
}
