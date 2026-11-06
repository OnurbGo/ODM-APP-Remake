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

export const salvos = {
  token: () => ler(local, "odm-token"),
  guardarToken: (token: string | null) => gravar(local, "odm-token", token),

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

  tokenMestreDev: () => ler(sessao, "odm-token-mestre"),
  guardarTokenMestreDev: (token: string) => gravar(sessao, "odm-token-mestre", token),
};
