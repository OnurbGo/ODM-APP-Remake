import { ATRIBUTOS, type Atributo } from "@odm/conteudo";
import { Botao, PopUp, TextoDoLivro } from "@odm/estilo";
import type { CompraPrestigio } from "@odm/protocolo";
import {
  atributosDaFicha,
  motivoDoAtributo,
  NOME_ATRIBUTO,
  opcoesDaLoja,
  opcoesDoTalento,
  pedeAtributo,
  pontosDePrestigio,
  proficienciasDaFicha,
  talentosDaLoja,
  tecnicasDaLoja,
  type AlvoLoja,
  type IdOpcaoLoja,
} from "@odm/regras";
import { useState, type ReactNode } from "react";
import { ListaDeDesfazer, type FichaVista } from "./Blocos";
import css from "./Ficha.module.css";

const TEXTO_OPCAO: Record<IdOpcaoLoja, { nome: string; texto: string }> = {
  tecnica_avancada: { nome: "Técnica Avançada", texto: "Habilidade de alto escalão da classe." },
  tecnica_lendaria: { nome: "Técnica Lendária", texto: "Exige pelo menos uma Técnica Avançada comprada." },
  talento_ou_proficiencia: { nome: "Talento ou proficiência", texto: "Inclui Treinamento Pesado: +1 atributo, máximo 5." },
  vitalidade_aprimorada: { nome: "Vitalidade Aprimorada", texto: "+5 PV máximos. Pode repetir." },
  polivalencia: { nome: "Nível em classe secundária", texto: "Polivalência. O mestre aprova o pedido." },
};

/* O servidor troca este id pelo definitivo. */
const ID_PROVISORIO = "novo";

function Janela({ titulo, variante, aoFechar, children }: { titulo: string; variante: FichaVista["variante"]; aoFechar: () => void; children: ReactNode }) {
  return (
    <PopUp aberto titulo={titulo} variante={variante} aoFechar={aoFechar}>
      <div className={css.janela}>{children}</div>
    </PopUp>
  );
}

function ListaAlvos({ alvos, aoEscolher }: { alvos: AlvoLoja[]; aoEscolher: (alvo: AlvoLoja) => void }) {
  return (
    <div className={css.opcoes}>
      {alvos.map((a) => (
        <details key={a.id} className={css.habilidade}>
          <summary className={css.linhaTexto}>{a.nome}</summary>
          <p className={css.habilidadeTexto}><TextoDoLivro texto={a.texto} /></p>
          <Botao largo disabled={!!a.motivo} onClick={() => aoEscolher(a)}>
            {a.motivo ?? "Comprar"}
          </Botao>
        </details>
      ))}
    </div>
  );
}

export function EscolherAtributo({ ficha, talentoId, aoEscolher }: { ficha: FichaVista; talentoId: string; aoEscolher: (a: Atributo) => void }) {
  const regra = ficha.ctx.talentos.get(talentoId)?.mecanica?.concede?.atributo_a_escolha;
  const atuais = atributosDaFicha(ficha.dados, ficha.ctx);
  return (
    <ul className={css.gradeAtributos}>
      {ATRIBUTOS.map((a) => {
        const motivo = motivoDoAtributo(ficha.dados, talentoId, a, ficha.ctx);
        return (
          <li key={a}>
            <Botao largo disabled={!!motivo} onClick={() => aoEscolher(a)}>
              {motivo ? `${NOME_ATRIBUTO[a]}: ${motivo}` : regra ? `${NOME_ATRIBUTO[a]} (${atuais[a].valor}) +${regra.pontos}` : NOME_ATRIBUTO[a]}
            </Botao>
          </li>
        );
      })}
    </ul>
  );
}

/* Perícias ou proficiências que o talento pede. */
export function EscolherOpcoes({ ficha, talentoId, aoEscolher }: { ficha: FichaVista; talentoId: string; aoEscolher: (ids: string[]) => void }) {
  const pedido = opcoesDoTalento(talentoId, ficha.ctx);
  const [marcadas, marcar] = useState<string[]>([]);
  if (!pedido) return null;
  const alternar = (id: string) => marcar((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  return (
    <div className={css.opcoes}>
      <p className={css.nota}>{pedido.rotulo}: escolha {pedido.quantidade}.</p>
      {pedido.opcoes.map((id) => (
        <label key={id} className={css.passo}>
          <input type="checkbox" checked={marcadas.includes(id)} disabled={!marcadas.includes(id) && marcadas.length >= pedido.quantidade} onChange={() => alternar(id)} />
          <span>{ficha.ctx.pericias.get(id)?.exibir ?? id.replaceAll("_", " ")}</span>
        </label>
      ))}
      <Botao variante="primario" largo disabled={marcadas.length !== pedido.quantidade} onClick={() => aoEscolher(marcadas)}>
        Confirmar
      </Botao>
    </div>
  );
}

export function LojaPrestigio({ ficha, larga }: { ficha: FichaVista; larga?: boolean }) {
  const { dados, ctx, variante } = ficha;
  const [escolha, abrir] = useState<IdOpcaoLoja | null>(null);
  const [talento, definirTalento] = useState<string | null>(null);
  const { saldo, ganhos, totalPossivel } = pontosDePrestigio(dados, ctx);
  const opcoes = opcoesDaLoja(dados, ctx);

  const fechar = () => {
    abrir(null);
    definirTalento(null);
  };
  const comprar = (compra: CompraPrestigio) => {
    ficha.operar({ op: "comprar", compra });
    fechar();
  };
  const aoEscolherOpcao = (id: IdOpcaoLoja) => {
    if (id === "vitalidade_aprimorada") comprar({ id: ID_PROVISORIO, tipo: id });
    else abrir(id);
  };

  const proficiencias = proficienciasDaFicha(dados, ctx);
  const periciasNovas = [...ctx.pericias.values()].filter((p) => !proficiencias.pericias.has(p.id));
  const categoriasNovas = ctx.regras.categorias.categorias.filter((c) => !proficiencias.categorias.has(c.id));

  return (
    <div className={`${css.loja} ${larga ? css.lojaLarga : ""}`}>
      <div className={css.saldo}>
        <span className={`${css.saldoValor} odm-numero`}>{saldo}</span>
        <span>
          <span className={`${css.saldoRotulo} odm-rotulo`}>{saldo === 1 ? "Ponto de Prestígio" : "Pontos de Prestígio"}</span>
          <span className={css.detalhe}>
            {ganhos} ganhos no total, de {totalPossivel}
          </span>
        </span>
      </div>

      <ul className={css.opcoesLoja}>
        {opcoes.map((o) => (
          <li key={o.id} className={css.opcaoLoja}>
            <div className={css.opcaoTopo}>
              <h3 className={css.opcaoNome}>{TEXTO_OPCAO[o.id].nome}</h3>
              <span className={css.custo} aria-label={`Custa ${o.custo}`}>
                {Array.from({ length: o.custo }, (_, i) => (
                  <span key={i} className={css.custoPonto} />
                ))}
              </span>
            </div>
            <p className={css.detalhe}>{TEXTO_OPCAO[o.id].texto}</p>
            <Botao variante={o.motivo ? "secundario" : "primario"} largo disabled={!!o.motivo} onClick={() => aoEscolherOpcao(o.id)}>
              {o.motivo ?? `Comprar · ${o.custo} ${o.custo === 1 ? "ponto" : "pontos"}`}
            </Botao>
          </li>
        ))}
      </ul>

      <ListaDeDesfazer personagemId={ficha.personagem.id} />

      {escolha === "tecnica_avancada" && (
        <Janela titulo="Técnica Avançada" variante={variante} aoFechar={fechar}>
          <ListaAlvos alvos={tecnicasDaLoja(dados, ctx, "avancada")} aoEscolher={(a) => comprar({ id: ID_PROVISORIO, tipo: "tecnica_avancada", habilidadeId: a.id })} />
        </Janela>
      )}

      {escolha === "tecnica_lendaria" && (
        <Janela titulo="Técnica Lendária" variante={variante} aoFechar={fechar}>
          <ListaAlvos alvos={tecnicasDaLoja(dados, ctx, "lendaria")} aoEscolher={(a) => comprar({ id: ID_PROVISORIO, tipo: "tecnica_lendaria", habilidadeId: a.id })} />
        </Janela>
      )}

      {escolha === "talento_ou_proficiencia" && !talento && (
        <Janela titulo="Talento ou proficiência" variante={variante} aoFechar={fechar}>
          <h3 className={`${css.subtitulo} odm-rotulo`}>Talentos</h3>
          <ListaAlvos
            alvos={talentosDaLoja(dados, ctx)}
            aoEscolher={(a) => {
              if (pedeAtributo(a.id, ctx) || opcoesDoTalento(a.id, ctx)) definirTalento(a.id);
              else comprar({ id: ID_PROVISORIO, tipo: "talento", talentoId: a.id });
            }}
          />
          <h3 className={`${css.subtitulo} odm-rotulo`}>Perícias</h3>
          <div className={css.opcoes}>
            {periciasNovas.map((p) => (
              <Botao key={p.id} largo onClick={() => comprar({ id: ID_PROVISORIO, tipo: "proficiencia", genero: "pericia", valor: p.id })}>
                {p.exibir}
              </Botao>
            ))}
          </div>
          <h3 className={`${css.subtitulo} odm-rotulo`}>Armas e armaduras</h3>
          <div className={css.opcoes}>
            {categoriasNovas.map((c) => (
              <Botao key={c.id} largo onClick={() => comprar({ id: ID_PROVISORIO, tipo: "proficiencia", genero: "categoria", valor: c.id })}>
                {c.id.replaceAll("_", " ")}
              </Botao>
            ))}
          </div>
        </Janela>
      )}

      {talento && (
        <Janela titulo={pedeAtributo(talento, ctx) ? "Escolha o atributo" : "Escolha"} variante={variante} aoFechar={fechar}>
          {pedeAtributo(talento, ctx) ? (
            <EscolherAtributo ficha={ficha} talentoId={talento} aoEscolher={(atributo) => comprar({ id: ID_PROVISORIO, tipo: "talento", talentoId: talento, atributo })} />
          ) : (
            <EscolherOpcoes ficha={ficha} talentoId={talento} aoEscolher={(escolhas) => comprar({ id: ID_PROVISORIO, tipo: "talento", talentoId: talento, escolhas })} />
          )}
        </Janela>
      )}
    </div>
  );
}
