import { Alternador, Botao, Cartao, Etiqueta } from "@odm/estilo";
import type { CadastroDe, DadosDiario, DadosNota, EventoVisto } from "@odm/protocolo";
import { useState } from "react";
import { acoes, useLoja } from "../../../conexao/loja";
import css from "./Campanha.module.css";

/* Notas do mestre e diário da sessão (especificação 7.4). As notas nunca saem do mestre; a entrada do diário
   pode ficar visível aos jogadores. "Sugerir do registro" junta combates, XP, compras, Jogo do 21 e marcos. */

type Nota = CadastroDe<"nota">;
type Diario = CadastroDe<"diario">;

function CartaoNota({ nota }: { nota: Nota }) {
  const [d, definir] = useState<DadosNota>(nota.dados);
  const [apagando, definirApagando] = useState(false);
  const mudou = JSON.stringify(d) !== JSON.stringify(nota.dados);
  return (
    <Cartao titulo={d.titulo || "Sem título"} extra={d.fixada ? <Etiqueta tom="destaque">Fixada</Etiqueta> : undefined}>
      <label className={css.campo}>
        <span className="odm-rotulo">Título</span>
        <input type="text" maxLength={160} value={d.titulo} onChange={(e) => definir((x) => ({ ...x, titulo: e.target.value }))} />
      </label>
      <textarea rows={5} maxLength={20_000} value={d.texto} aria-label={`Texto de ${d.titulo}`} onChange={(e) => definir((x) => ({ ...x, texto: e.target.value }))} />
      <Alternador rotulo="Fixar no topo" ligado={d.fixada} aoMudar={(fixada) => definir((x) => ({ ...x, fixada }))} />
      <div className={css.barraSalvar}>
        <Botao variante="primario" disabled={!mudou || !d.titulo.trim()} onClick={() => acoes.salvarCadastro({ id: nota.id, tipo: "nota", dados: d })}>
          {mudou ? "Salvar nota" : "Salva"}
        </Botao>
        {apagando ? (
          <Botao variante="perigo" onClick={() => acoes.apagarCadastro(nota.id)}>
            Confirmar: apagar
          </Botao>
        ) : (
          <Botao variante="fantasma" onClick={() => definirApagando(true)}>
            Apagar
          </Botao>
        )}
      </div>
    </Cartao>
  );
}

export function Notas() {
  const notas = useLoja((e) => e.cadastros)
    .filter((c): c is Nota => c.tipo === "nota")
    .sort((a, b) => Number(b.dados.fixada) - Number(a.dados.fixada) || b.atualizadoEm.localeCompare(a.atualizadoEm));
  return (
    <div className={css.linhaDoTempo}>
      <div className={css.barraSalvar}>
        <Botao variante="primario" onClick={() => acoes.salvarCadastro({ tipo: "nota", dados: { titulo: "Nova nota" } as DadosNota })}>
          Nova nota
        </Botao>
        <span className={css.nota}>Notas do mestre nunca saem do seu aparelho.</span>
      </div>
      {notas.length === 0 && <p className={css.nota}>Nenhuma nota ainda.</p>}
      {notas.map((n) => (
        <CartaoNota key={`${n.id}|${n.atualizadoEm}`} nota={n} />
      ))}
    </div>
  );
}

/* Linhas sugeridas: o que aconteceu desde a entrada anterior do diário. */
export function sugestoesDoRegistro(eventos: readonly EventoVisto[], desde: string | null, marcos: readonly CadastroDe<"marco">[]): string[] {
  const linhas: string[] = [];
  /* O que foi desfeito não entra. */
  const desfeitos = new Set(eventos.flatMap((e) => (e.tipo === "ficha_desfeita" || e.tipo === "combate_desfeito" ? [e.dados.eventoId] : [])));
  for (const e of eventos) {
    if ((desde && e.criadoEm <= desde) || desfeitos.has(e.id)) continue;
    if (e.tipo === "combate" && /^(Combate montado|Combate encerrado)/.test(e.dados.rotulo)) linhas.push(e.dados.rotulo.split(". ")[0]!);
    else if (e.tipo === "ficha_alterada" && (/^XP /.test(e.dados.rotulo) || e.dados.inversa.op === "transacao")) linhas.push(`${e.dados.personagemNome}: ${e.dados.rotulo}`);
    else if (e.tipo === "jogo21") linhas.push(`${e.dados.personagemNome} no Jogo do 21: ${e.dados.rotulo}`);
  }
  for (const m of marcos) if (m.dados.aconteceu && (!desde || m.atualizadoEm > desde)) linhas.push(`Marco: ${m.dados.titulo}`);
  return linhas;
}

function CartaoDiario({ entrada, sugerir }: { entrada: Diario; sugerir: () => string[] }) {
  const [d, definir] = useState<DadosDiario>(entrada.dados);
  const [apagando, definirApagando] = useState(false);
  const mudou = JSON.stringify(d) !== JSON.stringify(entrada.dados);
  return (
    <Cartao titulo={`Sessão ${d.sessao}${d.titulo ? `: ${d.titulo}` : ""}`} extra={d.visivel ? <Etiqueta tom="sucesso">Jogadores leem</Etiqueta> : <Etiqueta>Só você</Etiqueta>}>
      <div className={css.linhaForm}>
        <input type="text" maxLength={160} value={d.titulo} placeholder="Título da sessão" aria-label="Título da sessão" onChange={(e) => definir((x) => ({ ...x, titulo: e.target.value }))} />
        <input type="text" maxLength={40} value={d.data} placeholder="Data" aria-label="Data da sessão" onChange={(e) => definir((x) => ({ ...x, data: e.target.value }))} />
      </div>
      <textarea rows={8} maxLength={20_000} value={d.texto} aria-label={`Diário da sessão ${d.sessao}`} onChange={(e) => definir((x) => ({ ...x, texto: e.target.value }))} />
      <Alternador rotulo="Os jogadores leem" ligado={d.visivel} aoMudar={(visivel) => definir((x) => ({ ...x, visivel }))} />
      <div className={css.barraSalvar}>
        <Botao variante="primario" disabled={!mudou} onClick={() => acoes.salvarCadastro({ id: entrada.id, tipo: "diario", dados: d })}>
          {mudou ? "Salvar" : "Salvo"}
        </Botao>
        <Botao
          variante="fantasma"
          onClick={() => {
            const linhas = sugerir();
            if (linhas.length) definir((x) => ({ ...x, texto: [x.texto.trimEnd(), ...linhas.map((l) => `- ${l}`)].filter(Boolean).join("\n") }));
          }}
        >
          Sugerir do registro
        </Botao>
        {apagando ? (
          <Botao variante="perigo" onClick={() => acoes.apagarCadastro(entrada.id)}>
            Confirmar: apagar
          </Botao>
        ) : (
          <Botao variante="fantasma" onClick={() => definirApagando(true)}>
            Apagar
          </Botao>
        )}
      </div>
    </Cartao>
  );
}

export function DiarioDaSessao() {
  const cadastros = useLoja((e) => e.cadastros);
  const eventos = useLoja((e) => e.eventos);
  const entradas = cadastros.filter((c): c is Diario => c.tipo === "diario").sort((a, b) => b.dados.sessao - a.dados.sessao);
  const marcos = cadastros.filter((c): c is CadastroDe<"marco"> => c.tipo === "marco");
  const proxima = (entradas[0]?.dados.sessao ?? 0) + 1;
  return (
    <div className={css.linhaDoTempo}>
      <div className={css.barraSalvar}>
        <Botao
          variante="primario"
          onClick={() => acoes.salvarCadastro({ tipo: "diario", dados: { sessao: proxima, data: new Date().toLocaleDateString("pt-BR") } as DadosDiario })}
        >
          Sessão {proxima}
        </Botao>
        <span className={css.nota}>Uma entrada por sessão. &quot;Sugerir do registro&quot; traz o que aconteceu desde a sessão anterior.</span>
      </div>
      {entradas.length === 0 && <p className={css.nota}>O diário está vazio.</p>}
      {entradas.map((e, i) => (
        <CartaoDiario key={`${e.id}|${e.atualizadoEm}`} entrada={e} sugerir={() => sugestoesDoRegistro(eventos, entradas[i + 1]?.atualizadoEm ?? null, marcos)} />
      ))}
    </div>
  );
}
