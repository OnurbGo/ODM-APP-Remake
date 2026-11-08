import { Cartao, Etiqueta, TextoDoLivro } from "@odm/estilo";
import { ETAPAS_MISSAO, ROTULO_ETAPA, type CadastroDe, type SituacaoMissao } from "@odm/protocolo";
import { useContextoFicha } from "../../conexao/conteudo";
import { useLoja } from "../../conexao/loja";
import { LojasJogador } from "./LojasJogador";
import { PessoaConhecida } from "./Mostrado";
import { oQueFaz } from "./oQueFaz";

function PessoasEDiario() {
  const cadastros = useLoja((e) => e.cadastros);
  const npcs = cadastros.filter((c): c is CadastroDe<"npc"> => c.tipo === "npc").sort((a, b) => a.dados.nome.localeCompare(b.dados.nome, "pt-BR"));
  const diario = cadastros.filter((c): c is CadastroDe<"diario"> => c.tipo === "diario").sort((a, b) => b.dados.sessao - a.dados.sessao);
  return (
    <>
      {npcs.length > 0 && (
        <>
          <h2 className={css.titulo}>Pessoas</h2>
          <div>
            {npcs.map((n) => (
              <PessoaConhecida key={n.id} npc={n.dados} />
            ))}
          </div>
        </>
      )}
      {diario.length > 0 && (
        <>
          <h2 className={css.titulo}>Diário</h2>
          {diario.map((d) => (
            <Cartao key={d.id} titulo={`Sessão ${d.dados.sessao}${d.dados.titulo ? `: ${d.dados.titulo}` : ""}`} extra={d.dados.data ? <span className={css.nota}>{d.dados.data}</span> : undefined}>
              <p className={css.texto}>{d.dados.texto}</p>
            </Cartao>
          ))}
        </>
      )}
    </>
  );
}

function LojasDaCampanha() {
  const tem = useLoja((e) => e.cadastros.some((c) => c.tipo === "loja"));
  if (!tem) return null;
  return (
    <>
      <h2 className={css.titulo}>Lojas</h2>
      <LojasJogador />
    </>
  );
}
import css from "./CampanhaJogador.module.css";

/* Aba "Campanha" do jogador (fase 6, etapa 8): missões e linha do tempo. Só chega aqui o que o servidor libera
   (missão visível fora de rascunho, etapas e objetivos visíveis, marcos visíveis que aconteceram). */

const SITUACAO: Record<SituacaoMissao, { rotulo: string; tom: "neutro" | "destaque" | "sucesso" | "perigo" }> = {
  rascunho: { rotulo: "Rascunho", tom: "neutro" },
  ativa: { rotulo: "Em andamento", tom: "destaque" },
  concluida: { rotulo: "Concluída", tom: "sucesso" },
  falhou: { rotulo: "Falhou", tom: "perigo" },
};
const DIFICULDADE = { facil: "Fácil", moderada: "Moderada", dificil: "Difícil", morte_certa: "Morte certa" } as const;
const PESO: Record<SituacaoMissao, number> = { ativa: 0, rascunho: 1, concluida: 2, falhou: 3 };

function Missao({ m }: { m: CadastroDe<"missao"> }) {
  const d = m.dados;
  const etapas = ETAPAS_MISSAO.filter((id) => d.etapas[id].visivel && d.etapas[id].jogadores.trim());
  const temRecompensa = d.recompensas.texto.trim() || d.recompensas.itens.length > 0;
  return (
    <Cartao titulo={d.titulo} extra={<Etiqueta tom={SITUACAO[d.situacao].tom}>{SITUACAO[d.situacao].rotulo}</Etiqueta>}>
      <p className={css.nota}>Dificuldade: {DIFICULDADE[d.dificuldade]}</p>
      {etapas.map((id) => (
        <section key={id} className={css.etapa}>
          <h3 className="odm-rotulo">{ROTULO_ETAPA[id]}</h3>
          <p className={css.texto}>{d.etapas[id].jogadores}</p>
        </section>
      ))}
      {d.objetivos.length > 0 && (
        <section className={css.etapa}>
          <h3 className="odm-rotulo">Objetivos</h3>
          <ul className={css.objetivos}>
            {d.objetivos.map((o, i) => (
              <li key={i} className={o.feito ? css.feito : undefined}>
                <span aria-hidden>{o.feito ? "✓" : "○"}</span> {o.texto}
                {o.feito && <span className="odm-oculto"> (cumprido)</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
      {temRecompensa && (
        <section className={css.etapa}>
          <h3 className="odm-rotulo">Recompensa</h3>
          {d.recompensas.texto.trim() && <p className={css.texto}>{d.recompensas.texto}</p>}
          {d.recompensas.itens.length > 0 && <p className={css.nota}>{d.recompensas.itens.map((i) => `${i.quantidade} × ${i.nome}`).join(", ")}</p>}
        </section>
      )}
    </Cartao>
  );
}

export function CampanhaJogador() {
  const cadastros = useLoja((e) => e.cadastros);
  const ligados = useLoja((e) => e.mesa?.opcoes.mundo ?? []);
  const contexto = useContextoFicha();
  const cartas = contexto.situacao === "pronto" ? (contexto.conteudo.modificadores ?? []) : [];
  const mundo = ligados.flatMap((l) => cartas.filter((c) => c.id === l.id).map((c) => ({ ...c, campoAberto: l.campoAberto })));
  const missoes = cadastros
    .filter((c): c is CadastroDe<"missao"> => c.tipo === "missao")
    .sort((a, b) => PESO[a.dados.situacao] - PESO[b.dados.situacao] || a.dados.ordem - b.dados.ordem);
  const marcos = cadastros.filter((c): c is CadastroDe<"marco"> => c.tipo === "marco").sort((a, b) => a.dados.ordem - b.dados.ordem);
  const nomeDaMissao = new Map(missoes.map((m) => [m.id, m.dados.titulo]));
  return (
    <div className={css.campanha}>
      {mundo.length > 0 && (
        <>
          <h2 className={css.titulo}>O mundo agora</h2>
          {mundo.map((m) => (
            <Cartao key={m.id} titulo={m.nome} extra={m.campoAberto ? <Etiqueta tom="destaque">Campo aberto</Etiqueta> : undefined}>
              <p className={css.texto}><TextoDoLivro texto={m.texto} /></p>
              {oQueFaz(m).length > 0 && (
                <ul className={css.objetivos}>
                  {oQueFaz(m).map((l) => (
                    <li key={l} className={css.nota}>
                      {l}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>
          ))}
        </>
      )}
      <LojasDaCampanha />
      <PessoasEDiario />
      <h2 className={css.titulo}>Missões</h2>
      {missoes.length === 0 && <p className={css.nota}>O mestre ainda não mostrou nenhuma missão.</p>}
      {missoes.map((m) => (
        <Missao key={m.id} m={m} />
      ))}
      <h2 className={css.titulo}>Linha do tempo</h2>
      {marcos.length === 0 && <p className={css.nota}>Nada marcado ainda.</p>}
      <ol className={css.marcos}>
        {marcos.map((m) => (
          <li key={m.id} className={css.marco}>
            <span className={css.ponto} aria-hidden />
            <p className={css.marcoTitulo}>{m.dados.titulo}</p>
            {(m.dados.quando || m.dados.missaoId) && (
              <p className={css.nota}>{[m.dados.quando, m.dados.missaoId && nomeDaMissao.get(m.dados.missaoId)].filter(Boolean).join(" · ")}</p>
            )}
            {m.dados.descricao && <p className={css.texto}>{m.dados.descricao}</p>}
          </li>
        ))}
      </ol>
    </div>
  );
}
