import css from "./BarraPV.module.css";

type Props = {
  atual: number;
  maximo: number;
  temporario?: number;
};

export function BarraPV({ atual, maximo, temporario = 0 }: Props) {
  const fracao = Math.max(0, Math.min(1, atual / maximo));
  const fracaoTemp = Math.max(0, Math.min(1 - fracao, temporario / maximo));
  return (
    <div className={css.trilho} aria-hidden="true">
      <div className={css.vida} style={{ transform: `scaleX(${fracao})` }} />
      <div className={css.temporario} style={{ transform: `translateX(${fracao * 100}%) scaleX(${fracaoTemp})` }} />
    </div>
  );
}
