import { Botao, CampoNumero, CampoTexto, Cartao, Etiqueta, PopUp, TextoDoLivro } from "@odm/estilo";
import { ATRIBUTOS, type Atributo, type Recuperacao } from "@odm/conteudo";
import type { FichaDados, Operacao, Personagem } from "@odm/protocolo";
import {
  atributosDaArma,
  habilidadesDaFicha,
  NOME_ATRIBUTO,
  pendenciasDeNivel,
  pontosDePrestigio,
  talentosDaFicha,
  type ContextoFicha,
  type FichaCalculada,
  type HabilidadeDaFicha,
  type OrigemDaHabilidade,
  type ValorContado,
} from "@odm/regras";
import { useState } from "react";
import { acoes, useLoja } from "../../conexao/loja";
import css from "./Ficha.module.css";

export const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export type Variante = "folha" | "central";

export type FichaVista = {
  personagem: Personagem;
  dados: FichaDados;
  calc: FichaCalculada;
  ctx: ContextoFicha;
  variante: Variante;
  operar: (op: Operacao) => void;
};

/* A conta de um valor, com o ajuste manual ao lado (especificação, 5.1). */
function JanelaConta({ titulo, campo, valor, ficha, aoFechar }: { titulo: string; campo: string; valor: ValorContado; ficha: FichaVista; aoFechar: () => void }) {
  const [ajuste, definirAjuste] = useState(valor.ajuste?.valor ?? 0);
  const mudou = ajuste !== (valor.ajuste?.valor ?? 0);
  return (
    <PopUp aberto titulo={titulo} subtitulo={`Total ${valor.valor}`} variante={ficha.variante} aoFechar={aoFechar}>
      <ul className={css.conta}>
        {valor.conta.map((p, i) => (
          <li key={`${p.rotulo}-${i}`} className={p.rotulo.startsWith("Ajuste manual") ? css.contaAjuste : undefined}>
            {sinal(p.valor)} {p.rotulo}
          </li>
        ))}
      </ul>
      <CampoNumero rotulo="Ajuste manual" valor={ajuste} minimo={-99} maximo={99} aoMudar={definirAjuste} />
      <Botao
        variante="primario"
        largo
        disabled={!mudou}
        onClick={() => {
          ficha.operar({ op: "ajuste", campo, ajuste: ajuste ? { valor: ajuste } : null });
          aoFechar();
        }}
      >
        Salvar ajuste
      </Botao>
    </PopUp>
  );
}

function BotaoValor({ rotulo, campo, valor, unidade, ficha }: { rotulo: string; campo: string; valor: ValorContado; unidade?: string; ficha: FichaVista }) {
  const [aberta, abrir] = useState(false);
  return (
    <>
      <button type="button" className={css.calculado} onClick={() => abrir(true)} aria-label={`${rotulo}: ver a conta`}>
        <span>{rotulo}</span>
        {valor.ajuste && <Etiqueta tom="destaque">Ajuste {sinal(valor.ajuste.valor)}</Etiqueta>}
        <span className={`${css.calculadoValor} odm-numero`}>
          {valor.valor}
          {unidade}
        </span>
      </button>
      {aberta && <JanelaConta titulo={rotulo} campo={campo} valor={valor} ficha={ficha} aoFechar={() => abrir(false)} />}
    </>
  );
}

export function BlocoAtributos({ ficha }: { ficha: FichaVista }) {
  const [aberto, abrir] = useState<Atributo | null>(null);
  return (
    <Cartao titulo="Atributos">
      <ul className={css.atributos}>
        {ATRIBUTOS.map((a) => (
          <li key={a}>
            <button type="button" className={css.atributo} onClick={() => abrir(a)} aria-label={`${NOME_ATRIBUTO[a]}: ver a conta`}>
              <span className={`${css.atributoValor} odm-numero`}>{sinal(ficha.calc.atributos[a].valor)}</span>
              <span className={css.atributoNome}>{NOME_ATRIBUTO[a]}</span>
            </button>
          </li>
        ))}
      </ul>
      {aberto && <JanelaConta titulo={NOME_ATRIBUTO[aberto]} campo={`atributo:${aberto}`} valor={ficha.calc.atributos[aberto]} ficha={ficha} aoFechar={() => abrir(null)} />}
    </Cartao>
  );
}

export function BlocoCalculados({ ficha }: { ficha: FichaVista }) {
  const { calc } = ficha;
  return (
    <Cartao titulo="Valores">
      <ul className={css.calculados}>
        <li>
          <BotaoValor rotulo="PV máximos" campo="pv_maximo" valor={calc.pvMaximo} ficha={ficha} />
        </li>
        <li>
          <BotaoValor rotulo="Defesa" campo="defesa" valor={calc.defesa} ficha={ficha} />
        </li>
        <li>
          <BotaoValor rotulo="RD" campo="rd" valor={calc.rd} ficha={ficha} />
        </li>
        <li>
          <BotaoValor rotulo="Deslocamento" campo="deslocamento" valor={calc.deslocamento} unidade=" m" ficha={ficha} />
        </li>
        <li>
          <BotaoValor rotulo="Percepção passiva" campo="percepcao_passiva" valor={calc.percepcaoPassiva} ficha={ficha} />
        </li>
        {calc.estresseMaximo && (
          <li>
            <BotaoValor rotulo="Estresse máximo" campo="estresse_maximo" valor={calc.estresseMaximo} ficha={ficha} />
          </li>
        )}
      </ul>
      <p className={css.nota}>
        Proficiência {sinal(calc.proficiencia)} · Dados de Vida {calc.dadoDeVida} · {calc.paPorTurno} PA por turno
      </p>
    </Cartao>
  );
}

export function BlocoPericias({ ficha }: { ficha: FichaVista }) {
  const [aberta, abrir] = useState<string | null>(null);
  const pericia = ficha.calc.pericias.find((p) => p.id === aberta);
  return (
    <Cartao titulo="Perícias" className={css.periciasCartao}>
      <ul className={css.pericias}>
        {ficha.calc.pericias.map((p) => (
          <li key={p.id}>
            <button type="button" className={css.pericia} onClick={() => abrir(p.id)} aria-label={`${p.nome}: ver a conta`}>
              <span className={`${css.treino} ${p.treinada ? css.treinada : ""}`} aria-label={p.treinada ? "Treinada" : undefined} />
              <span className={css.periciaNome}>{p.nome}</span>
              <span className={`${css.periciaAtributo} odm-rotulo`}>{NOME_ATRIBUTO[p.atributo].slice(0, 3)}</span>
              <span className={`${css.periciaValor} odm-numero`}>{sinal(p.total.valor)}</span>
            </button>
          </li>
        ))}
      </ul>
      {pericia && <JanelaConta titulo={pericia.nome} campo={`pericia:${pericia.id}`} valor={pericia.total} ficha={ficha} aoFechar={() => abrir(null)} />}
    </Cartao>
  );
}

const textoDeRecuperacao = (r: Recuperacao) => {
  const quando = r.quando === "descanso_curto" ? "descanso curto" : "descanso longo";
  if (r.quantidade === "todas") return `Todas no ${quando}`;
  if (r.quantidade === "metade_do_maximo") return `Metade no ${quando}`;
  return `${r.quantidade} no ${quando}`;
};

export function BlocoFichasDeClasse({ ficha }: { ficha: FichaVista }) {
  const lista = ficha.calc.fichasDeClasse;
  if (!lista.length) return null;
  return (
    <Cartao titulo="Fichas de classe">
      <ul className={css.lista}>
        {lista.map((r) => (
          <li key={r.id} className={css.linhaTexto}>
            <span>{r.nome}</span>
            <span className="odm-numero">Máximo {r.maximo.valor}</span>
            <span className={css.detalhe}>
              {r.recupera.length ? r.recupera.map(textoDeRecuperacao).join("; ") : "Ficam até serem gastas"}
              {r.dt ? ` · DT ${r.dt.valor}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

export function BlocoHonra({ ficha }: { ficha: FichaVista }) {
  const { honra } = ficha.dados;
  const faixas = ficha.ctx.faixasHonra;
  const faixa = faixas.find((f) => honra >= f.de && honra <= f.ate);
  return (
    <Cartao titulo="Honra" extra={<span className={css.resumo}>{faixa?.nome ?? honra}</span>}>
      <div className={css.honra} role="img" aria-label={`Honra ${honra} de 20${faixa ? `, ${faixa.nome}` : ""}`}>
        <div className={css.honraTrilho}>
          {faixas.map((f, i) => (
            <span key={f.nome} className={`${css.honraFaixa} ${css[`faixa${i}`]}`} style={{ flexGrow: f.ate - f.de + 1 }} />
          ))}
        </div>
        <span className={`${css.honraMarca} odm-numero`} style={{ left: `${(honra / 20) * 100}%` }}>
          {honra}
        </span>
      </div>
      <p className={css.nota}>O mestre ajusta a Honra.</p>
    </Cartao>
  );
}

export function BlocoRedencao({ ficha }: { ficha: FichaVista }) {
  const { passos, titulo } = ficha.dados.redencao;
  const feitos = passos.filter((p) => p.feito).length;
  const anterioresFeitos = passos.slice(0, -1).every((p) => p.feito);
  if (!titulo && passos.every((p) => !p.texto)) return null;
  return (
    <Cartao titulo="Redenção" extra={<span className={css.resumo}>{feitos} de 6</span>}>
      <p className={css.trilha}>{titulo}</p>
      <ol className={css.passos}>
        {passos.map((passo, i) => {
          const travado = i === passos.length - 1 && !anterioresFeitos;
          return (
            <li key={i}>
              <label className={`${css.passo} ${travado ? css.passoTravado : ""}`}>
                <input type="checkbox" checked={passo.feito} disabled={travado} onChange={() => ficha.operar({ op: "passo_redencao", indice: i, feito: !passo.feito })} />
                <span>{passo.texto || `Passo ${i + 1}`}</span>
              </label>
            </li>
          );
        })}
      </ol>
    </Cartao>
  );
}

export function BlocoProgressao({ ficha, aoEscolher, aoAbrirLoja }: { ficha: FichaVista; aoEscolher: () => void; aoAbrirLoja?: () => void }) {
  const { calc, dados, ctx } = ficha;
  const pendencias = pendenciasDeNivel(dados, ctx);
  const { saldo } = pontosDePrestigio(dados, ctx);
  const fracao = calc.xpProximo ? Math.min(1, dados.xp / calc.xpProximo) : 1;
  return (
    <Cartao titulo={calc.consagracao ? "Consagração" : "Escalada"} extra={<span className={css.resumo}>Nível {calc.nivel}</span>}>
      <div className={css.xpTrilho} aria-hidden="true">
        <div className={css.xp} style={{ transform: `scaleX(${fracao})` }} />
      </div>
      <p className={css.xpTexto}>
        <span className="odm-numero">
          {dados.xp.toLocaleString("pt-BR")}
          {calc.xpProximo ? ` / ${calc.xpProximo.toLocaleString("pt-BR")}` : ""} XP
        </span>
      </p>
      <p className={css.nota}>O XP vem do app e do mestre.</p>
      {pendencias.length > 0 && (
        <Botao largo className={css.botaoLoja} onClick={aoEscolher}>
          {pendencias.length === 1 ? "Falta 1 escolha" : `Faltam ${pendencias.length} escolhas`}
        </Botao>
      )}
      {calc.consagracao && aoAbrirLoja && (
        <Botao variante="primario" largo className={css.botaoLoja} onClick={aoAbrirLoja}>
          Loja de prestígio · {saldo} {saldo === 1 ? "ponto" : "pontos"}
        </Botao>
      )}
    </Cartao>
  );
}

const TITULO_GRUPO: Record<OrigemDaHabilidade, string> = {
  classe: "Classe",
  especializacao: "Especialização",
  tecnica: "Técnicas",
  origem: "Origem",
  talento: "Talentos",
  mestre: "Dadas pelo mestre",
};

function Habilidade({ h }: { h: Pick<HabilidadeDaFicha, "nome" | "texto" | "foraDoLivro"> }) {
  return (
    <details className={css.habilidade}>
      <summary className={css.linhaTexto}>
        <span>{h.nome}</span>
        {h.foraDoLivro && <Etiqueta tom="perigo">Não está mais no livro</Etiqueta>}
      </summary>
      <p className={css.habilidadeTexto}><TextoDoLivro texto={h.texto} /></p>
    </details>
  );
}

export function BlocoHabilidades({ ficha }: { ficha: FichaVista }) {
  const { dados, ctx } = ficha;
  const todas = habilidadesDaFicha(dados, ctx);
  const origem = dados.origemId ? ctx.origens.get(dados.origemId) : undefined;
  const talentos = talentosDaFicha(dados, ctx);
  const grupos = (["classe", "especializacao", "tecnica", "mestre"] as const).map((de) => ({ de, lista: todas.filter((h) => h.de === de) }));
  const proficiencias = dados.compras.flatMap((c) => (c.tipo === "proficiencia" ? [ctx.pericias.get(c.valor)?.exibir ?? c.valor] : []));
  return (
    <div className={css.grupos}>
      {origem && (
        <Cartao titulo={`Origem: ${origem.nome}`}>
          <p className={css.habilidadeTexto}><TextoDoLivro texto={origem.texto} /></p>
        </Cartao>
      )}
      {grupos
        .filter((g) => g.lista.length)
        .map(({ de, lista }) => (
          <Cartao key={de} titulo={de === "especializacao" && dados.especializacaoId ? (ctx.especializacoes.get(dados.especializacaoId)?.nome ?? TITULO_GRUPO[de]) : TITULO_GRUPO[de]}>
            <ul className={css.lista}>
              {lista.map((h) => (
                <li key={h.id}>
                  <Habilidade h={h} />
                </li>
              ))}
            </ul>
          </Cartao>
        ))}
      {(talentos.length > 0 || proficiencias.length > 0) && (
        <Cartao titulo="Talentos">
          <ul className={css.lista}>
            {talentos.map((t, i) => (
              <li key={`${t.id}-${i}`}>
                <Habilidade h={{ nome: t.atributo ? `${t.nome} (${NOME_ATRIBUTO[t.atributo]})` : t.nome, texto: t.texto, foraDoLivro: !ctx.talentos.has(t.id) }} />
              </li>
            ))}
            {proficiencias.map((p) => (
              <li key={p} className={css.linhaTexto}>
                <span>{p}</span>
                <span className={css.detalhe}>Proficiência</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}

export function BlocoCarga({ ficha }: { ficha: FichaVista }) {
  const { limite, atual, condicao } = ficha.calc.carga;
  const escala = limite.valor * 2.2;
  const excesso = condicao !== "normal";
  return (
    <Cartao
      titulo="Carga"
      extra={
        condicao === "imobilizado" ? (
          <Etiqueta tom="perigo">Imobilizado</Etiqueta>
        ) : condicao === "sobrecarregado" ? (
          <Etiqueta tom="perigo">Sobrecarregado</Etiqueta>
        ) : (
          <span className={css.resumo}>Sem restrições</span>
        )
      }
    >
      <p className={css.cargaValor}>
        <span className="odm-numero">
          {atual.toLocaleString("pt-BR")} / {limite.valor} kg
        </span>
      </p>
      <div className={css.cargaTrilho} aria-hidden="true">
        <div className={`${css.cargaBarra} ${excesso ? css.cargaExcesso : ""}`} style={{ transform: `scaleX(${Math.min(1, atual / escala)})` }} />
        <span className={css.cargaLimite} style={{ left: `${(limite.valor / escala) * 100}%` }} />
        <span className={css.cargaLimite} style={{ left: `${((limite.valor * 2) / escala) * 100}%` }} />
      </div>
    </Cartao>
  );
}

export function BlocoDinheiro({ ficha }: { ficha: FichaVista }) {
  const [valor, definirValor] = useState(0);
  return (
    <Cartao titulo="Dinheiro">
      <p className={`${css.dinheiro} odm-numero`}>R$ {ficha.dados.dinheiro.toLocaleString("pt-BR")}</p>
      <CampoTexto rotulo="Quantia (R$)" type="text" inputMode="numeric" pattern="[0-9]*" placeholder="0" value={valor || ""} onChange={(e) => definirValor(Math.min(1_000_000, Number(e.target.value.replace(/\D/g, "")) || 0))} />
      <div className={css.opcoesLado}>
        <Botao
          disabled={!valor}
          onClick={() => {
            ficha.operar({ op: "dinheiro", delta: valor });
            definirValor(0);
          }}
        >
          Receber
        </Botao>
        <Botao
          disabled={!valor}
          onClick={() => {
            ficha.operar({ op: "dinheiro", delta: -valor });
            definirValor(0);
          }}
        >
          Gastar
        </Botao>
      </div>
    </Cartao>
  );
}

/* Finesse: o jogador escolhe o atributo da arma (decisão de 07/11/2026). Sem escolha, vale o maior. */
function EscolhaDeAtributo({ item, ficha }: { item: FichaDados["inventario"][number]; ficha: FichaVista }) {
  const opcoes = item.itemId ? atributosDaArma({ nome: item.nome, mecanica: ficha.ctx.itens.get(item.itemId)?.mecanica }) : [];
  if (opcoes.length < 2) return null;
  return (
    <label className={css.itemAtributo}>
      <span className="odm-oculto">Atributo de {item.nome}</span>
      <select value={item.atributo ?? ""} onChange={(e) => ficha.operar({ op: "item_ajustar", itemFichaId: item.id, campo: "atributo", valor: e.target.value || null })}>
        <option value="">O maior</option>
        {opcoes.map((a) => (
          <option key={a} value={a}>
            {NOME_ATRIBUTO[a]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function BlocoItens({ ficha }: { ficha: FichaVista }) {
  const { inventario } = ficha.dados;
  return (
    <Cartao titulo="Itens">
      {inventario.length === 0 && <p className={css.nota}>Quem entrega os itens é o mestre.</p>}
      <ul className={css.lista}>
        {inventario.map((i) => (
          <li key={i.id} className={css.item}>
            <span className={css.itemNome}>
              {i.nome}
              {i.quantidade > 1 && <span className={css.detalhe}> ×{i.quantidade}</span>}
            </span>
            {i.equipado && <Etiqueta tom="destaque">Equipado</Etiqueta>}
            <EscolhaDeAtributo item={i} ficha={ficha} />
            <button type="button" className={css.itemUsar} onClick={() => ficha.operar({ op: "equipar", itemFichaId: i.id, equipado: !i.equipado })}>
              {i.equipado ? "Guardar" : "Equipar"}
            </button>
            <button type="button" className={css.itemUsar} onClick={() => ficha.operar({ op: "tirar_item", item: i })}>
              Tirar
            </button>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

export function BlocoNotas({ ficha }: { ficha: FichaVista }) {
  const [texto, definirTexto] = useState(ficha.dados.notas);
  return (
    <Cartao titulo="Notas">
      <textarea
        className={css.notas}
        aria-label="Notas do personagem"
        value={texto}
        onChange={(e) => definirTexto(e.target.value)}
        onBlur={() => {
          if (texto !== ficha.dados.notas) ficha.operar({ op: "notas", texto });
        }}
      />
    </Cartao>
  );
}

export function ListaDeDesfazer({ personagemId }: { personagemId: string }) {
  const eventos = useLoja((e) => e.eventos);
  const eu = useLoja((e) => e.eu);
  const desfeitos = new Set(eventos.flatMap((e) => (e.tipo === "ficha_desfeita" ? [e.dados.eventoId] : [])));
  const ultimo = [...eventos]
    .reverse()
    .find((e) => e.tipo === "ficha_alterada" && e.dados.personagemId === personagemId && !desfeitos.has(e.id) && (eu?.papel === "mestre" || e.autorId === eu?.id));
  if (ultimo?.tipo !== "ficha_alterada") return null;
  return (
    <Botao variante="fantasma" onClick={() => acoes.desfazerFicha(ultimo.id)}>
      Desfazer: {ultimo.dados.rotulo}
    </Botao>
  );
}
