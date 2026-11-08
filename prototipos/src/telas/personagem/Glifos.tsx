import type { Categoria } from "../../dados/personagem";

/* Ícones próprios de categoria de item, em traço de tinta (24 × 24). Provisórios: o app pode trocar pela arte
   do catálogo quando o pacote levar as imagens dos itens. */
const TRACOS: Record<Categoria, string> = {
  corpo_a_corpo: "M5 19l9-9M14 10l5-5-.8 3.6L15 10.2M4.2 20.2l2.4-2.4M7.2 15.4l2 2",
  distancia: "M3 8.5h13.5l1.5-1.5h2.5v4h-3.2l-1.3 2h-3.8l-1 4.5H8l1-4.5H3zM6 8.5V7",
  armadura: "M8 3.5l4 2 4-2 3.5 3-2 2.5v11H6.5V9l-2-2.5zM12 5.5v14",
  escudo: "M12 3l7 3v5c0 5-3 8.2-7 10-4-1.8-7-5-7-10V6zM12 3v18M5.5 11h13",
  municao: "M9 21v-9.5a3 3 0 0 1 6 0V21zM9 15h6M8 21h8",
  consumivel: "M10 3h4M11 3v5.2l-5 8.6A2.8 2.8 0 0 0 8.4 21h7.2a2.8 2.8 0 0 0 2.4-4.2l-5-8.6V3M7.6 15h8.8",
  ferramenta: "M14.5 4.5a4.2 4.2 0 0 0 5 5L10 19a2.1 2.1 0 0 1-3-3l9.5-9.5a4.2 4.2 0 0 1-2-2zM7.5 17.5l1 1",
  geral: "M5.5 9h13l-1.2 11.5H6.7zM9 9V7.5a3 3 0 0 1 6 0V9M9.5 13h5",
};

export function GlifoCategoria({ categoria, className }: { categoria: Categoria; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d={TRACOS[categoria]} />
    </svg>
  );
}

/* Figuras provisórias no lugar da arte dos livros (que não pode ir para este repositório). No app, a silhueta
   é a arte da especialização pintada de preto, com o "?" claro no peito. */
const CORPO = "M50 46c-12 0-22 8-24 20l-8 70h12l6-52 2 58-4 84h14l4-70 2 0 4 70h14l-4-84 2-58 6 52h12l-8-70c-2-12-12-20-24-20z";
const EXTRAS: Record<string, string> = {
  "silhueta.pistoleiro": "M20 22h60v5H20zM36 8h28v15H36zM24 70l-10 120h20l6-100zM76 70l10 120H66l-6-100z",
  "silhueta.barbaro": "M18 50c10-8 54-8 64 0l14 150H4zM38 14c4-6 20-6 24 0v20H38z",
  "silhueta.espiao": "M38 12c4-4 20-4 24 0l1 6H37zM34 42h32v10H34z",
  "silhueta.medico-de-campo": "M34 10c8-8 26-6 30 8l14 10-14 4v8H36zM28 60h44l8 120H20z",
};

export function FiguraProvisoria({ silhueta, interrogacao = true }: { silhueta: string; interrogacao?: boolean }) {
  return (
    <svg viewBox="0 0 100 240" preserveAspectRatio="xMidYMax meet" aria-hidden="true">
      <g fill="var(--retrato-tinta, #0f0c09)">
        <circle cx="50" cy="30" r="15" />
        <path d={CORPO} />
        {EXTRAS[silhueta] && <path d={EXTRAS[silhueta]} />}
      </g>
      {interrogacao && (
        <text x="50" y="118" textAnchor="middle" fontSize="44" fontFamily="var(--fonte-titulo)" fill="var(--retrato-marca, #efe7d6)">
          ?
        </text>
      )}
    </svg>
  );
}
