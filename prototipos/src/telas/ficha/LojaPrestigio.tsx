import { Botao, Etiqueta, Icone, PopUp } from "@odm/estilo";
import { useState, type ReactNode } from "react";
import { ATRIBUTOS } from "../../dados/exemplo";
import {
  CLASSES_SECUNDARIAS,
  OPCOES_PROFICIENCIA,
  OPCOES_TALENTO,
  TECNICAS_AVANCADAS,
  TECNICAS_LENDARIAS,
} from "../../dados/ficha";
import type { Ficha } from "../../estado/useFicha";
import css from "./Ficha.module.css";

type Escolha = "avancada" | "lendaria" | "talento" | "polivalencia" | null;

const MAXIMO_ATRIBUTO = 5;

type Props = {
  ficha: Ficha;
  variante: "folha" | "central";
  larga?: boolean;
};

/* O motivo aparece no próprio botão: quem olha a loja nunca precisa adivinhar por que travou. */
function motivoSaldo(custo: number, saldo: number) {
  return saldo < custo ? `Custa ${custo}, você tem ${saldo}` : null;
}

export function LojaPrestigio({ ficha, variante, larga }: Props) {
  const { estado } = ficha;
  const [escolha, abrir] = useState<Escolha>(null);
  const { saldo, avancadas, polivalencia } = estado;

  const pedidoPendente = polivalencia.pedido;

  const opcoes: { id: string; nome: string; custo: number; texto: string; motivo: string | null; acao: () => void; rotulo?: string }[] = [
    {
      id: "avancada",
      nome: "Técnica Avançada",
      custo: 1,
      texto: "Habilidade de alto escalão da classe.",
      motivo: motivoSaldo(1, saldo),
      acao: () => abrir("avancada"),
    },
    {
      id: "lendaria",
      nome: "Técnica Lendária",
      custo: 2,
      texto: "Exige pelo menos uma Técnica Avançada comprada.",
      motivo: avancadas.length === 0 ? "Exige uma Técnica Avançada" : motivoSaldo(2, saldo),
      acao: () => abrir("lendaria"),
    },
    {
      id: "talento",
      nome: "Talento ou proficiência",
      custo: 1,
      texto: "Inclui Treinamento Pesado: +1 atributo, máximo 5.",
      motivo: motivoSaldo(1, saldo),
      acao: () => abrir("talento"),
    },
    {
      id: "vitalidade",
      nome: "Vitalidade Aprimorada",
      custo: 1,
      texto: estado.vitalidade ? `+5 PV máximos. Comprada ${estado.vitalidade}× até agora.` : "+5 PV máximos. Pode repetir.",
      motivo: motivoSaldo(1, saldo),
      acao: ficha.comprarVitalidade,
    },
    {
      id: "polivalencia",
      nome: "Nível em classe secundária",
      custo: 2,
      texto: polivalencia.classe ? `Polivalência: ${polivalencia.classe} 1.` : "Polivalência. O mestre aprova o pedido.",
      motivo: !polivalencia.ligada
        ? "Polivalência desligada na campanha"
        : pedidoPendente
          ? `Pedido de ${pedidoPendente} com o mestre`
          : motivoSaldo(2, saldo),
      acao: () => abrir("polivalencia"),
    },
  ];

  const compra = estado.compras.at(-1);

  return (
    <div className={`${css.loja} ${larga ? css.lojaLarga : ""}`}>
      <div className={css.saldo}>
        <span className={`${css.saldoValor} odm-numero`}>{saldo}</span>
        <span>
          <span className={`${css.saldoRotulo} odm-rotulo`}>{saldo === 1 ? "Ponto de Prestígio" : "Pontos de Prestígio"}</span>
          <span className={css.detalhe}>{estado.ganhos} ganhos no total, de 10</span>
        </span>
      </div>

      <ul className={css.opcoesLoja}>
        {opcoes.map((o) => (
          <li key={o.id} className={css.opcaoLoja}>
            <div className={css.opcaoTopo}>
              <h3 className={css.opcaoNome}>{o.nome}</h3>
              <span className={css.custo} aria-label={`Custa ${o.custo}`}>
                {Array.from({ length: o.custo }, (_, i) => (
                  <span key={i} className={css.custoPonto} />
                ))}
              </span>
            </div>
            <p className={css.detalhe}>{o.texto}</p>
            <Botao variante={o.motivo ? "secundario" : "primario"} largo disabled={!!o.motivo} onClick={o.acao}>
              {o.motivo ?? `Comprar · ${o.custo} ${o.custo === 1 ? "ponto" : "pontos"}`}
            </Botao>
          </li>
        ))}
      </ul>

      {estado.compras.length > 0 && (
        <div className={css.compras}>
          <h3 className={`${css.subtitulo} odm-rotulo`}>Compras</h3>
          <ul className={css.lista}>
            {estado.compras.map((c, i) => (
              <li key={`${c.texto}-${i}`} className={css.compra}>
                <span>{c.texto}</span>
                <span className={css.detalhe}>
                  {c.custo} {c.custo === 1 ? "ponto" : "pontos"}
                </span>
              </li>
            ))}
          </ul>
          {compra && (
            <Botao variante="fantasma" onClick={ficha.desfazerCompra}>
              <Icone nome="desfazer" tamanho={16} />
              Desfazer: {compra.texto}
            </Botao>
          )}
        </div>
      )}

      <Janela aberta={escolha === "avancada"} titulo="Técnica Avançada" variante={variante} aoFechar={() => abrir(null)}>
        <Lista
          itens={TECNICAS_AVANCADAS}
          compradas={avancadas}
          aoEscolher={(n) => {
            ficha.comprarAvancada(n);
            abrir(null);
          }}
        />
      </Janela>

      <Janela aberta={escolha === "lendaria"} titulo="Técnica Lendária" variante={variante} aoFechar={() => abrir(null)}>
        <Lista
          itens={TECNICAS_LENDARIAS}
          compradas={estado.lendarias}
          aoEscolher={(n) => {
            ficha.comprarLendaria(n);
            abrir(null);
          }}
        />
      </Janela>

      <Janela aberta={escolha === "talento"} titulo="Talento ou proficiência" variante={variante} aoFechar={() => abrir(null)}>
        <h3 className={`${css.subtitulo} odm-rotulo`}>Treinamento Pesado</h3>
        <ul className={css.gradeAtributos}>
          {ATRIBUTOS.map((a) => {
            const valor = estado.atributos[a];
            const noMaximo = valor >= MAXIMO_ATRIBUTO;
            return (
              <li key={a}>
                <Botao
                  largo
                  disabled={noMaximo}
                  onClick={() => {
                    ficha.comprarTreinamento(a);
                    abrir(null);
                  }}
                >
                  {noMaximo ? `${a}: máximo 5` : `${a} +1`}
                </Botao>
              </li>
            );
          })}
        </ul>
        <p className={css.nota}>Em Fibra, ganha também 1 PV máximo por nível de classe.</p>
        <h3 className={`${css.subtitulo} odm-rotulo`}>Talentos</h3>
        <Lista
          itens={OPCOES_TALENTO}
          compradas={estado.talentos}
          aoEscolher={(n) => {
            ficha.comprarTalento(n);
            abrir(null);
          }}
        />
        <h3 className={`${css.subtitulo} odm-rotulo`}>Proficiências</h3>
        <Lista
          itens={OPCOES_PROFICIENCIA}
          compradas={estado.proficiencias}
          aoEscolher={(n) => {
            ficha.comprarProficiencia(n);
            abrir(null);
          }}
        />
      </Janela>

      <Janela aberta={escolha === "polivalencia"} titulo="Classe secundária" subtitulo="Polivalência" variante={variante} aoFechar={() => abrir(null)}>
        <ul className={css.classes}>
          {CLASSES_SECUNDARIAS.map((c) => {
            const atende = c.requisitos.every((r) => r.ok);
            return (
              <li key={c.nome} className={css.classe}>
                <h3 className={css.opcaoNome}>{c.nome}</h3>
                <ul className={css.requisitos}>
                  {c.requisitos.map((r) => (
                    <li key={r.texto}>
                      <Etiqueta tom={r.ok ? "sucesso" : "perigo"}>{r.ok ? "Atende" : "Não atende"}</Etiqueta> {r.texto}
                    </li>
                  ))}
                </ul>
                <Botao
                  largo
                  disabled={!atende}
                  onClick={() => {
                    ficha.pedirPolivalencia(c.nome);
                    abrir(null);
                  }}
                >
                  {atende ? "Pedir ao mestre" : "Requisitos não atendidos"}
                </Botao>
              </li>
            );
          })}
        </ul>
        <p className={css.nota}>Sem PV, sem Dado de Vida, sem equipamento inicial e com 1 proficiência à escolha.</p>
      </Janela>
    </div>
  );
}

function Janela({
  aberta,
  titulo,
  subtitulo,
  variante,
  aoFechar,
  children,
}: {
  aberta: boolean;
  titulo: string;
  subtitulo?: string;
  variante: "folha" | "central";
  aoFechar: () => void;
  children: ReactNode;
}) {
  return (
    <PopUp aberto={aberta} titulo={titulo} subtitulo={subtitulo} variante={variante} aoFechar={aoFechar}>
      <div className={css.janela}>{children}</div>
    </PopUp>
  );
}

function Lista({ itens, compradas, aoEscolher }: { itens: string[]; compradas: string[]; aoEscolher: (nome: string) => void }) {
  return (
    <div className={css.opcoes}>
      {itens.map((n) => {
        const jaTem = compradas.includes(n);
        return (
          <Botao key={n} largo disabled={jaTem} onClick={() => aoEscolher(n)}>
            {jaTem ? `${n}: já comprada` : n}
          </Botao>
        );
      })}
    </div>
  );
}
