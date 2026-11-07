import { Botao, PopUp } from "@odm/estilo";
import { useState } from "react";
import { acoes } from "../../conexao/loja";
import { eEspecial, Grande, NOME_CARTA, RESUMO_DO_EFEITO } from "./comum";
import comum from "./Comum.module.css";
import css from "./Iniciativa.module.css";
import type { Jogo } from "./Jogo";

/* Iniciativa do jogador (parada 8): compra, vira e, com carta especial, escolhe entre o efeito e a prioridade.
   Com a Redenção completa, escolhe uma entre as cartas. O servidor confere tudo. */
export function IniciativaJogador({ jogo, variante, aberta, aoFechar }: { jogo: Jogo; variante: "folha" | "central"; aberta: boolean; aoFechar: () => void }) {
  const { combate, meu } = jogo;
  if (!combate || combate.fase !== "iniciativa" || !meu) return null;
  return (
    <PopUp aberto={aberta} titulo="Iniciativa" subtitulo={meu.carta ? NOME_CARTA[meu.carta.valor] : "Compre sua carta"} variante={variante} aoFechar={aoFechar}>
      <Fluxo jogo={jogo} />
    </PopUp>
  );
}

function Fluxo({ jogo }: { jogo: Jogo }) {
  const combate = jogo.combate!;
  const meu = jogo.meu!;
  const outros = combate.combatentes.filter((c) => c.id !== meu.id);
  const [alvos, definirAlvos] = useState<[string, string]>(["", ""]);
  const [aliado, definirAliado] = useState(meu.id);

  if (!meu.carta && !meu.cartasParaEscolher.length) {
    return (
      <div className={css.jogador}>
        <Botao variante="primario" grande largo onClick={() => acoes.comprarIniciativa(meu.id)}>
          Comprar carta
        </Botao>
        <p className={css.nota}>O mestre também pode comprar para a mesa toda.</p>
      </div>
    );
  }

  if (!meu.carta) {
    return (
      <div className={css.jogador}>
        <p className={css.nota}>Redenção completa: fique com a carta que quiser.</p>
        <div className={comum.cartas}>
          {meu.cartasParaEscolher.map((c) => (
            <button key={c.id} type="button" className={comum.escolher} aria-label={`Ficar com ${NOME_CARTA[c.valor]}`} onClick={() => acoes.escolherCarta(meu.id, c.id)}>
              <Grande carta={c} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  const carta = meu.carta;
  const decidindo = eEspecial(carta) && meu.usaEfeito === null;
  const jaUsado = meu.efeitosUsados.includes(carta.valor);
  return (
    <div className={css.jogador}>
      <div className={comum.cartas}>
        <Grande carta={carta} />
      </div>
      {decidindo ? (
        <div className={css.decidir}>
          <p className={css.efeito}>
            <strong>{NOME_CARTA[carta.valor]}:</strong> {RESUMO_DO_EFEITO[carta.valor]}
          </p>
          {carta.valor === "coringa" && (
            <div className={css.alvos}>
              {[0, 1].map((i) => (
                <label key={i} className={comum.campo}>
                  <span className="odm-rotulo">{i === 0 ? "Primeiro alvo" : "Segundo alvo"}</span>
                  <select value={alvos[i]} onChange={(e) => definirAlvos((a) => (i === 0 ? [e.target.value, a[1]] : [a[0], e.target.value]))}>
                    <option value="">Escolha</option>
                    {outros.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          )}
          {(carta.valor === "K" || carta.valor === "Q") && (
            <label className={comum.campo}>
              <span className="odm-rotulo">Quem recebe</span>
              <select value={aliado} onChange={(e) => definirAliado(e.target.value)}>
                {combate.combatentes
                  .filter((c) => c.tipo === "personagem")
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id === meu.id ? `${c.nome} (você)` : c.nome}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <Botao
            variante="primario"
            grande
            largo
            disabled={jaUsado || (carta.valor === "coringa" && (!alvos[0] || !alvos[1] || alvos[0] === alvos[1]))}
            onClick={() => acoes.decidirEfeito(meu.id, true, carta.valor === "coringa" ? alvos : carta.valor === "K" || carta.valor === "Q" ? [aliado] : [])}
          >
            {jaUsado ? "Efeito já usado neste combate" : "Usar efeito e ir para o fim da ordem"}
          </Botao>
          <Botao grande largo onClick={() => acoes.decidirEfeito(meu.id, false)}>
            Manter a prioridade
          </Botao>
        </div>
      ) : (
        <p className={css.nota}>
          {meu.usaEfeito ? `Vai usar o efeito do ${NOME_CARTA[carta.valor]}. ` : ""}Pronto. Aguardando o mestre começar o combate.
        </p>
      )}
    </div>
  );
}
