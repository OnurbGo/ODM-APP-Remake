import { Alternador, Botao, CampoNumero, Cartao, Etiqueta, PopUp, Seletor } from "@odm/estilo";
import type { Acao, Ameaca, Criatura } from "@odm/conteudo";
import type { Alvo, Combatente, EfeitoAtivo, EstadoCombate, Personagem } from "@odm/protocolo";
import { alvosDoAtaqueDeHorda, ataqueDeCriatura, bonusDeHorda, hordaDaFicha, type ContextoCombate } from "@odm/regras";
import { useState } from "react";
import { acoes, useLoja } from "../../../conexao/loja";
import css from "./Escudo.module.css";

/* Etapa 7: ataques, dano, efeitos e rolagem manual no Escudo, a partir do protótipo (ControleVida, ListaEfeitos,
   FichaCriatura). O servidor rola e aplica; aqui só se pede. */

const alvoDe = (c: Combatente): Alvo => ({ tipo: "combatente", id: c.id });

const acoesDaFicha = (ficha: Criatura | Ameaca) => ficha.secoes.flatMap((s) => s.itens.filter((i): i is Acao => "id" in i));
export const hordaDe = (ficha: Criatura | Ameaca | undefined) => (ficha ? hordaDaFicha(acoesDaFicha(ficha)) : null);

/* Formar Horda (ficha do Zumbi): o mestre marca quem está junto, porque o app não tem mapa. */
export function FormarHorda({ combate, fichas }: { combate: EstadoCombate; fichas: (Criatura | Ameaca)[] }) {
  const [marcados, definirMarcados] = useState<string[]>([]);
  const grupos = new Map<string, { ficha: Criatura | Ameaca; minimo: number; membros: Combatente[] }>();
  for (const c of combate.combatentes) {
    if (c.personagemId || c.horda || c.derrotado || !c.ref) continue;
    const ficha = fichas.find((f) => f.id === c.ref);
    const regras = hordaDe(ficha);
    if (!ficha || !regras) continue;
    const g = grupos.get(c.ref) ?? { ficha, minimo: regras.regras.minimoIntegrantes, membros: [] };
    g.membros.push(c);
    grupos.set(c.ref, g);
  }
  const possiveis = [...grupos.values()].filter((g) => g.membros.length >= g.minimo);
  if (!possiveis.length) return null;
  const vez = combate.fase === "em_curso" ? combate.ordem[combate.vez] : null;
  return (
    <details className={css.formarHorda}>
      <summary className="odm-rotulo">Formar Horda</summary>
      {possiveis.map((g) => {
        const escolhidos = g.membros.filter((m) => marcados.includes(m.id));
        return (
          <div key={g.ficha.id} className={css.aplicarEfeito}>
            {g.membros.map((m) => (
              <label key={m.id} className={css.marcarHorda}>
                <input type="checkbox" disabled={m.id === vez} checked={marcados.includes(m.id)} onChange={() => definirMarcados((l) => (l.includes(m.id) ? l.filter((x) => x !== m.id) : [...l, m.id]))} /> {m.nome}
                {m.id === vez ? " (na vez)" : ""}
              </label>
            ))}
            <Botao
              variante="primario"
              disabled={escolhidos.length < g.minimo}
              onClick={() => {
                acoes.formarHorda(escolhidos.map((m) => m.id));
                definirMarcados([]);
              }}
            >
              {escolhidos.length < g.minimo ? `Marque ao menos ${g.minimo}` : `Formar com ${escolhidos.length}`}
            </Botao>
          </div>
        );
      })}
      <p className={css.nota}>A Horda compra uma carta nova; as dos integrantes são descartadas. Forme fora do turno deles.</p>
    </details>
  );
}

/* Cartão da Horda (protótipo do Escudo): integrantes, bônus, PA e quem o mestre marcou na área. */
export function CartaoDaHorda({ c, ficha, combate }: { c: Combatente; ficha: Criatura | Ameaca | undefined; combate: EstadoCombate }) {
  const regras = hordaDe(ficha);
  const [area, definirArea] = useState<string[]>(c.horda?.naArea ?? []);
  if (!c.horda) return null;
  const n = c.horda.integrantes.length;
  const bonus = regras ? bonusDeHorda(n, regras.regras.bonusMaximo) : 0;
  const outros = combate.combatentes.filter((x) => x.id !== c.id && !x.derrotado && !x.horda);
  const mudou = JSON.stringify([...area].sort()) !== JSON.stringify([...c.horda.naArea].sort());
  return (
    <Cartao titulo="Horda" className={css.horda}>
      <div className={css.hordaLinha}>
        <div className={css.integrantes} role="img" aria-label={`${n} integrantes`}>
          {c.horda.integrantes.map((i) => (
            <span key={i.id} className={css.integrante} title={`${i.nome}: ${i.pv} PV`} />
          ))}
        </div>
        <div className={css.mini}>
          <span className="odm-numero">{n}</span>
          <span className="odm-rotulo">Integrantes</span>
        </div>
        <div className={css.mini}>
          <span className="odm-numero">{sinal(bonus)}</span>
          <span className="odm-rotulo">Bônus de Horda</span>
        </div>
        <div className={css.mini}>
          <span className="odm-numero">{regras?.regras.paPorTurno ?? "?"}</span>
          <span className="odm-rotulo">PA</span>
        </div>
      </div>
      {regras && (
        <p className={css.nota}>
          Dano acumulado {c.horda.danoAcumulado}: sai um a cada {regras.regras.danoPorIntegrante}; com {regras.regras.desfazCom} ou menos, ela se desfaz. Ataque de Horda: até {alvosDoAtaqueDeHorda(bonus)}{" "}
          {alvosDoAtaqueDeHorda(bonus) === 1 ? "alvo" : "alvos"}.
        </p>
      )}
      <div className={css.aplicarEfeito}>
        <span className="odm-rotulo">Na área ou adjacentes</span>
        {outros.map((o) => (
          <label key={o.id} className={css.marcarHorda}>
            <input type="checkbox" checked={area.includes(o.id)} onChange={() => definirArea((l) => (l.includes(o.id) ? l.filter((x) => x !== o.id) : [...l, o.id]))} /> {o.nome}
          </label>
        ))}
        <Botao disabled={!mudou} onClick={() => acoes.marcarAreaDaHorda(c.id, area)}>
          Salvar área
        </Botao>
      </div>
      <p className={css.nota}>Quem está na área sofre a Ameaça de Massa e, ao começar ou terminar o turno, a Pressão de Massa.</p>
    </Cartao>
  );
}
const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

export function AtaqueEsperando({ combate }: { combate: EstadoCombate }) {
  const p = combate.ataquePendente;
  if (!p) return null;
  const nome = (id: string) => combate.combatentes.find((c) => c.id === id)?.nome ?? "?";
  return (
    <Cartao className={css.teste}>
      <header className={css.testeTopo}>
        <div>
          <h2 className={css.testeTitulo}>
            {nome(p.atacanteId)} vai atacar {p.alvos.map(nome).join(", ")}
          </h2>
          <p className={css.nota}>
            {p.rotulo} · {p.aguardando.length ? `Aguardando a reação de ${p.aguardando.map(nome).join(", ")}` : "Pronto para rolar"}
            {Object.entries(p.reacoes).map(([id, r]) => ` · ${nome(id)}: ${r === "nenhuma" ? "sem reação" : r === "esquiva" ? "Esquiva" : "Bloqueio"}`)}
          </p>
        </div>
      </header>
      <div className={css.decisoes}>
        <Botao variante="primario" onClick={acoes.seguirAtaque}>
          Seguir sem reação
        </Botao>
        <Botao variante="fantasma" onClick={acoes.cancelarAtaque}>
          Cancelar ataque
        </Botao>
      </div>
    </Cartao>
  );
}

export function ControleVida({ c, comArea }: { c: Combatente; comArea?: boolean }) {
  const [valor, definirValor] = useState(5);
  const [tipo, definirTipo] = useState("");
  const [espacos, definirEspacos] = useState(0);
  return (
    <div className={css.controleVida}>
      <CampoNumero rotulo="Valor" rotuloOculto semSinal valor={valor} minimo={1} maximo={999} aoMudar={definirValor} />
      <input className={css.campoTipo} value={tipo} maxLength={40} placeholder="Tipo (opcional)" aria-label="Tipo do dano" list="odm-tipos-de-dano" onChange={(e) => definirTipo(e.target.value)} />
      <datalist id="odm-tipos-de-dano">
        {["contundente", "cortante", "perfurante", "fogo", "frio", "elétrico", "ácido", "veneno", "profano", "psicológico", "indefensável"].map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      {comArea && <CampoNumero rotulo="Espaços da Horda na área" semSinal valor={espacos} minimo={0} maximo={60} aoMudar={definirEspacos} />}
      <Botao variante="perigo" onClick={() => acoes.aplicarDano(c.id, valor, tipo.trim() || null, espacos)}>
        Dano
      </Botao>
      <Botao onClick={() => acoes.ajustarPv(alvoDe(c), valor, false)}>Cura</Botao>
      <Botao variante="fantasma" onClick={() => acoes.ajustarPv(alvoDe(c), valor, true)}>
        PV temporários
      </Botao>
    </div>
  );
}

function LinhaEfeito({ c, e, ctx }: { c: Combatente; e: EfeitoAtivo; ctx: ContextoCombate }) {
  const [editando, editar] = useState(false);
  const [acumulos, definirAcumulos] = useState(e.acumulos);
  const [turnos, definirTurnos] = useState<number | null>(e.turnosRestantes);
  const mec = ctx.efeitos.get(e.efeitoId)?.mecanica;
  const botoes = (mec?.acoes ?? []).map((a, i) => ({ nome: a.nome, i }));
  return (
    <li className={css.efeito}>
      <span>{e.nome}</span>
      {e.acumulos > 1 && <Etiqueta tom="perigo">×{e.acumulos}</Etiqueta>}
      {e.nivel !== null && <Etiqueta>Nível {e.nivel}</Etiqueta>}
      {e.turnosRestantes !== null && (
        <Etiqueta>
          {e.turnosRestantes} {e.turnosRestantes === 1 ? "turno" : "turnos"}
        </Etiqueta>
      )}
      {botoes.map((b) => (
        <button key={b.i} type="button" className={css.encerrar} onClick={() => acoes.acaoDeEfeito(alvoDe(c), e.id, b.i)}>
          {b.nome}
        </button>
      ))}
      <button type="button" className={css.encerrar} onClick={() => editar(!editando)} aria-expanded={editando}>
        Ajustar
      </button>
      <button type="button" className={css.encerrar} onClick={() => acoes.encerrarEfeito(alvoDe(c), e.id)}>
        Encerrar
      </button>
      {editando && (
        <div className={css.ajusteEfeito}>
          <CampoNumero rotulo="Acúmulos" semSinal valor={acumulos} minimo={1} maximo={mec?.acumulos?.max ?? 20} aoMudar={definirAcumulos} />
          <Alternador rotulo="Com duração" ligado={turnos !== null} aoMudar={(l) => definirTurnos(l ? (e.turnosRestantes ?? 1) : null)} />
          {turnos !== null && <CampoNumero rotulo="Turnos" semSinal valor={turnos} minimo={1} maximo={100} aoMudar={definirTurnos} />}
          <Botao
            onClick={() => {
              acoes.editarEfeito(alvoDe(c), e.id, acumulos, turnos);
              editar(false);
            }}
          >
            Salvar
          </Botao>
        </div>
      )}
    </li>
  );
}

export function EfeitosDoCombatente({ c, efeitos, ctx }: { c: Combatente; efeitos: EfeitoAtivo[]; ctx: ContextoCombate }) {
  const [efeitoId, definirEfeitoId] = useState("");
  const [acumulos, definirAcumulos] = useState(1);
  const [turnos, definirTurnos] = useState(0);
  const lista = [...ctx.efeitos.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return (
    <Cartao titulo="Efeitos">
      {efeitos.length === 0 ? (
        <p className={css.nota}>Nenhum efeito ativo.</p>
      ) : (
        <ul className={css.efeitos}>
          {efeitos.map((e) => (
            <LinhaEfeito key={`${e.id}-${e.acumulos}-${e.turnosRestantes}`} c={c} e={e} ctx={ctx} />
          ))}
        </ul>
      )}
      <div className={css.aplicarEfeito}>
        <select className={css.campoTipo} value={efeitoId} aria-label="Efeito a aplicar" onChange={(e) => definirEfeitoId(e.target.value)}>
          <option value="">Aplicar efeito…</option>
          {lista.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </select>
        {efeitoId && (
          <>
            <CampoNumero rotulo="Acúmulos" semSinal valor={acumulos} minimo={1} maximo={20} aoMudar={definirAcumulos} />
            <CampoNumero rotulo="Turnos (0 = sem duração)" semSinal valor={turnos} minimo={0} maximo={100} aoMudar={definirTurnos} />
            <Botao
              variante="primario"
              onClick={() => {
                acoes.aplicarEfeito(alvoDe(c), efeitoId, acumulos, turnos || undefined);
                definirEfeitoId("");
              }}
            >
              Aplicar
            </Botao>
          </>
        )}
      </div>
    </Cartao>
  );
}

function RolarAcao({ rotulo, aoFechar }: { rotulo: string; aoFechar: () => void }) {
  const [formula, definirFormula] = useState("1d20");
  const [oculta, definirOculta] = useState(true);
  return (
    <div className={css.alvos}>
      <input className={css.campoTipo} value={formula} maxLength={40} aria-label="Fórmula" onChange={(e) => definirFormula(e.target.value)} />
      <Alternador rotulo="Só eu vejo" ligado={oculta} aoMudar={definirOculta} />
      <Botao
        onClick={() => {
          acoes.rolarLivre(rotulo, formula.trim(), oculta);
          aoFechar();
        }}
      >
        Rolar
      </Botao>
    </div>
  );
}

/* Ações da ficha do bestiário: com mecânica revisada, "Atacar" escolhe o alvo; sem ela, rolagem manual. */
function AtaqueDeHorda({ c, ficha, combate, acao, alemDoAlcance, aoFechar }: { c: Combatente; ficha: Criatura | Ameaca; combate: EstadoCombate; acao: Acao; alemDoAlcance: boolean; aoFechar: () => void }) {
  const regras = hordaDe(ficha);
  const escolhas = regras?.ataqueDeHorda?.escolhas ?? [];
  const [escolha, definirEscolha] = useState(escolhas[0] ?? "");
  const [alvos, definirAlvos] = useState<string[]>([]);
  if (!c.horda || !regras) return <p className={css.nota}>Só a Horda faz o Ataque de Horda.</p>;
  const maximo = alvosDoAtaqueDeHorda(bonusDeHorda(c.horda.integrantes.length, regras.regras.bonusMaximo));
  const possiveis = combate.combatentes.filter((x) => x.id !== c.id && !x.derrotado);
  const nomeDe = (id: string) => acoesDaFicha(ficha).find((a) => a.id === id)?.rotulo ?? id;
  return (
    <div className={css.alvos}>
      <select className={css.campoTipo} value={escolha} aria-label="Ataque da Horda" onChange={(e) => definirEscolha(e.target.value)}>
        {escolhas.map((id) => (
          <option key={id} value={id}>
            {nomeDe(id)}
          </option>
        ))}
      </select>
      <span className="odm-rotulo">Alvos (até {maximo})</span>
      {possiveis.map((alvo) => (
        <label key={alvo.id} className={css.marcarHorda}>
          <input
            type="checkbox"
            checked={alvos.includes(alvo.id)}
            disabled={!alvos.includes(alvo.id) && alvos.length >= maximo}
            onChange={() => definirAlvos((l) => (l.includes(alvo.id) ? l.filter((x) => x !== alvo.id) : [...l, alvo.id]))}
          />{" "}
          {alvo.nome}
        </label>
      ))}
      <Botao
        variante="primario"
        disabled={!alvos.length || !escolha}
        onClick={() => {
          acoes.atacar(c.id, { tipo: "acao", acaoId: acao.id, escolha }, alvos, { alemDoAlcance, bonus: 0, modo: "normal" });
          aoFechar();
        }}
      >
        Atacar
      </Botao>
    </div>
  );
}

export function AcoesDaCriatura({ c, ficha, combate }: { c: Combatente; ficha: Criatura | Ameaca; combate: EstadoCombate }) {
  const [aberta, abrir] = useState<string | null>(null);
  const [alemDoAlcance, definirAlem] = useState(false);
  const alvos = combate.combatentes.filter((x) => x.id !== c.id && !x.derrotado);
  const daHorda = hordaDe(ficha)?.ataqueDeHorda?.acaoId;
  return (
    <Cartao titulo="Ações">
      <ul className={css.acoes}>
        {ficha.secoes.flatMap((s) =>
          s.itens.map((item, i) => {
            if ("nota" in item)
              return (
                <li key={`${s.titulo}-${i}`} className={css.nota}>
                  {item.nota}
                </li>
              );
            const acao = item as Acao;
            const ataque = ataqueDeCriatura(acao);
            const gasta = c.recargasGastas.includes(acao.id);
            return (
              <li key={acao.id}>
                <button type="button" className={css.acao} onClick={() => abrir(aberta === acao.id ? null : acao.id)} aria-expanded={aberta === acao.id}>
                  <span className={css.acaoNome}>{acao.rotulo}</span>
                  <span className={css.acaoDetalhe}>
                    {acao.id === daHorda
                      ? "Uma jogada, com o Bônus de Horda, contra vários alvos"
                      : ataque
                        ? `${ataque.custoPa ? `${ataque.custoPa} PA · ` : ""}${sinal(ataque.acerto[0]!.valor)} · ${ataque.dano.formula}${ataque.dano.tipo ? ` ${ataque.dano.tipo}` : ""}${ataque.inicio ? " · Início" : ""}${ataque.combo ? " · Combo" : ""}`
                        : acao.mecanica
                          ? "Regra da criatura"
                          : "Sem mecânica revisada: rolagem manual"}
                    {acao.recargaCriatura && ` · Recarga ${acao.recargaCriatura}${gasta ? " · gasta" : ""}`}
                  </span>
                </button>
                {aberta === acao.id && (
                  <>
                    <p className={css.acaoDetalhe}>{acao.texto}</p>
                    {acao.recargaCriatura && (
                      <Botao variante="fantasma" onClick={() => acoes.usarRecarga(c.id, acao.id, !gasta)}>
                        {gasta ? "Devolver a habilidade" : "Marcar como usada"}
                      </Botao>
                    )}
                    {acao.id === daHorda ? (
                      <AtaqueDeHorda c={c} ficha={ficha} combate={combate} acao={acao} alemDoAlcance={alemDoAlcance} aoFechar={() => abrir(null)} />
                    ) : !ataque && acao.mecanica ? null : ataque ? (
                      <div className={css.alvos}>
                        <span className="odm-rotulo">Alvo</span>
                        {alvos.map((alvo) => (
                          <Botao
                            key={alvo.id}
                            onClick={() => {
                              acoes.atacar(c.id, { tipo: "acao", acaoId: acao.id }, [alvo.id], { alemDoAlcance, bonus: 0, modo: "normal" });
                              abrir(null);
                            }}
                          >
                            {alvo.nome}
                          </Botao>
                        ))}
                        <Alternador rotulo="Além do alcance efetivo" ligado={alemDoAlcance} aoMudar={definirAlem} />
                      </div>
                    ) : (
                      <RolarAcao rotulo={`${c.nome}: ${acao.rotulo}`} aoFechar={() => abrir(null)} />
                    )}
                  </>
                )}
              </li>
            );
          }),
        )}
      </ul>
    </Cartao>
  );
}

/* Morrendo e Estresse do personagem, no Escudo (Jogador, "Morrendo e Estresse"). */
export function VidaDoPersonagem({ c, personagem, estresseMaximo }: { c: Combatente; personagem: Personagem; estresseMaximo: number | null }) {
  const vivo = personagem.vivo;
  const estresse = useLoja((e) => e.mesa?.opcoes.estresse ?? false);
  const m = vivo.morrendo;
  if (!m && !estresse && !vivo.falhasPendentes && !vivo.sequelas.length) return null;
  return (
    <Cartao titulo={m ? "Morrendo" : "Vida"}>
      {m && (
        <>
          <p className={css.nota}>
            {m.estavel ? "Estável e inconsciente." : "Inconsciente, com 0 PV."} {m.sucessos} {m.sucessos === 1 ? "sucesso" : "sucessos"}, {m.falhas} {m.falhas === 1 ? "falha" : "falhas"}.
            {c.marcas.testeDeMortePendente ? " Falta o Teste de Morte deste turno." : ""}
          </p>
          <div className={css.decisoes}>
            {c.marcas.testeDeMortePendente && (
              <Botao variante="primario" onClick={() => acoes.testeDeMorte(personagem.id, false)}>
                Rolar o Teste de Morte
              </Botao>
            )}
            {!m.estavel && <Botao onClick={() => acoes.estabilizar(personagem.id)}>Estabilizar</Botao>}
          </div>
        </>
      )}
      {vivo.falhasPendentes > 0 && <p className={css.nota}>Atitude Imprudente: {vivo.falhasPendentes} falha(s) pendente(s).</p>}
      {vivo.sequelas.length > 0 && <p className={css.nota}>Sequelas: {vivo.sequelas.join(", ")}.</p>}
      {estresse && (
        <div className={css.controleVida}>
          <span>
            Estresse {vivo.estresse}
            {estresseMaximo !== null ? `/${estresseMaximo}` : ""}
          </span>
          <Botao variante="fantasma" onClick={() => acoes.ajustarEstresse(personagem.id, -1)}>
            −1
          </Botao>
          <Botao variante="fantasma" onClick={() => acoes.ajustarEstresse(personagem.id, 1)}>
            +1
          </Botao>
          <Botao variante="fantasma" onClick={() => acoes.ajustarEstresse(personagem.id, 2)}>
            +2 (rolagem forçada)
          </Botao>
          {[...vivo.aflicoes, ...vivo.virtudes].map((x) => (
            <Etiqueta key={`${x.linha}-${x.nome}`} tom={vivo.aflicoes.includes(x) ? "perigo" : "sucesso"}>
              {x.nome}
              {x.intensidade === 2 ? " II" : ""}
            </Etiqueta>
          ))}
        </div>
      )}
    </Cartao>
  );
}

/* Descanso disparado pelo mestre (Jogador, Descansos): só fora de combate; passar de 2 curtos avisa no registro. */
export function Descanso({ aberto, personagens, aoFechar }: { aberto: boolean; personagens: Personagem[]; aoFechar: () => void }) {
  const [tipo, definirTipo] = useState<"curto" | "longo">("curto");
  const [fora, definirFora] = useState<string[]>([]);
  const [dados, definirDados] = useState<Record<string, number>>({});
  const [alimentado, definirAlimentado] = useState(true);
  const [cuidados, definirCuidados] = useState(false);
  const combate = useLoja((e) => e.combate);
  if (!aberto) return null;
  const escolhidos = personagens.filter((p) => !fora.includes(p.id));
  return (
    <PopUp aberto titulo="Descanso" variante="central" aoFechar={aoFechar}>
      <div className={css.formularioDescanso}>
        <Seletor
          rotulo="Tipo"
          opcoes={[
            { id: "curto", rotulo: "Curto" },
            { id: "longo", rotulo: "Longo" },
          ]}
          valor={tipo}
          aoMudar={definirTipo}
        />
        <ul className={css.efeitos}>
          {personagens.map((p) => {
            const pv = p.vivo.pv;
            return (
              <li key={p.id} className={css.efeito}>
                <label className={css.marcarHorda}>
                  <input type="checkbox" checked={!fora.includes(p.id)} onChange={() => definirFora((l) => (l.includes(p.id) ? l.filter((x) => x !== p.id) : [...l, p.id]))} /> {p.ficha.nome || "Sem nome"}
                </label>
                <span className={css.nota}>
                  {pv === null ? "PV cheios" : `${pv} PV`} · {p.vivo.descansosCurtos} curto(s) desde o longo
                </span>
                {tipo === "curto" && !fora.includes(p.id) && (
                  <CampoNumero rotulo="Dados de Vida" semSinal valor={dados[p.id] ?? 0} minimo={0} maximo={20} aoMudar={(v) => definirDados((d) => ({ ...d, [p.id]: v }))} />
                )}
              </li>
            );
          })}
        </ul>
        {tipo === "longo" && (
          <>
            <Alternador rotulo="Alimentados" dica="Tira 1 de Exaustão" ligado={alimentado} aoMudar={definirAlimentado} />
            <Alternador rotulo="Com cuidados médicos" dica="Tira mais 1 de Exaustão" ligado={cuidados} aoMudar={definirCuidados} />
          </>
        )}
        {combate && combate.fase !== "encerrado" && <p className={css.nota}>Encerre o combate antes do descanso.</p>}
        <Botao
          variante="primario"
          grande
          largo
          disabled={!escolhidos.length || (!!combate && combate.fase !== "encerrado")}
          onClick={() => {
            acoes.descansar(
              tipo,
              escolhidos.map((p) => ({ personagemId: p.id, dadosDeVida: tipo === "curto" ? (dados[p.id] ?? 0) : 0 })),
              alimentado,
              cuidados,
            );
            aoFechar();
          }}
        >
          Descanso {tipo} para {escolhidos.length} {escolhidos.length === 1 ? "personagem" : "personagens"}
        </Botao>
      </div>
    </PopUp>
  );
}

export function RolagemManual() {
  const [rotulo, definirRotulo] = useState("");
  const [formula, definirFormula] = useState("1d20");
  const [oculta, definirOculta] = useState(true);
  return (
    <Cartao titulo="Rolagem manual">
      <div className={css.aplicarEfeito}>
        <input className={css.campoTipo} value={rotulo} maxLength={120} placeholder="O que é (ex.: Uivo)" aria-label="O que é a rolagem" onChange={(e) => definirRotulo(e.target.value)} />
        <input className={css.campoTipo} value={formula} maxLength={40} aria-label="Fórmula" onChange={(e) => definirFormula(e.target.value)} />
        <Alternador rotulo="Só eu vejo" ligado={oculta} aoMudar={definirOculta} />
        <Botao disabled={!formula.trim()} onClick={() => acoes.rolarLivre(rotulo.trim() || "Rolagem", formula.trim(), oculta)}>
          Rolar
        </Botao>
      </div>
    </Cartao>
  );
}
