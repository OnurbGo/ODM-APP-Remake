import { z } from "zod";
import { Conteudo } from "./esquemas";

const Versao = z.string().regex(/^\d+\.\d+(\.\d+)?$/);

export const ManifestoPacote = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nome: z.string().min(1),
  versao: Versao,
  /* Complementos dependem da base. */
  dependencias: z.array(z.object({ id: z.string(), versaoMinima: Versao.optional() })).default([]),
  /* Identificador do tema visual do complemento (seção 9). */
  tema: z.string().optional(),
  /* De que livros e de qual versão deles o pacote saiu. */
  origem: z.object({ livros: z.array(z.string()), commit: z.string() }).optional(),
});
export type ManifestoPacote = z.infer<typeof ManifestoPacote>;

export const PacoteConteudo = z.object({
  manifesto: ManifestoPacote,
  conteudo: Conteudo,
});
export type PacoteConteudo = z.infer<typeof PacoteConteudo>;

export function lerPacote(json: string): PacoteConteudo {
  return PacoteConteudo.parse(JSON.parse(json));
}

/* O que o esquema não enxerga: id repetido quebraria a ligação das fichas com o conteúdo. */
export function conferirPacote(pacote: PacoteConteudo): string[] {
  const vistos = new Set<string>();
  const problemas: string[] = [];
  const ver = (id: string) => {
    if (vistos.has(id)) problemas.push(`Id repetido: ${id}`);
    vistos.add(id);
  };
  for (const lista of Object.values(pacote.conteudo)) {
    for (const item of lista) {
      ver(item.id);
      if (!("secoes" in item)) continue;
      for (const secao of item.secoes) for (const acao of secao.itens) if ("id" in acao) ver(acao.id);
    }
  }
  return problemas;
}

const partes = (v: string) => v.split(".").map(Number);

function versaoAtende(atual: string, minima: string) {
  const a = partes(atual);
  const m = partes(minima);
  for (let i = 0; i < 3; i++) {
    const diferenca = (a[i] ?? 0) - (m[i] ?? 0);
    if (diferenca !== 0) return diferenca > 0;
  }
  return true;
}

/* Devolve o que falta para o pacote funcionar com os outros que estão ativos. */
export function verificarDependencias(pacote: ManifestoPacote, ativos: readonly ManifestoPacote[]): string[] {
  const faltando: string[] = [];
  for (const dependencia of pacote.dependencias) {
    const ativo = ativos.find((a) => a.id === dependencia.id);
    if (!ativo) faltando.push(dependencia.id);
    else if (dependencia.versaoMinima && !versaoAtende(ativo.versao, dependencia.versaoMinima)) {
      faltando.push(`${dependencia.id} ${dependencia.versaoMinima}`);
    }
  }
  return faltando;
}
