import { Botao, Cartao, Etiqueta, Icone } from "@odm/estilo";
import type { EventoVisto } from "@odm/protocolo";
import { useMemo } from "react";
import { acoes, useLoja } from "../../../conexao/loja";
import { contaDoResultado, resultadosDe, textoDoSucesso, ultimoDoPedido, type EventoPedidoMestre } from "../../testes/comum";
import css from "./Escudo.module.css";

/* Cartão de resultados do mestre (especificação 8.3 e 8.4), a partir do protótipo (TesteEmAndamento).
   O mestre vê cada resultado assim que o servidor rola, sem esperar a animação do jogador. */

export function useTestesAbertos(fechados: ReadonlySet<string>) {
  const eventos = useLoja((e) => e.eventos);
  /* "Limpar rolagens" também tira os cartões de teste até o mesmo ponto do registro,
     menos os que ainda esperam a resposta de alguém. */
  const limpasAte = useLoja((e) => e.rolagensLimpasAte);
  return useMemo(() => {
    const resultados = resultadosDe(eventos as EventoVisto[]);
    const esperando = (e: EventoPedidoMestre) =>
      e.dados.pedido.personagens.some((p) => {
        const r = ultimoDoPedido(resultados, e.dados.pedido.id, p.personagemId);
        return !r || r.dados.estado === "recusado";
      });
    return eventos.filter((e): e is EventoPedidoMestre => e.tipo === "teste_pedido" && !fechados.has(e.dados.pedido.id) && (e.n > limpasAte || esperando(e))).reverse();
  }, [eventos, fechados, limpasAte]);
}

export function TestesEmAndamento({ pedidos, efeitos, aoFechar }: { pedidos: EventoPedidoMestre[]; efeitos: ReadonlyMap<string, string>; aoFechar: (pedidoId: string) => void }) {
  const eventos = useLoja((e) => e.eventos);
  const personagens = useLoja((e) => e.personagens);
  const resultados = useMemo(() => resultadosDe(eventos as EventoVisto[]), [eventos]);
  if (!pedidos.length) return null;
  return (
    <div className={css.testes}>
      {pedidos.map((e) => {
        const { pedido, oponente, donos, rotulo } = e.dados;
        const linhas = pedido.personagens.map((p) => ({ ajuste: p, r: ultimoDoPedido(resultados, pedido.id, p.personagemId), personagem: personagens.find((x) => x.id === p.personagemId) }));
        const faltam = linhas.filter((l) => !l.r || l.r.dados.estado === "recusado").length;
        const efeito = pedido.efeitoNaFalha ? (efeitos.get(pedido.efeitoNaFalha.efeitoId) ?? pedido.efeitoNaFalha.efeitoId) : null;
        const dtTexto =
          pedido.tipo === "contestado"
            ? `contra ${pedido.oponente.nome}${oponente ? ` ${oponente.total}` : ""}`
            : `DT ${pedido.dt}${pedido.tipo === "passivo" ? "" : pedido.dtVisivel ? " (visível)" : " (oculta)"}`;
        return (
          <Cartao key={pedido.id} className={css.teste}>
            <header className={css.testeTopo}>
              <div>
                <h2 className={css.testeTitulo}>
                  {rotulo} · {dtTexto}
                </h2>
                <p className={css.nota}>
                  {[
                    pedido.origem,
                    pedido.tipo === "passivo" ? "Passivo: os jogadores não sabem" : null,
                    pedido.tipo === "contestado" ? `${pedido.oponenteVisivel ? "Oponente visível" : "Oponente oculto"} · no empate vence ${pedido.quemAge === "personagem" ? "o personagem" : "o oponente"}` : null,
                    efeito ? `${efeito} em quem falhar` : null,
                    faltam ? `Faltam ${faltam}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <button type="button" className={css.fechar} onClick={() => aoFechar(pedido.id)} aria-label="Fechar teste">
                <Icone nome="fechar" tamanho={18} />
              </button>
            </header>
            <ul className={css.resultados}>
              {linhas.map(({ ajuste, r, personagem }) => {
                const nome = r?.dados.personagemNome ?? personagem?.ficha.nome ?? "Personagem";
                const esperando = !r || r.dados.estado === "recusado";
                const sucesso = r ? textoDoSucesso(r.dados) : null;
                return (
                  <li key={ajuste.personagemId} className={css.resultado}>
                    <span className={css.resultadoNome}>{nome}</span>
                    {!r && <span className={css.aguardando}>{donos[ajuste.personagemId] ? "Aguardando o jogador" : "Sem jogador"}</span>}
                    {r?.dados.estado === "recusado" && <Etiqueta tom="perigo">Recusado</Etiqueta>}
                    {r && r.dados.estado !== "recusado" && (
                      <>
                        <span className={css.resultadoConta}>
                          {contaDoResultado(r.dados)}
                          {ajuste.dt !== undefined && pedido.tipo !== "contestado" && ajuste.dt !== pedido.dt ? " (DT própria)" : ""}
                        </span>
                        {sucesso && <Etiqueta tom={r.dados.sucesso ? "sucesso" : "perigo"}>{sucesso}</Etiqueta>}
                        {r.dados.automatico && <Etiqueta>Automático</Etiqueta>}
                        {r.dados.habilidades.map((h) => (
                          <Etiqueta key={h} tom="tecnica">
                            {h}
                          </Etiqueta>
                        ))}
                        {r.dados.consequencia && <Etiqueta tom="perigo">Forçada: aplique uma consequência</Etiqueta>}
                        {r.dados.efeitoAplicado && efeito && <Etiqueta tom="perigo">{efeito}</Etiqueta>}
                      </>
                    )}
                    {esperando && pedido.tipo !== "passivo" && (
                      <span className={css.decisoes}>
                        <Botao variante="fantasma" onClick={() => acoes.decidirTeste(pedido.id, ajuste.personagemId, "sucesso")}>
                          Sucesso
                        </Botao>
                        <Botao variante="fantasma" onClick={() => acoes.decidirTeste(pedido.id, ajuste.personagemId, "falha")}>
                          Falha
                        </Botao>
                        <Botao variante="fantasma" onClick={() => acoes.decidirTeste(pedido.id, ajuste.personagemId, "rolar")}>
                          Rolar por ele
                        </Botao>
                        <Botao variante="fantasma" onClick={() => acoes.decidirTeste(pedido.id, ajuste.personagemId, "cancelar")}>
                          Cancelar teste
                        </Botao>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            {!faltam && efeito && linhas.some((l) => l.r?.dados.efeitoAplicado) && <p className={css.nota}>Efeito aplicado. Para reverter, use Desfazer no registro.</p>}
          </Cartao>
        );
      })}
    </div>
  );
}
