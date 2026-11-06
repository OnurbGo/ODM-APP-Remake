import { z } from "zod";

/* Especificação, 4.2: id fixo no formato tipo.nome. */
export const IdConteudo = z.string().regex(/^[a-z0-9_-]+(\.[a-z0-9_-]+)+$/);

const Versao = z.string().regex(/^\d+\.\d+(\.\d+)?$/);

export const ManifestoPacote = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  nome: z.string().min(1),
  versao: Versao,
  /* Complementos dependem da base. */
  dependencias: z.array(z.object({ id: z.string(), versaoMinima: Versao.optional() })).default([]),
  /* Identificador do tema visual do complemento (seção 9). */
  tema: z.string().optional(),
});
export type ManifestoPacote = z.infer<typeof ManifestoPacote>;

/* A estrutura interna do conteúdo chega na fase 3, com o exportador do repositório dos livros. */
export const PacoteConteudo = z.object({
  manifesto: ManifestoPacote,
  conteudo: z.record(z.string(), z.unknown()),
});
export type PacoteConteudo = z.infer<typeof PacoteConteudo>;

export function lerPacote(json: string): PacoteConteudo {
  return PacoteConteudo.parse(JSON.parse(json));
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
