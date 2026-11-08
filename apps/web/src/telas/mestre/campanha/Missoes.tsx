import { Alternador, Botao, Cartao, Etiqueta, Seletor } from "@odm/estilo";
import { ETAPAS_MISSAO, ROTULO_ETAPA, type CadastroDe, type DadosMissao, type SituacaoMissao } from "@odm/protocolo";
import { ROTULO_GRAU, type ContextoFicha, type GrauDeMissao } from "@odm/regras";
import { useEffect, useMemo, useState } from "react";
import type { ConteudoMestre } from "../../../conexao/conteudoMestre";
import { acoes, useLoja } from "../../../conexao/loja";
import { BuscaCatalogo } from "../BuscaCatalogo";
import css from "./Campanha.module.css";
import { ConcluirMissao } from "./ConcluirMissao";
import { paraBusca } from "../../busca";

/* Missões (especificação 7.3; Mestre, "Fluxo das missões"). O editor guarda um rascunho local e só envia ao salvar. */

type Missao = CadastroDe<"missao">;

export const ROTULO_SITUACAO: Record<SituacaoMissao, string> = { rascunho: "Rascunho", ativa: "Ativa", concluida: "Concluída", falhou: "Falhou" };
const TOM_SITUACAO: Record<SituacaoMissao, "neutro" | "destaque" | "sucesso" | "perigo"> = { rascunho: "neutro", ativa: "destaque", concluida: "sucesso", falhou: "perigo" };
const DIFICULDADES: { id: GrauDeMissao; rotulo: string }[] = (["facil", "moderada", "dificil", "morte_certa"] as const).map((id) => ({ id, rotulo: ROTULO_GRAU[id] }));

export const ordenarMissoes = (lista: readonly Missao[]) => {
  const peso: Record<SituacaoMissao, number> = { ativa: 0, rascunho: 1, concluida: 2, falhou: 3 };
  return [...lista].sort((a, b) => peso[a.dados.situacao] - peso[b.dados.situacao] || a.dados.ordem - b.dados.ordem || a.dados.titulo.localeCompare(b.dados.titulo, "pt-BR"));
};

function TextoLongo({ rotulo, valor, aoMudar, linhas = 4, dica }: { rotulo: string; valor: string; aoMudar: (v: string) => void; linhas?: number; dica?: string }) {
  return (
    <label className={css.campo}>
      <span className="odm-rotulo">{rotulo}</span>
      {dica && <span className={css.nota}>{dica}</span>}
      <textarea rows={linhas} maxLength={20_000} value={valor} onChange={(e) => aoMudar(e.target.value)} />
    </label>
  );
}

function Editor({ missao, conteudo, ctxFicha, aoApagar }: { missao: Missao; conteudo: ConteudoMestre; ctxFicha: ContextoFicha | null; aoApagar: () => void }) {
  const [d, definir] = useState<DadosMissao>(missao.dados);
  const [novoObjetivo, definirNovoObjetivo] = useState("");
  const [buscaCriatura, definirBuscaCriatura] = useState("");
  const [apagando, definirApagando] = useState(false);
  const [concluindo, definirConcluindo] = useState<"concluida" | "falhou" | null>(null);
  const cadastros = useLoja((e) => e.cadastros);
  const encontros = cadastros.filter((c): c is CadastroDe<"encontro"> => c.tipo === "encontro");
  const ligados = encontros.filter((e) => e.dados.missaoId === missao.id);
  const soltos = encontros.filter((e) => e.dados.missaoId === null);
  const fichas = useMemo(() => new Map([...conteudo.criaturas, ...conteudo.ameacas].map((f) => [f.id, f])), [conteudo]);
  const termo = paraBusca(buscaCriatura);
  const achadas = termo ? [...fichas.values()].filter((f) => paraBusca(f.nome).includes(termo) && !d.criaturas.includes(f.id)).slice(0, 6) : [];
  const mudou = JSON.stringify(d) !== JSON.stringify(missao.dados);
  const mudar = (parte: Partial<DadosMissao>) => definir((x) => ({ ...x, ...parte }));
  const salvar = (dados: DadosMissao = d) => acoes.salvarCadastro({ id: missao.id, tipo: "missao", dados });
  const ligarEncontro = (e: CadastroDe<"encontro">, missaoId: string | null) => acoes.salvarCadastro({ id: e.id, tipo: "encontro", dados: { ...e.dados, missaoId } });

  return (
    <div className={css.editor}>
      <Cartao
        titulo={d.titulo || "Sem título"}
        extra={<Etiqueta tom={TOM_SITUACAO[d.situacao]}>{ROTULO_SITUACAO[d.situacao]}</Etiqueta>}
      >
        <label className={css.campo}>
          <span className="odm-rotulo">Título</span>
          <input type="text" maxLength={160} value={d.titulo} onChange={(e) => mudar({ titulo: e.target.value })} />
        </label>
        <Seletor rotulo="Dificuldade" opcoes={DIFICULDADES} valor={d.dificuldade} aoMudar={(dificuldade) => mudar({ dificuldade })} />
        <Seletor
          rotulo="Situação"
          opcoes={(["rascunho", "ativa", "concluida", "falhou"] as const).map((id) => ({ id, rotulo: ROTULO_SITUACAO[id] }))}
          valor={d.situacao}
          aoMudar={(situacao) => mudar({ situacao })}
        />
        <Alternador rotulo="Visível para os jogadores" dica="Rascunho nunca aparece para eles" ligado={d.visivel} aoMudar={(visivel) => mudar({ visivel })} />
      </Cartao>

      {ETAPAS_MISSAO.map((id, i) => {
        const e = d.etapas[id];
        const mudarEtapa = (parte: Partial<typeof e>) => mudar({ etapas: { ...d.etapas, [id]: { ...e, ...parte } } });
        return (
          <Cartao key={id} titulo={`${i + 1}. ${ROTULO_ETAPA[id]}`} extra={e.visivel ? <Etiqueta tom="sucesso">Visível</Etiqueta> : <Etiqueta>Oculta</Etiqueta>}>
            <TextoLongo rotulo="Para os jogadores" valor={e.jogadores} aoMudar={(jogadores) => mudarEtapa({ jogadores })} />
            <TextoLongo rotulo="Notas do mestre" dica="Nunca saem do seu aparelho" valor={e.mestre} aoMudar={(mestre) => mudarEtapa({ mestre })} linhas={3} />
            <Alternador rotulo="Mostrar esta etapa aos jogadores" ligado={e.visivel} aoMudar={(visivel) => mudarEtapa({ visivel })} />
          </Cartao>
        );
      })}

      <Cartao titulo="Objetivos">
        {d.objetivos.length === 0 && <p className={css.nota}>Nenhum objetivo ainda.</p>}
        <ul className={css.lista}>
          {d.objetivos.map((o, i) => {
            const trocar = (parte: Partial<typeof o>) => mudar({ objetivos: d.objetivos.map((x, j) => (j === i ? { ...x, ...parte } : x)) });
            return (
              <li key={i} className={css.objetivo}>
                <label className={css.marcar}>
                  <input type="checkbox" checked={o.feito} onChange={() => trocar({ feito: !o.feito })} />
                  <span className={o.feito ? css.feito : undefined}>{o.texto}</span>
                </label>
                <Botao variante="fantasma" aria-pressed={o.visivel} onClick={() => trocar({ visivel: !o.visivel })}>
                  {o.visivel ? "Visível" : "Oculto"}
                </Botao>
                <Botao variante="fantasma" onClick={() => mudar({ objetivos: d.objetivos.filter((_, j) => j !== i) })}>
                  Tirar
                </Botao>
              </li>
            );
          })}
        </ul>
        <div className={css.linhaForm}>
          <input type="text" maxLength={300} value={novoObjetivo} placeholder="Novo objetivo" aria-label="Novo objetivo" onChange={(e) => definirNovoObjetivo(e.target.value)} />
          <Botao
            disabled={!novoObjetivo.trim()}
            onClick={() => {
              mudar({ objetivos: [...d.objetivos, { texto: novoObjetivo.trim(), feito: false, visivel: true }] });
              definirNovoObjetivo("");
            }}
          >
            Acrescentar
          </Botao>
        </div>
      </Cartao>

      <Cartao titulo="Ligações">
        <p className="odm-rotulo">Encontros</p>
        {ligados.length === 0 && <p className={css.nota}>Nenhum encontro ligado. Monte e salve encontros no Escudo.</p>}
        <ul className={css.lista}>
          {ligados.map((e) => (
            <li key={e.id} className={css.linhaLista}>
              <span>{e.dados.nome}</span>
              <Botao variante="fantasma" onClick={() => ligarEncontro(e, null)}>
                Desligar
              </Botao>
            </li>
          ))}
        </ul>
        {soltos.length > 0 && (
          <label className={css.campo}>
            <span className="odm-rotulo">Ligar encontro salvo</span>
            <select
              value=""
              onChange={(ev) => {
                const e = soltos.find((x) => x.id === ev.target.value);
                if (e) ligarEncontro(e, missao.id);
              }}
            >
              <option value="">Escolha um encontro</option>
              {soltos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.dados.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="odm-rotulo">Criaturas e NPCs do bestiário</p>
        <ul className={css.lista}>
          {d.criaturas.map((ref) => (
            <li key={ref} className={css.linhaLista}>
              <span>{fichas.get(ref)?.nome ?? ref}</span>
              <Botao variante="fantasma" onClick={() => mudar({ criaturas: d.criaturas.filter((x) => x !== ref) })}>
                Tirar
              </Botao>
            </li>
          ))}
        </ul>
        <input type="search" value={buscaCriatura} placeholder="Buscar criatura ou ameaça" aria-label="Buscar criatura ou ameaça para ligar" onChange={(e) => definirBuscaCriatura(e.target.value)} />
        <ul className={css.lista}>
          {achadas.map((f) => (
            <li key={f.id} className={css.linhaLista}>
              <span>{f.nome}</span>
              <Botao
                variante="fantasma"
                onClick={() => {
                  mudar({ criaturas: [...d.criaturas, f.id] });
                  definirBuscaCriatura("");
                }}
              >
                Ligar
              </Botao>
            </li>
          ))}
        </ul>
      </Cartao>

      <Cartao titulo="Recompensas">
        <TextoLongo rotulo="Texto" dica="Os jogadores veem quando o Desfecho estiver visível" valor={d.recompensas.texto} aoMudar={(texto) => mudar({ recompensas: { ...d.recompensas, texto } })} linhas={3} />
        <ul className={css.lista}>
          {d.recompensas.itens.map((it, i) => (
            <li key={i} className={css.linhaLista}>
              <span>
                {it.quantidade} × {it.nome}
              </span>
              <Botao variante="fantasma" onClick={() => mudar({ recompensas: { ...d.recompensas, itens: d.recompensas.itens.filter((_, j) => j !== i) } })}>
                Tirar
              </Botao>
            </li>
          ))}
        </ul>
        {ctxFicha && <BuscaCatalogo ctx={ctxFicha} rotulo="Acrescentar item" aoEscolher={(itemId, nome) => mudar({ recompensas: { ...d.recompensas, itens: [...d.recompensas.itens, { itemId, nome, quantidade: 1 }] } })} />}
      </Cartao>

      <Cartao titulo="Notas do mestre">
        <TextoLongo rotulo="Notas gerais" dica="Nunca saem do seu aparelho" valor={d.notas} aoMudar={(notas) => mudar({ notas })} />
      </Cartao>

      <div className={css.barraSalvar}>
        <Botao variante="primario" disabled={!mudou || !d.titulo.trim()} onClick={() => salvar()}>
          {mudou ? "Salvar missão" : "Salvo"}
        </Botao>
        <Botao disabled={mudou} onClick={() => definirConcluindo("concluida")}>
          {d.entregue ? "Entregar de novo" : "Concluir e entregar"}
        </Botao>
        <Botao variante="fantasma" disabled={mudou} onClick={() => definirConcluindo("falhou")}>
          Falhou
        </Botao>
        {apagando ? (
          <Botao
            variante="perigo"
            onClick={() => {
              acoes.apagarCadastro(missao.id);
              aoApagar();
            }}
          >
            Confirmar: apagar
          </Botao>
        ) : (
          <Botao variante="fantasma" onClick={() => definirApagando(true)}>
            Apagar
          </Botao>
        )}
        {mudou && <span className={css.nota}>Há mudanças sem salvar.</span>}
      </div>
      {concluindo && <ConcluirMissao missao={missao} desfecho={concluindo} conteudo={conteudo} ctxFicha={ctxFicha} aoFechar={() => definirConcluindo(null)} />}
    </div>
  );
}

export function Missoes({ conteudo, ctxFicha }: { conteudo: ConteudoMestre; ctxFicha: ContextoFicha | null }) {
  const cadastros = useLoja((e) => e.cadastros);
  const missoes = ordenarMissoes(cadastros.filter((c): c is Missao => c.tipo === "missao"));
  const [aberta, abrir] = useState<string | null>(null);
  const [antes, definirAntes] = useState<ReadonlySet<string> | null>(null);
  const nova = antes ? missoes.find((m) => !antes.has(m.id)) : undefined;
  useEffect(() => {
    if (!nova) return;
    abrir(nova.id);
    definirAntes(null);
  }, [nova]);
  const atual = missoes.find((m) => m.id === aberta) ?? null;

  return (
    <div className={`${css.dupla} ${atual ? css.comEditor : ""}`}>
      <nav className={css.listaLateral} aria-label="Missões">
        <Botao
          variante="primario"
          largo
          onClick={() => {
            definirAntes(new Set(missoes.map((m) => m.id)));
            acoes.salvarCadastro({ tipo: "missao", dados: { titulo: "Nova missão", ordem: missoes.length } as DadosMissao });
          }}
        >
          Nova missão
        </Botao>
        {missoes.length === 0 && <p className={css.nota}>Nenhuma missão nesta campanha.</p>}
        <ul className={css.lista}>
          {missoes.map((m) => (
            <li key={m.id}>
              <button type="button" className={`${css.itemLista} ${m.id === aberta ? css.itemAtivo : ""}`} onClick={() => abrir(m.id)}>
                <span className={css.itemTitulo}>{m.dados.titulo}</span>
                <span className={css.itemDetalhe}>
                  <Etiqueta tom={TOM_SITUACAO[m.dados.situacao]}>{ROTULO_SITUACAO[m.dados.situacao]}</Etiqueta> {ROTULO_GRAU[m.dados.dificuldade]}
                  {m.dados.visivel && m.dados.situacao !== "rascunho" ? " · visível" : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section className={css.painelEditor} aria-label="Missão aberta">
        {atual ? (
          <>
            <Botao variante="fantasma" className={css.voltar} onClick={() => abrir(null)}>
              ← Missões
            </Botao>
            <Editor key={`${atual.id}|${atual.atualizadoEm}`} missao={atual} conteudo={conteudo} ctxFicha={ctxFicha} aoApagar={() => abrir(null)} />
          </>
        ) : (
          <p className={css.nota}>Escolha uma missão ou crie uma nova.</p>
        )}
      </section>
    </div>
  );
}
