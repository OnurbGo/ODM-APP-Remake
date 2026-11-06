import { Botao, CampoNumero, Cartao, Etiqueta, PopUp } from "@odm/estilo";
import { useState } from "react";
import { ATRIBUTOS } from "../../dados/exemplo";
import {
  FAIXAS_HONRA,
  HABILIDADES_FICHA,
  LIMITE_CARGA,
  NOME_RARIDADE,
  OPCOES_ESPECIALIZACAO,
  OPCOES_TALENTO,
  PERICIAS_FICHA,
  TRILHA_REDENCAO,
} from "../../dados/ficha";
import type { Chave, Ficha } from "../../estado/useFicha";
import css from "./Ficha.module.css";

const sinal = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

type Variante = "folha" | "central";

export function BlocoAtributos({ ficha }: { ficha: Ficha }) {
  const { estado } = ficha;
  return (
    <Cartao titulo="Atributos">
      <ul className={css.atributos}>
        {ATRIBUTOS.map((a) => (
          <li key={a} className={css.atributo}>
            <span className={`${css.atributoValor} odm-numero`}>{sinal(estado.atributos[a])}</span>
            <span className={css.atributoNome}>{a}</span>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

const CHAVES: Chave[] = ["pv", "defesa", "deslocamento", "proficiencia"];

export function BlocoCalculados({ ficha, variante }: { ficha: Ficha; variante: Variante }) {
  const [aberta, abrir] = useState<Chave | null>(null);
  const conta = aberta ? ficha.contas[aberta] : null;
  const ajuste = aberta ? (ficha.estado.ajustes[aberta] ?? 0) : 0;

  return (
    <Cartao titulo="Valores">
      <ul className={css.calculados}>
        {CHAVES.map((chave) => {
          const c = ficha.contas[chave];
          const a = ficha.estado.ajustes[chave] ?? 0;
          return (
            <li key={chave}>
              <button type="button" className={css.calculado} onClick={() => abrir(chave)} aria-label={`${c.titulo}: ver a conta`}>
                <span>{c.titulo}</span>
                {a !== 0 && <Etiqueta tom="destaque">Ajuste {sinal(a)}</Etiqueta>}
                <span className={`${css.calculadoValor} odm-numero`}>
                  {c.valor + a}
                  {"unidade" in c ? c.unidade : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <PopUp aberto={!!conta} titulo={conta?.titulo ?? ""} variante={variante} aoFechar={() => abrir(null)}>
        <ul className={css.conta}>
          {conta?.linhas.map((l) => <li key={l}>{l}</li>)}
          {ajuste !== 0 && <li className={css.contaAjuste}>{sinal(ajuste)} ajuste manual</li>}
        </ul>
        {aberta && (
          <CampoNumero rotulo="Ajuste manual" valor={ajuste} aoMudar={(v) => ficha.ajustar(aberta, v)} />
        )}
      </PopUp>
    </Cartao>
  );
}

export function BlocoPericias() {
  return (
    <Cartao titulo="Perícias" className={css.periciasCartao}>
      <ul className={css.pericias}>
        {PERICIAS_FICHA.map((p) => (
          <li key={p.nome} className={css.pericia}>
            <span className={`${css.treino} ${p.treinada ? css.treinada : ""}`} aria-label={p.treinada ? "Treinada" : undefined} />
            <span className={css.periciaNome}>{p.nome}</span>
            <span className={`${css.periciaAtributo} odm-rotulo`}>{p.atributo}</span>
            <span className={`${css.periciaValor} odm-numero`}>{sinal(p.valor)}</span>
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

export function BlocoHonra({ ficha }: { ficha: Ficha }) {
  const { honra } = ficha.estado;
  const faixa = FAIXAS_HONRA.find((f) => honra >= f.de && honra <= f.ate);
  return (
    <Cartao titulo="Honra" extra={<span className={css.resumo}>{faixa?.nome}</span>}>
      <div className={css.honra} role="img" aria-label={`Honra ${honra} de 20, ${faixa?.nome}`}>
        <div className={css.honraTrilho}>
          {FAIXAS_HONRA.map((f, i) => (
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

export function BlocoRedencao({ ficha }: { ficha: Ficha }) {
  const { passos, cartaDestino } = ficha.estado;
  const feitos = passos.filter(Boolean).length;
  const anterioresFeitos = passos.slice(0, -1).every(Boolean);
  return (
    <Cartao titulo="Redenção" extra={<span className={css.resumo}>{feitos} de 6</span>}>
      <p className={css.trilha}>{TRILHA_REDENCAO.titulo}</p>
      <ol className={css.passos}>
        {TRILHA_REDENCAO.passos.map((texto, i) => {
          const ultimo = i === passos.length - 1;
          return (
            <li key={texto}>
              <label className={`${css.passo} ${ultimo && !anterioresFeitos ? css.passoTravado : ""}`}>
                <input
                  type="checkbox"
                  checked={passos[i]}
                  disabled={ultimo && !anterioresFeitos}
                  onChange={() => ficha.alternarPasso(i)}
                />
                <span>{texto}</span>
              </label>
            </li>
          );
        })}
      </ol>
      {cartaDestino && <Etiqueta tom="destaque">Carta do Destino disponível</Etiqueta>}
    </Cartao>
  );
}

export function BlocoProgressao({ ficha, aoAbrirLoja }: { ficha: Ficha; aoAbrirLoja?: () => void }) {
  const { estado } = ficha;
  const consagracao = estado.fase === "consagracao";
  const fracao = Math.min(1, estado.xp / estado.xpProximo);
  return (
    <Cartao titulo={consagracao ? "Consagração" : "Escalada"} extra={<span className={css.resumo}>Nível {estado.nivel}</span>}>
      <div className={css.xpTrilho} aria-hidden="true">
        <div className={css.xp} style={{ transform: `scaleX(${fracao})` }} />
      </div>
      <p className={css.xpTexto}>
        <span className="odm-numero">
          {estado.xp.toLocaleString("pt-BR")} / {estado.xpProximo.toLocaleString("pt-BR")} XP
        </span>
      </p>
      <p className={css.nota}>O XP vem do app e do mestre.</p>
      {estado.pendencia && (
        <Botao largo className={css.botaoLoja} onClick={ficha.reabrirEscolha}>
          Falta escolher {estado.pendencia === "talento" ? "um Talento" : "a Especialização"}
        </Botao>
      )}
      {consagracao && aoAbrirLoja && (
        <Botao variante="primario" largo className={css.botaoLoja} onClick={aoAbrirLoja}>
          Loja de prestígio · {estado.saldo} {estado.saldo === 1 ? "ponto" : "pontos"}
        </Botao>
      )}
    </Cartao>
  );
}

export function BlocoHabilidades({ ficha }: { ficha: Ficha }) {
  const { estado } = ficha;
  const grupos = ["Classe", "Especialização", "Origem"] as const;
  const tecnicas = [...estado.avancadas.map((n) => ({ n, t: "Avançada" })), ...estado.lendarias.map((n) => ({ n, t: "Lendária" }))];
  return (
    <div className={css.grupos}>
      {grupos.map((g) => {
        const lista = g === "Especialização" && !estado.especializacao ? [] : HABILIDADES_FICHA.filter((h) => h.fonte === g);
        return (
          <Cartao key={g} titulo={g === "Especialização" && estado.especializacao ? estado.especializacao : g}>
            {lista.length === 0 ? (
              <p className={css.nota}>Escolha ao chegar ao nível indicado pela tabela da classe.</p>
            ) : (
              <ul className={css.lista}>
                {lista.map((h) => (
                  <li key={h.nome} className={css.linhaTexto}>
                    <span>{h.nome}</span>
                    <span className={css.detalhe}>{h.detalhe}</span>
                  </li>
                ))}
              </ul>
            )}
          </Cartao>
        );
      })}
      <Cartao titulo="Talentos">
        <ul className={css.lista}>
          {estado.talentos.map((t) => (
            <li key={t} className={css.linhaTexto}>
              {t}
            </li>
          ))}
          {estado.proficiencias.map((p) => (
            <li key={p} className={css.linhaTexto}>
              <span>{p}</span>
              <span className={css.detalhe}>Proficiência</span>
            </li>
          ))}
        </ul>
      </Cartao>
      {tecnicas.length > 0 && (
        <Cartao titulo="Técnicas">
          <ul className={css.lista}>
            {tecnicas.map(({ n, t }) => (
              <li key={n} className={css.linhaTexto}>
                <span>{n}</span>
                <span className={css.detalhe}>Técnica {t}</span>
              </li>
            ))}
          </ul>
        </Cartao>
      )}
    </div>
  );
}

export function BlocoCarga({ ficha }: { ficha: Ficha }) {
  const { cargaAtual } = ficha.estado;
  const escala = LIMITE_CARGA * 2.2;
  const imobilizado = cargaAtual >= LIMITE_CARGA * 2;
  const sobrecarregado = !imobilizado && cargaAtual > LIMITE_CARGA;
  return (
    <Cartao
      titulo="Carga"
      extra={
        imobilizado ? (
          <Etiqueta tom="perigo">Imobilizado</Etiqueta>
        ) : sobrecarregado ? (
          <Etiqueta tom="perigo">Sobrecarregado</Etiqueta>
        ) : (
          <span className={css.resumo}>Sem restrições</span>
        )
      }
    >
      <p className={css.cargaValor}>
        <span className="odm-numero">
          {cargaAtual.toLocaleString("pt-BR")} / {LIMITE_CARGA} kg
        </span>
      </p>
      <div className={css.cargaTrilho} aria-hidden="true">
        <div
          className={`${css.cargaBarra} ${sobrecarregado || imobilizado ? css.cargaExcesso : ""}`}
          style={{ transform: `scaleX(${Math.min(1, cargaAtual / escala)})` }}
        />
        <span className={css.cargaLimite} style={{ left: `${(LIMITE_CARGA / escala) * 100}%` }} />
        <span className={css.cargaLimite} style={{ left: `${((LIMITE_CARGA * 2) / escala) * 100}%` }} />
      </div>
    </Cartao>
  );
}

export function BlocoDinheiro({ ficha }: { ficha: Ficha }) {
  return (
    <Cartao titulo="Dinheiro">
      <p className={`${css.dinheiro} odm-numero`}>R$ {ficha.estado.dinheiro.toLocaleString("pt-BR")}</p>
    </Cartao>
  );
}

export function BlocoItens({ ficha }: { ficha: Ficha }) {
  return (
    <Cartao titulo="Itens">
      <ul className={css.lista}>
        {ficha.estado.itens.map((i) => (
          <li key={i.id} className={css.item}>
            <span className={`${css.raridade} ${css[`rar-${i.raridade}`]}`} title={NOME_RARIDADE[i.raridade]} aria-label={NOME_RARIDADE[i.raridade]} />
            <span className={css.itemNome}>
              {i.nome}
              {i.qtd > 1 && <span className={css.detalhe}> ×{i.qtd}</span>}
            </span>
            {i.equipado && <Etiqueta tom="destaque">Equipado</Etiqueta>}
            <span className={`${css.itemPeso} odm-numero`}>{(i.peso * i.qtd).toLocaleString("pt-BR")} kg</span>
            {i.usar && (
              <button type="button" className={css.itemUsar} onClick={() => ficha.usarItem(i.id)}>
                {i.usar}
              </button>
            )}
          </li>
        ))}
      </ul>
    </Cartao>
  );
}

export function BlocoNotas({ ficha }: { ficha: Ficha }) {
  return (
    <Cartao titulo="Notas">
      <textarea
        className={css.notas}
        aria-label="Notas do personagem"
        value={ficha.estado.notas}
        onChange={(e) => ficha.definirNotas(e.target.value)}
      />
    </Cartao>
  );
}

/* Sobe sozinho o que a tabela dá; só especialização e talento pedem escolha (seção 6.2.1). */
export function AvisoNivel({ ficha, variante }: { ficha: Ficha; variante: Variante }) {
  const { subiu } = ficha.estado;
  if (!subiu) return null;
  const opcoes = subiu.escolha === "talento" ? OPCOES_TALENTO : subiu.escolha === "especializacao" ? OPCOES_ESPECIALIZACAO : [];
  return (
    <PopUp
      aberto
      titulo={subiu.automatico.length ? "Subiu de nível" : "Escolha pendente"}
      subtitulo={`Nível ${subiu.nivel}`}
      variante={variante}
      aoFechar={ficha.fecharSubiu}
    >
      {subiu.automatico.length > 0 && (
        <>
          <h3 className={`${css.subtitulo} odm-rotulo`}>Já aplicado</h3>
          <ul className={css.conta}>
            {subiu.automatico.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </>
      )}
      {subiu.escolha ? (
        <>
          <h3 className={`${css.subtitulo} odm-rotulo`}>Escolha {subiu.escolha === "talento" ? "um Talento" : "a Especialização"}</h3>
          <div className={css.opcoes}>
            {opcoes.map((o) => (
              <Botao key={o} largo onClick={() => ficha.escolherNivel(o)}>
                {o}
              </Botao>
            ))}
          </div>
        </>
      ) : (
        <Botao variante="primario" largo onClick={ficha.fecharSubiu}>
          Continuar
        </Botao>
      )}
    </PopUp>
  );
}
