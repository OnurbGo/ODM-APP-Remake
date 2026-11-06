import { Cartao } from "@odm/estilo";
import { useLoja } from "../conexao/loja";
import { FaixaConexao, NomeParticipante, Registro, Rolar } from "./Blocos";
import css from "./MesaJogador.module.css";
import { useTelaLarga } from "./useLargura";

/* Mesa provisória da fase 2: prova a conexão ao vivo. A fase 5 traz a aba Combate. */

function NaMesa() {
  const participantes = useLoja((e) => e.participantes);
  return (
    <Cartao titulo="Na mesa">
      <ul>
        {participantes.map((p) => (
          <NomeParticipante key={p.id} participante={p} />
        ))}
      </ul>
    </Cartao>
  );
}

function Topo() {
  const mesa = useLoja((e) => e.mesa);
  const eu = useLoja((e) => e.eu);
  return (
    <header className={css.topo}>
      <h1 className={css.titulo}>{mesa?.nome}</h1>
      <p className={css.quem}>{eu?.nome}</p>
    </header>
  );
}

function Celular() {
  return (
    <div className={`${css.celular} odm-grao`}>
      <FaixaConexao />
      <Topo />
      <main className={css.colunaCelular}>
        <Rolar />
        <NaMesa />
        <Registro />
      </main>
    </div>
  );
}

function Desktop() {
  return (
    <div className={`${css.desktop} odm-grao`}>
      <FaixaConexao />
      <Topo />
      <main className={css.colunas}>
        <div className={css.coluna}>
          <NaMesa />
        </div>
        <div className={css.coluna}>
          <Rolar />
        </div>
        <div className={css.coluna}>
          <Registro className={css.preenche} />
        </div>
      </main>
    </div>
  );
}

export function MesaJogador() {
  return useTelaLarga() ? <Desktop /> : <Celular />;
}
