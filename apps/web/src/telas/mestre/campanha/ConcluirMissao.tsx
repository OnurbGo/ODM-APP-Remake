import { Botao, PopUp } from "@odm/estilo";
import type { CadastroDe } from "@odm/protocolo";
import { lerRegrasEncontro, multiplicadorDoGrupo, nivelDoXp, nivelMedioDoGrupo, ROTULO_GRAU, valorGerado, xpDaMissao, type ContextoFicha } from "@odm/regras";
import { useMemo, useState } from "react";
import type { ConteudoMestre } from "../../../conexao/conteudoMestre";
import { acoes, useLoja } from "../../../conexao/loja";
import { Divisao, partesFinais, type DivisaoEscolhida } from "../Divisao";
import css from "./Campanha.module.css";

/* Concluir a missão (Mestre, "Recompensas e Encontros"; M1, 07/11/2026): XP de missão = metade da coluna da
   dificuldade × o multiplicador do grupo; dinheiro sugerido pela Tabela de Valor Gerado, também com o
   multiplicador. Os dois são sugestões editáveis, divididas entre os participantes. Missão que falhou não sugere nada. */

function CampoValor({ rotulo, valor, aoMudar }: { rotulo: string; valor: number; aoMudar: (v: number) => void }) {
  return (
    <label className={css.campoValor}>
      <span className="odm-rotulo">{rotulo}</span>
      <input type="number" inputMode="numeric" min={0} value={valor} onChange={(e) => aoMudar(Math.max(0, Math.floor(Number(e.target.value) || 0)))} />
    </label>
  );
}

export function ConcluirMissao({ missao, desfecho, conteudo, ctxFicha, aoFechar }: { missao: CadastroDe<"missao">; desfecho: "concluida" | "falhou"; conteudo: ConteudoMestre; ctxFicha: ContextoFicha | null; aoFechar: () => void }) {
  const todos = useLoja((e) => e.personagens);
  const personagens = todos.filter((p) => p.situacao === "ativo");
  const regras = useMemo(() => lerRegrasEncontro(conteudo), [conteudo]);
  const [fora, definirFora] = useState<string[]>([]);
  const recebem = personagens.filter((p) => !fora.includes(p.id));
  const pessoas = recebem.map((p) => ({ id: p.id, nome: p.ficha.nome || "Sem nome" }));
  const niveis = ctxFicha ? recebem.map((p) => nivelDoXp(p.ficha.xp, ctxFicha.regras)) : [];
  const nivel = nivelMedioDoGrupo(niveis, regras);
  const sugeridoXp = desfecho === "concluida" && nivel !== null ? xpDaMissao(missao.dados.dificuldade, nivel, recebem.length, regras) : null;
  const sugeridoDinheiro = desfecho === "concluida" && nivel !== null ? valorGerado(missao.dados.dificuldade, nivel, recebem.length, regras) : null;
  /* null = segue a sugestão (que muda com quem recebe); número = o mestre digitou. */
  const [xpDigitado, definirXp] = useState<number | null>(null);
  const [dinheiroDigitado, definirDinheiro] = useState<number | null>(null);
  const xp = xpDigitado ?? sugeridoXp ?? 0;
  const dinheiro = dinheiroDigitado ?? sugeridoDinheiro ?? 0;
  const [divisaoXp, definirDivisaoXp] = useState<DivisaoEscolhida>(null);
  const [divisaoDinheiro, definirDivisaoDinheiro] = useState<DivisaoEscolhida>(null);
  /* Item → quem recebe (vazio = não entregar agora). */
  const [destinos, definirDestinos] = useState<Record<number, string>>({});
  const itens = missao.dados.recompensas.itens;

  const conta = nivel !== null && recebem.length
    ? `Nível médio ${nivel}, ${recebem.length} ${recebem.length === 1 ? "personagem" : "personagens"} (× ${multiplicadorDoGrupo(recebem.length, regras).toLocaleString("pt-BR")}), ${ROTULO_GRAU[missao.dados.dificuldade]}`
    : null;

  const entregar = () => {
    const partesXp = partesFinais(xp, pessoas, divisaoXp);
    const partesDinheiro = partesFinais(dinheiro, pessoas, divisaoDinheiro);
    for (const p of pessoas) {
      if ((partesXp[p.id] ?? 0) > 0) acoes.operar(p.id, { op: "xp", delta: partesXp[p.id]! });
      if ((partesDinheiro[p.id] ?? 0) > 0) acoes.operar(p.id, { op: "dinheiro", delta: partesDinheiro[p.id]! });
    }
    itens.forEach((it, i) => {
      const quem = destinos[i];
      if (quem) acoes.operar(quem, { op: "dar_item", item: { id: "novo", itemId: it.itemId, nome: it.nome, quantidade: it.quantidade, equipado: false, pesoKg: null } });
    });
    acoes.salvarCadastro({ id: missao.id, tipo: "missao", dados: { ...missao.dados, situacao: desfecho, entregue: missao.dados.entregue || xp > 0 || dinheiro > 0 || Object.values(destinos).some(Boolean) } });
    aoFechar();
  };

  return (
    <PopUp aberto titulo={desfecho === "concluida" ? `Concluir: ${missao.dados.titulo}` : `Falhou: ${missao.dados.titulo}`} subtitulo={desfecho === "falhou" ? "Missão que falhou não sugere XP nem dinheiro. Se quiser dar algo, digite." : conta ?? undefined} variante="central" aoFechar={aoFechar}>
      <div className={css.concluir}>
        {missao.dados.entregue && <p className={css.aviso}>A recompensa desta missão já foi entregue uma vez. Entregar de novo soma outra vez.</p>}
        <fieldset className={css.campo}>
          <legend className="odm-rotulo">Quem participou</legend>
          {personagens.map((p) => (
            <label key={p.id} className={css.marcar}>
              <input type="checkbox" checked={!fora.includes(p.id)} onChange={() => definirFora((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))} /> {p.ficha.nome || "Sem nome"}
              {ctxFicha && <span className={css.nota}> · nível {nivelDoXp(p.ficha.xp, ctxFicha.regras)}</span>}
            </label>
          ))}
        </fieldset>

        <section className={css.bloco}>
          <CampoValor rotulo="XP de missão (total)" valor={xp} aoMudar={definirXp} />
          {desfecho === "concluida" && sugeridoXp === null && <p className={css.nota}>Sem sugestão: a regra do XP de missão não está aprovada no pacote, ou ninguém está marcado.</p>}
          {xpDigitado !== null && sugeridoXp !== null && (
            <Botao variante="fantasma" onClick={() => definirXp(null)}>
              Voltar à sugestão ({sugeridoXp.toLocaleString("pt-BR")} XP)
            </Botao>
          )}
          <Divisao rotulo="Dividir o XP da missão" unidade="XP" totalBruto={xp} pessoas={pessoas} escolhida={divisaoXp} aoEscolher={definirDivisaoXp} />
        </section>

        <section className={css.bloco}>
          <CampoValor rotulo="Dinheiro (total, R$)" valor={dinheiro} aoMudar={definirDinheiro} />
          {desfecho === "concluida" && sugeridoDinheiro !== null && <p className={css.nota}>Sugestão da Tabela de Valor Gerado. Não inclui itens e bens achados na missão.</p>}
          {dinheiroDigitado !== null && sugeridoDinheiro !== null && (
            <Botao variante="fantasma" onClick={() => definirDinheiro(null)}>
              Voltar à sugestão (R$ {sugeridoDinheiro.toLocaleString("pt-BR")})
            </Botao>
          )}
          <Divisao rotulo="Dividir o dinheiro da missão" unidade="R$" totalBruto={dinheiro} pessoas={pessoas} escolhida={divisaoDinheiro} aoEscolher={definirDivisaoDinheiro} />
        </section>

        {itens.length > 0 && (
          <section className={css.bloco}>
            <p className="odm-rotulo">Itens</p>
            <ul className={css.lista}>
              {itens.map((it, i) => (
                <li key={i} className={css.linhaLista}>
                  <span>
                    {it.quantidade} × {it.nome}
                  </span>
                  <select aria-label={`Quem recebe ${it.nome}`} value={destinos[i] ?? ""} onChange={(e) => definirDestinos((m) => ({ ...m, [i]: e.target.value }))}>
                    <option value="">Não entregar agora</option>
                    {personagens.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.ficha.nome || "Sem nome"}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className={css.nota}>Cada entrega entra no registro e pode ser desfeita de lá.</p>
        <Botao variante="primario" grande largo onClick={entregar}>
          {desfecho === "concluida" ? "Entregar e concluir" : "Marcar como falhou"}
        </Botao>
      </div>
    </PopUp>
  );
}
