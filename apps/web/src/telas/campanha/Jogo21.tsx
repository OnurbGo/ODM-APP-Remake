import { Botao, CartaBaralho, Etiqueta, PopUp } from "@odm/estilo";
import type { Jogo21 } from "@odm/protocolo";
import { totaisPossiveis } from "@odm/regras";
import { useState } from "react";
import { acoes, useLoja } from "../../conexao/loja";
import css from "./Jogo21.module.css";
import { salvos } from "../../conexao/armazenamento";

/* Jogo do 21 (Mestre, "Sistema de busca de espólios"; J1, 07/11/2026). O servidor guarda o baralho; a tela só
   mostra a mão e pede para comprar ou parar. */

export function Mao21({ jogo }: { jogo: Jogo21 }) {
  return (
    <div className={css.mao} aria-label={`Cartas de ${jogo.personagemNome}`}>
      {jogo.cartas.map((c, i) => (
        <CartaBaralho key={`${c.valor}-${c.naipe}`} valor={c.valor} naipe={c.naipe} virada tamanho="m" atraso={i < 2 ? i * 120 : 0} />
      ))}
    </div>
  );
}

export function ResultadoDo21({ jogo }: { jogo: Jogo21 }) {
  if (jogo.situacao === "jogando" || jogo.total === null) return null;
  const tom = jogo.situacao === "estourou" ? "perigo" : jogo.faixa?.resultado === "excepcional" ? "sucesso" : "destaque";
  return (
    <p className={css.resultado} role="status">
      <span className="odm-numero">{jogo.total}</span>
      <Etiqueta tom={tom}>{jogo.situacao === "estourou" ? "Estourou" : "Parou"}</Etiqueta>
      <span>{jogo.faixa?.rotulo ?? "Sem faixa na tabela"}</span>
    </p>
  );
}

/* As escolhas de parada: com Ás, o jogador escolhe quanto ele vale (1 ou 11). */
function Escolhas({ jogo }: { jogo: Jogo21 }) {
  const opcoes = totaisPossiveis(jogo.cartas).filter((o) => o.total <= 21);
  const temAs = opcoes.length > 1;
  return (
    <div className={css.botoes}>
      <Botao variante="primario" onClick={() => acoes.comprarNo21(jogo.id)}>
        Comprar carta
      </Botao>
      {opcoes.map((o) => (
        <Botao key={o.asesComo11} onClick={() => acoes.pararNo21(jogo.id, o.asesComo11)}>
          Parar em {o.total}
          {temAs ? (o.asesComo11 ? ` (Ás vale 11)` : " (Ás vale 1)") : ""}
        </Botao>
      ))}
    </div>
  );
}

/* Janela da jogadora: abre sozinha quando o mestre começa um jogo para um personagem dela. */
export function Jogo21Jogador() {
  const jogos = useLoja((e) => e.jogos21);
  const eu = useLoja((e) => e.eu);
  const [fechados, definirFechados] = useState<ReadonlySet<string>>(() => new Set(salvos.janelasFechadas("jogo21")));
  if (eu?.papel === "mestre") return null;
  const jogo = jogos.find((j) => !fechados.has(j.id));
  if (!jogo) return null;
  const fechar = () =>
    definirFechados((f) => {
      const novos = new Set([...f, jogo.id]);
      salvos.guardarJanelasFechadas("jogo21", [...novos]);
      return novos;
    });
  const somas = totaisPossiveis(jogo.cartas).filter((o) => o.total <= 21).map((o) => o.total);
  return (
    <PopUp aberto titulo="Jogo do 21" subtitulo={[jogo.personagemNome, jogo.local].filter(Boolean).join(" · ")} variante="central" aoFechar={fechar} obrigatorio={jogo.situacao === "jogando"}>
      <div className={css.janela}>
        <p className={css.nota}>Some 21 sem passar. Figuras valem 10; o Ás vale 1 ou 11, você escolhe ao parar.</p>
        <Mao21 jogo={jogo} />
        {jogo.situacao === "jogando" ? (
          <>
            <p className={css.soma}>
              Soma: <strong className="odm-numero">{somas.length ? somas.join(" ou ") : "passou de 21"}</strong>
            </p>
            <Escolhas jogo={jogo} />
          </>
        ) : (
          <>
            <ResultadoDo21 jogo={jogo} />
            <p className={css.nota}>O mestre escolhe o que você encontra.</p>
            <Botao largo onClick={fechar}>
              Fechar
            </Botao>
          </>
        )}
      </div>
    </PopUp>
  );
}
