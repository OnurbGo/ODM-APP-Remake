import { Botao, Carregando, Cartao, Etiqueta } from "@odm/estilo";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { acoes, useLoja } from "../conexao/loja";
import { FaixaConexao, NomeParticipante, Registro, Rolar } from "./Blocos";
import css from "./MesaJogador.module.css";
import { useTelaLarga } from "./useLargura";

/* A ficha só baixa quando alguém abre um personagem. */
const AreaFicha = lazy(() => import("./ficha/AreaFicha"));

/* Mesa provisória da fase 2: prova a conexão ao vivo. A fase 5 traz a aba Combate. */

function Personagens({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const personagens = useLoja((e) => e.personagens);
  const temConteudo = useLoja((e) => e.mesa?.conteudo ?? false);
  const pediu = useRef(false);

  /* O personagem recém-criado abre direto no assistente. */
  useEffect(() => {
    const ultimo = personagens.at(-1);
    if (pediu.current && ultimo?.situacao === "rascunho") {
      pediu.current = false;
      aoAbrir(ultimo.id);
    }
  }, [personagens, aoAbrir]);

  return (
    <Cartao titulo="Personagens">
      {personagens.length === 0 && <p className={css.vazio}>{temConteudo ? "Você ainda não tem personagem nesta mesa." : "O mestre ainda não tem o conteúdo do jogo."}</p>}
      <ul className={css.personagens}>
        {personagens.map((p) => (
          <li key={p.id} className={css.personagem}>
            <span className={css.personagemNome}>{p.ficha.nome || "Sem nome"}</span>
            {p.situacao === "rascunho" && <Etiqueta>Rascunho</Etiqueta>}
            <Botao variante="fantasma" onClick={() => aoAbrir(p.id)}>
              Abrir
            </Botao>
          </li>
        ))}
      </ul>
      {temConteudo && (
        <Botao
          largo
          onClick={() => {
            pediu.current = true;
            acoes.criarPersonagem();
          }}
        >
          Criar personagem
        </Botao>
      )}
    </Cartao>
  );
}

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

function Celular({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  return (
    <div className={`${css.celular} odm-grao`}>
      <FaixaConexao />
      <Topo />
      <main className={css.colunaCelular}>
        <Personagens aoAbrir={aoAbrir} />
        <Rolar />
        <NaMesa />
        <Registro />
      </main>
    </div>
  );
}

function Desktop({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  return (
    <div className={`${css.desktop} odm-grao`}>
      <FaixaConexao />
      <Topo />
      <main className={css.colunas}>
        <div className={css.coluna}>
          <Personagens aoAbrir={aoAbrir} />
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
  const larga = useTelaLarga();
  const [aberto, abrir] = useState<string | null>(null);
  const erro = useLoja((e) => e.erro);
  const existe = useLoja((e) => e.personagens.some((p) => p.id === aberto));

  if (aberto && existe) {
    return (
      <Suspense fallback={<Carregando rotulo="Abrindo a ficha" />}>
        <AreaFicha personagemId={aberto} aoVoltar={() => abrir(null)} />
      </Suspense>
    );
  }
  return (
    <>
      {erro && (
        <p className={css.erro} role="alert">
          {erro}
          <Botao variante="fantasma" onClick={acoes.limparErro}>
            Fechar
          </Botao>
        </p>
      )}
      {larga ? <Desktop aoAbrir={abrir} /> : <Celular aoAbrir={abrir} />}
    </>
  );
}
