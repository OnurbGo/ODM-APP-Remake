import { Botao, Carregando, CampoTexto, Cartao } from "@odm/estilo";
import { TAMANHO_CODIGO_MESA, TAMANHO_MAXIMO_NOME } from "@odm/protocolo/constantes";
import { lazy, Suspense, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { acoes, useLoja } from "../conexao/loja";
import css from "./Entrada.module.css";

/* O jogador nunca baixa a lista de campanhas do mestre. */
const Campanhas = lazy(() => import("./mestre/Campanhas"));

function codigoDoEndereco() {
  const url = new URL(location.href);
  const codigo = url.searchParams.get("codigo");
  if (codigo) {
    url.searchParams.delete("codigo");
    history.replaceState(null, "", url);
  }
  return codigo?.toUpperCase().slice(0, TAMANHO_CODIGO_MESA) ?? "";
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <main className={`${css.pagina} odm-grao`}>
      <h1 className={css.titulo}>Olho da Morte</h1>
      <div className={css.corpo}>{children}</div>
    </main>
  );
}

function Formulario() {
  const mesaAberta = useLoja((e) => e.mesaAberta);
  const erro = useLoja((e) => e.erro);
  const aviso = useLoja((e) => e.aviso);
  const deOutraCampanha = useLoja((e) => e.deOutraCampanha);
  const [nome, definirNome] = useState("");
  const [codigo, definirCodigo] = useState(codigoDoEndereco);
  /* Quem leu o QR code desta campanha quer entrar nela, mesmo tendo lugar em outra. */
  const [pedindo, definirPedindo] = useState(codigo !== "");

  const pronto = nome.trim().length > 0 && codigo.trim().length === TAMANHO_CODIGO_MESA;

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (pronto) acoes.pedirEntrada(nome.trim(), codigo.trim());
  };

  if (!mesaAberta) {
    return (
      <Cartao titulo="Mesa fechada">
        <p className={css.texto}>O mestre ainda não abriu a mesa. Esta tela atualiza sozinha quando abrir.</p>
      </Cartao>
    );
  }

  if (deOutraCampanha && !pedindo) {
    return (
      <Mensagem
        titulo="Mesa fechada"
        texto="O mestre abriu outra campanha. Esta tela atualiza sozinha quando a sua abrir."
        acao={<Botao onClick={() => definirPedindo(true)}>Pedir para entrar nesta campanha</Botao>}
      />
    );
  }

  return (
    <form onSubmit={enviar} className={css.formulario}>
      {aviso && <p className={css.aviso}>{aviso}</p>}
      <CampoTexto
        rotulo="Seu nome"
        value={nome}
        onChange={(e) => definirNome(e.target.value)}
        maxLength={TAMANHO_MAXIMO_NOME}
        autoComplete="name"
        enterKeyHint="next"
      />
      <CampoTexto
        rotulo="Código da mesa"
        ajuda="O mestre vê este código na tela dele."
        value={codigo}
        onChange={(e) => definirCodigo(e.target.value.toUpperCase())}
        maxLength={TAMANHO_CODIGO_MESA}
        autoComplete="off"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        erro={erro}
      />
      <Botao type="submit" variante="primario" grande largo disabled={!pronto}>
        Pedir para entrar
      </Botao>
    </form>
  );
}

function Mensagem({ titulo, texto, acao }: { titulo: string; texto: string; acao?: ReactNode }) {
  return (
    <Cartao titulo={titulo}>
      <p className={css.texto}>{texto}</p>
      {acao && <div className={css.acao}>{acao}</div>}
    </Cartao>
  );
}

const ESPERA_ANTES_DO_ERRO_MS = 8000;

/* Girar para sempre faz o jogador desistir. Depois da espera, explica o que conferir e segue tentando.
   O app Android usa esta mesma tela (especificação, 3.6). */
function ProcurandoMesa() {
  const reconectando = useLoja((e) => e.reconectando);
  const [demorou, definirDemorou] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => definirDemorou(true), ESPERA_ANTES_DO_ERRO_MS);
    return () => clearTimeout(id);
  }, []);

  if (demorou) {
    return (
      <Cartao titulo="Não achamos a mesa">
        <div role="alert">
          <p className={css.texto}>A página abriu, mas a mesa do mestre não respondeu. Continuamos tentando sozinhos.</p>
          <ul className={css.conferir}>
            <li>Confira se o mestre está com a mesa aberta.</li>
            <li>Use o mesmo Wi-Fi do mestre, sem os dados móveis.</li>
            <li>Peça ao mestre para abrir “Ninguém conseguiu entrar?” no painel dele.</li>
          </ul>
        </div>
        <div className={css.espera}>
          <Carregando decorativo />
        </div>
      </Cartao>
    );
  }
  return (
    <div className={css.espera}>
      <Carregando modo="linha" rotulo="Procurando a mesa" />
      <p className={css.texto}>{reconectando ? "Sem resposta do mestre. Tentando de novo…" : "Procurando a mesa…"}</p>
    </div>
  );
}

export function Entrada() {
  const fase = useLoja((e) => e.fase);
  const reconectando = useLoja((e) => e.reconectando);
  const erro = useLoja((e) => e.erro);

  switch (fase) {
    case "conectando":
    case "dentro":
      return (
        <Moldura>
          <ProcurandoMesa />
        </Moldura>
      );
    case "aguardando":
      return (
        <Moldura>
          <div className={css.espera} role="status">
            <Carregando decorativo />
            <p className={css.texto}>Pedido enviado. Aguardando o mestre aprovar sua entrada.</p>
            {reconectando && <p className={css.aviso}>A conexão caiu. Tentando voltar…</p>}
          </div>
        </Moldura>
      );
    case "recusado":
      return (
        <Moldura>
          <Mensagem
            titulo="Entrada recusada"
            texto="O mestre não aprovou este pedido."
            acao={<Botao onClick={acoes.voltarParaEntrada}>Tentar de novo</Botao>}
          />
        </Moldura>
      );
    case "revogado":
      return (
        <Moldura>
          <Mensagem
            titulo="Fora da mesa"
            texto="O mestre tirou este dispositivo da mesa."
            acao={<Botao onClick={acoes.recomecar}>Pedir para entrar de novo</Botao>}
          />
        </Moldura>
      );
    case "versao":
      return (
        <Moldura>
          <Mensagem
            titulo="Versão diferente"
            texto="Este app está em outra versão. Recarregue a página para atualizar."
            acao={<Botao onClick={() => location.reload()}>Recarregar</Botao>}
          />
        </Moldura>
      );
    case "negado":
      return (
        <Moldura>
          <Mensagem titulo="Sem permissão" texto={erro ?? "Esta janela não tem acesso de mestre."} />
        </Moldura>
      );
    case "campanhas":
      return (
        <Suspense fallback={<Carregando modo="tela" rotulo="Abrindo as campanhas" />}>
          <Campanhas />
        </Suspense>
      );
    case "visitante":
      return (
        <Moldura>
          <Formulario />
        </Moldura>
      );
  }
}
