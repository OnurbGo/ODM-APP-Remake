import { Botao, CampoNumero, Cartao, Etiqueta, prepararD20 } from "@odm/estilo";
import type { EventoVisto, Participante } from "@odm/protocolo";
import { aindaPodeDesfazer } from "@odm/regras/prazo";
import { useState, type ReactNode } from "react";
import { acoes, useLoja } from "../conexao/loja";
import css from "./Blocos.module.css";
import { contaDoResultado, textoDoSucesso } from "./testes/comum";

const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function LinhaEvento({ evento, desfeito, podeDesfazer }: { evento: EventoVisto; desfeito: boolean; podeDesfazer: boolean }) {
  let conteudo: ReactNode = null;

  if (evento.tipo === "rolagem") {
    const { rotulo, natural, modificadores, total } = evento.dados;
    const bonus = modificadores.reduce((soma, m) => soma + m.valor, 0);
    conteudo = (
      <>
        <span className={css.linhaTexto}>
          <strong className={css.autor}>{evento.autorNome ?? "Mesa"}</strong> {rotulo}
          <span className={css.conta}>
            d20 {natural}
            {bonus !== 0 && ` ${bonus > 0 ? "+" : "−"} ${Math.abs(bonus)}`}
          </span>
        </span>
        <span className={`${css.total} odm-numero`}>{total}</span>
      </>
    );
  } else if (evento.tipo === "participante_entrou") {
    conteudo = <span className={css.linhaSistema}>{evento.dados.nome} entrou na mesa</span>;
  } else if (evento.tipo === "participante_revogado") {
    conteudo = <span className={css.linhaSistema}>{evento.dados.nome} saiu da mesa</span>;
  } else if (evento.tipo === "ficha_alterada") {
    const { personagemNome, rotulo, subiuPara } = evento.dados;
    conteudo = (
      <span className={`${css.linhaTexto} ${desfeito ? css.desfeito : ""}`}>
        <strong className={css.autor}>{personagemNome}</strong> {rotulo}
        {subiuPara && <span className={css.conta}>Subiu para o nível {subiuPara}</span>}
      </span>
    );
  } else if (evento.tipo === "ficha_desfeita") {
    conteudo = (
      <span className={css.linhaSistema}>
        {evento.autorNome ?? "Mesa"} desfez: {evento.dados.rotulo}
      </span>
    );
  } else if (evento.tipo === "combate" || evento.tipo === "combate_visto") {
    const rotulo = evento.tipo === "combate" ? (evento.dados.rotuloMestre ?? evento.dados.rotulo) : evento.dados.rotulo;
    conteudo = (
      <span className={`${css.linhaTexto} ${desfeito ? css.desfeito : ""}`}>
        {evento.autorNome && <strong className={css.autor}>{evento.autorNome}</strong>} {rotulo}
      </span>
    );
  } else if (evento.tipo === "combate_desfeito") {
    conteudo = (
      <span className={css.linhaSistema}>
        {evento.autorNome ?? "Mesa"} desfez: {evento.dados.rotulo}
      </span>
    );
  } else if (evento.tipo === "rolagem_livre") {
    const { rotulo, formula, dados, total, oculta } = evento.dados;
    conteudo = (
      <>
        <span className={css.linhaTexto}>
          <strong className={css.autor}>{evento.autorNome ?? "Mestre"}</strong> {rotulo}
          <span className={css.conta}>
            {formula}
            {dados.length > 0 && ` (${dados.join(", ")})`}
            {oculta && " · só você vê"}
          </span>
        </span>
        <span className={`${css.total} odm-numero`}>{total}</span>
      </>
    );
  } else if (evento.tipo === "teste_pedido" || evento.tipo === "teste_pedido_visto") {
    const { pedido } = evento.dados;
    const rotulo = evento.tipo === "teste_pedido" ? evento.dados.rotulo : evento.dados.pedido.rotulo;
    const quantos = pedido.personagens.length;
    conteudo = (
      <span className={css.linhaSistema}>
        {evento.autorNome ?? "Mestre"} pediu {rotulo}
        {evento.tipo === "teste_pedido" && ` a ${quantos} ${quantos === 1 ? "personagem" : "personagens"}`}
        {evento.tipo === "teste_pedido" && pedido.tipo === "passivo" && " (passivo: só você vê)"}
        {pedido.origem && ` · ${pedido.origem}`}
      </span>
    );
  } else if (evento.tipo === "teste_resultado") {
    const d = evento.dados;
    const sucesso = textoDoSucesso(d);
    conteudo = (
      <>
        <span className={css.linhaTexto}>
          <strong className={css.autor}>{d.personagemNome}</strong> {d.rotulo}
          <span className={css.conta}>
            {contaDoResultado(d)}
            {d.forcado && " · forçada"}
            {d.automatico && " · automático"}
          </span>
        </span>
        {sucesso && <Etiqueta tom={d.sucesso ? "sucesso" : "perigo"}>{sucesso}</Etiqueta>}
      </>
    );
  } else if (evento.tipo === "personagem_ligado") {
    const { personagemNome, participanteNome } = evento.dados;
    conteudo = <span className={css.linhaSistema}>{participanteNome ? `${participanteNome} agora controla ${personagemNome}` : `${personagemNome} ficou sem jogador`}</span>;
  }

  if (!conteudo) return null;
  return (
    <li className={css.linha}>
      {conteudo}
      {podeDesfazer && !desfeito && (
        <button
          type="button"
          className={css.desfazer}
          onClick={() => (evento.tipo === "ficha_alterada" ? acoes.desfazerFicha(evento.id) : acoes.desfazerCombate(evento.id))}
        >
          Desfazer
        </button>
      )}
      <time className={css.hora} dateTime={evento.criadoEm}>
        {horaCurta(evento.criadoEm)}
      </time>
    </li>
  );
}

export function Registro({ className }: { className?: string }) {
  const eventos = useLoja((e) => e.eventos);
  const limpasAte = useLoja((e) => e.rolagensLimpasAte);
  const eu = useLoja((e) => e.eu);
  const recentes = eventos.filter((e) => e.tipo !== "rolagem" || e.n > limpasAte).reverse();
  const combate = useLoja((e) => e.combate);
  const desfeitos = new Set(eventos.flatMap((e) => (e.tipo === "ficha_desfeita" || e.tipo === "combate_desfeito" ? [e.dados.eventoId] : [])));
  const temRolagem = recentes.some((e) => e.tipo === "rolagem");
  /* O mestre desfaz tudo; o jogador, o que ele mesmo fez, até o fim do turno dele (especificação 5.2). */
  const pode = (e: EventoVisto) => {
    if (e.tipo === "ficha_alterada") return eu?.papel === "mestre" || e.autorId === eu?.id;
    if (e.tipo === "combate") return true;
    if (e.tipo === "combate_visto") return e.autorId === eu?.id && aindaPodeDesfazer(e.dados.desfazivelAte, combate);
    return false;
  };
  return (
    <Cartao
      titulo="Registro"
      className={`${css.registro} ${className ?? ""}`}
      extra={
        temRolagem && (
          <Botao variante="fantasma" onClick={acoes.limparRolagens}>
            Limpar rolagens
          </Botao>
        )
      }
    >
      {recentes.length === 0 ? (
        <p className={css.vazio}>Nada aconteceu ainda.</p>
      ) : (
        <ol className={css.lista} role="log" aria-label="Registro da sessão">
          {recentes.map((e) => (
            <LinhaEvento key={e.id} evento={e} desfeito={desfeitos.has(e.id)} podeDesfazer={pode(e)} />
          ))}
        </ol>
      )}
    </Cartao>
  );
}

export function Rolar({ className }: { className?: string }) {
  const [bonus, definirBonus] = useState(0);
  const conectado = useLoja((e) => !e.reconectando);
  return (
    <Cartao titulo="Rolar" className={className}>
      <div className={css.rolar}>
        <CampoNumero rotulo="Bônus ou penalidade" valor={bonus} aoMudar={definirBonus} />
        <Botao
          variante="primario"
          grande
          largo
          disabled={!conectado}
          onClick={() => {
            prepararD20();
            acoes.rolar(bonus);
          }}
        >
          Rolar d20
        </Botao>
      </div>
    </Cartao>
  );
}

export function NomeParticipante({ participante, extra }: { participante: Participante; extra?: ReactNode }) {
  return (
    <li className={css.participante}>
      <span className={`${css.ponto} ${participante.online ? css.online : ""}`} aria-hidden="true" />
      <span className={css.nome}>{participante.nome}</span>
      {participante.papel === "mestre" && <Etiqueta tom="destaque">Mestre</Etiqueta>}
      <span className="odm-oculto">{participante.online ? "conectado" : "desconectado"}</span>
      {extra}
    </li>
  );
}

export function FaixaConexao() {
  const reconectando = useLoja((e) => e.reconectando);
  if (!reconectando) return null;
  return (
    <p className={css.faixa} role="status">
      Conexão perdida. Tentando voltar…
    </p>
  );
}
