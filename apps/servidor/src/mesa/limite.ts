/* Conta tentativas erradas por chave dentro de uma janela de tempo. */
export class LimiteTentativas {
  private readonly contagens = new Map<string, { quantas: number; desde: number }>();

  constructor(
    private readonly maximo: number,
    private readonly janelaMs: number,
  ) {}

  bloqueado(chave: string, agora: number) {
    const atual = this.contagens.get(chave);
    if (!atual) return false;
    if (agora - atual.desde >= this.janelaMs) {
      this.contagens.delete(chave);
      return false;
    }
    return atual.quantas >= this.maximo;
  }

  registrarErro(chave: string, agora: number) {
    const atual = this.contagens.get(chave);
    if (!atual || agora - atual.desde >= this.janelaMs) this.contagens.set(chave, { quantas: 1, desde: agora });
    else atual.quantas += 1;
  }

  limpar(chave: string) {
    this.contagens.delete(chave);
  }
}
