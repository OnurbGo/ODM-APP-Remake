import { useCallback, useEffect, useRef, useState } from "react";

/* Só no app instalado: é o Electron que sabe consultar e liberar. */
export function usarFirewall() {
  const ponte = window.odmDesktop?.firewall;
  const [estado, definirEstado] = useState<EstadoFirewall | null>(null);
  const [liberando, definirLiberando] = useState(false);
  const [falha, definirFalha] = useState<MotivoFalha | null>(null);
  const atual = useRef<EstadoFirewall | null>(null);
  atual.current = estado;

  const consultar = useCallback(() => {
    void ponte?.estado().then(definirEstado, () => undefined);
  }, [ponte]);

  /* A pessoa pode ter respondido à janela do próprio Windows: ao voltar para o app, confere de novo. */
  useEffect(() => {
    consultar();
    const aoVoltar = () => {
      if (atual.current !== "liberado") consultar();
    };
    window.addEventListener("focus", aoVoltar);
    return () => window.removeEventListener("focus", aoVoltar);
  }, [consultar]);

  const liberar = useCallback(async () => {
    if (!ponte) return;
    definirLiberando(true);
    definirFalha(null);
    const resultado = await ponte.liberar().catch(() => null);
    definirLiberando(false);
    if (resultado) definirEstado(resultado.estado);
    definirFalha(resultado ? resultado.motivo : "falhou");
  }, [ponte]);

  return { noApp: !!ponte, estado, liberando, falha, liberar };
}

export type Firewall = ReturnType<typeof usarFirewall>;
