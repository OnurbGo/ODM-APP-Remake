import { useCallback, useEffect, useRef, useState } from "react";
import css from "./Abertura.module.css";
import { usePularAnimacao } from "./usePularAnimacao";
import { useReduzirAnimacoes } from "./useReduzirAnimacoes";

type Props = {
  titulo: string;
  aoTerminar: () => void;
};

const DURACAO = 2000;
const DURACAO_REDUZIDA = 900;
const SAIDA = 280;

const CAMARAS = Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 2;
  return { cx: 240 + 48 * Math.cos(a), cy: 150 + 48 * Math.sin(a) };
});

const RAIOS = Array.from({ length: 28 }, (_, i) => {
  const a = (Math.PI / 14) * i;
  const longo = i % 2 === 0;
  return {
    x1: 240 + 176 * Math.cos(a),
    y1: 150 + 176 * Math.sin(a),
    x2: 240 + (longo ? 232 : 206) * Math.cos(a),
    y2: 150 + (longo ? 232 : 206) * Math.sin(a),
  };
});

/* Sequência fixa: "aleatório" aqui faria cada abertura diferente sem motivo. */
const POEIRA = Array.from({ length: 22 }, (_, i) => ({
  esquerda: (i * 37) % 100,
  topo: 18 + ((i * 53) % 70),
  tamanho: 2 + (i % 4),
  atraso: 250 + ((i * 83) % 900),
}));

const RAJADAS = [
  { topo: 24, largura: 34, atraso: 300 },
  { topo: 41, largura: 22, atraso: 620 },
  { topo: 63, largura: 40, atraso: 180 },
  { topo: 78, largura: 26, atraso: 860 },
];

export function Abertura({ titulo, aoTerminar }: Props) {
  const reduzir = useReduzirAnimacoes();
  const [saindo, definirSaindo] = useState(false);
  const fim = useRef(aoTerminar);
  fim.current = aoTerminar;

  const sair = useCallback(() => definirSaindo(true), []);

  useEffect(() => {
    const id = window.setTimeout(sair, reduzir ? DURACAO_REDUZIDA : DURACAO);
    return () => clearTimeout(id);
  }, [reduzir, sair]);

  useEffect(() => {
    if (!saindo) return;
    const id = window.setTimeout(() => fim.current(), reduzir ? 0 : SAIDA);
    return () => clearTimeout(id);
  }, [reduzir, saindo]);

  usePularAnimacao(!saindo, sair);

  return (
    <div className={`${css.abertura} ${saindo ? css.saindo : ""}`} role="img" aria-label={titulo} onClick={sair}>
      <div className={css.poeira} aria-hidden="true">
        {RAJADAS.map((r) => (
          <span
            key={r.topo}
            className={css.rajada}
            style={{ top: `${r.topo}%`, width: `${r.largura}%`, animationDelay: `calc(${r.atraso}ms * var(--fator-animacao))` }}
          />
        ))}
        {POEIRA.map((p, i) => (
          <span
            key={i}
            className={css.grao}
            style={{
              left: `${p.esquerda}%`,
              top: `${p.topo}%`,
              width: p.tamanho,
              height: p.tamanho,
              animationDelay: `calc(${p.atraso}ms * var(--fator-animacao))`,
            }}
          />
        ))}
      </div>

      <svg className={css.olho} viewBox="0 -90 480 480" aria-hidden="true">
        <defs>
          <clipPath id="odm-olho-recorte">
            <path d="M30 150 Q240 -30 450 150 Q240 330 30 150 Z" />
          </clipPath>
        </defs>

        <g className={css.raios}>
          {RAIOS.map((r, i) => (
            <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
          ))}
        </g>

        <g clipPath="url(#odm-olho-recorte)">
          <rect x="0" y="0" width="480" height="300" className={css.esclera} />
          <g className={css.tambor}>
            <circle cx="240" cy="150" r="82" className={css.iris} />
            <circle cx="240" cy="150" r="74" className={css.aro} />
            {CAMARAS.map((c, i) => (
              <circle key={i} cx={c.cx} cy={c.cy} r="15" className={css.camara} />
            ))}
            <circle cx="240" cy="150" r="11" className={css.eixo} />
            <circle cx="240" cy="150" r="4" className={css.pino} />
          </g>
          <path className={`${css.palpebra} ${css.superior}`} d="M0 150 Q240 186 480 150 L480 -40 L0 -40 Z" />
          <path className={`${css.palpebra} ${css.inferior}`} d="M0 150 Q240 186 480 150 L480 340 L0 340 Z" />
        </g>

        <path className={css.contorno} d="M30 150 Q240 -30 450 150 Q240 330 30 150 Z" />
      </svg>

      <h1 className={css.titulo} aria-hidden="true">
        {Array.from(titulo).map((letra, i) => (
          <span key={i} className={css.letra} style={{ animationDelay: `calc(${880 + i * 34}ms * var(--fator-animacao))` }}>
            {letra === " " ? " " : letra}
          </span>
        ))}
      </h1>
      <span className={css.filete} aria-hidden="true" />

      <p className={`${css.dica} odm-rotulo`}>Clique, Espaço ou Esc para pular</p>
    </div>
  );
}
