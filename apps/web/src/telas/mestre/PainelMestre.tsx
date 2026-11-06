import { Botao, Cartao, Etiqueta, Icone, PopUp } from "@odm/estilo";
import type { EnderecoRede, JogadorConhecido, Participante, PedidoEntrada, RedeMestre, TipoRede } from "@odm/protocolo";
import { useEffect, useId, useState } from "react";
import { acoes, useLoja } from "../../conexao/loja";
import { FaixaConexao, NomeParticipante, Registro, Rolar } from "../Blocos";
import css from "./PainelMestre.module.css";
import { AvisoFirewall } from "./AvisoFirewall";
import { QrEndereco } from "./QrEndereco";

const NOME_REDE: Record<TipoRede, string> = {
  lan: "Rede local",
  hamachi: "Hamachi",
  radmin: "Radmin",
  outra: "Outra rede",
};

async function copiar(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function BotaoCopiar({ texto, rotulo }: { texto: string; rotulo: string }) {
  const [estado, definirEstado] = useState<"parado" | "copiado" | "falhou">("parado");

  useEffect(() => {
    if (estado === "parado") return;
    const id = window.setTimeout(() => definirEstado("parado"), 2000);
    return () => clearTimeout(id);
  }, [estado]);

  return (
    <Botao variante="fantasma" aria-label={rotulo} onClick={async () => definirEstado((await copiar(texto)) ? "copiado" : "falhou")}>
      <Icone nome="copiar" tamanho={18} />
      <span aria-live="polite">{estado === "copiado" ? "Copiado" : estado === "falhou" ? "Copie à mão" : "Copiar"}</span>
    </Botao>
  );
}

function LinhaEndereco({ endereco, porta, codigo }: { endereco: EnderecoRede; porta: number; codigo: string }) {
  const [qr, definirQr] = useState(false);
  const url = `http://${endereco.ip}:${porta}`;
  return (
    <li className={css.endereco}>
      <div className={css.enderecoTexto}>
        <Etiqueta tom={endereco.tipo === "outra" ? "neutro" : "destaque"}>{NOME_REDE[endereco.tipo]}</Etiqueta>
        <code className={`${css.url} odm-numero`}>{url}</code>
        {endereco.tipo === "outra" && <span className={css.interface}>{endereco.interface}</span>}
      </div>
      <div className={css.enderecoAcoes}>
        <BotaoCopiar texto={url} rotulo={`Copiar ${url}`} />
        <Botao variante="fantasma" onClick={() => definirQr(true)}>
          QR code
        </Botao>
      </div>
      <PopUp aberto={qr} titulo="Entrar pelo celular" subtitulo={url} variante="central" aoFechar={() => definirQr(false)}>
        <QrEndereco url={`${url}/?codigo=${codigo}`} />
      </PopUp>
    </li>
  );
}

function Convite({ codigo, rede }: { codigo: string; rede: RedeMestre }) {
  return (
    <Cartao titulo="Convidar jogadores">
      <div className={css.codigoBloco}>
        <p className={`${css.rotuloCodigo} odm-rotulo`}>Código da mesa</p>
        <p className={`${css.codigo} odm-numero`}>{codigo}</p>
        <div className={css.codigoAcoes}>
          <BotaoCopiar texto={codigo} rotulo="Copiar código da mesa" />
          <Botao variante="fantasma" onClick={acoes.trocarCodigo}>
            Trocar código
          </Botao>
        </div>
      </div>

      <AvisoFirewall />

      {rede.enderecos.length === 0 ? (
        <p className={css.vazio}>Nenhuma rede encontrada. Conecte este computador ao Wi-Fi, Hamachi ou Radmin.</p>
      ) : (
        <ul className={css.enderecos}>
          {rede.enderecos.map((e) => (
            <LinhaEndereco key={e.ip} endereco={e} porta={rede.porta} codigo={codigo} />
          ))}
        </ul>
      )}

      <p className={css.nota}>
        Se o jogador não conseguir abrir o endereço, a rede pode estar isolando os dispositivos, como em Wi-Fi de escritório ou
        de visitantes. Nesse caso, use Hamachi, Radmin ou o roteador do celular.
      </p>
    </Cartao>
  );
}

/* Sugeridos primeiro, depois quem está na mesa, depois quem saiu: o personagem de todos continua aqui. */
function paraAssociar(pedido: PedidoEntrada, jogadores: JogadorConhecido[]) {
  const sugeridos = new Set(pedido.mesmoNomeDe.map((j) => j.id));
  const grupo = (j: JogadorConhecido) => (sugeridos.has(j.id) ? 0 : j.revogado ? 2 : 1);
  return [...jogadores]
    .sort((a, b) => grupo(a) - grupo(b) || a.nome.localeCompare(b.nome, "pt-BR"))
    .map((jogador) => ({ jogador, sugerido: sugeridos.has(jogador.id) }));
}

/* Quem troca de celular pode digitar outro nome: a ficha continua com o jogador que já existe. */
function EscolherJogador({ pedido, jogadores, aoFechar }: { pedido: PedidoEntrada; jogadores: JogadorConhecido[]; aoFechar: () => void }) {
  return (
    <PopUp
      aberto
      titulo={`Quem é ${pedido.nome}?`}
      subtitulo="O novo dispositivo entra como este jogador."
      variante="central"
      aoFechar={aoFechar}
    >
      <ul className={css.escolha}>
        {paraAssociar(pedido, jogadores).map(({ jogador, sugerido }) => (
          <li key={jogador.id}>
            <Botao
              largo
              onClick={() => {
                acoes.aprovar(pedido.id, jogador.id);
                aoFechar();
              }}
            >
              {jogador.nome}
              {sugerido && <Etiqueta tom="destaque">Sugerido</Etiqueta>}
              {jogador.revogado && <Etiqueta>Fora da mesa</Etiqueta>}
            </Botao>
          </li>
        ))}
      </ul>
    </PopUp>
  );
}

function avisoMesmoNome(iguais: JogadorConhecido[]) {
  const [unico] = iguais;
  if (!unico) return null;
  if (iguais.length > 1) return `${iguais.length} jogadores têm este nome. Se for um deles, use Associar.`;
  const situacao = unico.revogado ? "já foi tirado da mesa" : "já está na mesa";
  return `${unico.nome} ${situacao}. Se for a mesma pessoa, use Associar.`;
}

function LinhaPedido({ pedido, jogadores }: { pedido: PedidoEntrada; jogadores: JogadorConhecido[] }) {
  const [escolhendo, definirEscolhendo] = useState(false);
  const motivo = useId();
  const aviso = avisoMesmoNome(pedido.mesmoNomeDe);
  const semJogadores = jogadores.length === 0;
  return (
    <li className={css.pedido}>
      <p className={css.pedidoNome}>{pedido.nome}</p>
      {aviso && <p className={css.nota}>{aviso}</p>}
      <div className={css.pedidoAcoes}>
        <Botao variante="primario" onClick={() => acoes.aprovar(pedido.id)}>
          Aceitar
        </Botao>
        <Botao disabled={semJogadores} aria-describedby={semJogadores ? motivo : undefined} onClick={() => definirEscolhendo(true)}>
          Associar
        </Botao>
        <Botao variante="fantasma" onClick={() => acoes.recusar(pedido.id)}>
          Recusar
        </Botao>
      </div>
      {semJogadores && (
        <p id={motivo} className={css.nota}>
          Ainda não há jogadores nesta mesa para associar.
        </p>
      )}
      {escolhendo && <EscolherJogador pedido={pedido} jogadores={jogadores} aoFechar={() => definirEscolhendo(false)} />}
    </li>
  );
}

function Pessoas({ pedidos, jogadores }: { pedidos: PedidoEntrada[]; jogadores: JogadorConhecido[] }) {
  const participantes = useLoja((e) => e.participantes);
  const [tirar, definirTirar] = useState<Participante | null>(null);
  return (
    <>
      {pedidos.length > 0 && (
        <Cartao titulo="Pedidos de entrada">
          <ul>
            {pedidos.map((p) => (
              <LinhaPedido key={p.id} pedido={p} jogadores={jogadores} />
            ))}
          </ul>
        </Cartao>
      )}
      <Cartao titulo="Na mesa">
        <ul>
          {participantes.map((p) => (
            <NomeParticipante
              key={p.id}
              participante={p}
              extra={
                p.papel === "jogador" && (
                  <Botao variante="fantasma" aria-label={`Tirar ${p.nome} da mesa`} onClick={() => definirTirar(p)}>
                    Tirar
                  </Botao>
                )
              }
            />
          ))}
        </ul>
      </Cartao>
      <PopUp
        aberto={tirar !== null}
        titulo={`Tirar ${tirar?.nome ?? ""} da mesa?`}
        subtitulo="Para voltar, será preciso pedir entrada de novo."
        variante="central"
        aoFechar={() => definirTirar(null)}
      >
        <div className={css.confirmar}>
          <Botao onClick={() => definirTirar(null)}>Cancelar</Botao>
          <Botao
            variante="perigo"
            onClick={() => {
              if (tirar) acoes.revogar(tirar.id);
              definirTirar(null);
            }}
          >
            Tirar da mesa
          </Botao>
        </div>
      </PopUp>
    </>
  );
}

export default function PainelMestre() {
  const mesa = useLoja((e) => e.mesa);
  const mestre = useLoja((e) => e.mestre);
  const erro = useLoja((e) => e.erro);

  return (
    <div className={`${css.painel} odm-grao`}>
      <FaixaConexao />
      <header className={css.topo}>
        <h1 className={css.titulo}>{mesa?.nome}</h1>
        <Etiqueta tom="destaque">Mestre</Etiqueta>
      </header>
      {erro && (
        <p className={css.erro} role="alert">
          {erro}
          <Botao variante="fantasma" onClick={acoes.limparErro}>
            Fechar
          </Botao>
        </p>
      )}
      <main className={css.colunas}>
        <div className={css.coluna}>{mestre && <Convite codigo={mestre.codigo} rede={mestre.rede} />}</div>
        <div className={css.coluna}>
          <Pessoas pedidos={mestre?.pedidos ?? []} jogadores={mestre?.jogadores ?? []} />
        </div>
        <div className={css.coluna}>
          <Rolar />
          <Registro className={css.preenche} />
        </div>
      </main>
    </div>
  );
}
