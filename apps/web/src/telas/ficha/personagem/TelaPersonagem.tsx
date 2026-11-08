import { Botao, Etiqueta, PopUp, Seletor, TextoDoLivro } from "@odm/estilo";
import type { Retrato } from "@odm/protocolo";
import { criarContextoCombate, NOME_ATRIBUTO, type ContextoCombate } from "@odm/regras";
import { useMemo, useState } from "react";
import { useContextoFicha } from "../../../conexao/conteudo";
import { enviarImagem, useImagem } from "../../../conexao/imagens";
import { useLoja } from "../../../conexao/loja";
import { useTelaLarga } from "../../useLargura";
import { BlocoDinheiro, type FichaVista } from "../Blocos";
import { IconeDoItem } from "./Glifos";
import { CATEGORIAS, itensDaFicha, type Categoria, type ItemVisto } from "./itens";
import css from "./TelaPersonagem.module.css";
import { paraBusca } from "../../busca";

/* Tela do personagem (protótipo aprovado na etapa 5; implementação da etapa 11): retrato de corpo inteiro no
   centro, o equipamento em grupos dos dois lados (sem limite de slots, P1), o resumo de combate e o inventário.
   Toda mudança passa por ficha.operar: vira evento no registro, com desfazer. */

type Ordem = "categoria" | "nome" | "peso";
type Visao = "grade" | "lista";

const GRUPOS_ESQUERDA: { titulo: string; categorias: Categoria[] }[] = [
  { titulo: "Corpo a corpo", categorias: ["corpo_a_corpo"] },
  { titulo: "Proteção", categorias: ["armadura", "escudo"] },
];
const GRUPOS_DIREITA: { titulo: string; categorias: Categoria[] }[] = [
  { titulo: "À distância", categorias: ["distancia"] },
  { titulo: "Outros", categorias: ["roupa", "ferramenta", "geral", "explosivo", "medico", "comida", "consumivel", "municao"] },
];

/* As 4 silhuetas do pacote (etapa 4): arte das especializações pintada de preto, com o "?". */
const SILHUETAS = [
  { id: "silhueta.pistoleiro", nome: "Pistoleiro" },
  { id: "silhueta.barbaro", nome: "Bárbaro" },
  { id: "silhueta.espiao", nome: "Espião" },
  { id: "silhueta.medico-de-campo", nome: "Médico de campo" },
];

const kg = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} kg`;
const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);
const nomeDaCategoria = (c: Categoria) => CATEGORIAS.find((x) => x.id === c)?.nome ?? c;
const RARIDADE = { comum: "Comum", incomum: "Incomum", raro: "Raro", extraordinario: "Extraordinário", unico: "Único" } as const;

function ImagemDoRetrato({ retrato }: { retrato: Retrato | null }) {
  const url = useImagem(retrato?.id, retrato?.origem === "arquivo" ? "arquivo" : "corpo");
  if (!retrato) return <span className={css.semRetrato}>Escolha um retrato</span>;
  return url ? <img src={url} alt="Retrato do personagem" className={css.foto} /> : <span className={css.semRetrato}>…</span>;
}

function Slot({ item, compacto, aoAbrir }: { item: ItemVisto; compacto: boolean; aoAbrir: (id: string) => void }) {
  return (
    <button type="button" className={`${css.slot} ${css[`r_${item.raridade}`]}`} onClick={() => aoAbrir(item.id)} title={compacto ? item.nome : undefined} aria-label={item.nome}>
      <IconeDoItem itemId={item.item.itemId} icone={item.icone} className={css.slotGlifo} />
      {!compacto && <span className={css.slotNome}>{item.nome}</span>}
    </button>
  );
}

function GrupoDeSlots({ titulo, itens, compacto, aoAbrir }: { titulo: string; itens: ItemVisto[]; compacto: boolean; aoAbrir: (id: string) => void }) {
  return (
    <section className={css.grupo} aria-label={titulo}>
      {!compacto && <h3 className={`${css.grupoTitulo} odm-rotulo`}>{titulo}</h3>}
      {itens.length ? (
        itens.map((i) => <Slot key={i.id} item={i} compacto={compacto} aoAbrir={aoAbrir} />)
      ) : (
        <span className={css.slotVazio} title={`${titulo}: nada equipado`}>
          {compacto ? "—" : "Nada equipado"}
        </span>
      )}
    </section>
  );
}

function DetalheDoItem({ item, ficha }: { item: ItemVisto; ficha: FichaVista }) {
  const [tirando, definirTirando] = useState(false);
  return (
    <div className={css.detalhe}>
      <div className={`${css.detalheIcone} ${css[`r_${item.raridade}`]}`}>
        <IconeDoItem itemId={item.item.itemId} icone={item.icone} className={css.detalheImagem} />
      </div>
      <h3 className={css.detalheNome}>{item.nome}</h3>
      <p className={css.detalheLinha}>
        <span className={css[`t_${item.raridade}`]}>{RARIDADE[item.raridade]}</span> · {nomeDaCategoria(item.categoria)}
        {item.equipado && (
          <>
            {" "}
            · <Etiqueta tom="destaque">Equipado</Etiqueta>
          </>
        )}
      </p>
      {item.ataque && (
        <dl className={css.numeros}>
          <div>
            <dt className="odm-rotulo">Acerto</dt>
            <dd className="odm-numero">{sinal(item.ataque.acerto)}</dd>
          </div>
          <div>
            <dt className="odm-rotulo">Dano</dt>
            <dd className="odm-numero">{item.ataque.dano}</dd>
          </div>
          {item.ataque.alcance && (
            <div>
              <dt className="odm-rotulo">Alcance</dt>
              <dd>{item.ataque.alcance}</dd>
            </div>
          )}
        </dl>
      )}
      {item.defesa !== null && (
        <dl className={css.numeros}>
          <div>
            <dt className="odm-rotulo">Defesa</dt>
            <dd className="odm-numero">{sinal(item.defesa)}</dd>
          </div>
        </dl>
      )}
      {item.texto && <p className={css.detalheTexto}><TextoDoLivro texto={item.texto} /></p>}
      <p className={css.detalheLinha}>{item.quantidade > 1 ? `${item.quantidade} × ${kg(item.pesoKg)} = ${kg(item.quantidade * item.pesoKg)}` : kg(item.pesoKg)}</p>
      {item.atributos.length > 1 && (
        <Seletor
          rotulo="Atributo (Finesse)"
          opcoes={[{ id: "", rotulo: "O maior" }, ...item.atributos.map((a) => ({ id: a, rotulo: NOME_ATRIBUTO[a] }))]}
          valor={item.item.atributo ?? ""}
          aoMudar={(v) => ficha.operar({ op: "item_ajustar", itemFichaId: item.id, campo: "atributo", valor: v || null })}
        />
      )}
      {item.modos.length > 1 && (
        <Seletor
          rotulo="Modo de disparo"
          opcoes={item.modos.map((m) => ({ id: m, rotulo: m }))}
          valor={item.modoAtual ?? item.modos[0]!}
          aoMudar={(v) => ficha.operar({ op: "item_ajustar", itemFichaId: item.id, campo: "modo", valor: v })}
        />
      )}
      <div className={css.detalheAcoes}>
        {item.equipavel && (
          <Botao variante={item.equipado ? "secundario" : "primario"} onClick={() => ficha.operar({ op: "equipar", itemFichaId: item.id, equipado: !item.equipado })}>
            {item.equipado ? "Guardar" : "Equipar"}
          </Botao>
        )}
        {tirando ? (
          <Botao variante="perigo" onClick={() => ficha.operar({ op: "tirar_item", item: item.item })}>
            Confirmar: tirar
          </Botao>
        ) : (
          <Botao variante="fantasma" onClick={() => definirTirando(true)}>
            Tirar do inventário
          </Botao>
        )}
      </div>
    </div>
  );
}

function EscolhaDeRetrato({ atual, ficha, aoFechar, largo }: { atual: Retrato | null; ficha: FichaVista; aoFechar: () => void; largo: boolean }) {
  const [rascunho, definirRascunho] = useState<Retrato | null>(atual);
  const [erro, definirErro] = useState<string | null>(null);
  const [enviando, definirEnviando] = useState(false);
  return (
    <PopUp aberto titulo="Retrato" subtitulo="Uma foto sua ou uma silhueta" variante={largo ? "central" : "folha"} aoFechar={aoFechar}>
      <div className={css.escolha}>
        <div className={css.escolhaPrevia}>
          <ImagemDoRetrato retrato={rascunho} />
        </div>
        <div className={css.escolhaOpcoes}>
          <label className={css.enviar}>
            <input
              type="file"
              accept="image/*"
              disabled={enviando}
              onChange={async (e) => {
                const arquivo = e.target.files?.[0];
                e.target.value = "";
                if (!arquivo) return;
                definirErro(null);
                definirEnviando(true);
                /* Reduzida no aparelho para até 600 × 1400, em WebP (decisão da etapa 5). */
                const r = await enviarImagem(arquivo, { largura: 600, altura: 1400 });
                definirEnviando(false);
                if ("erro" in r) definirErro(r.erro);
                else definirRascunho({ origem: "arquivo", id: r.id });
              }}
            />
            {enviando ? "Enviando…" : "Enviar uma foto"}
          </label>
          {erro && <p className={css.erro}>{erro}</p>}
          <p className={`${css.nota} odm-rotulo`}>Ou uma silhueta</p>
          <div className={css.silhuetas}>
            {SILHUETAS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`${css.silhueta} ${rascunho?.origem === "silhueta" && rascunho.id === s.id ? css.escolhida : ""}`}
                aria-pressed={rascunho?.origem === "silhueta" && rascunho.id === s.id}
                onClick={() => definirRascunho({ origem: "silhueta", id: s.id })}
              >
                <ImagemDoRetrato retrato={{ origem: "silhueta", id: s.id }} />
                <span>{s.nome}</span>
              </button>
            ))}
          </div>
          <Botao
            variante="primario"
            grande
            largo
            disabled={JSON.stringify(rascunho) === JSON.stringify(atual)}
            onClick={() => {
              ficha.operar({ op: "retrato", retrato: rascunho });
              aoFechar();
            }}
          >
            Usar este retrato
          </Botao>
        </div>
      </div>
    </PopUp>
  );
}

export function TelaPersonagem({ ficha, ctxCombate, cabecalho = false }: { ficha: FichaVista; ctxCombate?: ContextoCombate | null; cabecalho?: boolean }) {
  const largo = useTelaLarga();
  /* Fora da tela de combate, o contexto de combate sai do conteúdo da ficha (para o acerto e o dano das armas). */
  const contexto = useContextoFicha();
  const opcoes = useLoja((e) => e.mesa?.opcoes);
  const ctx = useMemo(() => {
    if (ctxCombate !== undefined) return ctxCombate;
    if (contexto.situacao !== "pronto") return null;
    const { regras, tabelas, efeitos, modificadores } = contexto.conteudo;
    const r = criarContextoCombate({ regras, tabelas, efeitos, modificadores }, opcoes);
    return r.ok ? r.contexto : null;
  }, [ctxCombate, contexto, opcoes]);
  const itens = useMemo(() => itensDaFicha(ficha, ctx), [ficha, ctx]);
  const [selecionado, definirSelecionado] = useState<string | null>(null);
  const [filtro, definirFiltro] = useState<Categoria | "tudo">("tudo");
  const [busca, definirBusca] = useState("");
  const [ordem, definirOrdem] = useState<Ordem>("categoria");
  const [visao, definirVisao] = useState<Visao>("grade");
  const [escolhendo, definirEscolhendo] = useState(false);
  const [dinheiro, definirDinheiro] = useState(false);

  const equipados = itens.filter((i) => i.equipado);
  const doGrupo = (cats: Categoria[]) => equipados.filter((i) => cats.includes(i.categoria));
  const { limite, atual: carga, condicao } = ficha.calc.carga;
  const sobrecarregado = limite.valor;
  const imobilizado = limite.valor * 2;
  const contagem = (c: Categoria | "tudo") => (c === "tudo" ? itens.length : itens.filter((i) => i.categoria === c).length);
  const visiveis = useMemo(() => {
    const ordemCat = CATEGORIAS.map((c) => c.id);
    const termo = paraBusca(busca);
    return itens
      .filter((i) => (filtro === "tudo" || i.categoria === filtro) && paraBusca(i.nome).includes(termo))
      .sort((a, b) =>
        ordem === "nome"
          ? a.nome.localeCompare(b.nome, "pt-BR")
          : ordem === "peso"
            ? b.pesoKg * b.quantidade - a.pesoKg * a.quantidade
            : Number(b.equipado) - Number(a.equipado) || ordemCat.indexOf(a.categoria) - ordemCat.indexOf(b.categoria) || a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [itens, filtro, busca, ordem]);
  const item = itens.find((i) => i.id === selecionado) ?? null;
  const armas = equipados.filter((i) => i.ataque);
  const detalhe = item && <DetalheDoItem key={item.id} item={item} ficha={ficha} />;

  return (
    <div className={css.pagina}>
      {cabecalho && (
        <header className={css.cabecalho}>
          <div>
            <h1 className={css.nome}>{ficha.dados.nome || "Sem nome"}</h1>
          </div>
        </header>
      )}

      <section className={css.palco} aria-label="Retrato e equipamento">
        <div className={css.lado}>
          {GRUPOS_ESQUERDA.map((g) => (
            <GrupoDeSlots key={g.titulo} titulo={g.titulo} itens={doGrupo(g.categorias)} compacto={!largo} aoAbrir={definirSelecionado} />
          ))}
        </div>
        <div className={css.retrato}>
          <button type="button" className={css.retratoBotao} onClick={() => definirEscolhendo(true)} aria-label="Trocar o retrato">
            <ImagemDoRetrato retrato={ficha.dados.retrato} />
          </button>
          <Botao variante="fantasma" onClick={() => definirEscolhendo(true)}>
            Trocar retrato
          </Botao>
        </div>
        <div className={css.lado}>
          {GRUPOS_DIREITA.map((g) => (
            <GrupoDeSlots key={g.titulo} titulo={g.titulo} itens={doGrupo(g.categorias)} compacto={!largo} aoAbrir={definirSelecionado} />
          ))}
        </div>
      </section>

      <section className={css.resumo} aria-label="Resumo de combate">
        <div className={css.defesa}>
          <span className="odm-rotulo">Defesa</span>
          <span className={`${css.defesaValor} odm-numero`}>{ficha.calc.defesa.valor}</span>
        </div>
        <ul className={css.ataques}>
          {armas.map((a) => (
            <li key={a.id}>
              <button type="button" className={css.ataque} onClick={() => definirSelecionado(a.id)}>
                <IconeDoItem itemId={a.item.itemId} icone={a.icone} className={css.ataqueGlifo} />
                <span className={css.ataqueNome}>{a.nome}</span>
                <span className="odm-numero">{sinal(a.ataque!.acerto)}</span>
                <span className={`${css.ataqueDano} odm-numero`}>{a.ataque!.dano}</span>
              </button>
            </li>
          ))}
          {!armas.length && <li className={css.nota}>Nenhuma arma equipada.</li>}
        </ul>
        <div className={css.defesa}>
          <span className="odm-rotulo">Deslocamento</span>
          <span className={`${css.defesaValor} odm-numero`}>{ficha.calc.deslocamento.valor} m</span>
        </div>
      </section>

      <section className={css.inventario} aria-label="Inventário">
        <div className={css.ferramentas}>
          <h2 className={css.titulo}>Inventário</h2>
          <input className={css.busca} type="search" placeholder="Buscar item" aria-label="Buscar item" value={busca} onChange={(e) => definirBusca(e.target.value)} />
          <label className={css.ordem}>
            <span className="odm-oculto">Ordenar por</span>
            <select value={ordem} onChange={(e) => definirOrdem(e.target.value as Ordem)}>
              <option value="categoria">Equipados primeiro</option>
              <option value="nome">Nome</option>
              <option value="peso">Mais pesados</option>
            </select>
          </label>
          <div className={css.visao} role="group" aria-label="Visão do inventário">
            {(["grade", "lista"] as const).map((v) => (
              <button key={v} type="button" className={`${css.filtro} ${visao === v ? css.filtroAtivo : ""}`} aria-pressed={visao === v} onClick={() => definirVisao(v)}>
                {v === "grade" ? "Grade" : "Lista"}
              </button>
            ))}
          </div>
        </div>
        <div className={css.filtros} role="group" aria-label="Categorias">
          {CATEGORIAS.filter((c) => contagem(c.id) > 0).map((c) => (
            <button key={c.id} type="button" className={`${css.filtro} ${filtro === c.id ? css.filtroAtivo : ""}`} aria-pressed={filtro === c.id} onClick={() => definirFiltro(c.id)}>
              {c.nome} <span className={css.filtroConta}>{contagem(c.id)}</span>
            </button>
          ))}
        </div>

        <div className={css.corpoInventario}>
          {itens.length === 0 && <p className={css.nota}>Inventário vazio. Quem entrega os itens é o mestre, ou a loja.</p>}
          {visao === "grade" ? (
            <ul className={css.grade}>
              {visiveis.map((i) => (
                <li key={i.id}>
                  <button
                    type="button"
                    className={`${css.celula} ${css[`r_${i.raridade}`]} ${selecionado === i.id ? css.celulaAtiva : ""}`}
                    onClick={() => definirSelecionado(i.id)}
                    aria-label={`${i.nome}${i.quantidade > 1 ? `, ${i.quantidade}` : ""}${i.equipado ? ", equipado" : ""}`}
                    title={i.nome}
                  >
                    <IconeDoItem itemId={i.item.itemId} icone={i.icone} className={css.celulaGlifo} />
                    {i.quantidade > 1 && <span className={`${css.quantidade} odm-numero`}>{i.quantidade}</span>}
                    {i.equipado && <span className={css.marcaEquipado} aria-hidden="true" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className={css.lista}>
              {visiveis.map((i) => (
                <li key={i.id}>
                  <button type="button" className={`${css.linha} ${selecionado === i.id ? css.celulaAtiva : ""}`} onClick={() => definirSelecionado(i.id)}>
                    <IconeDoItem itemId={i.item.itemId} icone={i.icone} className={`${css.linhaGlifo} ${css[`t_${i.raridade}`]}`} />
                    <span className={css.linhaNome}>{i.nome}</span>
                    {i.equipado && <Etiqueta tom="destaque">Equipado</Etiqueta>}
                    <span className={`${css.linhaQtd} odm-numero`}>{i.quantidade > 1 ? `×${i.quantidade}` : ""}</span>
                    <span className={`${css.linhaPeso} odm-numero`}>{kg(i.pesoKg * i.quantidade)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {itens.length > 0 && !visiveis.length && <p className={css.nota}>Nada com esse nome.</p>}
          {largo && <aside className={css.painel}>{detalhe ?? <p className={css.nota}>Toque num item para ver o que ele faz.</p>}</aside>}
        </div>

        <footer className={css.rodape}>
          <div className={css.carga}>
            <span className="odm-rotulo">Carga</span>
            <div className={css.trilhoCarga} role="meter" aria-valuemin={0} aria-valuemax={imobilizado} aria-valuenow={carga} aria-label="Carga">
              <div
                className={`${css.cheioCarga} ${condicao === "imobilizado" ? css.cargaRuim : condicao === "sobrecarregado" ? css.cargaAlerta : ""}`}
                style={{ width: `${Math.min(100, (carga / imobilizado) * 100)}%` }}
              />
              <span className={css.marcaCarga} style={{ left: "50%" }} title="Sobrecarregado" />
            </div>
            <span className={`${css.cargaTexto} odm-numero`}>
              {condicao === "imobilizado" ? "Imobilizado · " : condicao === "sobrecarregado" ? "Sobrecarregado · " : ""}
              {kg(carga)} · Sobrecarregado acima de {sobrecarregado} kg, Imobilizado acima de {imobilizado} kg
            </span>
          </div>
          <button type="button" className={css.dinheiro} onClick={() => definirDinheiro(true)} aria-label="Dinheiro: receber ou gastar">
            <span className="odm-rotulo">Dinheiro</span>
            <span className="odm-numero">R$ {ficha.dados.dinheiro.toLocaleString("pt-BR")}</span>
          </button>
        </footer>
      </section>

      {!largo && item && (
        <PopUp aberto titulo={item.nome} variante="folha" aoFechar={() => definirSelecionado(null)}>
          {detalhe}
        </PopUp>
      )}
      {dinheiro && (
        <PopUp aberto titulo="Dinheiro" variante={largo ? "central" : "folha"} aoFechar={() => definirDinheiro(false)}>
          <BlocoDinheiro ficha={ficha} />
        </PopUp>
      )}
      {escolhendo && <EscolhaDeRetrato atual={ficha.dados.retrato} ficha={ficha} largo={largo} aoFechar={() => definirEscolhendo(false)} />}
    </div>
  );
}
