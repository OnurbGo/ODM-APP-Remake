import { ID_VENDA_AO_MERCADOR } from "@odm/conteudo";
import { Abas, Botao, Cartao, CampoNumero, Etiqueta, PopUp } from "@odm/estilo";
import type { CadastroDe } from "@odm/protocolo";
import { precoEmReais, valorDeVenda } from "@odm/regras";
import { useState } from "react";
import { useContextoFicha } from "../../conexao/conteudo";
import { acoes, useLoja } from "../../conexao/loja";
import css from "./LojasJogador.module.css";
import { buscaDaLinha, paraBusca } from "../busca";
import { precoComExaustao, resumoDoEfeito, temEfeito } from "./servicos";

/* Lojas abertas pelo mestre (Mestre, "Disposição do comércio"). A compra sai na hora; o mestre desfaz pelo
   registro (C3, 07/11/2026). A venda paga 50% do preço do catálogo, se a loja tiver caixa. */

type Loja = CadastroDe<"loja">;
const reais = (n: number) => `R$ ${n.toLocaleString("pt-BR")}`;
const POR_PAGINA = 60;

function Comprar({ loja, personagemId, dinheiro }: { loja: Loja; personagemId: string; dinheiro: number }) {
  const [busca, definirBusca] = useState("");
  const [quantos, definirQuantos] = useState<Record<string, number>>({});
  const [pagina, definirPagina] = useState(1);
  const termo = paraBusca(busca);
  const linhas = loja.dados.itens.filter((l) => (l.quantidade === null || l.quantidade > 0) && (!termo || buscaDaLinha(l).includes(termo)));
  return (
    <div className={css.aba}>
      <input type="search" value={busca} placeholder="Buscar na loja" aria-label="Buscar na loja" onChange={(e) => definirBusca(e.target.value)} />
      {linhas.length === 0 && <p className={css.nota}>Nada à venda com esse nome.</p>}
      <ul className={css.lista}>
        {linhas.slice(0, POR_PAGINA * pagina).map((l) => {
          const q = quantos[l.id] ?? 1;
          const maximo = Math.min(999, l.quantidade ?? 999);
          const total = l.preco === null ? null : l.preco * q;
          return (
            <li key={l.id} className={css.linha}>
              <span className={css.nome}>
                {l.nome}
                <span className={css.nota}>
                  {l.preco === null ? "sem preço: fale com o mestre" : reais(l.preco)}
                  {l.quantidade !== null && ` · ${l.quantidade} no estoque`}
                </span>
              </span>
              {l.preco !== null && (
                <span className={css.acoes}>
                  <CampoNumero rotulo={`Quantos de ${l.nome}`} rotuloOculto semSinal valor={q} minimo={1} maximo={maximo} aoMudar={(v) => definirQuantos((m) => ({ ...m, [l.id]: v }))} />
                  <Botao disabled={total === null || total > dinheiro} onClick={() => acoes.comprarNaLoja(loja.id, l.id, q, personagemId)}>
                    Comprar {total !== null && reais(total)}
                  </Botao>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {linhas.length > POR_PAGINA * pagina && (
        <Botao variante="fantasma" onClick={() => definirPagina((p) => p + 1)}>
          Mostrar mais
        </Botao>
      )}
    </div>
  );
}

function Vender({ loja, personagemId }: { loja: Loja; personagemId: string }) {
  const personagem = useLoja((e) => e.personagens.find((p) => p.id === personagemId));
  const contexto = useContextoFicha();
  const [quantos, definirQuantos] = useState<Record<string, number>>({});
  if (loja.dados.compraSoForaDoComum) return <p className={css.nota}>{loja.dados.nome} só compra coisas fora do comum: combine com o mestre.</p>;
  const conteudo = contexto.situacao === "pronto" ? contexto.conteudo : null;
  const catalogo = new Map([...(conteudo?.itens ?? []), ...(conteudo?.municoes ?? [])].map((i) => [i.id, i]));
  const regra = conteudo?.regras.find((r) => r.id === ID_VENDA_AO_MERCADOR);
  if (!regra?.mecanica) return <p className={css.nota}>A regra de venda ainda não foi revisada: combine com o mestre.</p>;
  const itens = personagem?.ficha.inventario ?? [];
  return (
    <div className={css.aba}>
      <p className={css.nota}>A loja paga metade do preço do catálogo{loja.dados.caixa !== null ? `; tem ${reais(loja.dados.caixa)} em caixa` : ""}.</p>
      {itens.length === 0 && <p className={css.nota}>Inventário vazio.</p>}
      <ul className={css.lista}>
        {itens.map((i) => {
          const preco = precoEmReais(i.itemId ? catalogo.get(i.itemId)?.preco : null);
          const q = Math.min(quantos[i.id] ?? 1, i.quantidade);
          const unidade = preco === null ? null : preco / 2;
          const total = valorDeVenda(preco, regra, q);
          const semCaixa = total !== null && loja.dados.caixa !== null && total > loja.dados.caixa;
          return (
            <li key={i.id} className={css.linha}>
              <span className={css.nome}>
                {i.nome}
                <span className={css.nota}>{unidade === null ? "sem preço no catálogo: fale com o mestre" : `metade de R$ ${preco!.toLocaleString("pt-BR")} · você tem ${i.quantidade}`}</span>
              </span>
              {unidade !== null && (
                <span className={css.acoes}>
                  {i.quantidade > 1 && <CampoNumero rotulo={`Quantos de ${i.nome}`} rotuloOculto semSinal valor={q} minimo={1} maximo={i.quantidade} aoMudar={(v) => definirQuantos((m) => ({ ...m, [i.id]: v }))} />}
                  <Botao disabled={semCaixa || i.equipado} onClick={() => acoes.venderNaLoja(loja.id, i.id, q, personagemId)}>
                    {i.equipado ? "Equipado" : `Vender ${reais(total!)}`}
                  </Botao>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Servicos({ loja, personagemId, dinheiro }: { loja: Loja; personagemId: string; dinheiro: number }) {
  const exaustao = useLoja((e) => e.personagens.find((p) => p.id === personagemId)?.vivo.exaustao ?? 0);
  const contexto = useContextoFicha();
  const efeitos = contexto.situacao === "pronto" ? contexto.conteudo.efeitos : [];
  const nomeDoEfeito = (id: string) => efeitos.find((x) => x.id === id)?.nome ?? id;
  if (!loja.dados.servicos.length) return <p className={css.nota}>Esta loja não oferece serviços.</p>;
  return (
    <ul className={css.lista}>
      {loja.dados.servicos.map((s) => {
        const preco = precoComExaustao(s.preco, s.efeito, exaustao);
        return (
          <li key={s.id} className={css.linha}>
            <span className={css.nome}>
              {s.nome}
              {temEfeito(s.efeito) && <span className={css.efeito}>{resumoDoEfeito(s.efeito, nomeDoEfeito)}</span>}
              {s.descricao && <span className={css.nota}>{s.descricao}</span>}
            </span>
            <Botao disabled={preco > dinheiro} onClick={() => acoes.pagarServico(loja.id, s.id, personagemId)}>
              Pagar {reais(preco)}
            </Botao>
          </li>
        );
      })}
    </ul>
  );
}

function JanelaDaLoja({ loja, aoFechar }: { loja: Loja; aoFechar: () => void }) {
  const eu = useLoja((e) => e.eu);
  const meus = useLoja((e) => e.personagens).filter((p) => p.situacao === "ativo" && p.participanteId === eu?.id);
  const [quem, definirQuem] = useState(meus[0]?.id ?? "");
  const [aba, definirAba] = useState("comprar");
  const personagem = meus.find((p) => p.id === quem) ?? meus[0];
  return (
    <PopUp aberto titulo={loja.dados.nome} subtitulo={loja.dados.cidade || undefined} variante="central" aoFechar={aoFechar}>
      <div className={css.janela}>
        {!personagem ? (
          <p className={css.nota}>Você não tem personagem pronto para comprar.</p>
        ) : (
          <>
            {meus.length > 1 ? (
              <label className={css.campo}>
                <span className="odm-rotulo">Personagem</span>
                <select value={personagem.id} onChange={(e) => definirQuem(e.target.value)}>
                  {meus.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.ficha.nome || "Sem nome"}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <p className={css.dinheiro}>
              {personagem.ficha.nome || "Sem nome"}: <strong className="odm-numero">{reais(personagem.ficha.dinheiro)}</strong>
            </p>
            <Abas
              rotuloGrupo="Loja"
              itens={[
                { id: "comprar", rotulo: "Comprar" },
                { id: "vender", rotulo: "Vender" },
                { id: "servicos", rotulo: "Serviços" },
              ]}
              ativa={aba}
              aoEscolher={definirAba}
            />
            {aba === "comprar" ? (
              <Comprar loja={loja} personagemId={personagem.id} dinheiro={personagem.ficha.dinheiro} />
            ) : aba === "vender" ? (
              <Vender loja={loja} personagemId={personagem.id} />
            ) : (
              <Servicos loja={loja} personagemId={personagem.id} dinheiro={personagem.ficha.dinheiro} />
            )}
          </>
        )}
      </div>
    </PopUp>
  );
}

export function LojasJogador() {
  const lojas = useLoja((e) => e.cadastros).filter((c): c is Loja => c.tipo === "loja");
  const [aberta, abrir] = useState<string | null>(null);
  const atual = lojas.find((l) => l.id === aberta);
  if (!lojas.length) return null;
  return (
    <>
      {lojas.map((l) => (
        <Cartao key={l.id} titulo={l.dados.nome} extra={<Etiqueta tom="sucesso">Aberta</Etiqueta>}>
          {l.dados.cidade && <p className={css.nota}>{l.dados.cidade}</p>}
          <Botao onClick={() => abrir(l.id)}>Entrar na loja</Botao>
        </Cartao>
      ))}
      {atual && <JanelaDaLoja loja={atual} aoFechar={() => abrir(null)} />}
    </>
  );
}
