import type { MecanicaEspolios, Municao } from "@odm/conteudo";
import { Botao, Cartao, Etiqueta, TextoDoLivro } from "@odm/estilo";
import type { Jogo21 } from "@odm/protocolo";
import { sugerirEspolio, type ContextoFicha, type SugestaoDeEspolio } from "@odm/regras";
import { useState } from "react";
import { acoes, useLoja } from "../../../conexao/loja";
import { Mao21, ResultadoDo21 } from "../../campanha/Jogo21";
import { BuscaCatalogo } from "../BuscaCatalogo";
import css from "./Campanha.module.css";

/* Jogo do 21 do lado do mestre: abre para um personagem, acompanha a mão e, no fim, entrega o item da faixa
   pelo "dar item" (J1, 07/11/2026). O texto da regra aparece para lembrar a tabela. */
const sortear = (minimo: number, maximo: number) => minimo + Math.floor(Math.random() * (maximo - minimo + 1));

/* "Sugerir item" (lote 11, 08/11/2026): pelo lugar do "Onde" e pela faixa do 21. O mestre entrega ou pede outra. */
function SugerirItem({ jogo, espolios, ctxFicha, municoes, aoEntregar }: { jogo: Jogo21; espolios: MecanicaEspolios; ctxFicha: ContextoFicha; municoes: readonly Municao[]; aoEntregar: (itemId: string, nome: string) => void }) {
  const [sugestao, definirSugestao] = useState<SugestaoDeEspolio | null>(null);
  const resultado = jogo.situacao === "estourou" ? "estouro" : (jogo.faixa?.resultado ?? "");
  const sugerir = () => definirSugestao(sugerirEspolio(espolios, jogo.local, resultado, { itens: [...ctxFicha.itens.values()], municoes }, sortear));
  return (
    <div className={css.sugestao}>
      <Botao onClick={sugerir}>{sugestao ? "Outra sugestão" : "Sugerir item"}</Botao>
      {sugestao &&
        (sugestao.nada ? (
          <p className={css.nota}>{sugestao.nota}</p>
        ) : (
          <>
            <p>
              <span className={css.nota}>
                {sugestao.lugar} · {sugestao.categoria.nome}
              </span>
              {sugestao.item && (
                <>
                  <br />
                  <strong>{sugestao.item.nome}</strong>
                  {sugestao.item.raridade && <span className={css.nota}>{` · ${sugestao.item.raridade}`}</span>}
                </>
              )}
            </p>
            {sugestao.nota && <p className={css.nota}>{sugestao.nota}</p>}
            {sugestao.item && (
              <Botao
                variante="primario"
                onClick={() => {
                  aoEntregar(sugestao.item!.id, sugestao.item!.nome);
                  definirSugestao(null);
                }}
              >
                Dar {sugestao.item.nome} a {jogo.personagemNome}
              </Botao>
            )}
          </>
        ))}
    </div>
  );
}

export function Jogo21Mestre({
  ctxFicha,
  regraTexto,
  aprovado,
  espolios,
  municoes,
}: {
  ctxFicha: ContextoFicha | null;
  regraTexto: string | null;
  aprovado: boolean;
  espolios: MecanicaEspolios | null;
  municoes: readonly Municao[];
}) {
  const personagens = useLoja((e) => e.personagens).filter((p) => p.situacao === "ativo");
  const jogos = useLoja((e) => e.jogos21);
  const [quem, definirQuem] = useState("");
  const [local, definirLocal] = useState("");
  const [dados, definirDados] = useState<Record<string, string[]>>({});
  const entregar = (j: Jogo21, itemId: string, nome: string) => {
    acoes.operar(j.personagemId, { op: "dar_item", item: { id: "novo", itemId, nome, quantidade: 1, equipado: false, pesoKg: null } });
    definirDados((m) => ({ ...m, [j.id]: [...(m[j.id] ?? []), nome] }));
  };

  return (
    <div className={css.mundo}>
      <Cartao titulo="Abrir um jogo">
        {!aprovado && <p className={css.aviso}>A regra do Jogo do 21 ainda não foi aprovada no pacote desta campanha.</p>}
        <label className={css.campo}>
          <span className="odm-rotulo">Personagem</span>
          <select value={quem} onChange={(e) => definirQuem(e.target.value)}>
            <option value="">Escolha</option>
            {personagens.map((p) => (
              <option key={p.id} value={p.id}>
                {p.ficha.nome || "Sem nome"}
              </option>
            ))}
          </select>
        </label>
        <label className={css.campo}>
          <span className="odm-rotulo">Onde</span>
          <input type="text" maxLength={120} value={local} list="lugares-de-espolio" placeholder="Baú de gangue, cofre de chefe…" onChange={(e) => definirLocal(e.target.value)} />
          {espolios && (
            <datalist id="lugares-de-espolio">
              {espolios.lugares.map((l) => (
                <option key={l.nome} value={l.nome} />
              ))}
            </datalist>
          )}
          {espolios && <span className={css.nota}>Um lugar da lista muda a chance de cada categoria no "Sugerir item".</span>}
        </label>
        <Botao
          variante="primario"
          disabled={!quem || !aprovado}
          onClick={() => {
            acoes.abrirJogo21(quem, local.trim());
            definirLocal("");
          }}
        >
          Abrir o Jogo do 21
        </Botao>
        {regraTexto && (
          <details>
            <summary className={css.nota}>Regra do livro</summary>
            <p className={css.texto}><TextoDoLivro texto={regraTexto} /></p>
          </details>
        )}
      </Cartao>

      {jogos.map((j) => {
        const entregues = dados[j.id] ?? [];
        return (
          <Cartao
            key={j.id}
            titulo={`${j.personagemNome}${j.local ? ` · ${j.local}` : ""}`}
            extra={<Etiqueta tom={j.situacao === "jogando" ? "destaque" : j.situacao === "estourou" ? "perigo" : "sucesso"}>{j.situacao === "jogando" ? "Jogando" : j.situacao === "estourou" ? "Estourou" : "Parou"}</Etiqueta>}
          >
            <Mao21 jogo={j} />
            {j.situacao === "jogando" ? <p className={css.nota}>Esperando o jogador comprar ou parar.</p> : <ResultadoDo21 jogo={j} />}
            {j.situacao !== "jogando" && ctxFicha && (
              <>
                {entregues.length > 0 && <p className={css.nota}>Entregue: {entregues.join(", ")}</p>}
                {espolios && <SugerirItem jogo={j} espolios={espolios} ctxFicha={ctxFicha} municoes={municoes} aoEntregar={(itemId, nome) => entregar(j, itemId, nome)} />}
                <BuscaCatalogo ctx={ctxFicha} rotulo={`Dar item a ${j.personagemNome}`} aoEscolher={(itemId, nome) => entregar(j, itemId, nome)} />
              </>
            )}
            <Botao variante="fantasma" onClick={() => acoes.fecharJogo21(j.id)}>
              {j.situacao === "jogando" ? "Cancelar o jogo" : "Fechar"}
            </Botao>
          </Cartao>
        );
      })}
    </div>
  );
}
