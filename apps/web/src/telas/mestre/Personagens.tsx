import { Botao, CampoNumero, CampoTexto, Cartao, Etiqueta, PopUp } from "@odm/estilo";
import type { Kit, OpcoesCampanha, Personagem } from "@odm/protocolo";
import { calcularFicha, kitsDoPacote, nivelDoXp, pontosDePrestigio, type ContextoFicha, type ConteudoFicha } from "@odm/regras";
import { useState } from "react";
import { useContextoFicha, type EstadoDoContexto } from "../../conexao/conteudo";
import { acoes, useLoja } from "../../conexao/loja";
import { CamposOpcoes } from "./CamposOpcoes";
import css from "./Personagens.module.css";

function BuscaCatalogo({ ctx, rotulo, aoEscolher }: { ctx: ContextoFicha; rotulo: string; aoEscolher: (id: string, nome: string) => void }) {
  const [busca, definirBusca] = useState("");
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const achados = termo ? [...ctx.itens.values()].filter((i) => i.nome.toLocaleLowerCase("pt-BR").includes(termo)).slice(0, 8) : [];
  return (
    <div>
      <CampoTexto rotulo={rotulo} value={busca} onChange={(e) => definirBusca(e.target.value)} />
      <ul className={css.achados}>
        {achados.map((i) => (
          <li key={i.id}>
            <Botao
              largo
              variante="fantasma"
              onClick={() => {
                aoEscolher(i.id, i.nome);
                definirBusca("");
              }}
            >
              {i.nome}
            </Botao>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BuscaHabilidade({ ctx, aoEscolher }: { ctx: ContextoFicha; aoEscolher: (id: string) => void }) {
  const [busca, definirBusca] = useState("");
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const achados = termo ? [...ctx.habilidades.values()].filter((h) => h.nome.toLocaleLowerCase("pt-BR").includes(termo)).slice(0, 8) : [];
  return (
    <div>
      <CampoTexto rotulo="Dar habilidade" value={busca} onChange={(e) => definirBusca(e.target.value)} />
      <ul className={css.achados}>
        {achados.map((h) => (
          <li key={h.id}>
            <Botao
              largo
              variante="fantasma"
              onClick={() => {
                aoEscolher(h.id);
                definirBusca("");
              }}
            >
              {h.nome} <span className={css.nota}>{h.classe}</span>
            </Botao>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Gerenciar({ personagem, ctx, aoFechar, aoAbrir }: { personagem: Personagem; ctx: ContextoFicha; aoFechar: () => void; aoAbrir: () => void }) {
  const mestre = useLoja((e) => e.mestre);
  const [xp, definirXp] = useState(0);
  const { id, ficha } = personagem;
  const operar = acoes.operar.bind(null, id);
  const { saldo, ganhos } = pontosDePrestigio(ficha, ctx);
  const kits = mestre?.kits ?? [];
  const jogadores = (mestre?.jogadores ?? []).filter((j) => !j.revogado);

  return (
    <PopUp aberto titulo={ficha.nome || "Sem nome"} subtitulo={`Nível ${nivelDoXp(ficha.xp, ctx.regras)} · ${ficha.xp.toLocaleString("pt-BR")} XP`} variante="central" aoFechar={aoFechar}>
      <div className={css.gerenciar}>
        <label className={css.campo}>
          <span className="odm-rotulo">Quem controla</span>
          <select value={personagem.participanteId ?? ""} onChange={(e) => acoes.ligarPersonagem(id, e.target.value || null)}>
            <option value="">Sem jogador</option>
            {jogadores.map((j) => (
              <option key={j.id} value={j.id}>
                {j.nome}
              </option>
            ))}
          </select>
        </label>

        {personagem.situacao === "ativo" && (
          <>
            <div className={css.linha}>
              <CampoNumero rotulo="XP" semSinal valor={xp} minimo={0} maximo={1000000} aoMudar={definirXp} />
              <Botao disabled={!xp} onClick={() => operar({ op: "xp", delta: xp })}>
                Dar
              </Botao>
              <Botao disabled={!xp} onClick={() => operar({ op: "xp", delta: -xp })}>
                Tirar
              </Botao>
            </div>
            <CampoTexto rotulo="XP (digitar)" inputMode="numeric" value={xp || ""} onChange={(e) => definirXp(Number(e.target.value.replace(/\D/g, "")) || 0)} />

            <div className={css.linha}>
              <span>
                Prestígio: {saldo} de {ganhos}
              </span>
              <Botao onClick={() => operar({ op: "prestigio", delta: 1 })}>+1</Botao>
              <Botao onClick={() => operar({ op: "prestigio", delta: -1 })}>−1</Botao>
            </div>

            <div className={css.linha}>
              <span>Honra: {ficha.honra}</span>
              <Botao onClick={() => operar({ op: "honra", delta: 1 })}>+1</Botao>
              <Botao onClick={() => operar({ op: "honra", delta: -1 })}>−1</Botao>
            </div>

            <BuscaCatalogo ctx={ctx} rotulo="Dar item" aoEscolher={(itemId, nome) => operar({ op: "dar_item", item: { id: "novo", itemId, nome, quantidade: 1, equipado: false, pesoKg: null } })} />
            <BuscaHabilidade ctx={ctx} aoEscolher={(habilidade) => operar({ op: "dar_habilidade", id: habilidade })} />

            {kits.length > 0 && (
              <div className={css.coluna}>
                <span className="odm-rotulo">Entregar kit</span>
                {kits.map((k) => (
                  <Botao key={k.id} largo onClick={() => acoes.entregarKit(id, k.id)}>
                    {k.nome} ({k.itens.length})
                  </Botao>
                ))}
              </div>
            )}
          </>
        )}

        <Botao variante="primario" largo onClick={aoAbrir}>
          Abrir ficha
        </Botao>
      </div>
    </PopUp>
  );
}

function Kits({ ctx, conteudo, aoFechar }: { ctx: ContextoFicha; conteudo: ConteudoFicha; aoFechar: () => void }) {
  const kits = useLoja((e) => e.mestre?.kits ?? []);
  const sugeridos = kitsDoPacote(conteudo).filter((k) => !kits.some((m) => m.nome === k.nome));
  const [nome, definirNome] = useState("");
  const [itens, definirItens] = useState<Kit["itens"]>([]);
  return (
    <PopUp aberto titulo="Kits" subtitulo="Grupos de itens para entregar de uma vez." variante="central" aoFechar={aoFechar}>
      <div className={css.gerenciar}>
        <ul className={css.coluna}>
          {kits.map((k) => (
            <li key={k.id} className={css.linha}>
              <span className={css.nome}>
                {k.nome} <span className={css.nota}>{k.itens.map((i) => i.nome).join(", ")}</span>
              </span>
              <Botao variante="fantasma" onClick={() => acoes.apagarKit(k.id)}>
                Apagar
              </Botao>
            </li>
          ))}
        </ul>
        {sugeridos.length > 0 && (
          <Botao largo onClick={() => sugeridos.forEach((k) => acoes.salvarKit({ id: crypto.randomUUID(), ...k }))}>
            Acrescentar os {sugeridos.length} kits sugeridos
          </Botao>
        )}
        <CampoTexto rotulo="Nome do kit novo" value={nome} maxLength={120} onChange={(e) => definirNome(e.target.value)} />
        <BuscaCatalogo ctx={ctx} rotulo="Acrescentar item" aoEscolher={(itemId, n) => definirItens((l) => [...l, { itemId, nome: n, quantidade: 1 }])} />
        {itens.length > 0 && <p className={css.nota}>{itens.map((i) => i.nome).join(", ")}</p>}
        <Botao
          variante="primario"
          largo
          disabled={!nome.trim() || !itens.length}
          onClick={() => {
            acoes.salvarKit({ id: crypto.randomUUID(), nome: nome.trim(), itens });
            definirNome("");
            definirItens([]);
          }}
        >
          Salvar kit
        </Botao>
      </div>
    </PopUp>
  );
}

function OpcoesDaCampanha({ opcoes, aoFechar }: { opcoes: OpcoesCampanha; aoFechar: () => void }) {
  return (
    <PopUp aberto titulo="Opções da campanha" variante="central" aoFechar={aoFechar}>
      <CamposOpcoes opcoes={opcoes} aoMudar={acoes.definirOpcoes} />
    </PopUp>
  );
}

function Lista({ contexto, aoAbrir }: { contexto: Extract<EstadoDoContexto, { situacao: "pronto" }>; aoAbrir: (id: string) => void }) {
  const { ctx } = contexto;
  const personagens = useLoja((e) => e.personagens);
  const jogadores = useLoja((e) => e.mestre?.jogadores ?? []);
  const [gerenciando, gerenciar] = useState<string | null>(null);
  const atual = personagens.find((p) => p.id === gerenciando);
  const nomeDe = (id: string | null) => jogadores.find((j) => j.id === id)?.nome ?? "Sem jogador";
  return (
    <>
      {personagens.length === 0 && <p className={css.nota}>Nenhum personagem nesta campanha.</p>}
      <ul className={css.coluna}>
        {personagens.map((p) => {
          const calc = p.situacao === "ativo" ? calcularFicha(p.ficha, ctx) : null;
          return (
            <li key={p.id}>
              <button type="button" className={css.personagem} onClick={() => gerenciar(p.id)}>
                <span className={css.nome}>{p.ficha.nome || "Sem nome"}</span>
                {calc ? <span className={`${css.nota} odm-numero`}>Nível {calc.nivel}</span> : <Etiqueta>Rascunho</Etiqueta>}
                <span className={css.nota}>{nomeDe(p.participanteId)}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {atual && (
        <Gerenciar
          personagem={atual}
          ctx={ctx}
          aoFechar={() => gerenciar(null)}
          aoAbrir={() => {
            gerenciar(null);
            aoAbrir(atual.id);
          }}
        />
      )}
    </>
  );
}

export default function Personagens({ aoAbrir }: { aoAbrir: (id: string) => void }) {
  const opcoes = useLoja((e) => e.mesa?.opcoes);
  const temConteudo = useLoja((e) => e.mesa?.conteudo ?? false);
  const contexto = useContextoFicha();
  const [janela, abrir] = useState<"kits" | "opcoes" | null>(null);

  return (
    <Cartao
      titulo="Personagens"
      extra={
        <div className={css.acoes}>
          <Botao variante="fantasma" onClick={() => abrir("opcoes")}>
            Opções
          </Botao>
          {contexto.situacao === "pronto" && (
            <Botao variante="fantasma" onClick={() => abrir("kits")}>
              Kits
            </Botao>
          )}
        </div>
      }
    >
      {!temConteudo && <p className={css.nota}>Sem pacote de conteúdo nesta mesa.</p>}
      {temConteudo && contexto.situacao === "falhou" && <p className={css.nota}>{contexto.mensagem}</p>}
      {contexto.situacao === "pronto" && <Lista contexto={contexto} aoAbrir={aoAbrir} />}
      {temConteudo && (
        <Botao largo onClick={acoes.criarPersonagem}>
          Criar personagem
        </Botao>
      )}
      {janela === "opcoes" && opcoes && <OpcoesDaCampanha opcoes={opcoes} aoFechar={() => abrir(null)} />}
      {janela === "kits" && contexto.situacao === "pronto" && <Kits ctx={contexto.ctx} conteudo={contexto.conteudo} aoFechar={() => abrir(null)} />}
    </Cartao>
  );
}
