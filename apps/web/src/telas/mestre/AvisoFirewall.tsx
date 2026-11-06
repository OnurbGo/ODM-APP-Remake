import { Botao, Icone } from "@odm/estilo";
import { useCallback, useEffect, useRef, useState } from "react";
import css from "./PainelMestre.module.css";

const TEXTO: Partial<Record<EstadoFirewall, string>> = {
  bloqueado: "O Windows está impedindo os jogadores de entrar na mesa.",
  sem_liberacao: "Falta liberar este app no Windows para os jogadores conseguirem entrar.",
};

const FALHA: Record<MotivoFalha, string> = {
  recusado: "A confirmação do Windows foi recusada. Clique de novo e escolha Sim.",
  sem_resposta: "O Windows não recebeu resposta. Clique de novo e procure um ícone piscando na barra de tarefas.",
  falhou: "O Windows não aplicou a liberação. Feche o app, abra de novo e tente outra vez.",
};

/* Só no app instalado: é o Electron que sabe consultar e liberar. Liberado ou sem resposta, nada aparece. */
export function AvisoFirewall() {
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

  const texto = estado ? TEXTO[estado] : undefined;
  if (!ponte || !texto) return null;

  const liberar = async () => {
    definirLiberando(true);
    definirFalha(null);
    const resultado = await ponte.liberar().catch(() => null);
    definirLiberando(false);
    if (resultado) definirEstado(resultado.estado);
    definirFalha(resultado ? resultado.motivo : "falhou");
  };

  return (
    <div className={css.alerta} role="alert">
      <Icone nome="alerta" tamanho={20} />
      <div className={css.alertaCorpo}>
        <span>{texto}</span>
        <Botao variante="primario" disabled={liberando} onClick={() => void liberar()}>
          {liberando ? "Aguardando o Windows…" : "Liberar acesso"}
        </Botao>
        <span className={css.alertaAjuda}>{falha ? FALHA[falha] : "Se o Windows pedir uma confirmação, escolha Sim."}</span>
      </div>
    </div>
  );
}
