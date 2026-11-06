import type { PacoteConteudo } from "@odm/conteudo";
import { lerPasta, pastaConteudo } from "@odm/conteudo/pasta";

/* Só os pacotes válidos. O caminho do instalador entra na fase 7 (especificação, 4.1). */
export function pacotesDaPasta(pasta = pastaConteudo()): PacoteConteudo[] {
  return lerPasta(pasta).flatMap((l) => (l.pacote && l.problemas.length === 0 ? [l.pacote] : []));
}
