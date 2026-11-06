import { useEffect, useState, useSyncExternalStore } from "react";
import { usePreferencias } from "./estado/usePreferencias";
import { AberturaProto } from "./telas/AberturaProto";
import { CombateCelular } from "./telas/CombateCelular";
import { CombateDesktop } from "./telas/CombateDesktop";
import { EscudoMestre } from "./telas/EscudoMestre";
import { FichaDesktop } from "./telas/ficha/FichaDesktop";
import { Indice } from "./telas/Indice";
import { TransicoesProto } from "./telas/TransicoesProto";
import { Vitrine } from "./telas/Vitrine";

function useRota() {
  const [rota, definir] = useState(() => location.hash.slice(1) || "/");
  useEffect(() => {
    const aoMudar = () => definir(location.hash.slice(1) || "/");
    addEventListener("hashchange", aoMudar);
    return () => removeEventListener("hashchange", aoMudar);
  }, []);
  return rota;
}

const JANELA_DESKTOP = "(min-width: 900px)";

function assinarJanela(aoMudar: () => void) {
  const media = matchMedia(JANELA_DESKTOP);
  media.addEventListener("change", aoMudar);
  return () => media.removeEventListener("change", aoMudar);
}

/* Layouts separados, escolhidos pela largura: nunca o mesmo esticado. */
function useJanelaDesktop() {
  return useSyncExternalStore(assinarJanela, () => matchMedia(JANELA_DESKTOP).matches);
}

export function App() {
  const rota = useRota();
  const janelaDesktop = useJanelaDesktop();
  const [preferencias, mudar] = usePreferencias();
  const props = { preferencias, mudar };

  if (rota === "/combate") return janelaDesktop ? <CombateDesktop {...props} /> : <CombateCelular {...props} />;
  if (rota === "/combate-celular") return <CombateCelular {...props} />;
  if (rota === "/combate-desktop") return <CombateDesktop {...props} />;
  if (rota === "/abertura") return <AberturaProto {...props} />;
  if (rota === "/transicoes") return <TransicoesProto {...props} />;
  if (rota === "/ficha")
    return janelaDesktop ? <FichaDesktop {...props} /> : <CombateCelular {...props} abaInicial="personagem" />;
  if (rota === "/ficha-celular") return <CombateCelular key="ficha" {...props} abaInicial="personagem" />;
  if (rota === "/ficha-desktop") return <FichaDesktop {...props} />;
  if (rota === "/escudo") return <EscudoMestre {...props} />;
  if (rota === "/vitrine") return <Vitrine {...props} />;
  return <Indice />;
}
