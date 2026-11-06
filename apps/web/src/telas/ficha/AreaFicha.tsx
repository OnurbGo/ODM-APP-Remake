import { Botao, Carregando } from "@odm/estilo";
import { useLoja } from "../../conexao/loja";
import { useContextoFicha } from "../../conexao/conteudo";
import { Criacao } from "./Criacao";
import css from "./Ficha.module.css";
import { TelaFicha } from "./TelaFicha";

/* Rascunho abre o assistente; personagem ativo abre a ficha. */
export default function AreaFicha({ personagemId, aoVoltar }: { personagemId: string; aoVoltar: () => void }) {
  const personagem = useLoja((e) => e.personagens.find((p) => p.id === personagemId));
  const contexto = useContextoFicha();

  if (contexto.situacao === "carregando" || !personagem) return <Carregando rotulo="Abrindo a ficha" />;
  if (contexto.situacao === "falhou") {
    return (
      <div className={css.falha}>
        <p role="alert">{contexto.mensagem}</p>
        <Botao onClick={aoVoltar}>Voltar</Botao>
      </div>
    );
  }
  if (personagem.situacao === "rascunho") return <Criacao personagem={personagem} ctx={contexto.ctx} aoVoltar={aoVoltar} />;
  return <TelaFicha personagem={personagem} ctx={contexto.ctx} aoVoltar={aoVoltar} />;
}
