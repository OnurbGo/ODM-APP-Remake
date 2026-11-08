import { Botao, PopUp, Seletor } from "@odm/estilo";
import { conferirPartes, dividirRecompensa, partesDePorcentagem, partesIguais } from "@odm/regras";
import { useState } from "react";
import css from "./Divisao.module.css";

/* Divisão de XP ou dinheiro entre participantes (Mestre, "Recompensas e Encontros"; decisões de 07/11/2026).
   Automático: partes iguais, para baixo, e a sobra se perde. "Dividir de outro jeito": o mestre muda as partes,
   com o mesmo total que a divisão igual entrega, e a soma precisa fechar 100%. Vale só para aquela entrega. */

export type Pessoa = { id: string; nome: string };
export type Unidade = "XP" | "R$";

const fmt = (n: number, unidade: Unidade) => (unidade === "R$" ? `R$ ${n.toLocaleString("pt-BR")}` : `${n.toLocaleString("pt-BR")} XP`);

/* A chave muda quando o total ou as pessoas mudam: a divisão escolhida deixa de valer e volta ao automático. */
export const chaveDaDivisao = (total: number, pessoas: readonly Pessoa[]) => `${total}|${pessoas.map((p) => p.id).join(",")}`;

export type DivisaoEscolhida = { chave: string; partes: Record<string, number> } | null;

/* O que cada um recebe de fato. */
export function partesFinais(total: number, pessoas: readonly Pessoa[], escolhida: DivisaoEscolhida): Record<string, number> {
  if (escolhida && escolhida.chave === chaveDaDivisao(total, pessoas)) return escolhida.partes;
  const { parte } = dividirRecompensa(total, pessoas.length);
  return Object.fromEntries(pessoas.map((p) => [p.id, parte]));
}

function Modal({ titulo, unidade, total, pessoas, inicial, aoConfirmar, aoFechar }: { titulo: string; unidade: Unidade; total: number; pessoas: Pessoa[]; inicial: Record<string, number>; aoConfirmar: (partes: Record<string, number>) => void; aoFechar: () => void }) {
  const [modo, definirModo] = useState<"valor" | "porcentagem">("valor");
  const [valores, definirValores] = useState<number[]>(() => pessoas.map((p) => inicial[p.id] ?? 0));
  const [porcentagens, definirPorcentagens] = useState<number[]>(() => pessoas.map((p) => (total ? Math.round(((inicial[p.id] ?? 0) / total) * 10000) / 100 : 0)));
  const partes = modo === "valor" ? valores : partesDePorcentagem(porcentagens, total);
  const { soma, falta, sobra, fecha } = conferirPartes(partes, total);
  const somaPct = Math.round(porcentagens.reduce((s, p) => s + p, 0) * 100) / 100;
  const trocarModo = (novo: "valor" | "porcentagem") => {
    /* Leva os números de um modo para o outro, para o mestre não recomeçar. */
    if (novo === "porcentagem") definirPorcentagens(valores.map((v) => (total ? Math.round((v / total) * 10000) / 100 : 0)));
    else definirValores(partesDePorcentagem(porcentagens, total));
    definirModo(novo);
  };
  return (
    <PopUp aberto titulo={titulo} subtitulo={`Total: ${fmt(total, unidade)}. A soma precisa fechar 100%.`} variante="central" aoFechar={aoFechar}>
      <div className={css.modal}>
        <Seletor
          rotulo="Dividir por"
          opcoes={[
            { id: "valor", rotulo: unidade === "R$" ? "Em R$" : "Em XP" },
            { id: "porcentagem", rotulo: "Em %" },
          ]}
          valor={modo}
          aoMudar={trocarModo}
        />
        <ul className={css.pessoas}>
          {pessoas.map((p, i) => (
            <li key={p.id} className={css.pessoa}>
              <span>{p.nome}</span>
              {modo === "valor" ? (
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  aria-label={`Parte de ${p.nome} em ${unidade}`}
                  value={valores[i] ?? 0}
                  onChange={(e) => {
                    const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                    definirValores((l) => l.map((v, j) => (j === i ? n : v)));
                  }}
                />
              ) : (
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={100}
                  step={0.01}
                  aria-label={`Parte de ${p.nome} em %`}
                  value={porcentagens[i] ?? 0}
                  onChange={(e) => {
                    const n = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                    definirPorcentagens((l) => l.map((v, j) => (j === i ? n : v)));
                  }}
                />
              )}
              <span className={css.equivale}>{modo === "valor" ? `${total ? Math.round(((valores[i] ?? 0) / total) * 1000) / 10 : 0}%` : fmt(partes[i] ?? 0, unidade)}</span>
            </li>
          ))}
        </ul>
        <p className={fecha ? css.fecha : css.naoFecha} role="status">
          {modo === "porcentagem" ? `${somaPct.toLocaleString("pt-BR")}% · ` : ""}
          {fecha ? `Fecha: ${fmt(soma, unidade)}` : falta ? `Falta ${fmt(falta, unidade)}` : `Sobra ${fmt(sobra, unidade)}`}
        </p>
        <Botao
          variante="primario"
          largo
          disabled={!fecha}
          onClick={() => {
            aoConfirmar(Object.fromEntries(pessoas.map((p, i) => [p.id, partes[i] ?? 0])));
            aoFechar();
          }}
        >
          Usar esta divisão
        </Botao>
      </div>
    </PopUp>
  );
}

/* Resumo da divisão e o botão "Dividir de outro jeito". */
export function Divisao({ rotulo, unidade, totalBruto, pessoas, escolhida, aoEscolher }: { rotulo: string; unidade: Unidade; totalBruto: number; pessoas: Pessoa[]; escolhida: DivisaoEscolhida; aoEscolher: (d: DivisaoEscolhida) => void }) {
  const [aberto, abrir] = useState(false);
  const { parte, sobra } = dividirRecompensa(totalBruto, pessoas.length);
  const total = parte * pessoas.length;
  const chave = chaveDaDivisao(totalBruto, pessoas);
  const personalizada = escolhida?.chave === chave ? escolhida : null;
  const partes = partesFinais(totalBruto, pessoas, escolhida);
  if (!pessoas.length) return <p className={css.nota}>Ninguém marcado para receber.</p>;
  return (
    <div className={css.divisao}>
      {personalizada ? (
        <ul className={css.lista}>
          {pessoas.map((p) => (
            <li key={p.id}>
              {p.nome}: <strong className="odm-numero">{fmt(partes[p.id] ?? 0, unidade)}</strong>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Cada um recebe <strong className="odm-numero">{fmt(parte, unidade)}</strong>
          {sobra > 0 && <span className={css.nota}> · sobra {fmt(sobra, unidade)}, que se perde</span>}
        </p>
      )}
      <div className={css.botoes}>
        <Botao variante="fantasma" disabled={total <= 0} onClick={() => abrir(true)}>
          Dividir de outro jeito
        </Botao>
        {personalizada && (
          <Botao variante="fantasma" onClick={() => aoEscolher(null)}>
            Voltar à divisão igual
          </Botao>
        )}
      </div>
      {aberto && (
        <Modal
          titulo={rotulo}
          unidade={unidade}
          total={total}
          pessoas={pessoas}
          inicial={personalizada?.partes ?? Object.fromEntries(pessoas.map((p, i) => [p.id, partesIguais(total, pessoas.length)[i] ?? 0]))}
          aoConfirmar={(p) => aoEscolher({ chave, partes: p })}
          aoFechar={() => abrir(false)}
        />
      )}
    </div>
  );
}
