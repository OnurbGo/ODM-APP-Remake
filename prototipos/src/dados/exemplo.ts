/* Mesa fictícia. Nomes, números e textos são inventados e nenhum valor é regra:
   o conteúdo real vem dos pacotes gerados dos livros, a partir da fase 3. */

export const TEXTO_EXEMPLO = "Texto de exemplo. O texto real vem do pacote de conteúdo.";

/* Lista única: a interface inteira lê daqui e mantém a ordem do sistema. */
export const ATRIBUTOS = ["Brutalidade", "Agilidade", "Fibra", "Intelecto", "Astúcia", "Presença"] as const;
export type Atributo = (typeof ATRIBUTOS)[number];

export const PERSONAGEM = {
  nome: "Inácia Brasa",
  classe: "Caçadora",
  nivel: 6,
  defesa: 15,
  deslocamento: "9 m",
};

export const ATRIBUTOS_VALOR: Record<Atributo, number> = {
  Brutalidade: 1,
  Agilidade: 3,
  Fibra: 2,
  Intelecto: 0,
  Astúcia: 2,
  Presença: -1,
};

export const RESISTENCIAS_VALOR: Record<Atributo, number> = {
  Brutalidade: 1,
  Agilidade: 5,
  Fibra: 2,
  Intelecto: 0,
  Astúcia: 4,
  Presença: -1,
};

export const PERICIAS = [
  { nome: "Mira", valor: 5 },
  { nome: "Rastrear", valor: 4 },
  { nome: "Furtividade", valor: 3 },
  { nome: "Sobrevivência", valor: 2 },
  { nome: "Intimidar", valor: 1 },
  { nome: "Lábia", valor: -1 },
];

export const ARMA = { nome: "Revólver velho", acerto: 5, dano: "1d8+3" };

export type Combatente = { id: string; nome: string; criatura?: boolean; voce?: boolean };

/* Sem PV de criatura de propósito: o jogador não recebe esse dado. */
export const INICIATIVA: Combatente[] = [
  { id: "zeca", nome: "Zeca Tropeiro" },
  { id: "andarilho", nome: "Andarilho Podre", criatura: true },
  { id: "inacia", nome: "Inácia Brasa", voce: true },
  { id: "lucia", nome: "Irmã Lúcia" },
  { id: "carnicas", nome: "Bando de Carniças", criatura: true },
];

export type Efeito = {
  id: string;
  nome: string;
  tom: "perigo" | "sucesso" | "neutro";
  acumulos?: number;
  turnos?: number;
  acao?: { nome: string; custoPA: number };
};

export const EFEITOS: Efeito[] = [
  { id: "hemorragia", nome: "Hemorragia", tom: "perigo", acumulos: 2, acao: { nome: "Bandagem", custoPA: 1 } },
  { id: "envenenado", nome: "Envenenado", tom: "perigo", turnos: 2 },
  { id: "mao-firme", nome: "Mão Firme", tom: "sucesso", turnos: 1 },
];

export const EFEITOS_EXTRAS: Efeito[] = [
  { id: "impedido", nome: "Impedido", tom: "perigo", turnos: 1 },
  { id: "maldicao", nome: "Maldição do Poço Seco de Exemplo", tom: "perigo", acumulos: 3, turnos: 12 },
  { id: "benzido", nome: "Benzido pela Irmã", tom: "sucesso", turnos: 3 },
];

export type Habilidade = {
  id: string;
  nome: string;
  custo: string;
  pa?: number;
  frequencia: string;
  volta: string;
  usada: boolean;
};

export const HABILIDADES: Habilidade[] = [
  { id: "olhar-frio", nome: "Olhar Frio", custo: "1 PA", pa: 1, frequencia: "Uma vez por cena", volta: "na próxima cena", usada: false },
  { id: "passo-poeira", nome: "Passo de Poeira", custo: "Reação · 1 PA guardado", pa: 1, frequencia: "Uma vez por descanso curto", volta: "no descanso curto", usada: false },
  { id: "tiro-aviso", nome: "Tiro de Aviso", custo: "2 PA", pa: 2, frequencia: "Uma vez por descanso curto", volta: "no descanso curto", usada: true },
  { id: "ultima-prece", nome: "Última Prece", custo: "1 Ficha de Olho da Morte", frequencia: "Uma vez por descanso longo", volta: "no descanso longo", usada: true },
];

export const FICHAS = [
  { id: "olho", nome: "Ficha de Olho da Morte", atual: 2, maximo: 3 },
  { id: "adrenalina", nome: "Ficha de Adrenalina", atual: 1, maximo: 4 },
];

export const CONTAS = {
  pv: { titulo: "Pontos de Vida", linhas: ["Valor máximo 42", "Conta de exemplo; nada aqui é regra"] },
  defesa: { titulo: "Defesa 15", linhas: ["10 base", "+3 Agilidade", "+2 armadura"] },
  deslocamento: { titulo: "Deslocamento 9 m", linhas: ["9 m base", "Conta de exemplo; nada aqui é regra"] },
};
export type ChaveConta = keyof typeof CONTAS;
