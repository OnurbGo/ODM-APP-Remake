import { CartaBaralho, CartaMini, PopUp } from "@odm/estilo";
import type { Carta, Combatente, EstadoCombate } from "@odm/protocolo";
import type { ReactNode } from "react";
import type { Parcela, ValorContado } from "@odm/regras";
import { useImagem } from "../../conexao/imagens";
import css from "./Comum.module.css";

/* O estilo escreve "Coringa"; o protocolo, "coringa". */
const paraEstilo = (c: Carta) => ({ valor: c.valor === "coringa" ? "Coringa" : c.valor, naipe: c.naipe });

export function Mini({ carta }: { carta: Carta }) {
  return <CartaMini {...paraEstilo(carta)} />;
}

export function Grande({ carta, virada = true, tamanho = "g", apagada }: { carta: Carta; virada?: boolean; tamanho?: "p" | "m" | "g"; apagada?: boolean }) {
  return <CartaBaralho {...paraEstilo(carta)} virada={virada} tamanho={tamanho} apagada={apagada} />;
}

export const NOME_CARTA: Record<Carta["valor"], string> = {
  "2": "2",
  "3": "3",
  "4": "4",
  "5": "5",
  "6": "6",
  "7": "7",
  "8": "8",
  "9": "9",
  "10": "10",
  J: "Valete",
  Q: "Rainha",
  K: "Rei",
  A: "Ás",
  coringa: "Coringa",
};

export const ESPECIAIS: readonly Carta["valor"][] = ["coringa", "A", "K", "Q", "J"];
export const eEspecial = (c: Carta | null) => !!c && ESPECIAIS.includes(c.valor);

/* Resumo de tela do efeito de cada carta especial; o texto inteiro do livro vem do pacote. */
export const RESUMO_DO_EFEITO: Partial<Record<Carta["valor"], string>> = {
  coringa: "Troca de lugar dois alvos na ordem, menos você.",
  A: "1 PA a mais no seu primeiro turno.",
  K: "Vantagem no próximo ataque ou teste de habilidade de um aliado que ainda não agiu, ou seu.",
  Q: "A primeira reação de um aliado, ou sua, não custa PA até o início do seu próximo turno.",
  J: "Um deslocamento sem custo de PA no seu primeiro turno.",
};

/* Círculo é jogador, losango é criatura e quadrado é NPC (parada 4). */
export function Sinal({ tipo }: { tipo: Combatente["tipo"] }) {
  return <span className={`${css.sinal} ${tipo === "criatura" ? css.criatura : tipo === "npc" ? css.npc : ""}`} aria-hidden="true" />;
}

export const daVez = (combate: EstadoCombate | null) => (combate && combate.fase === "em_curso" ? (combate.combatentes.find((c) => c.id === combate.ordem[combate.vez]) ?? null) : null);

/* Quem vem depois. Na iniciativa oculta, a posição seguinte pode ser um "?" (id que o jogador não recebe). */
export function proximoDaVez(combate: EstadoCombate): Combatente | "oculto" | null {
  for (let i = combate.vez + 1; i < combate.ordem.length; i++) {
    const c = combate.combatentes.find((x) => x.id === combate.ordem[i]);
    if (!c) return "oculto";
    if (!c.derrotado) return c;
  }
  const primeiro = combate.ordem[0];
  return primeiro === undefined ? null : (combate.combatentes.find((x) => x.id === primeiro) ?? "oculto");
}

/* As posições da ordem como o jogador as vê: as que ainda não apareceram vêm sem combatente ("?"). */
export const posicoes = (combate: EstadoCombate): { id: string; c: Combatente | null }[] =>
  combate.ordem.length ? combate.ordem.map((id) => ({ id, c: combate.combatentes.find((x) => x.id === id) ?? null })) : combate.combatentes.map((c) => ({ id: c.id, c }));

/* Rosto da criatura ou NPC (arte do pacote), quando o servidor libera; sem ele, o sinal de sempre. */
export function RostoOuSinal({ c, className, alternativa }: { c: Combatente; className?: string; alternativa?: ReactNode }) {
  const url = useImagem(c.tipo !== "personagem" ? c.ref : null, "rosto");
  return url ? <img src={url} alt="" className={`${css.rosto} ${className ?? ""}`} /> : (alternativa ?? <Sinal tipo={c.tipo} />);
}

export const ordenados = (combate: EstadoCombate) =>
  combate.ordem.length ? combate.ordem.flatMap((id) => combate.combatentes.filter((c) => c.id === id)) : combate.combatentes;

const sinal = (n: number) => (n < 0 ? `− ${Math.abs(n)}` : `+ ${n}`);

/* A conta de um valor (especificação 5.1): cada parcela com o rótulo dela. */
export function JanelaConta({ titulo, valor, variante, aoFechar }: { titulo: string; valor: ValorContado | { valor: number; conta: Parcela[] } | null; variante: "folha" | "central"; aoFechar: () => void }) {
  return (
    <PopUp aberto={!!valor} titulo={titulo} subtitulo={valor ? String(valor.valor) : undefined} variante={variante} aoFechar={aoFechar}>
      <ul className={css.conta}>
        {valor?.conta.map((p, i) => (
          <li key={`${p.rotulo}-${i}`}>
            <span>{p.rotulo}</span>
            <span className="odm-numero">{i === 0 ? p.valor : sinal(p.valor)}</span>
          </li>
        ))}
      </ul>
    </PopUp>
  );
}
