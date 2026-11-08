import { Botao, CampoTexto, Cartao } from "@odm/estilo";
import { TAMANHO_MAXIMO_NOME } from "@odm/protocolo/constantes";
import type { OpcoesCampanha, PacoteDisponivel, ResumoCampanha } from "@odm/protocolo";
import { useState, type FormEvent } from "react";
import { acoes, useLoja } from "../../conexao/loja";
import css from "./Campanhas.module.css";
import { CamposOpcoes } from "./CamposOpcoes";

const PACOTE_BASE = "base";
const OPCOES_NOVAS: OpcoesCampanha = { cartasDoDestino: true, estresse: false, modeloVantagem: "dados_extras", empateIniciativa: "naipe", polivalencia: false, habilidadesDeCriatura: true, mundo: [] };

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });

function LinhaCampanha({ campanha }: { campanha: ResumoCampanha }) {
  return (
    <li className={css.campanha}>
      <div className={css.dados}>
        <p className={css.nome}>{campanha.nome}</p>
        <p className={css.detalhe}>Última sessão: {campanha.ultimaSessaoEm ? dataCurta(campanha.ultimaSessaoEm) : "ainda não houve"}</p>
        <p className={css.detalhe}>{campanha.personagens.length ? campanha.personagens.join(", ") : "Nenhum personagem"}</p>
      </div>
      <Botao variante="primario" aria-label={`Continuar ${campanha.nome}`} onClick={() => acoes.abrirCampanha(campanha.id)}>
        Continuar
      </Botao>
    </li>
  );
}

function NovaCampanha({ pacotes, aoCancelar }: { pacotes: PacoteDisponivel[]; aoCancelar: (() => void) | null }) {
  const erro = useLoja((e) => e.erro);
  const [nome, definirNome] = useState("");
  const [ativos, definirAtivos] = useState<string[]>(pacotes.some((p) => p.id === PACOTE_BASE) ? [PACOTE_BASE] : []);
  const [opcoes, definirOpcoes] = useState(OPCOES_NOVAS);

  const alternar = (id: string) => definirAtivos((lista) => (lista.includes(id) ? lista.filter((p) => p !== id) : [...lista, id]));

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (nome.trim()) acoes.criarCampanha(nome.trim(), ativos, opcoes);
  };

  return (
    <Cartao titulo="Nova campanha">
      <form onSubmit={enviar} className={css.formulario}>
        <CampoTexto rotulo="Nome da campanha" value={nome} onChange={(e) => definirNome(e.target.value)} maxLength={TAMANHO_MAXIMO_NOME} autoComplete="off" erro={erro} />
        <fieldset className={css.grupo}>
          <legend className="odm-rotulo">Pacotes ativos</legend>
          {pacotes.length === 0 && <p className={css.detalhe}>Nenhum pacote de conteúdo instalado. A campanha abre, mas as fichas só aparecem quando o pacote chegar.</p>}
          {pacotes.map((p) => (
            <label key={p.id} className={css.pacote}>
              <input type="checkbox" checked={ativos.includes(p.id)} disabled={p.id === PACOTE_BASE} onChange={() => alternar(p.id)} />
              {p.nome}
            </label>
          ))}
        </fieldset>
        <fieldset className={css.grupo}>
          <legend className="odm-rotulo">Opções da campanha</legend>
          <CamposOpcoes opcoes={opcoes} aoMudar={definirOpcoes} />
        </fieldset>
        <div className={css.acoes}>
          {aoCancelar && <Botao onClick={aoCancelar}>Cancelar</Botao>}
          <Botao type="submit" variante="primario" disabled={!nome.trim()}>
            Abrir campanha
          </Botao>
        </div>
      </form>
    </Cartao>
  );
}

/* Só o mestre, e só com nenhuma campanha aberta: uma por vez. */
export default function Campanhas() {
  const dados = useLoja((e) => e.campanhas);
  const erro = useLoja((e) => e.erro);
  const [criando, definirCriando] = useState(false);
  const lista = dados?.lista ?? [];
  const semCampanhas = lista.length === 0;

  return (
    <main className={`${css.pagina} odm-grao`}>
      <h1 className={css.titulo}>Olho da Morte</h1>
      <div className={css.corpo}>
        {criando || semCampanhas ? (
          <NovaCampanha pacotes={dados?.pacotes ?? []} aoCancelar={semCampanhas ? null : () => definirCriando(false)} />
        ) : (
          <>
            {erro && (
              <p className={css.erro} role="alert">
                {erro}
              </p>
            )}
            <Cartao
              titulo="Suas campanhas"
              extra={
                <Botao variante="fantasma" onClick={() => definirCriando(true)}>
                  Nova campanha
                </Botao>
              }
            >
              <ul className={css.lista}>
                {lista.map((c) => (
                  <LinhaCampanha key={c.id} campanha={c} />
                ))}
              </ul>
            </Cartao>
          </>
        )}
      </div>
    </main>
  );
}
