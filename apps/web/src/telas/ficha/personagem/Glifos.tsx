import { useImagem } from "../../../conexao/imagens";
import { ICONES, type IconeGenerico } from "./iconesGenericos";

/* Ícone genérico do tipo de item (desenhos em iconesGenericos.ts), em dois tons de tinta. */
export function GlifoCategoria({ icone, className }: { icone: IconeGenerico; className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" strokeLinecap="round" strokeLinejoin="round">
      {ICONES[icone].map((f, i) =>
        f.tom === "meio" ? (
          <path key={i} d={f.d} fill="currentColor" fillOpacity={0.3} stroke="currentColor" strokeWidth={1.3} />
        ) : f.tom === "cheio" ? (
          <path key={i} d={f.d} fill="currentColor" />
        ) : (
          <path key={i} d={f.d} fill="none" stroke="currentColor" strokeWidth={f.largura ?? 1.4} />
        ),
      )}
    </svg>
  );
}

/* Ícone do item: a arte do catálogo (do pacote, que é privado) ou, sem ela, o ícone genérico do tipo. */
export function IconeDoItem({ itemId, icone, className }: { itemId: string | null; icone: IconeGenerico; className?: string }) {
  const url = useImagem(itemId, "rosto");
  /* A arte do livro é tinta escura: vai sobre pergaminho, como o retrato. */
  return url ? (
    <img
      src={url}
      alt=""
      className={className}
      draggable={false}
      style={{ objectFit: "contain", padding: "6%", background: "radial-gradient(circle at 50% 45%, var(--p-pergaminho) 0%, var(--p-pergaminho-escuro) 80%)", borderRadius: "var(--raio-s)" }}
    />
  ) : (
    <GlifoCategoria icone={icone} className={className} />
  );
}
