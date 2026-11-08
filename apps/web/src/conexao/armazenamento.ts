/* Navegador sem armazenamento (janela privada, por exemplo) não pode quebrar a entrada:
   sem o token salvo, o jogador só pede para entrar de novo. */
function ler(area: () => Storage, chave: string) {
  try {
    return area().getItem(chave);
  } catch {
    return null;
  }
}

function gravar(area: () => Storage, chave: string, valor: string | null) {
  try {
    if (valor === null) area().removeItem(chave);
    else area().setItem(chave, valor);
  } catch {
    /* sem armazenamento: vale só nesta visita */
  }
}

const local = () => localStorage;
const sessao = () => sessionStorage;

export type PedidoSalvo = { pedidoId: string; segredo: string };

const MAX_TOKENS = 20;

function lerTokens(): string[] {
  try {
    const lista = JSON.parse(ler(local, "odm-tokens") ?? "[]") as unknown;
    return Array.isArray(lista) ? lista.filter((t): t is string => typeof t === "string") : [];
  } catch {
    return [];
  }
}

const gravarTokens = (tokens: string[]) => gravar(local, "odm-tokens", tokens.length ? JSON.stringify(tokens) : null);

export const salvos = {
  /* Um token por campanha em que este aparelho foi aprovado. "odm-token" é de quando só havia uma. */
  tokens() {
    const antigo = ler(local, "odm-token");
    return antigo ? [...new Set([...lerTokens(), antigo])] : lerTokens();
  },
  guardarToken(token: string) {
    gravarTokens([token, ...salvos.tokens().filter((t) => t !== token)].slice(0, MAX_TOKENS));
    gravar(local, "odm-token", null);
  },
  esquecerToken(token: string) {
    gravarTokens(salvos.tokens().filter((t) => t !== token));
    gravar(local, "odm-token", null);
  },
  esquecerTokens() {
    gravarTokens([]);
    gravar(local, "odm-token", null);
  },

  /* Pedido em espera: dura só esta aba, o bastante para o celular que bloqueou a tela. */
  pedido(): PedidoSalvo | null {
    const bruto = ler(sessao, "odm-pedido");
    if (!bruto) return null;
    try {
      return JSON.parse(bruto) as PedidoSalvo;
    } catch {
      return null;
    }
  },
  guardarPedido: (pedido: PedidoSalvo | null) => gravar(sessao, "odm-pedido", pedido ? JSON.stringify(pedido) : null),

  /* Último nível mostrado neste aparelho, para o aviso de subir de nível. */
  nivelVisto(personagemId: string) {
    const bruto = ler(local, `odm-nivel-${personagemId}`);
    return bruto === null ? null : Number(bruto);
  },
  guardarNivelVisto: (personagemId: string, nivel: number) => gravar(local, `odm-nivel-${personagemId}`, String(nivel)),

  /* "Rolagem rápida" (especificação 8.5): escolha de cada aparelho. */
  rolagemRapida: () => ler(local, "odm-rolagem-rapida") === "sim",
  guardarRolagemRapida: (ligada: boolean) => gravar(local, "odm-rolagem-rapida", ligada ? "sim" : null),
  tokenMestreDev: () => ler(sessao, "odm-token-mestre"),
  guardarTokenMestreDev: (token: string) => gravar(sessao, "odm-token-mestre", token),

  /* "Limpar rolagens": até que posição do registro as rolagens saíram da tela, por campanha e por pessoa
     (a posição "n" é do registro de quem recebe). Recarregar a página não traz de volta. */
  rolagensLimpasAte(campanhaId: string, participanteId: string) {
    const n = Number(ler(local, `odm-limpas-${campanhaId}-${participanteId}`));
    return Number.isInteger(n) && n > 0 ? n : 0;
  },
  guardarRolagensLimpasAte: (campanhaId: string, participanteId: string, n: number) => gravar(local, `odm-limpas-${campanhaId}-${participanteId}`, n > 0 ? String(n) : null),

  /* O encontro que montou o combate em curso: quantos de cada ficha entraram e o XP ajustado pelo mestre.
     O fim do combate usa para contar os que sumiram dentro da Horda. */
  encontroEmUso(campanhaId: string): LinhaEmUso[] {
    try {
      const lista = JSON.parse(ler(local, `odm-encontro-${campanhaId}`) ?? "[]") as unknown;
      return Array.isArray(lista) ? lista.filter((l): l is LinhaEmUso => !!l && typeof l.ref === "string" && typeof l.quantidade === "number") : [];
    } catch {
      return [];
    }
  },
  guardarEncontroEmUso: (campanhaId: string, linhas: LinhaEmUso[]) => gravar(local, `odm-encontro-${campanhaId}`, linhas.length ? JSON.stringify(linhas) : null),

  /* Janelas que a jogadora já fechou neste aparelho (Jogo do 21, o que o mestre mostra, cartão de teste do Escudo): não voltam ao entrar
     no combate nem ao recarregar. Valem só nesta aba, como o pedido de entrada. */
  janelasFechadas(tipo: "jogo21" | "mostra" | "teste"): string[] {
    try {
      const lista = JSON.parse(ler(sessao, `odm-fechadas-${tipo}`) ?? "[]") as unknown;
      return Array.isArray(lista) ? lista.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  },
  guardarJanelasFechadas: (tipo: "jogo21" | "mostra" | "teste", ids: string[]) => gravar(sessao, `odm-fechadas-${tipo}`, ids.length ? JSON.stringify(ids.slice(-50)) : null),
};

export type LinhaEmUso = { ref: string; elite: boolean; quantidade: number; xp: number | null };
