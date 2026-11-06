import css from "./BarraPV.module.css";

type Props = {
  atual: number;
  maximo: number;
  temporario?: number;
  rotulo?: string;
};

export function BarraPV({ atual, maximo, temporario = 0, rotulo = "PV" }: Props) {
  /* Com máximo zero (criatura sem dados, por exemplo), a barra fica vazia em vez de quebrar. */
  const base = maximo > 0 ? maximo : 1;
  const fracao = Math.max(0, Math.min(1, atual / base));
  const fracaoTemp = Math.max(0, Math.min(1 - fracao, temporario / base));
  const texto = `${atual} de ${maximo}${temporario ? `, mais ${temporario} temporários` : ""}`;
  return (
    <div
      className={css.trilho}
      role="meter"
      aria-label={rotulo}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={Math.max(0, Math.min(atual, maximo))}
      aria-valuetext={texto}
    >
      <div className={css.vida} style={{ transform: `scaleX(${fracao})` }} />
      <div className={css.temporario} style={{ transform: `translateX(${fracao * 100}%) scaleX(${fracaoTemp})` }} />
    </div>
  );
}
