/* Ícones genéricos dos itens (pedido de 07/11/2026): valem quando o item não tem arte no pacote.
   Desenho próprio, 32 × 32, em dois tons: "meio" é o preenchimento suave com contorno a tinta, "cheio" é a
   parte sólida (lâmina, ponta, metal) e "traco" é só a linha. A cor vem de currentColor. */

export type Forma = { d: string; tom: "meio" | "cheio" | "traco"; largura?: number };

export type IconeGenerico =
  | "corpo_a_corpo"
  | "distancia"
  | "armadura"
  | "escudo"
  | "explosivo"
  | "medico"
  | "comida"
  | "consumivel"
  | "roupa"
  | "ferramenta"
  | "geral"
  | "municao_curta"
  | "municao_media"
  | "municao_longa"
  | "municao_escopeta"
  | "municao_flecha"
  | "municao_especial";

/* Cartucho na vertical: estojo (meio), projétil (cheio) e aro (cheio). "topo" é onde o estojo começa. */
const cartucho = (topo: number, ponta: number): Forma[] => [
  { d: `M12.5 ${topo}h7v${26 - topo}h-7z`, tom: "meio" },
  { d: `M12.5 ${topo}v-2.5c0-${(topo - 2.5 - ponta) * 0.75} 1.6-${topo - 2.5 - ponta} 3.5-${topo - 2.5 - ponta}s3.5 ${(topo - 2.5 - ponta) * 0.25} 3.5 ${topo - 2.5 - ponta}v2.5z`, tom: "cheio" },
  { d: "M11.5 26h9v2.2h-9z", tom: "cheio" },
];

export const ICONES: Record<IconeGenerico, Forma[]> = {
  /* Facão: lâmina larga, guarda e cabo enrolado. */
  corpo_a_corpo: [
    { d: "M12.2 18.4 24.6 5.2c1.6-1.4 3.5.4 2.2 2L14.6 20.8z", tom: "meio" },
    { d: "M13.5 18.8 25.4 6.4", tom: "traco", largura: 0.9 },
    { d: "M9.6 16.8l5.6 5.6", tom: "traco", largura: 2.6 },
    { d: "M11.6 21 5.4 27.2", tom: "traco", largura: 3.4 },
    { d: "M8.4 22.4l1.8 1.8M6.6 24.2l1.8 1.8", tom: "traco", largura: 0.8 },
  ],
  /* Revólver de perfil: cano, tambor, cão e coronha. */
  distancia: [
    { d: "M3 10.2h14.5v3.4H3z", tom: "cheio" },
    { d: "M3.6 10.2V8.6", tom: "traco", largura: 1.4 },
    { d: "M15 8.6h7.2a1.6 1.6 0 0 1 1.6 1.6v4.6H15z", tom: "meio" },
    { d: "M17.4 9v5.6M20 9v5.6", tom: "traco", largura: 0.8 },
    { d: "M22.6 9.2l2.4-2.6 1.4 1.2-1.8 2.6", tom: "traco", largura: 1.4 },
    { d: "M20.4 14.8h4.4l2.6 9.6a1.6 1.6 0 0 1-1.5 2h-2.4a1.6 1.6 0 0 1-1.6-1.3z", tom: "meio" },
    { d: "M16.6 14.8c0 2.8 1.4 4 3.8 3.6", tom: "traco", largura: 1.3 },
  ],
  /* Colete de couro com placas. */
  armadura: [
    { d: "M10 4.5l3 2.4h6l3-2.4 5 3-1.6 5.4V26.6a1.4 1.4 0 0 1-1.4 1.4H8a1.4 1.4 0 0 1-1.4-1.4V12.9L5 7.5z", tom: "meio" },
    { d: "M16 6.9V28", tom: "traco", largura: 1.2 },
    { d: "M6.6 15.5h18.8M6.6 21.5h18.8", tom: "traco", largura: 0.9 },
    { d: "M13.2 10.5l-.4 2M18.8 10.5l.4 2", tom: "traco", largura: 1 },
  ],
  /* Escudo redondo de tábuas, com umbo de metal. */
  escudo: [
    { d: "M16 3.5a12.5 12.5 0 1 1 0 25 12.5 12.5 0 0 1 0-25z", tom: "meio" },
    { d: "M11.8 4.2v23.6M20.2 4.2v23.6", tom: "traco", largura: 0.9 },
    { d: "M16 6.4a9.6 9.6 0 1 1 0 19.2 9.6 9.6 0 0 1 0-19.2z", tom: "traco", largura: 0.8 },
    { d: "M16 12.6a3.4 3.4 0 1 1 0 6.8 3.4 3.4 0 0 1 0-6.8z", tom: "cheio" },
  ],
  /* Três bananas de dinamite com pavio aceso. */
  explosivo: [
    { d: "M6.5 13h5.4v14H6.5zM13.3 13h5.4v14h-5.4zM20.1 13h5.4v14h-5.4z", tom: "meio" },
    { d: "M5.8 19.2h20.4v2.4H5.8z", tom: "cheio" },
    { d: "M16 13c0-4 2.4-6.6 6.2-6.8", tom: "traco", largura: 1.3 },
    { d: "M24.6 2.6l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z", tom: "cheio" },
  ],
  /* Maleta médica com a cruz. */
  medico: [
    { d: "M5.5 10h21a1.8 1.8 0 0 1 1.8 1.8v13.4a1.8 1.8 0 0 1-1.8 1.8h-21a1.8 1.8 0 0 1-1.8-1.8V11.8A1.8 1.8 0 0 1 5.5 10z", tom: "meio" },
    { d: "M12 10V7.4A1.6 1.6 0 0 1 13.6 5.8h4.8A1.6 1.6 0 0 1 20 7.4V10", tom: "traco", largura: 1.5 },
    { d: "M14.2 12.8h3.6v3h3v3.6h-3v3h-3.6v-3h-3v-3.6h3z", tom: "cheio" },
  ],
  /* Lata de conserva com rótulo e lacre. */
  comida: [
    { d: "M7.5 9.5v15c0 1.9 3.8 3.4 8.5 3.4s8.5-1.5 8.5-3.4v-15", tom: "meio" },
    { d: "M16 6.1c4.7 0 8.5 1.5 8.5 3.4s-3.8 3.4-8.5 3.4-8.5-1.5-8.5-3.4 3.8-3.4 8.5-3.4z", tom: "meio" },
    { d: "M7.5 15c0 1.9 3.8 3.4 8.5 3.4s8.5-1.5 8.5-3.4v5c0 1.9-3.8 3.4-8.5 3.4s-8.5-1.5-8.5-3.4z", tom: "cheio" },
    { d: "M18.6 8.6a2 1 0 1 1-3.4.4", tom: "traco", largura: 1 },
  ],
  /* Garrafa com rótulo e rolha. */
  consumivel: [
    { d: "M13.6 2.8h4.8v3.4l-.4.8v3.6c3 1.2 5 3.8 5 6.8v9.6a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2v-9.6c0-3 2-5.6 5-6.8V7l-.4-.8z", tom: "meio" },
    { d: "M13.2 2.6h5.6v2.4h-5.6z", tom: "cheio" },
    { d: "M9 17.6h14v6.6H9z", tom: "cheio" },
  ],
  /* Chapéu de aba larga. */
  roupa: [
    { d: "M9.4 19.8c0-5.4 1.4-11.4 4.4-11.4 1.1 0 1.6.9 2.2.9s1.1-.9 2.2-.9c3 0 4.4 6 4.4 11.4", tom: "meio" },
    { d: "M9.6 17.2c4.2 1.2 8.6 1.2 12.8 0", tom: "traco", largura: 1.8 },
    { d: "M2.8 20.6c1.2 3 25.2 3 26.4 0 .5-1.2-.6-1.8-1.6-1.2-3.8 2-19.4 2-23.2 0-1-.6-2.1 0-1.6 1.2z", tom: "cheio" },
  ],
  /* Martelo e chave cruzados. */
  ferramenta: [
    { d: "M7.2 26.4 19.6 14", tom: "traco", largura: 2.4 },
    { d: "M18.5 7.9l7.1 7.1-2.9 2.9-7.1-7.1z", tom: "cheio" },
    { d: "M24.8 26.4 12.6 14.2", tom: "traco", largura: 2.4 },
    { d: "M6.4 5.6a4.2 4.2 0 0 0 5.6 5.6l-2-2 1.4-1.4 2 2a4.2 4.2 0 0 0-5.6-5.6z", tom: "cheio" },
  ],
  /* Saco de lona amarrado. */
  geral: [
    { d: "M11 10.6c-3.4 3-5.6 8-5.6 11.8 0 3.8 4.8 5.8 10.6 5.8s10.6-2 10.6-5.8c0-3.8-2.2-8.8-5.6-11.8z", tom: "meio" },
    { d: "M12 10.6l-1.4-4.2c-.2-.8.4-1.4 1.2-1.2 2.6.8 5.8.8 8.4 0 .8-.2 1.4.4 1.2 1.2L20 10.6", tom: "meio" },
    { d: "M10.8 10.6h10.4", tom: "traco", largura: 2 },
    { d: "M12.6 18.6c2.2 1 4.6 1 6.8 0", tom: "traco", largura: 0.9 },
  ],
  /* Munição curta: estojo baixo, ponta redonda. */
  municao_curta: cartucho(15, 10),
  /* Munição média: estojo mais alto, ponta mais longa. */
  municao_media: cartucho(12, 4.5),
  /* Munição longa: estojo de gargalo e ponta fina. */
  municao_longa: [
    { d: "M12 27V13.6l1.6-2.4V8.4h4.8v2.8l1.6 2.4V27z", tom: "meio" },
    { d: "M13.6 8.4V5.4c0-2 1-3.4 2.4-3.4s2.4 1.4 2.4 3.4v3z", tom: "cheio" },
    { d: "M11 26.4h10v2h-10z", tom: "cheio" },
  ],
  /* Cartucho de escopeta: tubo com dobra no topo e base de latão. */
  municao_escopeta: [
    { d: "M10.6 4.6h10.8v17H10.6z", tom: "meio" },
    { d: "M13.2 4.6v2.6M16 4.6v2.6M18.8 4.6v2.6", tom: "traco", largura: 0.9 },
    { d: "M9.8 20.4h12.4v6.4a1.2 1.2 0 0 1-1.2 1.2h-10a1.2 1.2 0 0 1-1.2-1.2z", tom: "cheio" },
    { d: "M9.8 23.4h12.4", tom: "traco", largura: 0.6 },
  ],
  /* Flecha com ponta e penas. */
  municao_flecha: [
    { d: "M7.4 24.6 23.2 8.8", tom: "traco", largura: 1.6 },
    { d: "M27.6 4.4l-1.6 8.2-2.9-2.9-2.9-2.9z", tom: "cheio" },
    { d: "M9.4 22.6 4 22l1.8-3.4 4.6 1.6zM9.4 22.6 10 28l3.4-1.8-1.6-4.6z", tom: "meio" },
  ],
  /* Munição especial: cartucho com a ponta marcada e o brilho. */
  municao_especial: [
    ...cartucho(15, 9),
    { d: "M12.5 19.5h7v2.4h-7z", tom: "cheio" },
    { d: "M16 2.4v2.4M10.4 5.2l1.6 1.6M21.6 5.2 20 6.8M8.6 10.2h2.2M23.4 10.2h-2.2", tom: "traco", largura: 1.2 },
  ],
};

/* Munição por id do pacote: as três comuns pelo nome, flechas, escopeta, e o resto é especial. */
export function iconeDeMunicao(itemId: string | null, nome: string): IconeGenerico {
  const chave = `${itemId ?? ""} ${nome}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/escopeta|balote|bafo de dragao|espinhosa|moedeira/.test(chave)) return "municao_escopeta";
  if (/flecha/.test(chave)) return "municao_flecha";
  if (/municoes\.curta\b|\bcurta\b/.test(chave)) return "municao_curta";
  if (/municoes\.media\b|\bmedia\b/.test(chave)) return "municao_media";
  if (/municoes\.longa\b|\blonga\b/.test(chave)) return "municao_longa";
  return "municao_especial";
}
