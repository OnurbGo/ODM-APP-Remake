import { Alternador, Botao, CampoNumero, PopUp, Seletor } from "@odm/estilo";
import { ATRIBUTOS, type AlvoDoTeste, type Atributo, type ModoRolagem, type PedidoTeste, type Personagem } from "@odm/protocolo";
import { NOME_ATRIBUTO } from "@odm/regras";
import { useState } from "react";
import { acoes } from "../../../conexao/loja";
import { MODOS } from "../../testes/comum";
import css from "./PedirTeste.module.css";

/* Pedido de teste do mestre (especificação 8.3), a partir do protótipo aprovado (PedidoTeste). */

type Tipo = PedidoTeste["tipo"];

const TIPOS: { id: Tipo; rotulo: string }[] = [
  { id: "habilidade", rotulo: "Habilidade" },
  { id: "resistencia", rotulo: "Resistência" },
  { id: "passivo", rotulo: "Passivo" },
  { id: "contestado", rotulo: "Contestado" },
];

/* Os degraus da escala (Jogador, Progressão), na ordem do pacote. */
const NOME_DA_DT: Record<string, string> = {
  muito_facil: "Muito fácil",
  facil: "Fácil",
  moderada: "Moderada",
  dificil: "Difícil",
  muito_dificil: "Muito difícil",
  quase_impossivel: "Quase impossível",
};

export type OpcoesDoPedido = {
  personagens: Personagem[];
  pericias: { id: string; nome: string }[];
  efeitos: { id: string; nome: string }[];
  escala: Record<string, number>;
  /* Nomes do combate, para o oponente do contestado. */
  oponentes: string[];
};

type Ajuste = { marcado: boolean; dt: number | null; bonus: number; modo: ModoRolagem };

function SeletorDeTeste({ rotulo, valor, pericias, aoMudar, soAtributo }: { rotulo: string; valor: AlvoDoTeste; pericias: OpcoesDoPedido["pericias"]; aoMudar: (v: AlvoDoTeste) => void; soAtributo?: boolean }) {
  const atual = valor.alvo === "atributo" ? `atributo:${valor.atributo}` : `pericia:${valor.periciaId}`;
  return (
    <label className={css.campo}>
      <span className={`${css.rotulo} odm-rotulo`}>{rotulo}</span>
      <select
        className={css.select}
        value={atual}
        onChange={(e) => {
          const [tipo, id] = e.target.value.split(":") as [string, string];
          aoMudar(tipo === "atributo" ? { alvo: "atributo", atributo: id as Atributo } : { alvo: "pericia", periciaId: id });
        }}
      >
        <optgroup label="Atributos">
          {ATRIBUTOS.map((a) => (
            <option key={a} value={`atributo:${a}`}>
              {NOME_ATRIBUTO[a]}
            </option>
          ))}
        </optgroup>
        {!soAtributo && pericias.length > 0 && (
          <optgroup label="Perícias">
            {pericias.map((p) => (
              <option key={p.id} value={`pericia:${p.id}`}>
                {p.nome}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}

export function PedirTeste({ aberto, opcoes, aoFechar, marcados }: { aberto: boolean; opcoes: OpcoesDoPedido; aoFechar: () => void; marcados?: string[] }) {
  if (!aberto) return null;
  return (
    <PopUp aberto titulo="Pedir teste" variante="larga" aoFechar={aoFechar}>
      <Formulario opcoes={opcoes} marcados={marcados} aoEnviar={aoFechar} />
    </PopUp>
  );
}

function Formulario({ opcoes, marcados, aoEnviar }: { opcoes: OpcoesDoPedido; marcados?: string[]; aoEnviar: () => void }) {
  const { personagens, pericias, efeitos, escala } = opcoes;
  const [tipo, definirTipo] = useState<Tipo>("resistencia");
  const [teste, definirTeste] = useState<AlvoDoTeste>({ alvo: "atributo", atributo: "agilidade" });
  const [dt, definirDt] = useState(escala.moderada ?? 15);
  const [dtVisivel, definirDtVisivel] = useState(false);
  const [origem, definirOrigem] = useState("");
  const [efeitoId, definirEfeitoId] = useState("");
  const [dependeDe, definirDependeDe] = useState<"" | "visao" | "audicao">("");
  const [oponente, definirOponente] = useState({ nome: opcoes.oponentes[0] ?? "", teste: { alvo: "atributo", atributo: "astucia" } as AlvoDoTeste, bonus: 0, modo: "normal" as ModoRolagem });
  const [oponenteVisivel, definirOponenteVisivel] = useState(false);
  const [quemAge, definirQuemAge] = useState<"personagem" | "oponente">("personagem");
  const [ajustes, definirAjustes] = useState<Record<string, Ajuste>>(() =>
    Object.fromEntries(personagens.map((p) => [p.id, { marcado: marcados ? marcados.includes(p.id) : false, dt: null, bonus: 0, modo: "normal" as ModoRolagem }])),
  );

  const mudar = (id: string, parte: Partial<Ajuste>) => definirAjustes((a) => ({ ...a, [id]: { ...a[id]!, ...parte } }));
  const escolhidos = personagens.filter((p) => ajustes[p.id]?.marcado);
  const todos = escolhidos.length === personagens.length;
  const comDt = tipo !== "contestado";
  const alvoDoTeste: AlvoDoTeste = tipo === "resistencia" && teste.alvo === "pericia" ? { alvo: "atributo", atributo: "agilidade" } : teste;

  function enviar() {
    const lista = escolhidos.map((p) => {
      const a = ajustes[p.id]!;
      return { personagemId: p.id, bonus: a.bonus, modo: a.modo, ...(comDt && a.dt !== null && a.dt !== dt ? { dt: a.dt } : {}) };
    });
    const base = {
      id: crypto.randomUUID(),
      personagens: lista,
      ...(origem.trim() ? { origem: origem.trim() } : {}),
      ...(efeitoId ? { efeitoNaFalha: { efeitoId } } : {}),
      ...(dependeDe ? { dependeDe } : {}),
    };
    let pedido: PedidoTeste;
    switch (tipo) {
      case "habilidade":
        pedido = { ...base, tipo, teste: alvoDoTeste, dt, dtVisivel };
        break;
      case "resistencia":
        pedido = { ...base, tipo, atributo: alvoDoTeste.alvo === "atributo" ? alvoDoTeste.atributo : "agilidade", dt, dtVisivel };
        break;
      case "passivo":
        pedido = { ...base, tipo, teste: alvoDoTeste, dt };
        break;
      case "contestado":
        pedido = { ...base, tipo, teste: alvoDoTeste, oponente: { ...oponente, nome: oponente.nome.trim() || "Oponente" }, oponenteVisivel, quemAge };
        break;
    }
    acoes.pedirTeste(pedido);
    aoEnviar();
  }

  return (
    <div className={css.formulario}>
      <section className={css.geral}>
        <Seletor rotulo="Tipo de teste" opcoes={TIPOS} valor={tipo} aoMudar={definirTipo} />
        {tipo === "passivo" && <p className={css.nota}>O jogador não recebe nada: nem pedido, nem resultado. Só você vê os valores contra a DT.</p>}
        <div className={css.linhaDupla}>
          <SeletorDeTeste rotulo={tipo === "resistencia" ? "Atributo" : "Atributo ou perícia"} valor={alvoDoTeste} pericias={pericias} soAtributo={tipo === "resistencia"} aoMudar={definirTeste} />
          <label className={css.campo}>
            <span className={`${css.rotulo} odm-rotulo`}>Origem (opcional)</span>
            <input className={css.texto} value={origem} maxLength={120} placeholder="Ex.: porta trancada" onChange={(e) => definirOrigem(e.target.value)} />
          </label>
        </div>

        {comDt && (
          <div className={css.campo}>
            <span className={`${css.rotulo} odm-rotulo`}>DT</span>
            <div className={css.escala}>
              {Object.entries(escala).map(([chave, valor]) => (
                <button key={chave} type="button" className={`${css.degrau} ${valor === dt ? css.degrauAtivo : ""}`} aria-pressed={valor === dt} onClick={() => definirDt(valor)}>
                  {NOME_DA_DT[chave] ?? chave} <span className="odm-numero">{valor}</span>
                </button>
              ))}
              <CampoNumero rotulo="DT" rotuloOculto semSinal valor={dt} minimo={0} maximo={100} aoMudar={definirDt} />
            </div>
            {tipo !== "passivo" && <Alternador rotulo="Mostrar a DT aos jogadores" dica="Padrão: invisível" ligado={dtVisivel} aoMudar={definirDtVisivel} />}
          </div>
        )}

        {tipo === "contestado" && (
          <fieldset className={css.oponente}>
            <legend className={`${css.rotulo} odm-rotulo`}>Oponente</legend>
            <div className={css.linhaDupla}>
              <label className={css.campo}>
                <span className={`${css.rotulo} odm-rotulo`}>Nome</span>
                <input className={css.texto} list="odm-oponentes" value={oponente.nome} maxLength={80} onChange={(e) => definirOponente((o) => ({ ...o, nome: e.target.value }))} />
                <datalist id="odm-oponentes">
                  {opcoes.oponentes.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </label>
              <SeletorDeTeste rotulo="Teste do oponente" valor={oponente.teste} pericias={pericias} aoMudar={(t) => definirOponente((o) => ({ ...o, teste: t }))} />
            </div>
            <div className={css.linhaDupla}>
              <CampoNumero rotulo="Bônus do oponente" valor={oponente.bonus} minimo={-30} maximo={40} aoMudar={(b) => definirOponente((o) => ({ ...o, bonus: b }))} />
              <Seletor rotulo="Rolagem do oponente" opcoes={MODOS} valor={oponente.modo} aoMudar={(m) => definirOponente((o) => ({ ...o, modo: m }))} />
            </div>
            <p className={css.nota}>Percepção ativa de criatura: a passiva menos 10. Contra um grupo, o oponente rola uma vez.</p>
            <Seletor
              rotulo="Quem age (vence no empate)"
              opcoes={[
                { id: "personagem", rotulo: "O personagem" },
                { id: "oponente", rotulo: "O oponente" },
              ]}
              valor={quemAge}
              aoMudar={definirQuemAge}
            />
            <Alternador rotulo="Mostrar o oponente aos jogadores" dica="Nome e rolagem. Padrão: oculto" ligado={oponenteVisivel} aoMudar={definirOponenteVisivel} />
          </fieldset>
        )}

        <div className={css.linhaDupla}>
          <label className={css.campo}>
            <span className={`${css.rotulo} odm-rotulo`}>Efeito em quem falhar</span>
            <select className={css.select} value={efeitoId} onChange={(e) => definirEfeitoId(e.target.value)}>
              <option value="">Nenhum</option>
              {efeitos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className={css.campo}>
            <span className={`${css.rotulo} odm-rotulo`}>Depende de</span>
            <select className={css.select} value={dependeDe} onChange={(e) => definirDependeDe(e.target.value as typeof dependeDe)}>
              <option value="">Nada em especial</option>
              <option value="visao">Visão (Cego falha)</option>
              <option value="audicao">Audição (Surdo falha)</option>
            </select>
          </label>
        </div>
      </section>

      <section>
        <div className={css.tabelaTopo}>
          <h3 className={`${css.rotulo} odm-rotulo`}>Personagens</h3>
          <Botao variante="fantasma" onClick={() => definirAjustes((a) => Object.fromEntries(Object.entries(a).map(([id, v]) => [id, { ...v, marcado: !todos }])))}>
            {todos ? "Desmarcar todos" : "Marcar todos"}
          </Botao>
        </div>
        {personagens.length === 0 && <p className={css.nota}>Nenhum personagem pronto nesta campanha.</p>}
        <ul className={css.jogadores}>
          {personagens.map((p) => {
            const a = ajustes[p.id]!;
            const nome = p.ficha.nome || "Sem nome";
            return (
              <li key={p.id} className={`${css.jogador} ${a.marcado ? "" : css.desmarcado}`}>
                <label className={css.marcar}>
                  <input type="checkbox" checked={a.marcado} onChange={(e) => mudar(p.id, { marcado: e.target.checked })} />
                  <span>
                    <span className={css.nome}>{nome}</span>
                    {p.vivo.efeitos.length > 0 && <span className={css.condicoes}>{p.vivo.efeitos.map((e) => e.nome).join(", ")}</span>}
                  </span>
                </label>
                {a.marcado && (
                  <div className={css.ajustes}>
                    {comDt && <CampoNumero rotulo={`DT de ${nome}`} rotuloOculto semSinal valor={a.dt ?? dt} minimo={0} maximo={100} aoMudar={(v) => mudar(p.id, { dt: v === dt ? null : v })} />}
                    <CampoNumero rotulo={`Bônus ou penalidade de ${nome}`} rotuloOculto valor={a.bonus} aoMudar={(v) => mudar(p.id, { bonus: v })} />
                    <Seletor rotulo={`Vantagem de ${nome}`} opcoes={MODOS} valor={a.modo} aoMudar={(v) => mudar(p.id, { modo: v })} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <Botao variante="primario" grande largo disabled={escolhidos.length === 0} onClick={enviar}>
        {escolhidos.length === 0 ? "Marque ao menos um personagem" : `Enviar para ${escolhidos.length} ${escolhidos.length === 1 ? "personagem" : "personagens"}`}
      </Botao>
    </div>
  );
}
