import { ATRIBUTOS, type Atributo } from "@odm/conteudo";
import { Botao, CampoTexto, Cartao, Etiqueta, PopUp } from "@odm/estilo";
import type { FichaDados, FichaRascunho, Personagem } from "@odm/protocolo";
import { calcularFicha, errosDaCriacao, NOME_ATRIBUTO, PASSOS_CRIACAO, vagasDeProficiencia, type ContextoFicha, type PassoCriacao } from "@odm/regras";
import { useEffect, useMemo, useRef, useState } from "react";
import { acoes, useLoja } from "../../conexao/loja";
import { useTelaLarga } from "../useLargura";
import css from "./Criacao.module.css";

const ROTULO_PASSO: Record<PassoCriacao, string> = {
  conceito: "Conceito",
  origem: "Origem",
  classe: "Classe",
  atributos: "Atributos",
  pericias: "Perícias",
  redencao: "Redenção",
  revisao: "Revisão",
};

/* Perguntas de "Saiba o básico de quem você vai interpretar" ficam no livro: aqui, só o espaço para anotar. */
function PassoConceito({ ficha, mudar }: { ficha: FichaDados; mudar: (p: FichaRascunho) => void }) {
  return (
    <div className={css.coluna}>
      <CampoTexto rotulo="Nome do personagem" value={ficha.nome} maxLength={120} onChange={(e) => mudar({ nome: e.target.value })} />
      <label className={css.campoLongo}>
        <span className="odm-rotulo">Quem é o personagem</span>
        <textarea value={ficha.conceito} maxLength={2000} onChange={(e) => mudar({ conceito: e.target.value })} />
      </label>
    </div>
  );
}

function ListaEscolha({ itens, valor, aoEscolher }: { itens: { id: string; nome: string; texto: string; aviso?: string }[]; valor: string | null; aoEscolher: (id: string) => void }) {
  return (
    <ul className={css.opcoes}>
      {itens.map((i) => (
        <li key={i.id} className={`${css.opcao} ${i.id === valor ? css.opcaoAtiva : ""}`}>
          <details open={i.id === valor}>
            <summary className={css.opcaoNome}>
              {i.nome}
              {i.id === valor && <Etiqueta tom="destaque">Escolhida</Etiqueta>}
              {i.aviso && <Etiqueta>{i.aviso}</Etiqueta>}
            </summary>
            <p className={css.texto}>{i.texto}</p>
            <Botao largo disabled={i.id === valor || !!i.aviso} onClick={() => aoEscolher(i.id)}>
              {i.aviso ?? "Escolher"}
            </Botao>
          </details>
        </li>
      ))}
    </ul>
  );
}

function PassoAtributos({ ficha, ctx, mudar }: { ficha: FichaDados; ctx: ContextoFicha; mudar: (p: FichaRascunho) => void }) {
  const valores = ctx.regras.atributos.valores;
  const usados = ATRIBUTOS.flatMap((a) => (ficha.atributos[a] !== undefined ? [ficha.atributos[a] as number] : []));
  const sobra = [...valores];
  for (const u of usados) {
    const i = sobra.indexOf(u);
    if (i >= 0) sobra.splice(i, 1);
  }
  const definir = (a: Atributo, bruto: string) => {
    const proximo = { ...ficha.atributos };
    if (bruto === "") delete proximo[a];
    else proximo[a] = Number(bruto);
    mudar({ atributos: proximo });
  };
  return (
    <div className={css.coluna}>
      <p className={css.texto}>Distribua os números, usando cada um uma vez. Sobram: {sobra.length ? sobra.join(", ") : "nenhum"}.</p>
      <ul className={css.atributos}>
        {ATRIBUTOS.map((a) => {
          const atual = ficha.atributos[a];
          const opcoes = [...new Set([...(atual !== undefined ? [atual] : []), ...sobra])].sort((x, y) => y - x);
          return (
            <li key={a} className={css.atributo}>
              <label htmlFor={`attr-${a}`}>{NOME_ATRIBUTO[a]}</label>
              <select id={`attr-${a}`} value={atual ?? ""} onChange={(e) => definir(a, e.target.value)}>
                <option value="">—</option>
                {opcoes.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function PassoPericias({ ficha, ctx, mudar }: { ficha: FichaDados; ctx: ContextoFicha; mudar: (p: FichaRascunho) => void }) {
  const vagas = vagasDeProficiencia(ficha, ctx);
  const origem = ficha.origemId ? ctx.origens.get(ficha.origemId) : undefined;
  if (!vagas) return <p className={css.texto}>Escolha a classe primeiro.</p>;
  const daOrigem = new Set(origem?.mecanica?.concede?.pericias ?? []);
  const pedidoBruto = origem?.mecanica?.concede?.escolher;
  const pedido = pedidoBruto && { ...pedidoBruto, de: pedidoBruto.de === "pericias" ? [...ctx.pericias.keys()] : pedidoBruto.de };
  const faltam = vagas.total - ficha.pericias.length - ficha.ferramentas.length;
  const alternar = (id: string) => mudar({ pericias: ficha.pericias.includes(id) ? ficha.pericias.filter((p) => p !== id) : [...ficha.pericias, id] });
  const alternarTroca = (id: string) => mudar({ trocas: ficha.trocas.includes(id) ? ficha.trocas.filter((t) => t !== id) : [...ficha.trocas, id] });
  return (
    <div className={css.coluna}>
      <p className={css.texto}>
        {faltam > 0 ? `Faltam ${faltam}` : faltam < 0 ? `Sobram ${-faltam}: tire alguma` : "Tudo escolhido"}
        {vagas.ferramentas ? ` (perícias e ferramentas somam ${vagas.total})` : ""}.
      </p>
      <ul className={css.grade}>
        {vagas.lista.map((id) => {
          const treinada = daOrigem.has(id);
          return (
            <li key={id}>
              <label className={css.marca}>
                <input type="checkbox" checked={treinada || ficha.pericias.includes(id)} disabled={treinada} onChange={() => alternar(id)} />
                <span>{ctx.pericias.get(id)?.exibir ?? id}</span>
                {treinada && <Etiqueta>Da origem</Etiqueta>}
              </label>
            </li>
          );
        })}
      </ul>
      {vagas.ferramentas > 0 && (
        <CampoTexto
          rotulo="Ferramentas, separadas por vírgula"
          value={ficha.ferramentas.join(", ")}
          onChange={(e) => mudar({ ferramentas: e.target.value.split(",").map((t) => t.trimStart()).filter((t, i, l) => t || i === l.length - 1) })}
        />
      )}
      {vagas.trocas.length > 0 && (
        <>
          <h3 className="odm-rotulo">Trocas</h3>
          {vagas.trocas.map((t) => (
            <label key={t.ganha} className={css.marca}>
              <input type="checkbox" checked={ficha.trocas.includes(t.ganha)} onChange={() => alternarTroca(t.ganha)} />
              <span>
                {t.ganha.replaceAll("_", " ")}: sacrifica {t.sacrifica.pericias_ou_ferramentas}
              </span>
            </label>
          ))}
        </>
      )}
      {pedido && (
        <>
          <h3 className="odm-rotulo">{pedido.rotulo}</h3>
          <ul className={css.grade}>
            {pedido.de.map((id) => (
              <li key={id}>
                <label className={css.marca}>
                  <input
                    type="checkbox"
                    checked={ficha.escolhasDaOrigem.includes(id)}
                    onChange={() => mudar({ escolhasDaOrigem: ficha.escolhasDaOrigem.includes(id) ? ficha.escolhasDaOrigem.filter((x) => x !== id) : [...ficha.escolhasDaOrigem, id] })}
                  />
                  <span>{ctx.pericias.get(id)?.exibir ?? id}</span>
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function PassoRedencao({ ficha, mudar }: { ficha: FichaDados; mudar: (p: FichaRascunho) => void }) {
  const { redencao } = ficha;
  const passo = (i: number, texto: string) => mudar({ redencao: { ...redencao, passos: redencao.passos.map((p, n) => (n === i ? { ...p, texto } : p)) } });
  return (
    <div className={css.coluna}>
      <p className={css.texto}>Opcional. Você pode combinar a trilha com o mestre e voltar a ela depois.</p>
      <CampoTexto rotulo="Nome da trilha" value={redencao.titulo} maxLength={120} onChange={(e) => mudar({ redencao: { ...redencao, titulo: e.target.value } })} />
      {redencao.passos.map((p, i) => (
        <CampoTexto key={i} rotulo={`Passo ${i + 1}`} value={p.texto} maxLength={400} onChange={(e) => passo(i, e.target.value)} />
      ))}
    </div>
  );
}

function PassoRevisao({ ficha, ctx }: { ficha: FichaDados; ctx: ContextoFicha }) {
  const calc = useMemo(() => calcularFicha(ficha, ctx), [ficha, ctx]);
  const erros = errosDaCriacao(ficha, ctx);
  const classe = ficha.classeId ? ctx.classes.get(ficha.classeId) : undefined;
  return (
    <div className={css.coluna}>
      {erros.length > 0 && (
        <ul className={css.erros}>
          {erros.map((e) => (
            <li key={e.mensagem}>{e.mensagem}</li>
          ))}
        </ul>
      )}
      <Cartao titulo={ficha.nome || "Sem nome"}>
        <p className={css.texto}>
          {classe?.nome ?? "Sem classe"} · {ficha.origemId ? ctx.origens.get(ficha.origemId)?.nome : "Sem origem"}
        </p>
        {classe?.mecanica && (
          <ul className={css.resumo}>
            <li>PV máximos: {calc.pvMaximo.valor}</li>
            <li>Defesa: {calc.defesa.valor}</li>
            <li>Deslocamento: {calc.deslocamento.valor} m</li>
            <li>Dado de Vida: {calc.dadoDeVida}</li>
            <li>Carga: {calc.carga.limite.valor} kg</li>
          </ul>
        )}
      </Cartao>
      <p className={css.texto}>Os itens iniciais vêm do mestre depois que você concluir.</p>
    </div>
  );
}

const ESPERA_SALVAR_MS = 500;

export function Criacao({ personagem, ctx, aoVoltar }: { personagem: Personagem; ctx: ContextoFicha; aoVoltar: () => void }) {
  const larga = useTelaLarga();
  const erro = useLoja((e) => e.erro);
  const [ficha, definirFicha] = useState(personagem.ficha);
  const [passo, definirPasso] = useState<PassoCriacao>("conceito");
  const [apagando, definirApagando] = useState(false);
  const pendente = useRef<FichaRascunho>({});
  const relogio = useRef<number | undefined>(undefined);

  const descarregar = () => {
    window.clearTimeout(relogio.current);
    if (Object.keys(pendente.current).length) acoes.salvarRascunho(personagem.id, pendente.current);
    pendente.current = {};
  };

  /* Salva sozinho: o rascunho sobrevive a uma tela bloqueada. */
  const mudar = (parte: FichaRascunho) => {
    definirFicha((f) => ({ ...f, ...parte }));
    pendente.current = { ...pendente.current, ...parte };
    window.clearTimeout(relogio.current);
    relogio.current = window.setTimeout(descarregar, ESPERA_SALVAR_MS);
  };

  useEffect(() => () => descarregar(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const indice = PASSOS_CRIACAO.indexOf(passo);
  const erros = errosDaCriacao(ficha, ctx);
  const comErro = new Set(erros.map((e) => e.passo));
  const origens = [...ctx.origens.values()].map((o) => ({ id: o.id, nome: o.nome, texto: o.texto }));
  const classes = [...ctx.classes.values()].map((c) => ({ id: c.id, nome: c.nome, texto: c.descricao, aviso: c.mecanica ? undefined : "Ainda sem revisão" }));

  return (
    <div className={`${css.tela} ${larga ? css.larga : ""} odm-grao`}>
      <header className={css.topo}>
        <button type="button" className={css.voltar} onClick={aoVoltar}>
          ← Salvar e voltar
        </button>
        <h1 className={css.titulo}>Novo personagem</h1>
      </header>
      {erro && (
        <p className={css.erro} role="alert">
          {erro}
          <Botao variante="fantasma" onClick={acoes.limparErro}>
            Fechar
          </Botao>
        </p>
      )}
      <nav aria-label="Passos da criação">
        <ol className={css.passos}>
          {PASSOS_CRIACAO.map((p, i) => (
            <li key={p}>
              <button type="button" className={`${css.passo} ${p === passo ? css.passoAtivo : ""}`} aria-current={p === passo ? "step" : undefined} onClick={() => definirPasso(p)}>
                <span className="odm-numero">{i + 1}</span> {ROTULO_PASSO[p]}
                {comErro.has(p) && i < indice && <span className={css.pontoErro} aria-label="Falta resolver" />}
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main className={css.corpo}>
        <h2 className={css.tituloPasso}>{ROTULO_PASSO[passo]}</h2>
        {passo === "conceito" && <PassoConceito ficha={ficha} mudar={mudar} />}
        {passo === "origem" && <ListaEscolha itens={origens} valor={ficha.origemId} aoEscolher={(origemId) => mudar({ origemId, escolhasDaOrigem: [] })} />}
        {passo === "classe" && <ListaEscolha itens={classes} valor={ficha.classeId} aoEscolher={(classeId) => mudar({ classeId, pericias: [], ferramentas: [], trocas: [] })} />}
        {passo === "atributos" && <PassoAtributos ficha={ficha} ctx={ctx} mudar={mudar} />}
        {passo === "pericias" && <PassoPericias ficha={ficha} ctx={ctx} mudar={mudar} />}
        {passo === "redencao" && <PassoRedencao ficha={ficha} mudar={mudar} />}
        {passo === "revisao" && <PassoRevisao ficha={ficha} ctx={ctx} />}
      </main>

      <footer className={css.rodape}>
        <Botao variante="fantasma" onClick={() => definirApagando(true)}>
          Apagar rascunho
        </Botao>
        <span className={css.espaco} />
        {indice > 0 && <Botao onClick={() => definirPasso(PASSOS_CRIACAO[indice - 1]!)}>Anterior</Botao>}
        {passo !== "revisao" ? (
          <Botao variante="primario" onClick={() => definirPasso(PASSOS_CRIACAO[indice + 1]!)}>
            Próximo
          </Botao>
        ) : (
          <Botao
            variante="primario"
            disabled={erros.length > 0}
            onClick={() => {
              descarregar();
              acoes.concluirPersonagem(personagem.id);
            }}
          >
            Concluir personagem
          </Botao>
        )}
      </footer>

      <PopUp aberto={apagando} titulo="Apagar este rascunho?" subtitulo="Não dá para desfazer." variante="central" aoFechar={() => definirApagando(false)}>
        <div className={css.confirmar}>
          <Botao onClick={() => definirApagando(false)}>Cancelar</Botao>
          <Botao
            variante="perigo"
            onClick={() => {
              window.clearTimeout(relogio.current);
              pendente.current = {};
              acoes.apagarPersonagem(personagem.id);
              aoVoltar();
            }}
          >
            Apagar
          </Botao>
        </div>
      </PopUp>
    </div>
  );
}
