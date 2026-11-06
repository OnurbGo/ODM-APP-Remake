import type { Atributo } from "./exemplo";

/* Ficha fictícia. Perícias, técnicas, talentos, itens e números são inventados, para o layout
   caber o caso real. As opções da loja e seus custos vêm da seção 6.2.1 da especificação. */

export const ATRIBUTOS_INICIAIS: Record<Atributo, number> = {
  Brutalidade: 1,
  Agilidade: 3,
  Fibra: 2,
  Intelecto: 0,
  Astúcia: 2,
  Presença: -1,
};

export const PERICIAS_FICHA: { nome: string; atributo: string; valor: number; treinada?: boolean }[] = [
  { nome: "Arremesso", atributo: "Agi", valor: 3 },
  { nome: "Barganha", atributo: "Pre", valor: -1 },
  { nome: "Cavalgar", atributo: "Agi", valor: 5, treinada: true },
  { nome: "Decifrar", atributo: "Int", valor: 0 },
  { nome: "Disfarce", atributo: "Ast", valor: 2 },
  { nome: "Escalar", atributo: "Bru", valor: 1 },
  { nome: "Faro", atributo: "Ast", valor: 4, treinada: true },
  { nome: "Furtividade", atributo: "Agi", valor: 5, treinada: true },
  { nome: "Lábia", atributo: "Pre", valor: -1 },
  { nome: "Mira", atributo: "Agi", valor: 5, treinada: true },
  { nome: "Primeiros Socorros", atributo: "Ast", valor: 2 },
  { nome: "Rastrear", atributo: "Ast", valor: 4, treinada: true },
  { nome: "Remendo", atributo: "Int", valor: 0 },
  { nome: "Sobreviver", atributo: "Ast", valor: 2 },
  { nome: "Tocar Viola", atributo: "Pre", valor: -1 },
  { nome: "Trato com Bichos", atributo: "Pre", valor: -1 },
];

export const FAIXAS_HONRA = [
  { nome: "Desonrado", de: 0, ate: 3 },
  { nome: "Suspeito", de: 4, ate: 8 },
  { nome: "Neutro", de: 9, ate: 11 },
  { nome: "Respeitado", de: 12, ate: 16 },
  { nome: "Honrado", de: 17, ate: 20 },
];

export const TRILHA_REDENCAO = {
  titulo: "A dívida do irmão",
  passos: [
    "O dia do roubo",
    "Achar quem viu",
    "Pagar o primeiro credor",
    "Perder a confiança do bando",
    "Encarar o irmão",
    "Enterrar a dívida",
  ],
};

export type HabilidadeFicha = { nome: string; detalhe: string; fonte: "Classe" | "Especialização" | "Origem" };

export const HABILIDADES_FICHA: HabilidadeFicha[] = [
  { nome: "Olhar Frio", detalhe: "1 PA · Uma vez por cena", fonte: "Classe" },
  { nome: "Rastro Fresco", detalhe: "Passiva", fonte: "Classe" },
  { nome: "Passo de Poeira", detalhe: "Reação · 1 PA guardado · Uma vez por descanso curto", fonte: "Especialização" },
  { nome: "Tiro de Aviso", detalhe: "2 PA · Uma vez por descanso curto", fonte: "Especialização" },
  { nome: "Última Prece", detalhe: "1 Ficha de Olho da Morte · Uma vez por descanso longo", fonte: "Origem" },
];

export const TALENTOS_INICIAIS = ["Sono Leve", "Dedo Ligeiro"];

export const OPCOES_TALENTO = ["Nervos de Aço", "Pontaria de Feira", "Couro Grosso", "Sorte de Principiante"];
export const OPCOES_PROFICIENCIA = ["Armas de fogo longas", "Armadura média", "Kit de remendos"];
export const OPCOES_ESPECIALIZACAO = ["Rastreadora", "Atiradora de Tocaia"];

export const TECNICAS_AVANCADAS = ["Tiro no Escuro", "Saque de Duelista", "Faro de Sangue"];
export const TECNICAS_LENDARIAS = ["Bala com Nome", "A Última Caçada"];

export const CLASSES_SECUNDARIAS = [
  { nome: "Bélico", requisitos: [{ texto: "Brutalidade 2", ok: false }, { texto: "Proficiência em armas pesadas", ok: true }] },
  { nome: "Patife", requisitos: [{ texto: "Agilidade 2", ok: true }, { texto: "Astúcia 1", ok: true }] },
];

export type Item = {
  id: string;
  nome: string;
  qtd: number;
  peso: number;
  raridade: "comum" | "incomum" | "raro" | "extraordinario" | "unico";
  equipado?: boolean;
  usar?: string;
};

export const NOME_RARIDADE: Record<Item["raridade"], string> = {
  comum: "Comum",
  incomum: "Incomum",
  raro: "Raro",
  extraordinario: "Extraordinário",
  unico: "Único",
};

export const ITENS: Item[] = [
  { id: "revolver", nome: "Revólver velho", qtd: 1, peso: 1, raridade: "comum", equipado: true },
  { id: "colete", nome: "Colete de couro cru", qtd: 1, peso: 4, raridade: "incomum", equipado: true },
  { id: "balas", nome: "Balas curtas", qtd: 18, peso: 0.1, raridade: "comum" },
  { id: "bandagem", nome: "Bandagem", qtd: 3, peso: 0.2, raridade: "comum", usar: "Usar" },
  { id: "tonico", nome: "Tônico de Madame Nana", qtd: 1, peso: 0.5, raridade: "raro", usar: "Beber" },
  { id: "amuleto", nome: "Amuleto do Rio Seco", qtd: 1, peso: 0.1, raridade: "extraordinario" },
  { id: "corda", nome: "Corda de 15 metros", qtd: 1, peso: 3, raridade: "comum" },
  { id: "racao", nome: "Ração de viagem", qtd: 4, peso: 0.4, raridade: "comum" },
];

export const CENARIOS_CARGA = [
  { id: "leve", rotulo: "Carga normal", atual: 10.4 },
  { id: "sobrecarregado", rotulo: "Sobrecarregado", atual: 19.5 },
  { id: "imobilizado", rotulo: "Imobilizado", atual: 31 },
];

export const LIMITE_CARGA = 15;
