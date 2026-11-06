import { PORTA_PADRAO } from "@odm/protocolo/constantes";

export const MENOR_PORTA = 1024;
export const MAIOR_PORTA = 65535;

/* URL.origin vale "null" em esquema próprio como odm://, então a origem é montada à mão. */
export function origemDe(url: string): string | null {
  try {
    const { protocol, host } = new URL(url);
    return `${protocol}//${host}`;
  } catch {
    return null;
  }
}

export function portaValida(porta: unknown): porta is number {
  return typeof porta === "number" && Number.isInteger(porta) && porta >= MENOR_PORTA && porta <= MAIOR_PORTA;
}

/* O que o jogador digita na tela inicial: IP, IP:porta ou o endereço inteiro.
   Devolve a origem http, ou null se não for um endereço aceitável. */
export function origemDaMesa(texto: string): string | null {
  const limpo = texto.trim();
  if (!limpo || /\s/.test(limpo)) return null;

  let url: URL;
  try {
    url = new URL(/^[a-z]+:\/\//i.test(limpo) ? limpo : `http://${limpo}`);
  } catch {
    return null;
  }
  /* A mesa é sempre HTTP, na rede local ou virtual (especificação, 3.2). */
  if (url.protocol !== "http:" || url.username || url.password) return null;
  /* Lida do texto: o URL descarta a porta 80 por ser a padrão do HTTP, e ela sumiria calada. */
  const digitada = /^(?:[a-z]+:\/\/)?[^/:?#]+:(\d+)/i.exec(limpo)?.[1];
  const porta = digitada ? Number(digitada) : PORTA_PADRAO;
  if (!portaValida(porta)) return null;
  return `http://${url.hostname}:${porta}`;
}
