/* Símbolos dos naturais do d20, desenho próprio no estilo do ícone do app (olho de pergaminho, íris de tinta,
   sangue): o 20 natural é o olho com um X, e o 1 natural, a lápide. Grade de 100 × 100.
   Os mesmos caminhos servem ao SVG (dado plano e resultado) e ao canvas do dado 3D (Path2D).
   Papéis de cor: "figura" é a cor do número no dado; "entalhe", a do corpo do dado; "fundo", a tinta. */

export type PapelDoSimbolo = "figura" | "entalhe" | "fundo";
export type TracoDoSimbolo = { d: string; papel: PapelDoSimbolo; contorno?: number };
export type SimboloNatural = "olho" | "lapide";

export const SIMBOLOS_D20: Record<SimboloNatural, TracoDoSimbolo[]> = {
  /* 20 natural: o Olho da Morte, com a íris riscada por um X. */
  olho: [
    { d: "M4 50Q50 4 96 50Q50 96 4 50Z", papel: "figura" },
    { d: "M29 50a21 21 0 1 0 42 0a21 21 0 1 0-42 0Z", papel: "fundo" },
    { d: "M39.5 39.5L60.5 60.5M60.5 39.5L39.5 60.5", papel: "figura", contorno: 7 },
    { d: "M14 33L8 25M30 21L27 12M50 17V7M70 21L73 12M86 33L92 25", papel: "figura", contorno: 4 },
  ],
  /* 1 natural: a lápide, com cruz entalhada e uma rachadura. */
  lapide: [
    { d: "M27 86V42Q27 13 50 13Q73 13 73 42V86Z", papel: "figura" },
    { d: "M50 29V64M38 41H62", papel: "entalhe", contorno: 7 },
    { d: "M66 22L60 31L65 37L59 47", papel: "entalhe", contorno: 2.5 },
    { d: "M10 92Q50 78 90 92V96H10Z", papel: "figura" },
  ],
};

export const simboloDoNatural = (natural: number): SimboloNatural | null => (natural === 20 ? "olho" : natural === 1 ? "lapide" : null);

export type CoresDoSimbolo = Record<PapelDoSimbolo, string>;

/* Desenha o símbolo no canvas, centrado em (cx, cy) e com o lado "tamanho". Usado no atlas do dado 3D. */
export function desenharSimbolo(c: CanvasRenderingContext2D, simbolo: SimboloNatural, cx: number, cy: number, tamanho: number, cores: CoresDoSimbolo) {
  c.save();
  c.translate(cx - tamanho / 2, cy - tamanho / 2);
  c.scale(tamanho / 100, tamanho / 100);
  c.lineCap = "round";
  c.lineJoin = "round";
  for (const traco of SIMBOLOS_D20[simbolo]) {
    const caminho = new Path2D(traco.d);
    if (traco.contorno) {
      c.strokeStyle = cores[traco.papel];
      c.lineWidth = traco.contorno;
      c.stroke(caminho);
    } else {
      c.fillStyle = cores[traco.papel];
      c.fill(caminho);
    }
  }
  c.restore();
}
