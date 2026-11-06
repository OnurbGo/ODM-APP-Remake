import { Abas, Botao, Carregando, Cartao, Seletor, useTrocaDeTela, type TipoTransicao } from "@odm/estilo";
import { useEffect, useState } from "react";
import { useFicha } from "../estado/useFicha";
import type { Preferencias } from "../estado/usePreferencias";
import { Moldura } from "../moldura/Moldura";
import { PainelAparencia } from "../moldura/PainelAparencia";
import { BlocoAtributos, BlocoCarga, BlocoDinheiro, BlocoItens, BlocoProgressao } from "./ficha/BlocosFicha";
import css from "./TransicoesProto.module.css";

const TIPOS: { id: TipoTransicao; rotulo: string }[] = [
  { id: "jornal", rotulo: "Trocar de área" },
  { id: "portas", rotulo: "Entrar na mesa" },
  { id: "cartaz", rotulo: "Momento raro" },
  { id: "nenhuma", rotulo: "Abas da ficha" },
];

const ABAS = [
  { id: "transicoes", rotulo: "Transições" },
  { id: "carregando", rotulo: "Carregamento" },
  { id: "botoes", rotulo: "Botões" },
];

type Props = {
  preferencias: Preferencias;
  mudar: (parte: Partial<Preferencias>) => void;
};

export function TransicoesProto({ preferencias, mudar }: Props) {
  const [aba, definirAba] = useState("transicoes");
  const [tipo, definirTipo] = useState<TipoTransicao>("jornal");
  const [tela, definirTela] = useState<"personagem" | "inventario">("personagem");
  const { trocar, camada } = useTrocaDeTela();
  const ficha = useFicha("consagracao");

  const ir = (destino: "personagem" | "inventario") => {
    if (destino !== tela) trocar(tipo, () => definirTela(destino));
  };

  return (
    <Moldura
      desktop
      titulo="Transições e carregamento"
      painel={
        <>
          <PainelAparencia preferencias={preferencias} mudar={mudar} />
        </>
      }
    >
      <div className={`${css.pagina} odm-grao`}>
        <header className={css.topo}>
          <h1 className={css.titulo}>Olho da Morte</h1>
          <Abas rotuloGrupo="Áreas" itens={ABAS} ativa={aba} aoEscolher={definirAba} />
        </header>

        {aba === "transicoes" && (
          <main className={css.conteudo}>
            <Seletor rotulo="Transição" opcoes={TIPOS} valor={tipo} aoMudar={definirTipo} />
            <div className={css.navegacao}>
              <Botao variante={tela === "personagem" ? "primario" : "secundario"} largo onClick={() => ir("personagem")}>
                Personagem
              </Botao>
              <Botao variante={tela === "inventario" ? "primario" : "secundario"} largo onClick={() => ir("inventario")}>
                Inventário
              </Botao>
            </div>
            {tela === "personagem" ? (
              <div className={css.tela}>
                <BlocoProgressao ficha={ficha} />
                <BlocoAtributos ficha={ficha} />
              </div>
            ) : (
              <div className={css.tela}>
                <BlocoItens ficha={ficha} />
                <div className={css.pilha}>
                  <BlocoCarga ficha={ficha} />
                  <BlocoDinheiro ficha={ficha} />
                </div>
              </div>
            )}
          </main>
        )}

        {aba === "carregando" && (
          <main className={css.conteudo}>
            <Cartao titulo="Tambor de revólver">
              <div className={css.exibicao}>
                <Carregando tamanho={96} />
              </div>
              <div className={css.exemplos}>
                <Botao disabled>
                  <Carregando tamanho={20} decorativo />
                  Entrando na mesa
                </Botao>
                <p className={css.linha}>
                  <Carregando tamanho={28} decorativo />
                  Aguardando o mestre
                </p>
              </div>
            </Cartao>
          </main>
        )}

        {aba === "botoes" && (
          <main className={css.conteudo}>
            <Cartao titulo="Carimbo e brilho no foco">
              <div className={css.botoes}>
                <Botao variante="primario">Rolar</Botao>
                <Botao>Encerrar efeito</Botao>
                <Botao variante="perigo">Dano</Botao>
              </div>
            </Cartao>
            <p className={css.nota}>Clique e segure para ver a pressão. Use Tab para ver o brilho de ouro velho no foco.</p>
          </main>
        )}
      </div>
      <SemTransicao />
      {camada}
    </Moldura>
  );
}

/* Avisa no console do navegador sem API de transição, para o teste não enganar. */
function SemTransicao() {
  useEffect(() => {
    if (!document.startViewTransition) console.info("Este navegador não tem View Transitions: Jornal troca sem animação.");
  }, []);
  return null;
}
