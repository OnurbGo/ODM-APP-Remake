import { Botao, Carregando } from "@odm/estilo";
import { useContextoFicha } from "../../conexao/conteudo";
import { useLoja } from "../../conexao/loja";
import css from "../ficha/Ficha.module.css";
import TelaJogo from "./Jogo";

/* Baixa o conteúdo da ficha e abre a aba Combate. Fica num pacote à parte: o jogador só baixa quando abre. */
export default function JogoDoPersonagem({ personagemId, aoAbrirMesa }: { personagemId: string; aoAbrirMesa: () => void }) {
  const personagem = useLoja((e) => e.personagens.find((p) => p.id === personagemId));
  const contexto = useContextoFicha();
  if (contexto.situacao === "carregando" || !personagem) return <Carregando rotulo="Abrindo o personagem" />;
  if (contexto.situacao === "falhou") {
    return (
      <div className={css.falha}>
        <p role="alert">{contexto.mensagem}</p>
        <Botao onClick={aoAbrirMesa}>Voltar</Botao>
      </div>
    );
  }
  return <TelaJogo personagem={personagem} ctx={contexto.ctx} conteudo={contexto.conteudo} aoAbrirMesa={aoAbrirMesa} />;
}
