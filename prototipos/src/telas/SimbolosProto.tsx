import { Botao, Carregando, Cartao, Etiqueta, RolagemD20, SimboloD20, type DadosRolagem } from "@odm/estilo";
import { useState } from "react";
import css from "./SimbolosProto.module.css";

/* Correções antes da fase 6: os símbolos do 20 e do 1 naturais no d20 e o tambor centralizado. Dados fictícios. */

const ROLAGENS: { rotulo: string; rolagem: DadosRolagem; semTresD?: boolean }[] = [
  {
    rotulo: "Ataque com 20 natural (3D)",
    rolagem: {
      id: "a20",
      titulo: "Ataque — Revólver",
      dados: [20],
      escolhido: 0,
      modificadores: [{ rotulo: "Agilidade", valor: 3 }, { rotulo: "Proficiência", valor: 2 }],
      total: 25,
      alvo: { rotulo: "Defesa", valor: null },
      resultado: { texto: "Acerto crítico", bom: true },
      destaqueNatural: "alto",
      notaNatural: "20 natural",
    },
  },
  {
    rotulo: "Ataque com 1 natural (3D)",
    rolagem: {
      id: "a1",
      titulo: "Ataque — Revólver",
      dados: [1],
      escolhido: 0,
      modificadores: [{ rotulo: "Agilidade", valor: 3 }, { rotulo: "Proficiência", valor: 2 }],
      total: 6,
      alvo: { rotulo: "Defesa", valor: null },
      resultado: { texto: "Falha crítica", bom: false },
      destaqueNatural: "baixo",
      notaNatural: "Falha crítica",
    },
  },
  {
    rotulo: "Teste com 20 natural (plano)",
    semTresD: true,
    rolagem: {
      id: "t20",
      titulo: "Resistência de Fibra",
      dados: [20],
      escolhido: 0,
      modificadores: [{ rotulo: "Fibra", valor: 1 }],
      total: 21,
      alvo: { rotulo: "DT", valor: 15 },
      resultado: { texto: "Sucesso", bom: true },
      destaqueNatural: "alto",
      notaNatural: "20 natural",
    },
  },
  {
    rotulo: "Teste com 1 natural e vantagem (plano)",
    semTresD: true,
    rolagem: {
      id: "t1",
      titulo: "Percepção",
      dados: [1, 1],
      escolhido: 1,
      notaDados: "Vantagem: dois d20",
      modificadores: [{ rotulo: "Astúcia", valor: 2 }],
      total: 3,
      alvo: { rotulo: "DT", valor: 12 },
      resultado: { texto: "Falha", bom: false },
      destaqueNatural: "baixo",
      notaNatural: "1 natural",
    },
  },
];

export function SimbolosProto() {
  const [aberta, definirAberta] = useState<(typeof ROLAGENS)[number] | null>(null);
  return (
    <main className={`${css.pagina} odm-grao`}>
      <h1 className={css.titulo}>Símbolos do d20 e tambor</h1>
      <p className={css.apoio}>Desenho próprio, no estilo do ícone do app. Dados fictícios.</p>

      <Cartao titulo="Os dois desenhos">
        <div className={css.linha}>
          <figure className={css.figura}>
            <SimboloD20 simbolo="olho" className={css.grande} />
            <figcaption>20 natural: o olho com um X</figcaption>
          </figure>
          <figure className={css.figura}>
            <SimboloD20 simbolo="lapide" className={css.grande} />
            <figcaption>1 natural: a lápide</figcaption>
          </figure>
          <figure className={css.figura}>
            <span className={css.pequenos}>
              {[16, 24, 32, 48].map((t) => (
                <span key={t} style={{ fontSize: t }}>
                  <SimboloD20 simbolo="olho" />
                  <SimboloD20 simbolo="lapide" />
                </span>
              ))}
            </span>
            <figcaption>16, 24, 32 e 48 px</figcaption>
          </figure>
        </div>
        <div className={css.linha}>
          <Etiqueta tom="destaque">
            <SimboloD20 simbolo="olho" className={css.etiqueta} /> Acerto crítico
          </Etiqueta>
          <Etiqueta tom="perigo">
            <SimboloD20 simbolo="lapide" className={css.etiqueta} /> Falha crítica
          </Etiqueta>
        </div>
      </Cartao>

      <Cartao titulo="Rolar (dado 3D, dado plano e resultado)">
        <div className={css.botoes}>
          {ROLAGENS.map((r) => (
            <Botao key={r.rolagem.id} onClick={() => definirAberta(r)}>
              {r.rotulo}
            </Botao>
          ))}
        </div>
      </Cartao>

      <Cartao titulo="Tambor de carregamento">
        <div className={css.tambores}>
          <div className={css.caixaAlta}>
            <span className={css.legenda}>Coluna alta</span>
            <Carregando rotulo="Abrindo o Escudo" />
          </div>
          <div className={css.caixaBaixa}>
            <span className={css.legenda}>Cartão sem altura</span>
            <Carregando rotulo="Gerando o QR code" />
          </div>
        </div>
      </Cartao>

      {aberta && <RolagemD20 rolagem={aberta.rolagem} semTresD={aberta.semTresD} aoFechar={() => definirAberta(null)} />}
    </main>
  );
}
