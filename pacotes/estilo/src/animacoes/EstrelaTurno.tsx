import css from "./EstrelaTurno.module.css";

const PONTAS = 6;

function pontos() {
  const saida: string[] = [];
  for (let i = 0; i < PONTAS * 2; i++) {
    const raio = i % 2 === 0 ? 44 : 23;
    const angulo = (Math.PI / PONTAS) * i - Math.PI / 2;
    saida.push(`${(50 + raio * Math.cos(angulo)).toFixed(1)},${(50 + raio * Math.sin(angulo)).toFixed(1)}`);
  }
  return saida.join(" ");
}

const DESENHO = pontos();

/* Estrela de xerife: entra girando e carimba. Desenho próprio, gerado aqui. */
export function EstrelaTurno({ tamanho = 44 }: { tamanho?: number }) {
  return (
    <svg className={css.estrela} width={tamanho} height={tamanho} viewBox="0 0 100 100" aria-hidden="true">
      <polygon points={DESENHO} className={css.corpo} />
      {Array.from({ length: PONTAS }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return <circle key={i} cx={50 + 45 * Math.cos(a)} cy={50 + 45 * Math.sin(a)} r="5" className={css.bola} />;
      })}
      <circle cx="50" cy="50" r="15" className={css.miolo} />
      <circle cx="50" cy="50" r="10" className={css.aro} />
    </svg>
  );
}
