import { MecanicaLoja } from "@odm/conteudo";
import { Alternador, Botao, Cartao, Etiqueta, TextoDoLivro } from "@odm/estilo";
import type { CadastroDe, DadosLoja, EfeitoDeServico, LinhaDeLoja, ServicoDeLoja } from "@odm/protocolo";
import { linhasDaLoja, precoEmReais, type ContextoFicha } from "@odm/regras";
import { useEffect, useMemo, useState } from "react";
import type { ConteudoMestre } from "../../../conexao/conteudoMestre";
import { acoes, useLoja } from "../../../conexao/loja";
import { BuscaCatalogo } from "../BuscaCatalogo";
import css from "./Campanha.module.css";
import { buscaDaLinha, paraBusca } from "../../busca";
import { EFEITO_VAZIO, resumoDoEfeito, temEfeito } from "../../campanha/servicos";

/* Comércio (especificação 7.4; Mestre, "Disposição do comércio"; C1, C2 e C3 de 07/11/2026). O mestre copia a
   loja do livro ou monta a sua; o jogador compra e vende quando ela está aberta. */

type Loja = CadastroDe<"loja">;

const reais = (n: number | null) => (n === null ? "sem preço" : `R$ ${n.toLocaleString("pt-BR")}`);
const novoId = () => crypto.randomUUID();
const POR_PAGINA = 80;

/* Número digitado; vazio = nulo ("sem limite", "sem caixa"). */
function CampoNumeroLivre({ rotulo, valor, vazio, aoMudar }: { rotulo: string; valor: number | null; vazio: string; aoMudar: (v: number | null) => void }) {
  return (
    <input
      type="number"
      inputMode="numeric"
      min={0}
      aria-label={rotulo}
      placeholder={vazio}
      value={valor ?? ""}
      onChange={(e) => aoMudar(e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value) || 0)))}
    />
  );
}

function Transacoes({ lojaId }: { lojaId: string }) {
  const eventos = useLoja((e) => e.eventos);
  const desfeitos = new Set(eventos.flatMap((e) => (e.tipo === "ficha_desfeita" ? [e.dados.eventoId] : [])));
  const daLoja = eventos.filter((e) => e.tipo === "ficha_alterada" && e.dados.inversa.op === "transacao" && e.dados.inversa.loja?.lojaId === lojaId).slice(-15).reverse();
  if (!daLoja.length) return <p className={css.nota}>Nenhuma compra ou venda ainda.</p>;
  return (
    <ul className={css.lista}>
      {daLoja.map((e) =>
        e.tipo === "ficha_alterada" ? (
          <li key={e.id} className={css.linhaLista}>
            <span className={desfeitos.has(e.id) ? css.feito : undefined}>
              <strong>{e.dados.personagemNome}</strong> {e.dados.rotulo.charAt(0).toLocaleLowerCase("pt-BR") + e.dados.rotulo.slice(1)}
            </span>
            {desfeitos.has(e.id) ? (
              <Etiqueta>Desfeita</Etiqueta>
            ) : (
              <Botao variante="fantasma" onClick={() => acoes.desfazerFicha(e.id)}>
                Desfazer
              </Botao>
            )}
          </li>
        ) : null,
      )}
    </ul>
  );
}

type OpcaoDeEfeito = { id: string; nome: string };

/* O que o serviço faz ao ser pago (decisão de 08/11/2026). */
function EditorDeEfeito({ efeito, efeitos, aoMudar }: { efeito: EfeitoDeServico | null; efeitos: OpcaoDeEfeito[]; aoMudar: (e: EfeitoDeServico | null) => void }) {
  const e = efeito ?? EFEITO_VAZIO;
  const mudar = (parte: Partial<EfeitoDeServico>) => {
    const novo = { ...e, ...parte };
    aoMudar(temEfeito(novo) ? novo : null);
  };
  return (
    <div className={css.efeitoServico}>
      <Alternador rotulo="Recupera todos os PV" ligado={e.curaTotal} aoMudar={(curaTotal) => mudar({ curaTotal })} />
      <Alternador rotulo="Recupera os Dados de Vida gastos" ligado={e.dadosDeVida} aoMudar={(dadosDeVida) => mudar({ dadosDeVida })} />
      <Alternador rotulo="Tira toda a Exaustão" ligado={e.tiraExaustao} aoMudar={(tiraExaustao) => mudar({ tiraExaustao })} />
      <label className={css.campo}>
        <span className="odm-rotulo">Dá a condição</span>
        <select value={e.condicao ?? ""} onChange={(ev) => mudar({ condicao: ev.target.value || null })}>
          <option value="">Nenhuma</option>
          {efeitos.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nome}
            </option>
          ))}
        </select>
      </label>
      <label className={css.campo}>
        <span className="odm-rotulo">+ R$ por nível de Exaustão</span>
        <CampoNumeroLivre rotulo="Valor a mais por nível de Exaustão" valor={e.extraPorExaustao || null} vazio="0" aoMudar={(v) => mudar({ extraPorExaustao: v ?? 0 })} />
      </label>
    </div>
  );
}

function Editor({ loja, ctxFicha, efeitos, aoApagar }: { loja: Loja; ctxFicha: ContextoFicha | null; efeitos: OpcaoDeEfeito[]; aoApagar: () => void }) {
  const [d, definir] = useState<DadosLoja>(loja.dados);
  const [busca, definirBusca] = useState("");
  const [pagina, definirPagina] = useState(1);
  const [linhaEscrita, definirLinhaEscrita] = useState({ nome: "", preco: null as number | null });
  const [servico, definirServico] = useState<{ nome: string; preco: number; descricao: string; efeito: EfeitoDeServico | null }>({ nome: "", preco: 0, descricao: "", efeito: null });
  const nomeDoEfeito = (id: string) => efeitos.find((x) => x.id === id)?.nome ?? id;
  const mudarServico = (id: string, parte: Partial<ServicoDeLoja>) => mudar({ servicos: d.servicos.map((s) => (s.id === id ? { ...s, ...parte } : s)) });
  const [apagando, definirApagando] = useState(false);
  const mudou = JSON.stringify(d) !== JSON.stringify(loja.dados);
  const mudar = (parte: Partial<DadosLoja>) => definir((x) => ({ ...x, ...parte }));
  const mudarLinha = (id: string, parte: Partial<LinhaDeLoja>) => mudar({ itens: d.itens.map((l) => (l.id === id ? { ...l, ...parte } : l)) });
  const termo = paraBusca(busca);
  const filtradas = termo ? d.itens.filter((l) => buscaDaLinha(l).includes(termo)) : d.itens;
  const visiveis = filtradas.slice(0, POR_PAGINA * pagina);

  return (
    <div className={css.editor}>
      <Cartao titulo={d.nome || "Sem nome"} extra={d.aberta ? <Etiqueta tom="sucesso">Aberta</Etiqueta> : <Etiqueta>Fechada</Etiqueta>}>
        <label className={css.campo}>
          <span className="odm-rotulo">Nome</span>
          <input type="text" maxLength={120} value={d.nome} onChange={(e) => mudar({ nome: e.target.value })} />
        </label>
        <label className={css.campo}>
          <span className="odm-rotulo">Cidade</span>
          <input type="text" maxLength={120} value={d.cidade} onChange={(e) => mudar({ cidade: e.target.value })} />
        </label>
        <label className={css.campo}>
          <span className="odm-rotulo">Caixa (R$)</span>
          <span className={css.nota}>O que a loja tem para comprar dos jogadores; cresce quando eles compram. Vazio: sem limite.</span>
          <CampoNumeroLivre rotulo="Caixa da loja" valor={d.caixa} vazio="Sem limite" aoMudar={(caixa) => mudar({ caixa })} />
        </label>
        <Alternador rotulo="Aberta para os jogadores" dica="Eles veem o estoque e compram na hora" ligado={d.aberta} aoMudar={(aberta) => mudar({ aberta })} />
        <Alternador rotulo="Só compra coisas fora do comum" dica="A venda passa por você" ligado={d.compraSoForaDoComum} aoMudar={(compraSoForaDoComum) => mudar({ compraSoForaDoComum })} />
      </Cartao>

      <Cartao titulo={`Estoque (${d.itens.length})`}>
        <input type="search" value={busca} placeholder="Filtrar o estoque" aria-label="Filtrar o estoque" onChange={(e) => definirBusca(e.target.value)} />
        <table className={css.tabelaLoja}>
          <thead>
            <tr>
              <th>Item</th>
              <th>Preço (R$)</th>
              <th>Quantidade</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((l) => (
              <tr key={l.id}>
                <td>
                  {l.nome}
                  {l.itemId === null && <span className={css.nota}> · escrito à mão</span>}
                </td>
                <td>
                  <CampoNumeroLivre rotulo={`Preço de ${l.nome}`} valor={l.preco} vazio="Sem preço" aoMudar={(preco) => mudarLinha(l.id, { preco })} />
                </td>
                <td>
                  <CampoNumeroLivre rotulo={`Quantidade de ${l.nome}`} valor={l.quantidade} vazio="Sem limite" aoMudar={(quantidade) => mudarLinha(l.id, { quantidade })} />
                </td>
                <td>
                  <Botao variante="fantasma" aria-label={`Tirar ${l.nome}`} onClick={() => mudar({ itens: d.itens.filter((x) => x.id !== l.id) })}>
                    Tirar
                  </Botao>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtradas.length > visiveis.length && (
          <Botao variante="fantasma" onClick={() => definirPagina((p) => p + 1)}>
            Mostrar mais ({filtradas.length - visiveis.length})
          </Botao>
        )}
        {ctxFicha && (
          <BuscaCatalogo
            ctx={ctxFicha}
            rotulo="Acrescentar do catálogo"
            aoEscolher={(itemId, nome) => mudar({ itens: [...d.itens, { id: novoId(), itemId, nome, preco: precoEmReais(ctxFicha.itens.get(itemId)?.preco), quantidade: 1 }] })}
          />
        )}
        <div className={css.linhaForm}>
          <input type="text" maxLength={160} value={linhaEscrita.nome} placeholder="Item escrito à mão" aria-label="Nome do item escrito à mão" onChange={(e) => definirLinhaEscrita((x) => ({ ...x, nome: e.target.value }))} />
          <CampoNumeroLivre rotulo="Preço do item escrito à mão" valor={linhaEscrita.preco} vazio="Preço" aoMudar={(preco) => definirLinhaEscrita((x) => ({ ...x, preco }))} />
          <Botao
            disabled={!linhaEscrita.nome.trim()}
            onClick={() => {
              mudar({ itens: [...d.itens, { id: novoId(), itemId: null, nome: linhaEscrita.nome.trim(), preco: linhaEscrita.preco, quantidade: 1 }] });
              definirLinhaEscrita({ nome: "", preco: null });
            }}
          >
            Acrescentar
          </Botao>
        </div>
      </Cartao>

      <Cartao titulo="Serviços">
        {d.servicos.length === 0 && <p className={css.nota}>Nenhum serviço.</p>}
        <ul className={css.lista}>
          {d.servicos.map((s: ServicoDeLoja) => (
            <li key={s.id} className={css.servicoLinha}>
              <div className={css.linhaLista}>
                <span>
                  {s.nome} · {reais(s.preco)}
                  {s.descricao && <span className={css.nota}> · {s.descricao}</span>}
                  {temEfeito(s.efeito) && <span className={css.efeitoResumo}>{resumoDoEfeito(s.efeito, nomeDoEfeito)}</span>}
                </span>
                <Botao variante="fantasma" onClick={() => mudar({ servicos: d.servicos.filter((x) => x.id !== s.id) })}>
                  Tirar
                </Botao>
              </div>
              <details>
                <summary className={css.nota}>Efeito ao pagar</summary>
                <EditorDeEfeito efeito={s.efeito} efeitos={efeitos} aoMudar={(efeito) => mudarServico(s.id, { efeito })} />
              </details>
            </li>
          ))}
        </ul>
        <div className={css.linhaForm}>
          <input type="text" maxLength={160} value={servico.nome} placeholder="Serviço (pernoite, conserto…)" aria-label="Nome do serviço" onChange={(e) => definirServico((x) => ({ ...x, nome: e.target.value }))} />
          <CampoNumeroLivre rotulo="Preço do serviço" valor={servico.preco} vazio="Preço" aoMudar={(preco) => definirServico((x) => ({ ...x, preco: preco ?? 0 }))} />
          <input type="text" maxLength={2000} value={servico.descricao} placeholder="Descrição (opcional)" aria-label="Descrição do serviço" onChange={(e) => definirServico((x) => ({ ...x, descricao: e.target.value }))} />
          <Botao
            disabled={!servico.nome.trim()}
            onClick={() => {
              mudar({ servicos: [...d.servicos, { id: novoId(), nome: servico.nome.trim(), preco: servico.preco, descricao: servico.descricao.trim(), efeito: servico.efeito }] });
              definirServico({ nome: "", preco: 0, descricao: "", efeito: null });
            }}
          >
            Acrescentar
          </Botao>
        </div>
        <details>
          <summary className={css.nota}>Efeito ao pagar {servico.efeito ? `· ${resumoDoEfeito(servico.efeito, nomeDoEfeito)}` : "(opcional)"}</summary>
          <EditorDeEfeito efeito={servico.efeito} efeitos={efeitos} aoMudar={(efeito) => definirServico((x) => ({ ...x, efeito }))} />
        </details>
      </Cartao>

      <Cartao titulo="Notas do mestre">
        <label className={css.campo}>
          <span className={css.nota}>Nunca saem do seu aparelho.</span>
          <textarea rows={3} maxLength={20_000} value={d.notas} aria-label="Notas da loja" onChange={(e) => mudar({ notas: e.target.value })} />
        </label>
      </Cartao>

      <Cartao titulo="Compras e vendas">
        <Transacoes lojaId={loja.id} />
      </Cartao>

      <div className={css.barraSalvar}>
        <Botao variante="primario" disabled={!mudou || !d.nome.trim()} onClick={() => acoes.salvarCadastro({ id: loja.id, tipo: "loja", dados: d })}>
          {mudou ? "Salvar loja" : "Salvo"}
        </Botao>
        {apagando ? (
          <Botao
            variante="perigo"
            onClick={() => {
              acoes.apagarCadastro(loja.id);
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
    </div>
  );
}

export function Comercio({ conteudo, ctxFicha }: { conteudo: ConteudoMestre; ctxFicha: ContextoFicha | null }) {
  const opcoesDeEfeito = useMemo(() => conteudo.efeitos.filter((e) => e.id !== "efeito.exaustao").map((e) => ({ id: e.id, nome: e.nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), [conteudo.efeitos]);
  const cadastros = useLoja((e) => e.cadastros);
  const lojas = cadastros.filter((c): c is Loja => c.tipo === "loja").sort((a, b) => a.dados.nome.localeCompare(b.dados.nome, "pt-BR"));
  const [aberta, abrir] = useState<string | null>(null);
  const [antes, definirAntes] = useState<ReadonlySet<string> | null>(null);
  const [doLivro, definirDoLivro] = useState("");
  const nova = antes ? lojas.find((l) => !antes.has(l.id)) : undefined;
  useEffect(() => {
    if (!nova) return;
    abrir(nova.id);
    definirAntes(null);
  }, [nova]);
  const atual = lojas.find((l) => l.id === aberta) ?? null;

  /* Lojas do livro com o estoque revisado; sem ele, o mestre lê o texto e monta à mão. */
  const doPacote = useMemo(
    () =>
      (conteudo.lojas ?? []).map((l) => {
        const lida = MecanicaLoja.safeParse(l.mecanica);
        return { loja: l, entradas: lida.success ? lida.data.lojas : null };
      }),
    [conteudo],
  );
  const escolhida = doPacote.find((x) => x.loja.id === doLivro);

  const criar = (dados: Partial<DadosLoja> & { nome: string }) => {
    definirAntes(new Set(lojas.map((l) => l.id)));
    acoes.salvarCadastro({ tipo: "loja", dados: dados as DadosLoja });
  };
  const copiar = () => {
    if (!escolhida) return;
    if (!escolhida.entradas) {
      criar({ nome: escolhida.loja.nome, cidade: escolhida.loja.nome, origem: escolhida.loja.id, notas: escolhida.loja.texto });
      return;
    }
    for (const e of escolhida.entradas) {
      criar({
        nome: e.nome,
        cidade: escolhida.loja.nome,
        caixa: e.caixa,
        itens: linhasDaLoja(e, { itens: [...(ctxFicha?.itens.values() ?? [])], municoes: conteudo.municoes ?? [] }, novoId),
        compraSoForaDoComum: !!e.so_compra_fora_do_comum,
        servicos: (e.servicos ?? []).map((s) => {
          const ef = s.efeito;
          const efeito: EfeitoDeServico = { curaTotal: !!ef?.cura_total, dadosDeVida: !!ef?.dados_de_vida, tiraExaustao: !!ef?.tira_exaustao, condicao: ef?.condicao ?? null, extraPorExaustao: ef?.extra_por_exaustao ?? 0 };
          return { id: novoId(), nome: s.nome, preco: s.preco, descricao: s.descricao ?? "", efeito: temEfeito(efeito) ? efeito : null };
        }),
        origem: escolhida.loja.id,
        notas: escolhida.loja.texto,
      });
    }
  };

  return (
    <div className={`${css.dupla} ${atual ? css.comEditor : ""}`}>
      <nav className={css.listaLateral} aria-label="Lojas">
        <Botao variante="primario" largo onClick={() => criar({ nome: "Nova loja" })}>
          Nova loja
        </Botao>
        <label className={css.campo}>
          <span className="odm-rotulo">Copiar do livro</span>
          <select value={doLivro} onChange={(e) => definirDoLivro(e.target.value)}>
            <option value="">Escolha a cidade</option>
            {doPacote.map(({ loja, entradas }) => (
              <option key={loja.id} value={loja.id}>
                {loja.nome}
                {entradas ? "" : " (só texto)"}
              </option>
            ))}
          </select>
        </label>
        {escolhida && <p className={`${css.nota} ${css.texto}`}><TextoDoLivro texto={escolhida.loja.texto} /></p>}
        <Botao disabled={!escolhida} onClick={copiar}>
          {escolhida?.entradas && escolhida.entradas.length > 1 ? `Copiar as ${escolhida.entradas.length} lojas` : "Copiar a loja"}
        </Botao>
        {lojas.length === 0 && <p className={css.nota}>Nenhuma loja nesta campanha.</p>}
        <ul className={css.lista}>
          {lojas.map((l) => (
            <li key={l.id}>
              <button type="button" className={`${css.itemLista} ${l.id === aberta ? css.itemAtivo : ""}`} onClick={() => abrir(l.id)}>
                <span className={css.itemTitulo}>{l.dados.nome}</span>
                <span className={css.itemDetalhe}>
                  {l.dados.aberta ? <Etiqueta tom="sucesso">Aberta</Etiqueta> : <Etiqueta>Fechada</Etiqueta>} {l.dados.cidade} · caixa {reais(l.dados.caixa)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section className={css.painelEditor} aria-label="Loja aberta">
        {atual ? (
          <>
            <Botao variante="fantasma" className={css.voltar} onClick={() => abrir(null)}>
              ← Lojas
            </Botao>
            <Editor key={`${atual.id}|${atual.atualizadoEm}`} loja={atual} ctxFicha={ctxFicha} efeitos={opcoesDeEfeito} aoApagar={() => abrir(null)} />
          </>
        ) : (
          <p className={css.nota}>Escolha uma loja, crie uma nova ou copie a de uma cidade do livro.</p>
        )}
      </section>
    </div>
  );
}
