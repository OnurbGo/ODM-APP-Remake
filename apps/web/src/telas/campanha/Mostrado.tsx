import { Botao, PopUp } from "@odm/estilo";
import type { DadosNpc } from "@odm/protocolo";
import { useState } from "react";
import { useImagemDaRef } from "../../conexao/imagens";
import { useLoja } from "../../conexao/loja";
import css from "./Mostrado.module.css";
import { salvos } from "../../conexao/armazenamento";

/* O que o mestre mostra (especificação 7.4): abre por cima da tela. O jogador pode fechar no aparelho dele;
   quando o mestre fecha, some para todos. */
export function Mostrado() {
  const mostra = useLoja((e) => e.mostrando);
  const eu = useLoja((e) => e.eu);
  const [fechados, definirFechados] = useState<ReadonlySet<string>>(() => new Set(salvos.janelasFechadas("mostra")));
  const url = useImagemDaRef(mostra?.imagem);
  if (!mostra || eu?.papel === "mestre" || fechados.has(mostra.id)) return null;
  const fechar = () =>
    definirFechados((f) => {
      const novos = new Set([...f, mostra.id]);
      salvos.guardarJanelasFechadas("mostra", [...novos]);
      return novos;
    });
  return (
    <PopUp aberto titulo={mostra.titulo || "O mestre mostra"} variante="central" aoFechar={fechar}>
      <div className={css.mostra}>
        {url && <img src={url} alt={mostra.titulo} className={css.imagem} />}
        {mostra.texto && <p className={css.texto}>{mostra.texto}</p>}
        <Botao largo onClick={fechar}>
          Fechar
        </Botao>
      </div>
    </PopUp>
  );
}

/* Cartão de NPC que o grupo conhece (aba Campanha). */
export function PessoaConhecida({ npc }: { npc: DadosNpc }) {
  const url = useImagemDaRef(npc.imagem);
  return (
    <div className={css.pessoa}>
      {url ? <img src={url} alt="" className={css.rosto} /> : <span className={css.semRosto} aria-hidden>?</span>}
      <div className={css.dados}>
        <strong>{npc.nome}</strong>
        {(npc.cidade || npc.afiliacao) && <span className={css.nota}>{[npc.cidade, npc.afiliacao].filter(Boolean).join(" · ")}</span>}
        {npc.resumo && <p className={css.texto}>{npc.resumo}</p>}
      </div>
    </div>
  );
}
