import { Botao, CampoTexto, Carregando, Cartao } from "@odm/estilo";
import { PORTA_PADRAO } from "@odm/protocolo/constantes";
import { useState, type FormEvent } from "react";
import css from "./Inicio.module.css";

/* Primeira tela do app instalado. A porta ocupada aparece aqui porque, nesse caso, o
   servidor não subiu e não existe página do mestre para abrir. */

const MENOR_PORTA = 1024;
const MAIOR_PORTA = 65535;

function portaValida(texto: string) {
  const porta = Number(texto);
  return Number.isInteger(porta) && porta >= MENOR_PORTA && porta <= MAIOR_PORTA;
}

function PortaOcupada({ porta, aoEscolher }: { porta: number; aoEscolher: (porta: number) => void }) {
  const [valor, definirValor] = useState(String(porta === PORTA_PADRAO ? PORTA_PADRAO + 1 : porta + 1));
  const valida = portaValida(valor);

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (valida) aoEscolher(Number(valor));
  };

  return (
    <form onSubmit={enviar} className={css.porta} role="alert">
      <p className={css.problema}>
        A porta <strong>{porta}</strong> já está sendo usada por outro programa neste computador, então a mesa não pôde abrir.
      </p>
      <p className={css.texto}>
        Feche o outro programa, ou escolha outra porta. A escolha fica salva, e o endereço da mesa muda: os jogadores entram pelo
        novo endereço e precisam da sua aprovação de novo.
      </p>
      <CampoTexto
        rotulo="Outra porta"
        value={valor}
        onChange={(e) => definirValor(e.target.value)}
        inputMode="numeric"
        erro={valida ? null : `Use um número de ${MENOR_PORTA} a ${MAIOR_PORTA}.`}
      />
      <Botao type="submit" variante="primario" largo disabled={!valida}>
        Abrir nesta porta
      </Botao>
    </form>
  );
}

export function Inicio() {
  const [abrindo, definirAbrindo] = useState(false);
  const [portaOcupada, definirPortaOcupada] = useState<number | null>(null);
  const [falha, definirFalha] = useState<string | null>(null);
  const [endereco, definirEndereco] = useState("");
  const [erroEndereco, definirErroEndereco] = useState<string | null>(null);

  const ponte = window.odmInicio;

  const tratar = (resultado: ResultadoAbrirMesa) => {
    definirAbrindo(false);
    if (resultado.ok) return;
    if (resultado.motivo === "porta_ocupada") definirPortaOcupada(resultado.porta);
    else definirFalha(resultado.mensagem);
  };

  const abrirMesa = async (porta?: number) => {
    if (!ponte) return;
    definirAbrindo(true);
    definirFalha(null);
    definirPortaOcupada(null);
    try {
      tratar(await (porta === undefined ? ponte.abrirMesa() : ponte.trocarPorta(porta)));
    } catch {
      tratar({ ok: false, motivo: "falha", mensagem: "Não foi possível abrir a mesa. Feche o app e tente de novo." });
    }
  };

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    if (!ponte) return;
    const resposta = await ponte.entrarEmMesa(endereco.trim());
    definirErroEndereco(resposta.ok ? null : (resposta.mensagem ?? "Endereço inválido."));
  };

  return (
    <main className={`${css.pagina} odm-grao`}>
      <h1 className={css.titulo}>Olho da Morte</h1>
      <div className={css.opcoes}>
        <Cartao titulo="Sou o mestre">
          {abrindo ? (
            <Carregando rotulo="Abrindo a mesa" />
          ) : portaOcupada !== null ? (
            <PortaOcupada porta={portaOcupada} aoEscolher={(p) => void abrirMesa(p)} />
          ) : (
            <>
              <p className={css.texto}>Este computador abre a mesa e os jogadores entram nele.</p>
              {falha && (
                <p className={css.problema} role="alert">
                  {falha}
                </p>
              )}
              <Botao variante="primario" grande largo onClick={() => void abrirMesa()}>
                Abrir minha mesa
              </Botao>
            </>
          )}
        </Cartao>

        <Cartao titulo="Sou jogador">
          <form onSubmit={entrar} className={css.formulario}>
            <CampoTexto
              rotulo="Endereço da mesa"
              ajuda={`IP que o mestre passou, como 192.168.0.10:${PORTA_PADRAO}`}
              value={endereco}
              onChange={(e) => definirEndereco(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              erro={erroEndereco}
            />
            <Botao type="submit" grande largo disabled={!endereco.trim()}>
              Entrar numa mesa
            </Botao>
          </form>
        </Cartao>
      </div>
    </main>
  );
}
