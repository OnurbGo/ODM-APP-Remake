import { Alternador, Botao, Cartao, Etiqueta } from "@odm/estilo";
import type { CadastroDe, DadosMarco } from "@odm/protocolo";
import { useState } from "react";
import { acoes, useLoja } from "../../../conexao/loja";
import css from "./Campanha.module.css";

/* Linha do tempo (especificação 7.4): marcos em lista vertical, na ordem. O jogador vê os visíveis que já aconteceram. */

type Marco = CadastroDe<"marco">;

export const ordenarMarcos = <T extends { dados: { ordem: number; titulo: string } }>(lista: readonly T[]) =>
  [...lista].sort((a, b) => a.dados.ordem - b.dados.ordem || a.dados.titulo.localeCompare(b.dados.titulo, "pt-BR"));

const salvar = (m: Marco, parte: Partial<DadosMarco>) => acoes.salvarCadastro({ id: m.id, tipo: "marco", dados: { ...m.dados, ...parte } });

function EditorMarco({ marco, missoes, aoFechar }: { marco: Marco; missoes: CadastroDe<"missao">[]; aoFechar: () => void }) {
  const [d, definir] = useState(marco.dados);
  const [tags, definirTags] = useState(marco.dados.tags.join(", "));
  const mudar = (parte: Partial<DadosMarco>) => definir((x) => ({ ...x, ...parte }));
  return (
    <div className={css.formMarco}>
      <label className={css.campo}>
        <span className="odm-rotulo">Título</span>
        <input type="text" maxLength={160} value={d.titulo} onChange={(e) => mudar({ titulo: e.target.value })} />
      </label>
      <label className={css.campo}>
        <span className="odm-rotulo">Quando</span>
        <input type="text" maxLength={80} value={d.quando} placeholder="Data no jogo, se quiser" onChange={(e) => mudar({ quando: e.target.value })} />
      </label>
      <label className={css.campo}>
        <span className="odm-rotulo">Descrição</span>
        <textarea rows={3} maxLength={20_000} value={d.descricao} onChange={(e) => mudar({ descricao: e.target.value })} />
      </label>
      <label className={css.campo}>
        <span className="odm-rotulo">Missão</span>
        <select value={d.missaoId ?? ""} onChange={(e) => mudar({ missaoId: e.target.value || null })}>
          <option value="">Nenhuma</option>
          {missoes.map((m) => (
            <option key={m.id} value={m.id}>
              {m.dados.titulo}
            </option>
          ))}
        </select>
      </label>
      <label className={css.campo}>
        <span className="odm-rotulo">Marcadores</span>
        <input type="text" value={tags} placeholder="Separados por vírgula" onChange={(e) => definirTags(e.target.value)} />
      </label>
      <div className={css.barraSalvar}>
        <Botao
          variante="primario"
          disabled={!d.titulo.trim()}
          onClick={() => {
            const lista = [...new Set(tags.split(",").map((t) => t.trim()).filter(Boolean))].slice(0, 10).map((t) => t.slice(0, 40));
            salvar(marco, { ...d, titulo: d.titulo.trim(), tags: lista });
            aoFechar();
          }}
        >
          Salvar marco
        </Botao>
        <Botao variante="fantasma" onClick={aoFechar}>
          Cancelar
        </Botao>
      </div>
    </div>
  );
}

export function LinhaDoTempo() {
  const cadastros = useLoja((e) => e.cadastros);
  const marcos = ordenarMarcos(cadastros.filter((c): c is Marco => c.tipo === "marco"));
  const missoes = cadastros.filter((c): c is CadastroDe<"missao"> => c.tipo === "missao");
  const [editando, definirEditando] = useState<string | null>(null);
  const [apagando, definirApagando] = useState<string | null>(null);

  /* Trocar com o vizinho reescreve a ordem dos dois (0, 1, 2… pela posição atual). */
  const mover = (i: number, passo: -1 | 1) => {
    const j = i + passo;
    if (j < 0 || j >= marcos.length) return;
    const a = marcos[i]!;
    const b = marcos[j]!;
    salvar(a, { ordem: j });
    salvar(b, { ordem: i });
    marcos.forEach((m, k) => {
      if (k !== i && k !== j && m.dados.ordem !== k) salvar(m, { ordem: k });
    });
  };

  return (
    <div className={css.linhaDoTempo}>
      <div className={css.barraSalvar}>
        <Botao variante="primario" onClick={() => acoes.salvarCadastro({ tipo: "marco", dados: { titulo: "Novo marco", ordem: marcos.length } as DadosMarco })}>
          Novo marco
        </Botao>
        <span className={css.nota}>O jogador vê só os marcos visíveis que já aconteceram.</span>
      </div>
      {marcos.length === 0 && <p className={css.nota}>Nenhum marco ainda.</p>}
      <ol className={css.marcos}>
        {marcos.map((m, i) => {
          const missao = missoes.find((x) => x.id === m.dados.missaoId);
          const veem = m.dados.visivel && m.dados.aconteceu;
          return (
            <li key={m.id} className={`${css.marco} ${m.dados.aconteceu ? css.marcoAconteceu : ""}`}>
              <span className={css.ponto} aria-hidden />
              <Cartao
                titulo={m.dados.titulo}
                extra={veem ? <Etiqueta tom="sucesso">Jogadores veem</Etiqueta> : <Etiqueta>Só você vê</Etiqueta>}
              >
                {editando === m.id ? (
                  <EditorMarco key={m.atualizadoEm} marco={m} missoes={missoes} aoFechar={() => definirEditando(null)} />
                ) : (
                  <>
                    {(m.dados.quando || missao || m.dados.tags.length > 0) && (
                      <p className={css.nota}>
                        {[m.dados.quando, missao && `Missão: ${missao.dados.titulo}`].filter(Boolean).join(" · ")}
                        {m.dados.tags.map((t) => (
                          <Etiqueta key={t}>{t}</Etiqueta>
                        ))}
                      </p>
                    )}
                    {m.dados.descricao && <p className={css.texto}>{m.dados.descricao}</p>}
                    <Alternador rotulo="Aconteceu" ligado={m.dados.aconteceu} aoMudar={(aconteceu) => salvar(m, { aconteceu })} />
                    <Alternador rotulo="Visível para os jogadores" ligado={m.dados.visivel} aoMudar={(visivel) => salvar(m, { visivel })} />
                    <div className={css.barraSalvar}>
                      <Botao variante="fantasma" onClick={() => definirEditando(m.id)}>
                        Editar
                      </Botao>
                      <Botao variante="fantasma" disabled={i === 0} aria-label={`Subir ${m.dados.titulo}`} onClick={() => mover(i, -1)}>
                        ↑
                      </Botao>
                      <Botao variante="fantasma" disabled={i === marcos.length - 1} aria-label={`Descer ${m.dados.titulo}`} onClick={() => mover(i, 1)}>
                        ↓
                      </Botao>
                      {apagando === m.id ? (
                        <Botao variante="perigo" onClick={() => acoes.apagarCadastro(m.id)}>
                          Confirmar: apagar
                        </Botao>
                      ) : (
                        <Botao variante="fantasma" onClick={() => definirApagando(m.id)}>
                          Apagar
                        </Botao>
                      )}
                    </div>
                  </>
                )}
              </Cartao>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
