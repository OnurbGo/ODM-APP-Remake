import { MecanicaModificador, type Modificador } from "@odm/conteudo";
import { Alternador, Cartao, Etiqueta, TextoDoLivro } from "@odm/estilo";
import { acoes, useLoja } from "../../../conexao/loja";
import { oQueFaz } from "../../campanha/oQueFaz";
import css from "./Campanha.module.css";

/* Modificadores de mundo (especificação 7.4; Mestre, "Modificadores de mundo"). Regra opcional: o mestre liga
   e todos veem a carta. Com mecânica aprovada, ela entra na conta e o pop-up do teste mostra o nome da carta. */

export function Mundo({ modificadores }: { modificadores: Modificador[] }) {
  const opcoes = useLoja((e) => e.mesa?.opcoes);
  if (!opcoes) return null;
  const ligados = new Map(opcoes.mundo.map((m) => [m.id, m]));
  const definir = (mundo: typeof opcoes.mundo) => acoes.definirOpcoes({ ...opcoes, mundo });
  const ligar = (id: string, sim: boolean) => definir(sim ? [...opcoes.mundo, { id, campoAberto: false }] : opcoes.mundo.filter((m) => m.id !== id));
  const campoAberto = (id: string, sim: boolean) => definir(opcoes.mundo.map((m) => (m.id === id ? { ...m, campoAberto: sim } : m)));

  return (
    <div className={css.mundo}>
      <p className={css.nota}>Regra opcional. A carta ligada aparece para todos; a parte com número entra na conta sozinha.</p>
      {modificadores.length === 0 && <p className={css.nota}>O pacote desta campanha não traz modificadores de mundo.</p>}
      <div className={css.cartasMundo}>
        {modificadores.map((m) => {
          const ligado = ligados.get(m.id);
          const faz = oQueFaz(m);
          return (
            <Cartao key={m.id} titulo={m.nome} className={ligado ? css.cartaLigada : undefined} extra={ligado ? <Etiqueta tom="destaque">Ligado</Etiqueta> : undefined}>
              <p className={css.texto}><TextoDoLivro texto={m.texto} /></p>
              {faz.length ? (
                <ul className={css.faz}>
                  {faz.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              ) : (
                <p className={css.nota}>Só texto: você aplica.</p>
              )}
              <Alternador rotulo="Ligado" ligado={!!ligado} aoMudar={(sim) => ligar(m.id, sim)} />
              {ligado && MecanicaModificador.safeParse(m.mecanica).data?.deslocamento && (
                <Alternador rotulo="Campo aberto" dica="A cena acontece ao ar livre" ligado={ligado.campoAberto} aoMudar={(sim) => campoAberto(m.id, sim)} />
              )}
            </Cartao>
          );
        })}
      </div>
    </div>
  );
}
