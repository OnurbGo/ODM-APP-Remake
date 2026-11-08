import { Alternador, Botao, Cartao, Etiqueta } from "@odm/estilo";
import type { CadastroDe, DadosNpc } from "@odm/protocolo";
import { useEffect, useMemo, useState } from "react";
import type { ConteudoMestre } from "../../../conexao/conteudoMestre";
import { acoes, useLoja } from "../../../conexao/loja";
import css from "./Campanha.module.css";
import { EscolherImagem, Mostrar } from "./Mostrar";
import { paraBusca } from "../../busca";

/* NPCs (especificação 7.4; Mestre, "Como criar um NPC?"). Objetivo, segredo e traço podem sair das tabelas 1d8
   do livro ("Criando um NPC rapidamente"). O jogador vê, do NPC visível, só nome, cidade, afiliação, resumo e imagem. */

type Npc = CadastroDe<"npc">;
const TABELAS = { objetivo: "tabela.npc-objetivo", segredo: "tabela.npc-segredo", traco: "tabela.npc-traco" } as const;
const ROTULO = { objetivo: "Objetivo", segredo: "Segredo", traco: "Traço de personalidade" } as const;

function Editor({ npc, conteudo, aoApagar }: { npc: Npc; conteudo: ConteudoMestre; aoApagar: () => void }) {
  const [d, definir] = useState<DadosNpc>(npc.dados);
  const [apagando, definirApagando] = useState(false);
  const [mostrando, definirMostrando] = useState(false);
  const [busca, definirBusca] = useState("");
  const mudou = JSON.stringify(d) !== JSON.stringify(npc.dados);
  const mudar = (parte: Partial<DadosNpc>) => definir((x) => ({ ...x, ...parte }));
  const fichas = useMemo(() => [...conteudo.ameacas, ...conteudo.criaturas], [conteudo]);
  const ficha = fichas.find((f) => f.id === d.ref);
  const termo = paraBusca(busca);
  const achadas = termo ? fichas.filter((f) => paraBusca(f.nome).includes(termo)).slice(0, 6) : [];

  /* 1d8 na tabela do livro: a linha cujo primeiro número é o resultado. */
  const rolar = (campo: keyof typeof TABELAS) => {
    const tabela = conteudo.tabelas.find((t) => t.id === TABELAS[campo]);
    if (!tabela?.linhas.length) return;
    const n = 1 + Math.floor(Math.random() * tabela.linhas.length);
    const linha = tabela.linhas.find((l) => Number(l[0]) === n) ?? tabela.linhas[n - 1];
    if (linha?.[1]) mudar({ [campo]: linha[1] });
  };

  return (
    <div className={css.editor}>
      <Cartao titulo={d.nome || "Sem nome"} extra={d.visivel ? <Etiqueta tom="sucesso">Jogadores conhecem</Etiqueta> : <Etiqueta>Só você</Etiqueta>}>
        <label className={css.campo}>
          <span className="odm-rotulo">Nome</span>
          <input type="text" maxLength={120} value={d.nome} onChange={(e) => mudar({ nome: e.target.value })} />
        </label>
        <label className={css.campo}>
          <span className="odm-rotulo">Cidade</span>
          <input type="text" maxLength={120} value={d.cidade} onChange={(e) => mudar({ cidade: e.target.value })} />
        </label>
        <label className={css.campo}>
          <span className="odm-rotulo">Afiliação</span>
          <input type="text" maxLength={120} value={d.afiliacao} placeholder="Facção, família, ofício" onChange={(e) => mudar({ afiliacao: e.target.value })} />
        </label>
        <label className={css.campo}>
          <span className="odm-rotulo">O que os jogadores sabem</span>
          <textarea rows={3} maxLength={20_000} value={d.resumo} onChange={(e) => mudar({ resumo: e.target.value })} />
        </label>
        <Alternador rotulo="Os jogadores conhecem" dica="Aparece na aba Campanha deles" ligado={d.visivel} aoMudar={(visivel) => mudar({ visivel })} />
      </Cartao>

      <Cartao titulo="Para interpretar">
        <p className={css.nota}>Só seus. Rolar sorteia uma linha da tabela 1d8 do livro.</p>
        {(Object.keys(TABELAS) as (keyof typeof TABELAS)[]).map((campo) => (
          <label key={campo} className={css.campo}>
            <span className="odm-rotulo">{ROTULO[campo]}</span>
            <span className={css.linhaForm}>
              <input type="text" maxLength={500} value={d[campo]} onChange={(e) => mudar({ [campo]: e.target.value })} />
              <Botao variante="fantasma" onClick={() => rolar(campo)}>
                Rolar 1d8
              </Botao>
            </span>
          </label>
        ))}
        <label className={css.campo}>
          <span className="odm-rotulo">Notas</span>
          <textarea rows={3} maxLength={20_000} value={d.notas} onChange={(e) => mudar({ notas: e.target.value })} />
        </label>
      </Cartao>

      <Cartao titulo="Ficha e imagem">
        <p className={css.nota}>{ficha ? `Ficha do bestiário: ${ficha.nome}. Entra no combate pelo Escudo.` : "Sem ficha: o NPC é só de conversa."}</p>
        <span className={css.linhaForm}>
          <input type="search" value={busca} placeholder="Buscar ficha de ameaça ou criatura" aria-label="Buscar ficha do bestiário" onChange={(e) => definirBusca(e.target.value)} />
          {d.ref && (
            <Botao variante="fantasma" onClick={() => mudar({ ref: null })}>
              Tirar a ficha
            </Botao>
          )}
        </span>
        <ul className={css.lista}>
          {achadas.map((f) => (
            <li key={f.id} className={css.linhaLista}>
              <span>{f.nome}</span>
              <Botao
                variante="fantasma"
                onClick={() => {
                  mudar({ ref: f.id, imagem: d.imagem ?? { origem: "pacote", id: f.id } });
                  definirBusca("");
                }}
              >
                Usar
              </Botao>
            </li>
          ))}
        </ul>
        <EscolherImagem valor={d.imagem} artePadrao={d.ref} aoMudar={(imagem) => mudar({ imagem })} />
      </Cartao>

      <div className={css.barraSalvar}>
        <Botao variante="primario" disabled={!mudou || !d.nome.trim()} onClick={() => acoes.salvarCadastro({ id: npc.id, tipo: "npc", dados: d })}>
          {mudou ? "Salvar NPC" : "Salvo"}
        </Botao>
        <Botao onClick={() => definirMostrando(true)}>Mostrar aos jogadores</Botao>
        {apagando ? (
          <Botao
            variante="perigo"
            onClick={() => {
              acoes.apagarCadastro(npc.id);
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
      <Mostrar aberto={mostrando} inicial={{ titulo: d.nome, texto: d.resumo, imagem: d.imagem }} aoFechar={() => definirMostrando(false)} />
    </div>
  );
}

/* Pessoas importantes das cidades do livro (Mestre, 07-cidades.md): o mestre copia as de uma cidade como NPC,
   sem repetir quem já está na campanha (decisão de 08/11/2026). Entram como "Só você". */
function PessoasDoLivro({ conteudo, npcs }: { conteudo: ConteudoMestre; npcs: Npc[] }) {
  const pessoas = conteudo.pessoas ?? [];
  const cidades = [...new Set(pessoas.map((p) => p.cidade))];
  const [cidade, definirCidade] = useState(cidades[0] ?? "");
  if (!cidades.length) return null;
  const daCidade = pessoas.filter((p) => p.cidade === cidade);
  const existentes = new Set(npcs.map((n) => paraBusca(n.dados.nome)));
  const faltam = daCidade.filter((p) => !existentes.has(paraBusca(p.nome)));
  return (
    <details className={css.pessoasDoLivro}>
      <summary className="odm-rotulo">Pessoas do livro</summary>
      <select value={cidade} aria-label="Cidade" onChange={(e) => definirCidade(e.target.value)}>
        {cidades.map((c) => (
          <option key={c} value={c}>
            {c} ({pessoas.filter((p) => p.cidade === c).length})
          </option>
        ))}
      </select>
      <p className={css.nota}>
        {daCidade.map((p) => p.nome).join(", ")}.{daCidade.length > faltam.length ? ` ${daCidade.length - faltam.length} já estão na campanha.` : ""}
      </p>
      <Botao
        largo
        disabled={!faltam.length}
        onClick={() => {
          for (const p of faltam)
            acoes.salvarCadastro({
              tipo: "npc",
              dados: { nome: p.nome, cidade: p.cidade, afiliacao: p.papel, resumo: p.texto, imagem: p.retrato ? { origem: "pacote", id: p.id } : null, visivel: false } as DadosNpc,
            });
        }}
      >
        {faltam.length ? `Copiar ${faltam.length} para a campanha` : "Todas já estão na campanha"}
      </Botao>
    </details>
  );
}

export function Npcs({ conteudo }: { conteudo: ConteudoMestre }) {
  const cadastros = useLoja((e) => e.cadastros);
  const npcs = cadastros.filter((c): c is Npc => c.tipo === "npc").sort((a, b) => a.dados.nome.localeCompare(b.dados.nome, "pt-BR"));
  const [aberto, abrir] = useState<string | null>(null);
  const [antes, definirAntes] = useState<ReadonlySet<string> | null>(null);
  const [filtro, definirFiltro] = useState("");
  const novo = antes ? npcs.find((n) => !antes.has(n.id)) : undefined;
  useEffect(() => {
    if (!novo) return;
    abrir(novo.id);
    definirAntes(null);
  }, [novo]);
  const atual = npcs.find((n) => n.id === aberto) ?? null;
  const termo = paraBusca(filtro);
  const lista = termo ? npcs.filter((n) => paraBusca(`${n.dados.nome} ${n.dados.cidade} ${n.dados.afiliacao}`).includes(termo)) : npcs;

  return (
    <div className={`${css.dupla} ${atual ? css.comEditor : ""}`}>
      <nav className={css.listaLateral} aria-label="NPCs">
        <Botao
          variante="primario"
          largo
          onClick={() => {
            definirAntes(new Set(npcs.map((n) => n.id)));
            acoes.salvarCadastro({ tipo: "npc", dados: { nome: "Novo NPC" } as DadosNpc });
          }}
        >
          Novo NPC
        </Botao>
        <PessoasDoLivro conteudo={conteudo} npcs={npcs} />
        <input type="search" value={filtro} placeholder="Filtrar por nome, cidade ou afiliação" aria-label="Filtrar NPCs" onChange={(e) => definirFiltro(e.target.value)} />
        {npcs.length === 0 && <p className={css.nota}>Nenhum NPC nesta campanha.</p>}
        <ul className={css.lista}>
          {lista.map((n) => (
            <li key={n.id}>
              <button type="button" className={`${css.itemLista} ${n.id === aberto ? css.itemAtivo : ""}`} onClick={() => abrir(n.id)}>
                <span className={css.itemTitulo}>{n.dados.nome}</span>
                <span className={css.itemDetalhe}>
                  {n.dados.visivel ? <Etiqueta tom="sucesso">Conhecido</Etiqueta> : <Etiqueta>Só você</Etiqueta>} {[n.dados.cidade, n.dados.afiliacao].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section className={css.painelEditor} aria-label="NPC aberto">
        {atual ? (
          <>
            <Botao variante="fantasma" className={css.voltar} onClick={() => abrir(null)}>
              ← NPCs
            </Botao>
            <Editor key={`${atual.id}|${atual.atualizadoEm}`} npc={atual} conteudo={conteudo} aoApagar={() => abrir(null)} />
          </>
        ) : (
          <p className={css.nota}>Escolha um NPC ou crie um novo.</p>
        )}
      </section>
    </div>
  );
}
