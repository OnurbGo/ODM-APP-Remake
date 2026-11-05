import { Alternador, BarraPV, Botao, Cartao, Etiqueta, EstrelaTurno, FichaClasse, MarcadorPA } from "@odm/estilo";
import { useState } from "react";
import type { Preferencias } from "../estado/usePreferencias";
import { PainelAparencia } from "../moldura/PainelAparencia";
import css from "./Vitrine.module.css";

const CORES = [
  "fundo",
  "superficie",
  "superficie-alta",
  "borda-forte",
  "texto",
  "texto-suave",
  "destaque",
  "perigo",
  "sucesso",
  "tecnica",
  "prestigio",
  "metal",
];

const FONTES = [
  { token: "--fonte-gotica", exemplo: "Olho da Morte" },
  { token: "--fonte-titulo", exemplo: "Efeitos ativos" },
  { token: "--fonte-epigrafe", exemplo: "Poeira, pólvora e pagamento" },
  { token: "--fonte-texto", exemplo: "Tocar mostra as ações do efeito e o texto." },
  { token: "--fonte-rotulo", exemplo: "Defesa · Exaustão · PA · DT" },
  { token: "--fonte-numero", exemplo: "0123456789 +3 −1 27/42" },
];

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function Vitrine({ preferencias, mudar }: Props) {
  const [ligado, definirLigado] = useState(true);
  const [fichas, definirFichas] = useState(2);

  return (
    <div className={`${css.vitrine} odm-grao`}>
      <main className={css.conteudo}>
        <h1 className={css.titulo}>Vitrine do estilo</h1>

        <Cartao titulo="Cores semânticas">
          <div className={css.cores}>
            {CORES.map((c) => (
              <div key={c} className={css.cor}>
                <span className={css.amostra} style={{ background: `var(--cor-${c})` }} />
                <span>{c}</span>
              </div>
            ))}
          </div>
        </Cartao>

        <Cartao titulo="Fontes">
          {FONTES.map((f) => (
            <div key={f.token} className={css.fonte}>
              <code>{f.token}</code>
              <p style={{ fontFamily: `var(${f.token})` }}>{f.exemplo}</p>
            </div>
          ))}
        </Cartao>

        <Cartao titulo="Botões">
          <div className={css.linha}>
            <Botao variante="primario">Rolar</Botao>
            <Botao>Encerrar efeito</Botao>
            <Botao variante="perigo">Teste de Morte</Botao>
            <Botao variante="fantasma">Desfazer</Botao>
            <Botao disabled>Custa 2, você tem 1</Botao>
          </div>
        </Cartao>

        <Cartao titulo="Marcadores de PA">
          <div className={css.linha}>
            <MarcadorPA estado="disponivel" aoTocar={() => undefined} />
            <MarcadorPA estado="guardado" aoTocar={() => undefined} />
            <MarcadorPA estado="gasto" />
            <MarcadorPA estado="bloqueado" />
          </div>
        </Cartao>

        <Cartao titulo="Vida, fichas e etiquetas">
          <BarraPV atual={27} maximo={42} temporario={5} />
          <FichaClasse nome="Ficha de Olho da Morte" atual={fichas} maximo={3} aoMudar={(d) => definirFichas((v) => v + d)} />
          <div className={css.linha}>
            <Etiqueta>2 turnos</Etiqueta>
            <Etiqueta tom="destaque">+5 temp.</Etiqueta>
            <Etiqueta tom="perigo">×2</Etiqueta>
            <Etiqueta tom="sucesso">Sucesso</Etiqueta>
            <Etiqueta tom="tecnica">Técnica</Etiqueta>
          </div>
          <Alternador rotulo="Rolar resistências automaticamente" ligado={ligado} aoMudar={definirLigado} />
        </Cartao>

        <Cartao titulo="Estrela do turno">
          <EstrelaTurno tamanho={72} />
        </Cartao>
      </main>

      <aside className={css.lado}>
        <a href="#/">← Protótipos</a>
        <PainelAparencia preferencias={preferencias} mudar={mudar} />
      </aside>
    </div>
  );
}
