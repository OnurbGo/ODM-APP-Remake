import { Botao, CampoNumero, Cartao, Etiqueta, prepararD20 } from "@odm/estilo";
import type { EventoVisto, Participante } from "@odm/protocolo";
import { useState, type ReactNode } from "react";
import { acoes, useLoja } from "../conexao/loja";
import css from "./Blocos.module.css";

const horaCurta = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function LinhaEvento({ evento }: { evento: EventoVisto }) {
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
  }

  if (!conteudo) return null;
  return (
    <li className={css.linha}>
      {conteudo}
      <time className={css.hora} dateTime={evento.criadoEm}>
        {horaCurta(evento.criadoEm)}
      </time>
    </li>
  );
}

export function Registro({ className }: { className?: string }) {
  const eventos = useLoja((e) => e.eventos);
  const recentes = [...eventos].reverse();
  return (
    <Cartao titulo="Registro" className={`${css.registro} ${className ?? ""}`}>
      {recentes.length === 0 ? (
        <p className={css.vazio}>Nada aconteceu ainda.</p>
      ) : (
        <ol className={css.lista} role="log" aria-label="Registro da sessão">
          {recentes.map((e) => (
            <LinhaEvento key={e.id} evento={e} />
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
