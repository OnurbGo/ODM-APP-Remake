import { useMemo } from "react";
import css from "./TextoDoLivro.module.css";
import { blocosDoTexto } from "./marcasDoLivro";

/* Texto copiado dos livros, com o negrito, o itálico e as listas do Markdown.
   Vai dentro do parágrafo de quem chama (só usa <span>), então herda a fonte e a cor dele. */
export function TextoDoLivro({ texto }: { texto: string }) {
  const blocos = useMemo(() => blocosDoTexto(texto), [texto]);
  return (
    <>
      {blocos.map((bloco, b) => (
        <span key={b} className={css.bloco}>
          {bloco.map((linha, l) => (
            <span key={l} className={linha.item ? css.item : linha.titulo ? css.titulo : css.linha}>
              {linha.trechos.map((t, i) =>
                t.negrito && t.italico ? (
                  <strong key={i}>
                    <em>{t.texto}</em>
                  </strong>
                ) : t.negrito ? (
                  <strong key={i}>{t.texto}</strong>
                ) : t.italico ? (
                  <em key={i}>{t.texto}</em>
                ) : (
                  t.texto
                ),
              )}
            </span>
          ))}
        </span>
      ))}
    </>
  );
}
