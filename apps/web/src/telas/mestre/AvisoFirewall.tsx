import { Botao, Icone } from "@odm/estilo";
import css from "./PainelMestre.module.css";
import type { Firewall } from "./usarFirewall";

const TEXTO: Partial<Record<EstadoFirewall, string>> = {
  bloqueado: "O Windows está impedindo os jogadores de entrar na mesa.",
  sem_liberacao: "Falta liberar este app no Windows para os jogadores conseguirem entrar.",
};

const FALHA: Record<MotivoFalha, string> = {
  recusado: "A confirmação do Windows foi recusada. Clique de novo e escolha Sim.",
  sem_resposta: "O Windows não recebeu resposta. Clique de novo e procure um ícone piscando na barra de tarefas.",
  falhou: "O Windows não aplicou a liberação. Feche o app, abra de novo e tente outra vez.",
};

/* Liberado ou sem resposta, nada aparece. */
export function AvisoFirewall({ firewall }: { firewall: Firewall }) {
  const { noApp, estado, liberando, falha, liberar } = firewall;
  const texto = estado ? TEXTO[estado] : undefined;
  if (!noApp || !texto) return null;

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
