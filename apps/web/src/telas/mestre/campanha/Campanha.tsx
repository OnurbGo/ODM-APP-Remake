import { ID_CATEGORIAS_DE_ESPOLIO, ID_JOGO_DO_21, MecanicaEspolios } from "@odm/conteudo";
import { Abas, Carregando } from "@odm/estilo";
import { useState } from "react";
import { useContextoFicha } from "../../../conexao/conteudo";
import { useConteudoMestre } from "../../../conexao/conteudoMestre";
import css from "./Campanha.module.css";
import { Comercio } from "./Comercio";
import { Jogo21Mestre } from "./Jogo21Mestre";
import { LinhaDoTempo } from "./LinhaDoTempo";
import { Missoes } from "./Missoes";
import { Notas, DiarioDaSessao } from "./Notas";
import { Npcs } from "./Npcs";
import { Mundo } from "./Mundo";

/* Área "Campanha" do mestre (fase 6, etapas 8 a 10): missões, linha do tempo, comércio, NPCs, mundo, Jogo do 21, notas e diário. */
export default function Campanha() {
  const doMestre = useConteudoMestre();
  const contexto = useContextoFicha();
  const [aba, definirAba] = useState("missoes");
  if (doMestre.situacao === "carregando" || contexto.situacao === "carregando") return <Carregando rotulo="Abrindo a campanha" />;
  if (doMestre.situacao === "falhou") return <p className={css.nota}>{doMestre.mensagem}</p>;
  const ctxFicha = contexto.situacao === "pronto" ? contexto.ctx : null;
  const regra21 = doMestre.conteudo.regras.find((r) => r.id === ID_JOGO_DO_21);
  /* Lugares de espólio (lote 11): só com a mecânica no pacote (aprovada, ou na prévia). */
  const espolios = MecanicaEspolios.safeParse(doMestre.conteudo.regras.find((r) => r.id === ID_CATEGORIAS_DE_ESPOLIO)?.mecanica);
  return (
    <div className={css.campanha}>
      <Abas
        rotuloGrupo="Campanha"
        itens={[
          { id: "missoes", rotulo: "Missões" },
          { id: "linha", rotulo: "Linha do tempo" },
          { id: "comercio", rotulo: "Comércio" },
          { id: "npcs", rotulo: "NPCs" },
          { id: "mundo", rotulo: "Mundo" },
          { id: "jogo21", rotulo: "Jogo do 21" },
          { id: "notas", rotulo: "Notas" },
          { id: "diario", rotulo: "Diário" },
        ]}
        ativa={aba}
        aoEscolher={definirAba}
      />
      <div className={css.corpo}>
        {aba === "missoes" ? <Missoes conteudo={doMestre.conteudo} ctxFicha={ctxFicha} /> : aba === "linha" ? (
          <LinhaDoTempo />
        ) : aba === "npcs" ? (
          <Npcs conteudo={doMestre.conteudo} />
        ) : aba === "notas" ? (
          <Notas />
        ) : aba === "diario" ? (
          <DiarioDaSessao />
        ) : aba === "comercio" ? (
          <Comercio conteudo={doMestre.conteudo} ctxFicha={ctxFicha} />
        ) : aba === "mundo" ? (
          <Mundo modificadores={doMestre.conteudo.modificadores ?? []} />
        ) : (
          <Jogo21Mestre ctxFicha={ctxFicha} regraTexto={regra21?.texto ?? null} aprovado={!!regra21?.mecanica} espolios={espolios.success ? espolios.data : null} municoes={doMestre.conteudo.municoes ?? []} />
        )}
      </div>
    </div>
  );
}
