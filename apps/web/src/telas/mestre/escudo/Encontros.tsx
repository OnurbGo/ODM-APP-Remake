import type { Ameaca, Criatura } from "@odm/conteudo";
import { Botao, CampoNumero, Cartao, Dica, Etiqueta, PopUp } from "@odm/estilo";
import type { Cadastro, EstadoCombate } from "@odm/protocolo";
import { avaliarEncontro, ehLendaria, lerRegrasEncontro, nivelDoXp, ROTULO_GRAU, xpDaCriatura, type ContextoFicha, type GrauEncontro, type OrigemDoXp, type RegrasEncontro } from "@odm/regras";
import { useEffect, useMemo, useState } from "react";
import { salvos, type LinhaEmUso } from "../../../conexao/armazenamento";
import type { ConteudoMestre } from "../../../conexao/conteudoMestre";
import { acoes, useLoja } from "../../../conexao/loja";
import { Sinal } from "../../combate/comum";
import comum from "../../combate/Comum.module.css";
import { Divisao, partesFinais, type DivisaoEscolhida } from "../Divisao";
import css from "./Encontros.module.css";
import { gruposDoCombate, type Grupo } from "./fimDoCombate";
import { paraBusca } from "../../busca";

/* Montando encontros e XP no fim do combate (fase 6, etapa 7; Mestre, "Recompensas e Encontros").
   A conta é do motor de regras; aqui só a tela. */

type Ficha = Criatura | Ameaca;
type Linha = LinhaEmUso;

const TOM_GRAU: Record<GrauEncontro, "neutro" | "sucesso" | "destaque" | "perigo"> = {
  abaixo_de_facil: "neutro",
  facil: "sucesso",
  moderada: "destaque",
  dificil: "perigo",
  morte_certa: "perigo",
};

const ORIGEM: Record<OrigemDoXp, string> = {
  ficha: "XP da ficha",
  nd: "XP do ND na tabela",
  nd_elite: "XP do ND da Elite",
  mestre: "XP ajustado por você",
  sem_xp: "Ficha sem XP nem ND",
};

const fmt = (n: number) => n.toLocaleString("pt-BR");

function useRegrasEncontro(conteudo: ConteudoMestre) {
  return useMemo(() => lerRegrasEncontro(conteudo), [conteudo]);
}

/* XP como número digitado: vazio volta ao da ficha. */
function CampoXp({ rotulo, valor, padrao, aoMudar }: { rotulo: string; valor: number | null; padrao: number | null; aoMudar: (v: number | null) => void }) {
  return (
    <label className={css.campoXp}>
      <span className="odm-rotulo">XP</span>
      <input
        type="number"
        inputMode="numeric"
        min={0}
        aria-label={rotulo}
        value={valor ?? ""}
        placeholder={padrao === null ? "?" : String(padrao)}
        onChange={(e) => {
          const n = e.target.value === "" ? null : Math.max(0, Math.floor(Number(e.target.value)));
          aoMudar(n === null || Number.isNaN(n) ? null : n);
        }}
      />
    </label>
  );
}

/* ---------- Pistas das lendárias ---------- */

function PistasDaLendaria({ ficha, cadastro, recomendadas }: { ficha: Ficha; cadastro: Extract<Cadastro, { tipo: "lendaria" }> | undefined; recomendadas: number }) {
  const [texto, definirTexto] = useState("");
  const [de, definirDe] = useState("");
  const pistas = cadastro?.dados.pistas ?? [];
  const salvar = (lista: typeof pistas) => acoes.salvarCadastro({ id: cadastro?.id, tipo: "lendaria", dados: { ref: ficha.id, pistas: lista } });
  return (
    <details className={css.pistas}>
      <summary>
        Pistas sobre {ficha.nome}{" "}
        <Etiqueta tom={pistas.length >= recomendadas ? "sucesso" : "neutro"}>
          {pistas.length} de {recomendadas}
        </Etiqueta>
      </summary>
      <p className={comum.vazio}>
        O recomendado é enfrentar a lendária depois de {recomendadas} pistas, obtidas por caminhos diferentes. Não é obrigatório.
      </p>
      {pistas.length > 0 && (
        <ol className={css.listaPistas}>
          {pistas.map((p, i) => (
            <li key={i}>
              <span>
                {p.texto}
                {p.de && <span className={comum.vazio}> · {p.de}</span>}
              </span>
              <Botao variante="fantasma" aria-label={`Tirar a pista ${i + 1}`} onClick={() => salvar(pistas.filter((_, j) => j !== i))}>
                Tirar
              </Botao>
            </li>
          ))}
        </ol>
      )}
      <div className={css.novaPista}>
        <input type="text" value={texto} maxLength={500} placeholder="O que o grupo descobriu" aria-label="Pista" onChange={(e) => definirTexto(e.target.value)} />
        <input type="text" value={de} maxLength={120} placeholder="De onde (NPC, local, investigação)" aria-label="De onde veio a pista" onChange={(e) => definirDe(e.target.value)} />
        <Botao
          disabled={!texto.trim()}
          onClick={() => {
            salvar([...pistas, { texto: texto.trim(), de: de.trim() }]);
            definirTexto("");
            definirDe("");
          }}
        >
          Anotar pista
        </Botao>
      </div>
    </details>
  );
}

/* ---------- Montador ---------- */

/* O rascunho sobrevive a ir para a aba Mesa e voltar (não a recarregar a página). */
let rascunho: { linhas: Linha[]; nome: string; salvoId: string | null; mesaId: string | null } = { linhas: [], nome: "", salvoId: null, mesaId: null };

export function MontarEncontro({ conteudo, ctxFicha }: { conteudo: ConteudoMestre; ctxFicha: ContextoFicha | null }) {
  const todos = useLoja((e) => e.personagens);
  const cadastros = useLoja((e) => e.cadastros);
  const mesaId = useLoja((e) => e.mesa?.id ?? null);
  const personagens = useMemo(() => todos.filter((p) => p.situacao === "ativo"), [todos]);
  const regras = useRegrasEncontro(conteudo);
  /* Guarda quem o mestre tirou: personagem novo entra marcado, mesmo com o Escudo já aberto. */
  const [fora, definirFora] = useState<string[]>([]);
  const [busca, definirBusca] = useState("");
  const doRascunho = rascunho.mesaId === mesaId ? rascunho : null;
  const [linhas, definirLinhas] = useState<Linha[]>(doRascunho?.linhas ?? []);
  const [nome, definirNome] = useState(doRascunho?.nome ?? "");
  const [salvoId, definirSalvoId] = useState<string | null>(doRascunho?.salvoId ?? null);
  useEffect(() => {
    rascunho = { linhas, nome, salvoId, mesaId };
  }, [linhas, nome, salvoId, mesaId]);
  const [apagando, definirApagando] = useState<string | null>(null);
  /* Encontro novo: o id vem do servidor. Guarda os que já existiam para achar o que chegou. */
  const [antes, definirAntes] = useState<ReadonlySet<string> | null>(null);

  const fichas = useMemo(() => new Map<string, Ficha>([...conteudo.criaturas, ...conteudo.ameacas].map((f) => [f.id, f])), [conteudo]);
  const encontros = cadastros.filter((c): c is Extract<Cadastro, { tipo: "encontro" }> => c.tipo === "encontro");
  const lendarias = cadastros.filter((c): c is Extract<Cadastro, { tipo: "lendaria" }> => c.tipo === "lendaria");
  const escolhidos = personagens.filter((p) => !fora.includes(p.id));
  const niveis = ctxFicha ? escolhidos.map((p) => nivelDoXp(p.ficha.xp, ctxFicha.regras)) : [];
  const termo = paraBusca(busca);
  const achadas = termo ? [...fichas.values()].filter((f) => paraBusca(f.nome).includes(termo)).slice(0, 8) : [];

  const xpDe = (l: Linha) => {
    const f = fichas.get(l.ref);
    return f ? xpDaCriatura(f, l.elite, regras, l.xp) : { xp: l.xp, origem: (l.xp === null ? "sem_xp" : "mestre") as OrigemDoXp };
  };
  const avaliacao = avaliarEncontro(
    linhas.map((l) => {
      const f = fichas.get(l.ref);
      return { nome: f?.nome ?? l.ref, quantidade: l.quantidade, xp: xpDe(l).xp, lendaria: f ? ehLendaria(f) : false };
    }),
    niveis,
    regras,
  );
  const recomendadas = regras.lidas.lendarias?.pistas_recomendadas ?? 3;
  const novo = antes ? encontros.find((e) => !antes.has(e.id)) : undefined;
  useEffect(() => {
    if (!novo) return;
    definirSalvoId(novo.id);
    definirAntes(null);
  }, [novo]);

  const alternar = (id: string) => definirFora((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  const mudar = (i: number, parte: Partial<Linha>) => definirLinhas((l) => l.map((p, j) => (j === i ? { ...p, ...parte } : p)));
  const carregar = (c: Extract<Cadastro, { tipo: "encontro" }>) => {
    definirLinhas(c.dados.criaturas.map((x) => ({ ref: x.ref, quantidade: x.quantidade, elite: x.elite, xp: x.xp })));
    definirNome(c.dados.nome);
    definirSalvoId(c.id);
  };
  const salvar = () => {
    const anterior = encontros.find((e) => e.id === salvoId);
    if (!salvoId) definirAntes(new Set(encontros.map((e) => e.id)));
    acoes.salvarCadastro({
      id: salvoId ?? undefined,
      tipo: "encontro",
      dados: { nome: nome.trim(), criaturas: linhas, notas: anterior?.dados.notas ?? "", missaoId: anterior?.dados.missaoId ?? null },
    });
  };
  const limpar = () => {
    definirLinhas([]);
    definirNome("");
    definirSalvoId(null);
  };

  return (
    <div className={css.coluna}>
      {encontros.length > 0 && (
        <Cartao titulo="Encontros salvos">
          <ul className={css.lista}>
            {encontros.map((c) => (
              <li key={c.id} className={comum.linhaFicha}>
                <span>
                  {c.dados.nome} <span className={comum.vazio}>· {c.dados.criaturas.reduce((s, x) => s + x.quantidade, 0)} criatura(s)</span>{" "}
                  {c.id === salvoId && <Etiqueta tom="destaque">Aberto</Etiqueta>}
                </span>
                <span className={css.botoes}>
                  <Botao variante="fantasma" onClick={() => carregar(c)}>
                    Abrir
                  </Botao>
                  {apagando === c.id ? (
                    <Botao
                      variante="perigo"
                      onClick={() => {
                        acoes.apagarCadastro(c.id);
                        definirApagando(null);
                        if (salvoId === c.id) definirSalvoId(null);
                      }}
                    >
                      Confirmar
                    </Botao>
                  ) : (
                    <Botao variante="fantasma" onClick={() => definirApagando(c.id)}>
                      Apagar
                    </Botao>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
      <Cartao titulo="Novo combate">
        <fieldset className={comum.semCombate}>
          <legend className="odm-rotulo">Personagens</legend>
          {personagens.length === 0 && <p className={comum.vazio}>Nenhum personagem pronto nesta campanha.</p>}
          {personagens.map((p) => (
            <label key={p.id} className={comum.linhaFicha}>
              <span>
                <input type="checkbox" checked={!fora.includes(p.id)} onChange={() => alternar(p.id)} /> {p.ficha.nome || "Sem nome"}
              </span>
              {ctxFicha && <span className={comum.vazio}>nível {nivelDoXp(p.ficha.xp, ctxFicha.regras)}</span>}
            </label>
          ))}
        </fieldset>
        <label className={comum.campo}>
          <span className="odm-rotulo">Bestiário</span>
          <input type="search" value={busca} placeholder="Buscar criatura ou ameaça" onChange={(e) => definirBusca(e.target.value)} />
        </label>
        <ul className={css.lista}>
          {achadas.map((f) => {
            const xp = xpDaCriatura(f, false, regras).xp;
            return (
              <li key={f.id} className={comum.linhaFicha}>
                <span>
                  <Sinal tipo={f.tipo === "ameaca" ? "npc" : "criatura"} /> {f.nome} {f.nd && <Etiqueta>ND {f.nd}</Etiqueta>} {ehLendaria(f) && <Etiqueta tom="tecnica">Lendária</Etiqueta>}
                  {xp !== null && <span className={comum.vazio}> · {fmt(xp)} XP</span>}
                </span>
                <Botao
                  variante="fantasma"
                  onClick={() => {
                    definirLinhas((l) => [...l, { ref: f.id, quantidade: 1, elite: false, xp: null }]);
                    definirBusca("");
                  }}
                >
                  Adicionar
                </Botao>
              </li>
            );
          })}
        </ul>
        {linhas.length > 0 && (
          <ul className={css.linhas}>
            {linhas.map((l, i) => {
              const f = fichas.get(l.ref);
              const nomeDaFicha = f?.nome ?? l.ref;
              const { xp, origem } = xpDe(l);
              const padrao = f ? xpDaCriatura(f, l.elite, regras).xp : null;
              const lendaria = f ? ehLendaria(f) : false;
              return (
                <li key={`${l.ref}-${i}`} className={css.linha}>
                  <div className={css.linhaTopo}>
                    <span className={css.nomeLinha}>
                      {nomeDaFicha} {f?.nd && <Etiqueta>ND {l.elite && f.ndElite ? f.ndElite : f.nd}</Etiqueta>} {lendaria && <Etiqueta tom="tecnica">Lendária: fora da conta</Etiqueta>}
                    </span>
                    <Botao variante="fantasma" onClick={() => definirLinhas((x) => x.filter((_, j) => j !== i))}>
                      Tirar
                    </Botao>
                  </div>
                  <div className={css.controles}>
                    <CampoNumero rotulo={`Quantidade de ${nomeDaFicha}`} rotuloOculto semSinal valor={l.quantidade} minimo={1} maximo={20} aoMudar={(q) => mudar(i, { quantidade: q })} />
                    <label className={css.elite}>
                      <input type="checkbox" checked={l.elite} onChange={() => mudar(i, { elite: !l.elite })} /> Elite
                    </label>
                    <CampoXp rotulo={`XP de cada ${nomeDaFicha}`} valor={l.xp} padrao={padrao} aoMudar={(v) => mudar(i, { xp: v })} />
                    <span className={comum.vazio}>
                      {xp === null ? "sem XP" : `${l.quantidade} × ${fmt(xp)} = ${fmt(xp * l.quantidade)}`} · {ORIGEM[origem]}
                    </span>
                  </div>
                  {lendaria && f && <PistasDaLendaria ficha={f} cadastro={lendarias.find((c) => c.dados.ref === f.id)} recomendadas={recomendadas} />}
                </li>
              );
            })}
          </ul>
        )}
        {linhas.length > 0 && (
          <div className={css.resumo}>
            <span>
              XP total <strong className="odm-numero">{fmt(avaliacao.xpTotal)}</strong>
            </span>
            {avaliacao.grau ? (
              <Dica titulo="A conta do encontro" linhas={avaliacao.conta} classeBotao={css.grau}>
                <Etiqueta tom={TOM_GRAU[avaliacao.grau]}>{ROTULO_GRAU[avaliacao.grau]}</Etiqueta>
              </Dica>
            ) : null}
          </div>
        )}
        {linhas.length > 0 && <AvisosDoEncontro regras={regras} semXp={avaliacao.semXp} lendarias={avaliacao.lendarias} semPersonagens={!escolhidos.length} />}
        <div className={css.salvar}>
          <input type="text" value={nome} maxLength={120} placeholder="Nome do encontro" aria-label="Nome do encontro" onChange={(e) => definirNome(e.target.value)} />
          <Botao disabled={!nome.trim() || !linhas.length} onClick={salvar}>
            {salvoId ? "Salvar alterações" : "Salvar encontro"}
          </Botao>
          {(salvoId || linhas.length > 0) && (
            <Botao variante="fantasma" onClick={limpar}>
              Limpar
            </Botao>
          )}
        </div>
        <Botao
          variante="primario"
          grande
          largo
          disabled={!escolhidos.length && !linhas.length}
          onClick={() => {
            if (mesaId) salvos.guardarEncontroEmUso(mesaId, linhas);
            acoes.criarCombate(
              escolhidos.map((p) => p.id),
              linhas.map(({ ref, quantidade, elite }) => ({ ref, quantidade, elite })),
            );
          }}
        >
          Montar combate
        </Botao>
      </Cartao>
    </div>
  );
}

function AvisosDoEncontro({ regras, semXp, lendarias, semPersonagens }: { regras: RegrasEncontro; semXp: string[]; lendarias: string[]; semPersonagens: boolean }) {
  const avisos = [
    !regras.lidas.montando && "A regra Montando encontros ainda não está aprovada no pacote: o app soma o XP, mas não mostra o grau.",
    regras.lidas.montando && semPersonagens && "Marque os personagens para ver o grau do encontro.",
    semXp.length > 0 && `Sem XP na ficha: ${[...new Set(semXp)].join(", ")}. Digite o XP de cada um.`,
    lendarias.length > 0 && "Lendárias ficam fora da conta do encontro e não devem ser usadas como encontro comum.",
  ].filter((a): a is string => typeof a === "string");
  if (!avisos.length) return null;
  return (
    <ul className={css.avisos}>
      {avisos.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
}

/* ---------- Fim do combate: XP ---------- */

export function FimDoCombate({ combate, conteudo, aoFechar }: { combate: EstadoCombate; conteudo: ConteudoMestre; aoFechar: () => void }) {
  const mesaId = useLoja((e) => e.mesa?.id ?? null);
  const regras = useRegrasEncontro(conteudo);
  const fichas = useMemo(() => new Map<string, Ficha>([...conteudo.criaturas, ...conteudo.ameacas].map((f) => [f.id, f])), [conteudo]);
  const grupos = useMemo(() => gruposDoCombate(combate, fichas, regras, mesaId ? salvos.encontroEmUso(mesaId) : []), [combate, fichas, regras, mesaId]);
  const [contam, definirContam] = useState<Record<string, number>>(() => Object.fromEntries(grupos.map((g) => [g.chave, g.derrotados + (g.iniciais - g.presentes)])));
  const [xps, definirXps] = useState<Record<string, number | null>>({});
  const participantes = combate.combatentes.filter((c) => c.tipo === "personagem" && c.personagemId);
  const [fora, definirFora] = useState<string[]>([]);
  const recebem = participantes.filter((c) => !fora.includes(c.personagemId!));
  const xpDoGrupo = (g: Grupo) => xps[g.chave] ?? g.xp;
  const total = grupos.reduce((s, g) => s + (contam[g.chave] ?? 0) * (xpDoGrupo(g) ?? 0), 0);
  const pessoas = recebem.map((c) => ({ id: c.personagemId!, nome: c.nome }));
  const [divisao, definirDivisao] = useState<DivisaoEscolhida>(null);
  const partes = partesFinais(total, pessoas, divisao);
  const entregue = Object.values(partes).reduce((s, v) => s + v, 0);
  const terminar = (comXp: boolean) => {
    if (comXp) for (const p of pessoas) if ((partes[p.id] ?? 0) > 0) acoes.operar(p.id, { op: "xp", delta: partes[p.id]! });
    acoes.encerrarCombate();
    if (mesaId) salvos.guardarEncontroEmUso(mesaId, []);
    aoFechar();
  };
  return (
    <PopUp aberto titulo="Fim do combate" subtitulo="XP das criaturas derrotadas: mortas, capturadas ou postas em fuga" variante="central" aoFechar={aoFechar}>
      <div className={css.fim}>
        {grupos.length === 0 && <p className={comum.vazio}>Nenhuma criatura neste combate.</p>}
        <ul className={css.linhas}>
          {grupos.map((g) => (
            <li key={g.chave} className={css.linha}>
              <div className={css.linhaTopo}>
                <span className={css.nomeLinha}>
                  {g.nome} {g.elite && <Etiqueta tom="destaque">Elite</Etiqueta>}
                </span>
                <span className={comum.vazio}>
                  {g.derrotados} de {g.iniciais} derrotada(s) no combate
                </span>
              </div>
              <div className={css.controles}>
                <span className="odm-rotulo">Contam</span>
                <CampoNumero rotulo={`Quantos de ${g.nome} contam`} rotuloOculto semSinal valor={contam[g.chave] ?? 0} minimo={0} maximo={g.iniciais} aoMudar={(v) => definirContam((m) => ({ ...m, [g.chave]: v }))} />
                <CampoXp rotulo={`XP de cada ${g.nome}`} valor={xps[g.chave] ?? null} padrao={g.xp} aoMudar={(v) => definirXps((m) => ({ ...m, [g.chave]: v }))} />
                <span className={comum.vazio}>{xpDoGrupo(g) === null ? "sem XP: digite" : `= ${fmt((contam[g.chave] ?? 0) * xpDoGrupo(g)!)} XP`}</span>
              </div>
            </li>
          ))}
        </ul>
        <fieldset className={comum.semCombate}>
          <legend className="odm-rotulo">Quem recebe</legend>
          {participantes.map((c) => (
            <label key={c.id} className={comum.linhaFicha}>
              <span>
                <input type="checkbox" checked={!fora.includes(c.personagemId!)} onChange={() => definirFora((l) => (l.includes(c.personagemId!) ? l.filter((x) => x !== c.personagemId) : [...l, c.personagemId!]))} /> {c.nome}
              </span>
            </label>
          ))}
        </fieldset>
        <div className={css.resumo}>
          <span>
            XP total <strong className="odm-numero">{fmt(total)}</strong>
          </span>
        </div>
        <Divisao rotulo="Dividir o XP do combate" unidade="XP" totalBruto={total} pessoas={pessoas} escolhida={divisao} aoEscolher={definirDivisao} />
        <p className={comum.vazio}>Cada XP entra no registro e pode ser desfeito de lá.</p>
        <Botao variante="primario" grande largo disabled={!recebem.length || entregue <= 0} onClick={() => terminar(true)}>
          Dar {fmt(entregue)} XP e encerrar
        </Botao>
        <Botao variante="fantasma" largo onClick={() => terminar(false)}>
          Encerrar sem dar XP
        </Botao>
      </div>
    </PopUp>
  );
}
