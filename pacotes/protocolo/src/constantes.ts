/* Separado do resto: a web precisa destes valores, mas não leva o Zod no pacote inicial. */

export const VERSAO_PROTOCOLO = 1;

/* Nesta ordem, como nos livros. */
export const ATRIBUTOS = ["brutalidade", "agilidade", "fibra", "intelecto", "astucia", "presenca"] as const;

export const NOME_ATRIBUTO: Record<(typeof ATRIBUTOS)[number], string> = {
  brutalidade: "Brutalidade",
  agilidade: "Agilidade",
  fibra: "Fibra",
  intelecto: "Intelecto",
  astucia: "Astúcia",
  presenca: "Presença",
};

export const TAMANHO_CODIGO_MESA = 6;
export const TAMANHO_MAXIMO_NOME = 40;
export const CAMINHO_WS = "/ws";
export const PORTA_PADRAO = 47821;
