/// <reference types="vite/client" />

/* Pontes do Electron: só existem no app instalado, nas janelas do próprio mestre. */
interface Window {
  odmDesktop?: {
    tokenMestre: () => Promise<string>;
    firewall: {
      estado: () => Promise<EstadoFirewall>;
      liberar: () => Promise<ResultadoLiberar>;
    };
  };
  odmInicio?: {
    abrirMesa: () => Promise<ResultadoAbrirMesa>;
    trocarPorta: (porta: number) => Promise<ResultadoAbrirMesa>;
    entrarEmMesa: (endereco: string) => Promise<{ ok: boolean; mensagem?: string }>;
  };
}

type EstadoFirewall = "liberado" | "bloqueado" | "sem_liberacao" | "desconhecido";
type MotivoFalha = "recusado" | "sem_resposta" | "falhou";
type ResultadoLiberar = { estado: EstadoFirewall; motivo: MotivoFalha | null };

type ResultadoAbrirMesa =
  | { ok: true }
  | { ok: false; motivo: "porta_ocupada"; porta: number }
  | { ok: false; motivo: "falha"; mensagem: string };
