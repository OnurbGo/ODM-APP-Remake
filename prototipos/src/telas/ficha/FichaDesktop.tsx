import { Abas, Etiqueta, type ItemAba } from "@odm/estilo";
import { useState } from "react";
import { PERSONAGEM } from "../../dados/exemplo";
import { useFicha } from "../../estado/useFicha";
import type { Preferencias } from "../../estado/usePreferencias";
import { Moldura } from "../../moldura/Moldura";
import { GruposFicha } from "../../moldura/GruposFicha";
import { PainelAparencia } from "../../moldura/PainelAparencia";
import {
  AvisoNivel,
  BlocoAtributos,
  BlocoCalculados,
  BlocoCarga,
  BlocoDinheiro,
  BlocoHabilidades,
  BlocoHonra,
  BlocoItens,
  BlocoNotas,
  BlocoPericias,
  BlocoProgressao,
  BlocoRedencao,
} from "./BlocosFicha";
import fichaCss from "./Ficha.module.css";
import css from "./FichaDesktop.module.css";
import { LojaPrestigio } from "./LojaPrestigio";

const ABAS: ItemAba[] = [
  { id: "personagem", rotulo: "Personagem" },
  { id: "habilidades", rotulo: "Habilidades e talentos" },
  { id: "inventario", rotulo: "Inventário" },
  { id: "notas", rotulo: "Notas" },
  { id: "prestigio", rotulo: "Prestígio" },
];

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function FichaDesktop({ preferencias, mudar }: Props) {
  const ficha = useFicha("consagracao");
  const [aba, definirAba] = useState("personagem");
  const { estado } = ficha;
  const itens = ABAS.filter((a) => a.id !== "prestigio" || estado.fase === "consagracao");

  return (
    <Moldura
      desktop
      titulo="Ficha, desktop"
      painel={
        <>
          <GruposFicha ficha={ficha} />
          <PainelAparencia preferencias={preferencias} mudar={mudar} />
        </>
      }
    >
      <div className={css.tela}>
        <header className={css.faixa}>
          <div>
            <h1 className={css.nome}>{PERSONAGEM.nome}</h1>
            <p className={css.classe}>
              {PERSONAGEM.classe}
              {estado.especializacao ? ` · ${estado.especializacao}` : ""} · Nível {estado.nivel}
              {estado.polivalencia.classe ? ` · ${estado.polivalencia.classe} 1` : ""}
            </p>
          </div>
          <Abas rotuloGrupo="Ficha" itens={itens} ativa={aba} aoEscolher={definirAba} />
          <div className={css.direita}>
            {estado.pendencia && <Etiqueta tom="destaque">Escolha pendente</Etiqueta>}
            <a href="#/combate-desktop" className={css.voltar}>
              Voltar ao combate
            </a>
          </div>
        </header>

        <main className={css.corpo}>
          {aba === "personagem" && (
            <div className={`${css.personagem} ${fichaCss.largo}`}>
              <div className={css.coluna}>
                <BlocoAtributos ficha={ficha} />
                <BlocoCalculados ficha={ficha} variante="central" />
              </div>
              <BlocoPericias />
              <div className={css.coluna}>
                <BlocoProgressao ficha={ficha} aoAbrirLoja={() => definirAba("prestigio")} />
                <BlocoHonra ficha={ficha} />
                <BlocoRedencao ficha={ficha} />
              </div>
            </div>
          )}
          {aba === "habilidades" && (
            <div className={css.colunasHabilidades}>
              <BlocoHabilidades ficha={ficha} />
            </div>
          )}
          {aba === "inventario" && (
            <div className={css.inventario}>
              <BlocoItens ficha={ficha} />
              <div className={css.coluna}>
                <BlocoCarga ficha={ficha} />
                <BlocoDinheiro ficha={ficha} />
              </div>
            </div>
          )}
          {aba === "notas" && (
            <div className={css.notas}>
              <BlocoNotas ficha={ficha} />
            </div>
          )}
          {aba === "prestigio" && estado.fase === "consagracao" && (
            <div className={css.prestigio}>
              <LojaPrestigio ficha={ficha} variante="central" larga />
            </div>
          )}
        </main>

        <AvisoNivel ficha={ficha} variante="central" />
      </div>
    </Moldura>
  );
}
