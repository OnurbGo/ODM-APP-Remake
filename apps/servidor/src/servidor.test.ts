import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { PacoteConteudo } from "@odm/conteudo";
import { CAMINHO_WS, MensagemServidor, VERSAO_PROTOCOLO, type EventoCompleto, type MensagemCliente, type Personagem } from "@odm/protocolo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
import { conteudoExemplo } from "../../../pacotes/regras/src/ficha/exemplo";
import { efeitosExemplo, regrasDeCombateExemplo } from "../../../pacotes/regras/src/combate/exemplo";
import { iniciarServidor, PortaOcupada, type ServidorOdm } from "./servidor";

const TOKEN_MESTRE = "token-do-mestre-para-os-testes-0000";
const PASTA_MIGRACOES = resolve(import.meta.dirname, "../migracoes");

type Msg = MensagemServidor;

class Cliente {
  readonly recebidas: Msg[] = [];
  readonly brutas: string[] = [];
  private readonly esperas: { teste: (m: Msg) => boolean; ok: (m: Msg) => void; falha: (e: Error) => void }[] = [];
  fechou: number | null = null;

  private constructor(readonly ws: WebSocket) {
    ws.on("message", (dado) => {
      const texto = dado.toString();
      this.brutas.push(texto);
      /* Toda mensagem do servidor tem de seguir o protocolo. */
      const mensagem = MensagemServidor.parse(JSON.parse(texto));
      this.recebidas.push(mensagem);
      for (const espera of [...this.esperas]) {
        if (espera.teste(mensagem)) {
          this.esperas.splice(this.esperas.indexOf(espera), 1);
          espera.ok(mensagem);
        }
      }
    });
    ws.on("close", (codigo) => {
      this.fechou = codigo;
    });
  }

  static abrir(porta: number, cabecalhos?: Record<string, string>) {
    return new Promise<Cliente>((resolver, rejeitar) => {
      const ws = new WebSocket(`ws://127.0.0.1:${porta}${CAMINHO_WS}`, { headers: cabecalhos });
      const cliente = new Cliente(ws);
      ws.once("open", () => resolver(cliente));
      ws.once("error", rejeitar);
    });
  }

  enviar(mensagem: MensagemCliente) {
    this.ws.send(JSON.stringify(mensagem));
  }

  /* Vale a mensagem que já chegou ou a próxima que chegar. */
  esperar<T extends Msg["t"]>(tipo: T, filtro: (m: Extract<Msg, { t: T }>) => boolean = () => true, desde = 0) {
    const teste = (m: Msg) => m.t === tipo && filtro(m as Extract<Msg, { t: T }>);
    const ja = this.recebidas.slice(desde).find(teste);
    if (ja) return Promise.resolve(ja as Extract<Msg, { t: T }>);
    return new Promise<Extract<Msg, { t: T }>>((resolver, rejeitar) => {
      const espera = { teste, ok: (m: Msg) => resolver(m as Extract<Msg, { t: T }>), falha: rejeitar };
      this.esperas.push(espera);
      setTimeout(() => rejeitar(new Error(`Não chegou "${tipo}"`)), 3000).unref();
    });
  }

  eventos() {
    return this.recebidas.flatMap((m) => (m.t === "evento" ? [m.evento] : m.t === "bem_vindo" ? m.eventos : []));
  }

  fechar() {
    this.ws.terminate();
  }
}

let pasta: string;
let servidor: ServidorOdm;
const clientes: Cliente[] = [];

const pacoteExemplo = () => PacoteConteudo.parse({ manifesto: { id: "base", nome: "Exemplo", versao: "1.0" }, conteudo: conteudoExemplo() });

async function subir(aleatorio?: (min: number, max: number) => number, pacotes?: PacoteConteudo[], retomar?: boolean) {
  return iniciarServidor({
    porta: 0,
    host: "127.0.0.1",
    pastaDados: join(pasta, "Área de Trabalho", "dados"),
    pastaMigracoes: PASTA_MIGRACOES,
    tokenMestre: TOKEN_MESTRE,
    aleatorio,
    pacotes,
    retomar,
  });
}

async function abrir(cabecalhos?: Record<string, string>) {
  const cliente = await Cliente.abrir(servidor.porta, cabecalhos);
  clientes.push(cliente);
  return cliente;
}

async function mestreSemMesa() {
  const mestre = await abrir();
  mestre.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: TOKEN_MESTRE } });
  const { lista } = await mestre.esperar("campanhas");
  return { mestre, lista };
}

async function mestreComMesa(nome = "Mesa de exemplo") {
  const { mestre } = await mestreSemMesa();
  mestre.enviar({ t: "criar_campanha", nome });
  await mestre.esperar("bem_vindo");
  const { codigo } = await mestre.esperar("estado_mestre");
  return { mestre, codigo };
}

async function visitante() {
  const cliente = await abrir();
  cliente.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "visitante" } });
  await cliente.esperar("visitante");
  return cliente;
}

async function jogadorAprovado(mestre: Cliente, codigo: string, nome: string) {
  const jogador = await visitante();
  jogador.enviar({ t: "pedir_entrada", nome, codigo });
  await jogador.esperar("entrada_aguardando");
  const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.some((p) => p.nome === nome));
  const pedido = estado.pedidos.find((p) => p.nome === nome)!;
  mestre.enviar({ t: "aprovar_entrada", pedidoId: pedido.id });
  const { token } = await jogador.esperar("entrada_aprovada");
  jogador.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
  const { eu } = await jogador.esperar("bem_vindo");
  return { jogador, token, id: eu.id };
}

function evento(corpo: Pick<EventoCompleto, "tipo" | "dados">): EventoCompleto {
  return {
    id: crypto.randomUUID(),
    autorId: null,
    autorNome: null,
    criadoEm: new Date().toISOString(),
    ...corpo,
  } as EventoCompleto;
}

beforeEach(async () => {
  /* Caminho com acento de propósito: foi o que quebrou o app antigo. */
  pasta = mkdtempSync(join(tmpdir(), "odm-Área-"));
  servidor = await subir();
});

afterEach(async () => {
  for (const c of clientes.splice(0)) c.fechar();
  await servidor.encerrar();
  rmSync(pasta, { recursive: true, force: true });
});

describe("entrada na mesa", () => {
  it("nome + código, aprovação do mestre e token: o jogador entra", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const boasVindas = await jogador.esperar("bem_vindo");
    expect(boasVindas.eu.nome).toBe("Ana");
    expect(boasVindas.mesa.nome).toBe("Mesa de exemplo");
  });

  it("o jogador não recebe o código da mesa nem os pedidos de entrada", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const outro = await visitante();
    outro.enviar({ t: "pedir_entrada", nome: "Bia", codigo });
    await mestre.esperar("estado_mestre", (m) => m.pedidos.some((p) => p.nome === "Bia"));
    expect(jogador.recebidas.some((m) => m.t === "estado_mestre")).toBe(false);
    expect(jogador.brutas.join()).not.toContain(codigo);
    expect(jogador.brutas.join()).not.toContain("Bia");
  });

  it("com o token, entra direto na próxima vez, mesmo depois de o app reiniciar", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { token, jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.fechar();
    mestre.fechar();
    await servidor.encerrar();
    servidor = await subir();

    const { mestre: mestreDeVolta, lista } = await mestreSemMesa();
    mestreDeVolta.enviar({ t: "abrir_campanha", campanhaId: lista[0]!.id });
    await mestreDeVolta.esperar("bem_vindo");

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    expect((await volta.esperar("bem_vindo")).eu.nome).toBe("Ana");
  });

  it("guarda só o hash do token", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { token } = await jogadorAprovado(mestre, codigo, "Ana");
    const { DatabaseSync } = await import("node:sqlite");
    const banco = new DatabaseSync(join(pasta, "Área de Trabalho", "dados", "odm.sqlite"), { readOnly: true });
    const linhas = banco.prepare("SELECT token_hash FROM dispositivos").all() as { token_hash: string }[];
    banco.close();
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.token_hash).not.toBe(token);
  });

  it("código errado é recusado, e a sexta tentativa esbarra no limite", async () => {
    const { codigo } = await mestreComMesa();
    const cliente = await visitante();
    const errado = codigo === "AAAAAA" ? "BBBBBB" : "AAAAAA";
    for (let i = 1; i <= 5; i++) {
      const antes = cliente.recebidas.length;
      cliente.enviar({ t: "pedir_entrada", nome: "Ana", codigo: errado });
      await cliente.esperar("erro", (m) => m.codigo === "codigo_incorreto", antes);
    }
    const antes = cliente.recebidas.length;
    cliente.enviar({ t: "pedir_entrada", nome: "Ana", codigo });
    await cliente.esperar("erro", (m) => m.codigo === "muitas_tentativas", antes);
  });

  it("mestre recusa: o jogador é avisado e não entra", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const jogador = await visitante();
    jogador.enviar({ t: "pedir_entrada", nome: "Ana", codigo });
    const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.length === 1);
    mestre.enviar({ t: "recusar_entrada", pedidoId: estado.pedidos[0]!.id });
    await jogador.esperar("entrada_recusada");
    const final = await mestre.esperar("estado_mestre", (m) => m.pedidos.length === 0);
    expect(final.pedidos).toEqual([]);
  });

  it("celular que caiu enquanto esperava recebe a aprovação ao voltar", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const jogador = await visitante();
    jogador.enviar({ t: "pedir_entrada", nome: "Ana", codigo });
    const { pedidoId, segredo } = await jogador.esperar("entrada_aguardando");
    const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.length === 1);
    jogador.fechar();
    await new Promise((r) => setTimeout(r, 50));
    mestre.enviar({ t: "aprovar_entrada", pedidoId: estado.pedidos[0]!.id });
    await mestre.esperar("estado_mestre", (m) => m.pedidos.length === 0);

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "pedido", pedidoId, segredo } });
    const { token } = await volta.esperar("entrada_aprovada");
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    expect((await volta.esperar("bem_vindo")).eu.nome).toBe("Ana");
  });

  it("a mesma pessoa em outro dispositivo pode ser ligada ao participante atual", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { id } = await jogadorAprovado(mestre, codigo, "Ana");
    const celular = await visitante();
    celular.enviar({ t: "pedir_entrada", nome: "ana", codigo });
    const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.some((p) => p.nome === "ana"));
    const pedido = estado.pedidos[0]!;
    expect(pedido.mesmoNomeDe).toEqual([{ id, nome: "Ana", revogado: false }]);

    mestre.enviar({ t: "aprovar_entrada", pedidoId: pedido.id, vincularA: id });
    const { token } = await celular.esperar("entrada_aprovada");
    celular.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    const boasVindas = await celular.esperar("bem_vindo");
    expect(boasVindas.eu.id).toBe(id);
    expect(boasVindas.participantes.filter((p) => p.papel === "jogador")).toHaveLength(1);
  });

  it("o mestre liga o pedido a um jogador da mesa, mesmo com outro nome", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { id } = await jogadorAprovado(mestre, codigo, "Ana");
    const celular = await visitante();
    celular.enviar({ t: "pedir_entrada", nome: "Aninha", codigo });
    const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.some((p) => p.nome === "Aninha"));
    const pedido = estado.pedidos.find((p) => p.nome === "Aninha")!;
    expect(pedido.mesmoNomeDe).toEqual([]);
    expect(estado.jogadores).toEqual([{ id, nome: "Ana", revogado: false }]);

    mestre.enviar({ t: "aprovar_entrada", pedidoId: pedido.id, vincularA: id });
    const { token } = await celular.esperar("entrada_aprovada");
    celular.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    const boasVindas = await celular.esperar("bem_vindo");
    expect(boasVindas.eu).toMatchObject({ id, nome: "Ana" });
    expect(boasVindas.participantes.filter((p) => p.papel === "jogador")).toHaveLength(1);
  });

  it("jogador tirado da mesa continua na lista e volta como a mesma pessoa, com outro nome", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { id, token } = await jogadorAprovado(mestre, codigo, "Ana");
    mestre.enviar({ t: "revogar_acesso", participanteId: id });
    const estado = await mestre.esperar("estado_mestre", (m) => m.jogadores[0]?.revogado === true);
    expect(estado.jogadores).toEqual([{ id, nome: "Ana", revogado: true }]);

    const celular = await visitante();
    celular.enviar({ t: "pedir_entrada", nome: "Celular novo", codigo });
    const comPedido = await mestre.esperar("estado_mestre", (m) => m.pedidos.some((p) => p.nome === "Celular novo"));
    mestre.enviar({ t: "aprovar_entrada", pedidoId: comPedido.pedidos[0]!.id, vincularA: id });
    const novo = await celular.esperar("entrada_aprovada");
    celular.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [novo.token] } });
    expect((await celular.esperar("bem_vindo")).eu.id).toBe(id);

    /* O celular perdido continua fora: voltar não reativa o token antigo. */
    const perdido = await abrir();
    perdido.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    await perdido.esperar("erro", (m) => m.codigo === "token_invalido");
  });

  it("todos os jogadores com o mesmo nome aparecem no pedido", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const primeira = await jogadorAprovado(mestre, codigo, "Ana");
    const segunda = await jogadorAprovado(mestre, codigo, "ANA");
    await jogadorAprovado(mestre, codigo, "Bia");
    const celular = await visitante();
    celular.enviar({ t: "pedir_entrada", nome: "ana", codigo });
    const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.some((p) => p.nome === "ana"));
    const ids = estado.pedidos.find((p) => p.nome === "ana")!.mesmoNomeDe.map((j) => j.id);
    expect(ids.sort()).toEqual([primeira.id, segunda.id].sort());
  });

  it("o pedido não pode ser ligado ao mestre", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { eu } = await mestre.esperar("bem_vindo");
    const jogador = await visitante();
    jogador.enviar({ t: "pedir_entrada", nome: "Ana", codigo });
    const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.length === 1);
    const antes = mestre.recebidas.length;
    mestre.enviar({ t: "aprovar_entrada", pedidoId: estado.pedidos[0]!.id, vincularA: eu.id });
    await mestre.esperar("erro", (m) => m.codigo === "pedido_inexistente", antes);
    expect(jogador.recebidas.some((m) => m.t === "entrada_aprovada")).toBe(false);
  });

  it("revogar derruba a conexão na hora e o token deixa de valer", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, token, id } = await jogadorAprovado(mestre, codigo, "Ana");
    mestre.enviar({ t: "revogar_acesso", participanteId: id });
    await jogador.esperar("acesso_revogado");
    await expect.poll(() => jogador.fechou).toBe(4003);

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    await volta.esperar("erro", (m) => m.codigo === "token_invalido");
  });

  it("jogador não aprova, não revoga e não pede teste", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id } = await jogadorAprovado(mestre, codigo, "Ana");
    const antes = jogador.recebidas.length;
    jogador.enviar({ t: "revogar_acesso", participanteId: id });
    await jogador.esperar("erro", (m) => m.codigo === "nao_autorizado", antes);
    const depois = jogador.recebidas.length;
    jogador.enviar({ t: "trocar_codigo" });
    await jogador.esperar("erro", (m) => m.codigo === "nao_autorizado", depois);
  });

  it("recusa versão de protocolo diferente", async () => {
    const cliente = await abrir();
    cliente.enviar({ t: "ola", versao: VERSAO_PROTOCOLO + 1, credencial: { tipo: "visitante" } });
    await cliente.esperar("erro", (m) => m.codigo === "versao_incompativel");
  });

  it("token de mestre errado é recusado e derruba a conexão", async () => {
    const cliente = await abrir();
    cliente.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: "x".repeat(40) } });
    await cliente.esperar("erro", (m) => m.codigo === "nao_autorizado");
    await expect.poll(() => cliente.fechou).toBe(4001);
  });

  it("mensagem malformada recebe erro e não derruba o servidor", async () => {
    const cliente = await abrir();
    cliente.ws.send("isto não é JSON");
    await cliente.esperar("erro", (m) => m.codigo === "mensagem_invalida");
    cliente.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "visitante" } });
    await cliente.esperar("visitante");
  });
});

describe("campanhas", () => {
  const voltarComTokens = async (tokens: string[]) => {
    const cliente = await abrir();
    cliente.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens } });
    return cliente;
  };

  /* Fecha a aberta e abre outra pelo nome, como o botão Trocar de campanha. */
  const trocar = async (mestre: Cliente, nome: string) => {
    const desde = mestre.recebidas.length;
    mestre.enviar({ t: "fechar_campanha" });
    await mestre.esperar("mesa_mudou");
    mestre.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: TOKEN_MESTRE } });
    const { lista } = await mestre.esperar("campanhas", () => true, desde);
    const campanha = lista.find((c) => c.nome === nome);
    if (campanha) mestre.enviar({ t: "abrir_campanha", campanhaId: campanha.id });
    else mestre.enviar({ t: "criar_campanha", nome });
    await mestre.esperar("bem_vindo", (m) => m.mesa.nome === nome, desde);
    return (await mestre.esperar("estado_mestre", () => true, desde)).codigo;
  };

  it("sem campanha aberta, o mestre recebe a lista e o jogador vê a mesa fechada", async () => {
    const { lista } = await mestreSemMesa();
    expect(lista).toEqual([]);
    const jogador = await visitante();
    expect((await jogador.esperar("visitante")).mesaAberta).toBe(false);
  });

  it("a lista mostra nome, última sessão e personagens, da sessão mais recente para a mais antiga", async () => {
    const pacote = pacoteExemplo();
    await servidor.encerrar();
    servidor = await subir(undefined, [pacote]);
    const { mestre, codigo } = await mestreComMesa("Primeira");
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.enviar({ t: "personagem_criar" });
    const { personagem } = await jogador.esperar("personagem");
    jogador.enviar({ t: "personagem_salvar", personagemId: personagem.id, ficha: { nome: "Zeca" } });
    await jogador.esperar("personagem", (m) => m.personagem.ficha.nome === "Zeca");
    await trocar(mestre, "Segunda");

    mestre.enviar({ t: "fechar_campanha" });
    await mestre.esperar("mesa_mudou");
    mestre.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: TOKEN_MESTRE } });
    const { lista } = await mestre.esperar("campanhas", (m) => m.lista.length === 2);
    expect(lista.map((c) => c.nome)).toEqual(["Segunda", "Primeira"]);
    expect(lista[1]!.personagens).toEqual(["Zeca"]);
    expect(lista[1]!.ultimaSessaoEm).not.toBeNull();
  });

  it("uma campanha aberta por vez", async () => {
    const { mestre } = await mestreComMesa();
    mestre.enviar({ t: "criar_campanha", nome: "Outra" });
    await mestre.esperar("erro", (m) => m.codigo === "mesa_ja_existe");
  });

  it("a campanha nova guarda pacotes e opções, e pacote que não existe é recusado", async () => {
    await servidor.encerrar();
    servidor = await subir(undefined, [pacoteExemplo()]);
    const { mestre } = await mestreSemMesa();
    mestre.enviar({ t: "criar_campanha", nome: "Inválida", pacotes: ["base", "nao-existe"] });
    await mestre.esperar("erro", (m) => m.codigo === "recusado");
    mestre.enviar({
      t: "criar_campanha",
      nome: "Certa",
      pacotes: ["base"],
      opcoes: { cartasDoDestino: false, estresse: true, modeloVantagem: "cartas", empateIniciativa: "nova_compra", polivalencia: false },
    });
    const { mesa } = await mestre.esperar("bem_vindo");
    expect(mesa.conteudo).toBe(true);
    expect(mesa.opcoes).toMatchObject({ cartasDoDestino: false, estresse: true, modeloVantagem: "cartas" });
  });

  it("jogador não abre, não cria e não fecha campanha", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.enviar({ t: "fechar_campanha" });
    await jogador.esperar("erro", (m) => m.codigo === "nao_autorizado");
    jogador.enviar({ t: "abrir_campanha", campanhaId: "qualquer" });
    await jogador.esperar("erro", (m) => m.codigo === "mesa_ja_existe");

    const estranho = await visitante();
    estranho.enviar({ t: "criar_campanha", nome: "Minha" });
    await estranho.esperar("erro", (m) => m.codigo === "nao_identificado");
  });

  it("aprovado vale só na campanha dele: em outra, espera sem perder o token e entra sozinho quando a dele abrir", async () => {
    const { mestre, codigo } = await mestreComMesa("Pampas");
    const { jogador, token, id } = await jogadorAprovado(mestre, codigo, "Ana");

    const codigoNovo = await trocar(mestre, "Fronteira");
    await jogador.esperar("mesa_mudou");
    jogador.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    const espera = await jogador.esperar("visitante", (m) => m.deOutraCampanha);
    expect(espera.mesaAberta).toBe(true);
    expect(jogador.recebidas.some((m) => m.t === "erro" && m.codigo === "token_invalido")).toBe(false);

    /* Enquanto espera, ele não está dentro: pedir teste, rolar e ver o registro não valem. */
    jogador.enviar({ t: "rolar" });
    await jogador.esperar("erro", (m) => m.codigo === "nao_identificado");

    await trocar(mestre, "Pampas");
    await jogador.esperar("mesa_mudou", () => true, jogador.recebidas.indexOf(espera));
    jogador.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    expect((await jogador.esperar("bem_vindo", () => true, jogador.recebidas.indexOf(espera))).eu.id).toBe(id);
    expect(codigoNovo).not.toBe(codigo);
  });

  it("o mesmo aparelho entra em duas campanhas, cada uma com o próprio token", async () => {
    const { mestre, codigo } = await mestreComMesa("Pampas");
    const a = await jogadorAprovado(mestre, codigo, "Ana");
    const codigoNovo = await trocar(mestre, "Fronteira");
    const b = await jogadorAprovado(mestre, codigoNovo, "Ana Souza");
    expect(b.id).not.toBe(a.id);

    const aqui = await voltarComTokens([a.token, b.token]);
    const entrou = await aqui.esperar("bem_vindo");
    expect(entrou.eu.id).toBe(b.id);
    expect(entrou.tokenIndice).toBe(1);
  });

  it("fechar devolve todos à espera e descarta os pedidos pendentes", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const pendente = await visitante();
    pendente.enviar({ t: "pedir_entrada", nome: "Bia", codigo });
    const { pedidoId, segredo } = await pendente.esperar("entrada_aguardando");

    mestre.enviar({ t: "fechar_campanha" });
    await jogador.esperar("mesa_mudou");
    await pendente.esperar("mesa_mudou");
    pendente.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "pedido", pedidoId, segredo } });
    await pendente.esperar("erro", (m) => m.codigo === "pedido_inexistente");
    jogador.enviar({ t: "rolar" });
    await jogador.esperar("erro", (m) => m.codigo === "nao_identificado");
  });

  it("o registro de outra campanha não aparece, e a contagem antiga não esconde eventos", async () => {
    const { mestre, codigo } = await mestreComMesa("Pampas");
    const a = await jogadorAprovado(mestre, codigo, "Ana");
    a.jogador.enviar({ t: "rolar", rotulo: "Só em Pampas" });
    await a.jogador.esperar("evento");
    const codigoNovo = await trocar(mestre, "Fronteira");
    const b = await jogadorAprovado(mestre, codigoNovo, "Bia");

    const aqui = await abrir();
    aqui.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [b.token] }, vistos: 50, vistosDe: a.id });
    const { eventos } = await aqui.esperar("bem_vindo");
    expect(eventos.length).toBeGreaterThan(0);
    expect(JSON.stringify(eventos)).not.toContain("Só em Pampas");
  });

  it("depois de uma queda, a campanha aberta continua aberta; abrir o app de novo mostra a lista", async () => {
    const { mestre, codigo } = await mestreComMesa("Pampas");
    const { jogador, token } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.fechar();
    mestre.fechar();
    await servidor.encerrar();

    servidor = await subir(undefined, undefined, true);
    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    expect((await volta.esperar("bem_vindo")).mesa.nome).toBe("Pampas");
    volta.fechar();
    await servidor.encerrar();

    servidor = await subir();
    const { lista } = await mestreSemMesa();
    expect(lista.map((c) => c.nome)).toEqual(["Pampas"]);
  });

  it("fechar é para valer: depois disso, a queda não reabre nada", async () => {
    const { mestre } = await mestreComMesa("Pampas");
    mestre.enviar({ t: "fechar_campanha" });
    await mestre.esperar("mesa_mudou");
    mestre.fechar();
    await servidor.encerrar();
    servidor = await subir(undefined, undefined, true);
    const { lista } = await mestreSemMesa();
    expect(lista).toHaveLength(1);
  });
});

describe("painel do mestre", () => {
  it("recebe os endereços da máquina e a porta real", async () => {
    const { mestre } = await mestreComMesa();
    const { rede } = await mestre.esperar("estado_mestre");
    expect(rede.porta).toBe(servidor.porta);
  });
});

describe("rolagem ao vivo", () => {
  it("dois jogadores e o mestre veem a mesma rolagem", async () => {
    await servidor.encerrar();
    servidor = await subir((min, max) => (max === 20 ? 14 : min));
    const { mestre, codigo } = await mestreComMesa();
    const ana = await jogadorAprovado(mestre, codigo, "Ana");
    const bia = await jogadorAprovado(mestre, codigo, "Bia");
    const antes = bia.jogador.recebidas.length;

    ana.jogador.enviar({ t: "rolar", bonus: 3 });
    const ehRolagem = (m: Extract<Msg, { t: "evento" }>) => m.evento.tipo === "rolagem";
    const vistoPorBia = await bia.jogador.esperar("evento", ehRolagem, antes);
    const vistoPelaAna = await ana.jogador.esperar("evento", ehRolagem);
    const vistoPeloMestre = await mestre.esperar("evento", ehRolagem);

    for (const { evento: e } of [vistoPorBia, vistoPelaAna, vistoPeloMestre]) {
      expect(e.autorNome).toBe("Ana");
      expect(e.tipo === "rolagem" && e.dados).toEqual({
        rotulo: "Rolagem de d20",
        natural: 14,
        modificadores: [{ rotulo: "Bônus", valor: 3 }],
        total: 17,
      });
    }
  });

  it("quem reconecta recebe só o que perdeu", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, token } = await jogadorAprovado(mestre, codigo, "Ana");
    mestre.enviar({ t: "rolar", bonus: 0 });
    await jogador.esperar("evento", (m) => m.evento.tipo === "rolagem");
    const vistos = jogador.eventos().at(-1)!.n;
    jogador.fechar();
    await new Promise((r) => setTimeout(r, 50));

    const antes = mestre.recebidas.length;
    mestre.enviar({ t: "rolar", bonus: 1 });
    mestre.enviar({ t: "rolar", bonus: 2 });
    await mestre.esperar("evento", (m) => m.evento.tipo === "rolagem" && m.evento.dados.modificadores[0]?.valor === 2, antes);

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] }, vistos });
    const { eventos } = await volta.esperar("bem_vindo");
    expect(eventos.map((e) => e.n)).toEqual([vistos + 1, vistos + 2]);
  });

  it("presença mostra quem saiu", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.fechar();
    await mestre.esperar("presenca", (m) => m.participantes.find((p) => p.id === id)?.online === false);
  });
});

describe("visibilidade", () => {
  const passivo = {
    tipo: "teste_pedido" as const,
    dados: {
      pedido: {
        id: "pedido-passivo",
        tipo: "passivo" as const,
        teste: { alvo: "pericia" as const, periciaId: "pericia.segredo" },
        dt: 77,
        origem: "Porta escondida",
        personagens: [{ personagemId: "personagem-ana", bonus: 0, modo: "normal" as const }],
      },
      oponente: null,
      donos: { "personagem-ana": "?" } as Record<string, string | null>,
      rotulo: "Percepção passiva",
    },
  };

  it("teste passivo não gera nenhuma mensagem para o jogador", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id } = await jogadorAprovado(mestre, codigo, "Ana");
    const antes = jogador.brutas.length;
    const antesMestre = mestre.recebidas.length;

    passivo.dados.donos["personagem-ana"] = id;
    servidor.mesa.registrar(evento(passivo));
    await mestre.esperar("evento", (m) => m.evento.tipo === "teste_pedido", antesMestre);

    /* Uma rolagem depois serve de marcador: é a única coisa nova que o jogador pode receber. */
    mestre.enviar({ t: "rolar", bonus: 0 });
    await jogador.esperar("evento", (m) => m.evento.tipo === "rolagem", antes);

    const novas = jogador.brutas.slice(antes);
    expect(novas).toHaveLength(1);
    expect(novas.join()).not.toMatch(/passivo|Porta escondida|pericia\.segredo/);
  });

  it("evento oculto não deixa buraco na numeração do jogador", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id, token } = await jogadorAprovado(mestre, codigo, "Ana");
    const antes = jogador.eventos().at(-1)!.n;

    passivo.dados.donos["personagem-ana"] = id;
    servidor.mesa.registrar(evento(passivo));
    mestre.enviar({ t: "rolar", bonus: 0 });
    const { evento: rolagem } = await jogador.esperar("evento", (m) => m.evento.tipo === "rolagem");
    expect(rolagem.n).toBe(antes + 1);

    /* Ao voltar, a numeração continua igual, e o oculto segue fora. */
    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    const { eventos } = await volta.esperar("bem_vindo");
    expect(eventos.map((e) => e.n)).toEqual(Array.from({ length: antes + 1 }, (_, i) => i + 1));
    expect(volta.brutas.join()).not.toContain("Porta escondida");
  });

  it("o mestre continua vendo o passivo ao voltar", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { id } = await jogadorAprovado(mestre, codigo, "Ana");
    passivo.dados.donos["personagem-ana"] = id;
    servidor.mesa.registrar(evento(passivo));

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: TOKEN_MESTRE } });
    const { eventos } = await volta.esperar("bem_vindo");
    expect(eventos.some((e) => e.tipo === "teste_pedido")).toBe(true);
  });

  it("PV de criatura nunca chega ao jogador", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, token } = await jogadorAprovado(mestre, codigo, "Ana");
    const antes = mestre.recebidas.length;
    servidor.mesa.registrar(
      evento({ tipo: "pv_criatura", dados: { criaturaId: "criatura.exemplo", nome: "Criatura de exemplo", atual: 4321, maximo: 9876 } }),
    );
    await mestre.esperar("evento", (m) => m.evento.tipo === "pv_criatura", antes);

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
    await volta.esperar("bem_vindo");
    for (const bruto of [...jogador.brutas, ...volta.brutas]) expect(bruto).not.toMatch(/"atual"|"maximo"|criatura\.exemplo/);
  });

  it.each([
    ["habilidade", { teste: { alvo: "atributo", atributo: "intelecto" }, dt: 77, dtVisivel: false }],
    ["resistencia", { atributo: "fibra", dt: 77, dtVisivel: false }],
  ])("DT oculta de teste de %s chega ao jogador como null", async (tipo, resto) => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id } = await jogadorAprovado(mestre, codigo, "Ana");
    const antes = jogador.recebidas.length;
    servidor.mesa.registrar(
      evento({
        tipo: "teste_pedido",
        dados: { pedido: { id: "p", tipo, personagens: [{ personagemId: "pa", bonus: 0, modo: "normal" }], ...resto } as never, oponente: null, donos: { pa: id }, rotulo: "Teste" },
      }),
    );
    const { evento: visto } = await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", antes);
    expect(visto.tipo === "teste_pedido_visto" && visto.dados.pedido.personagens[0]!.dt).toBeNull();
    expect(jogador.brutas.join()).not.toContain('"dt":77');
  });

  it("DT visível chega com o ajuste próprio, e o de outro jogador não", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const ana = await jogadorAprovado(mestre, codigo, "Ana");
    const bia = await jogadorAprovado(mestre, codigo, "Bia");
    const antes = ana.jogador.recebidas.length;
    servidor.mesa.registrar(
      evento({
        tipo: "teste_pedido",
        dados: {
          pedido: {
            id: "p",
            tipo: "resistencia",
            atributo: "agilidade",
            dt: 15,
            dtVisivel: true,
            personagens: [
              { personagemId: "pa", bonus: 2, modo: "normal" },
              { personagemId: "pb", dt: 33, bonus: -4, modo: "desvantagem" },
            ],
          },
          oponente: null,
          donos: { pa: ana.id, pb: bia.id },
          rotulo: "Resistência de Agilidade",
        },
      }),
    );
    const { evento: visto } = await ana.jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", antes);
    expect(visto.tipo === "teste_pedido_visto" && visto.dados.pedido.personagens).toEqual([{ personagemId: "pa", dt: 15, bonus: 2, modo: "normal" }]);
    expect(JSON.stringify(visto)).not.toMatch(/"dt":33|"bonus":-4|desvantagem/);
  });

  it("jogador fora do pedido não fica sabendo dele", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const ana = await jogadorAprovado(mestre, codigo, "Ana");
    const bia = await jogadorAprovado(mestre, codigo, "Bia");
    const antes = bia.jogador.brutas.length;
    servidor.mesa.registrar(
      evento({
        tipo: "teste_pedido",
        dados: {
          pedido: {
            id: "p",
            tipo: "resistencia",
            atributo: "fibra",
            dt: 10,
            dtVisivel: false,
            personagens: [{ personagemId: "pa", bonus: 0, modo: "normal" }],
          },
          oponente: null,
          donos: { pa: ana.id },
          rotulo: "Resistência de Fibra",
        },
      }),
    );
    mestre.enviar({ t: "rolar", bonus: 0 });
    await bia.jogador.esperar("evento", (m) => m.evento.tipo === "rolagem", 0);
    expect(bia.jogador.brutas.slice(antes)).toHaveLength(1);
  });

  it("contestado esconde o oponente até o mestre escolher mostrar", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id } = await jogadorAprovado(mestre, codigo, "Ana");
    const antes = jogador.recebidas.length;
    servidor.mesa.registrar(
      evento({
        tipo: "teste_pedido",
        dados: {
          pedido: {
            id: "p",
            tipo: "contestado",
            teste: { alvo: "pericia", periciaId: "pericia.exemplo" },
            oponente: { nome: "Vigia oculto", teste: { alvo: "pericia", periciaId: "pericia.outra" }, bonus: 55, modo: "normal" },
            oponenteVisivel: false,
            quemAge: "personagem",
            personagens: [{ personagemId: "pa", bonus: 0, modo: "normal" }],
          },
          oponente: { dados: [12], natural: 12, total: 67 },
          donos: { pa: id },
          rotulo: "Exemplo (contestado)",
        },
      }),
    );
    await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", antes);
    expect(jogador.brutas.join()).not.toMatch(/Vigia oculto|"bonus":55|pericia\.outra/);
  });


});

describe("personagens", () => {
  beforeEach(async () => {
    await servidor.encerrar();
    rmSync(pasta, { recursive: true, force: true });
    pasta = mkdtempSync(join(tmpdir(), "odm-Área-"));
    servidor = await subir(undefined, [pacoteExemplo()]);
  });

  const ATRIBUTOS = { brutalidade: 3, agilidade: 2, fibra: 1, intelecto: 0, astucia: 0, presenca: -1 };
  const CRIACAO = {
    nome: "Zé Ninguém",
    origemId: "origem.sem-revisao",
    classeId: "classe.rufiao",
    atributos: ATRIBUTOS,
    pericias: ["pericia.faro"],
    ferramentas: ["Lima"],
  };

  const aguardar = (c: Cliente, teste: (p: Personagem) => boolean, desde = 0) => c.esperar("personagem", (m) => teste(m.personagem), desde);

  async function personagemAtivo(mestre: Cliente, jogador: Cliente) {
    const desde = jogador.recebidas.length;
    jogador.enviar({ t: "personagem_criar" });
    const { personagem } = await jogador.esperar("personagem", () => true, desde);
    const { id } = personagem;
    jogador.enviar({ t: "personagem_salvar", personagemId: id, ficha: CRIACAO });
    await aguardar(jogador, (p) => p.id === id && p.ficha.nome === CRIACAO.nome, desde);
    jogador.enviar({ t: "personagem_concluir", personagemId: id });
    await aguardar(jogador, (p) => p.id === id && p.situacao === "ativo", desde);
    await aguardar(mestre, (p) => p.id === id && p.situacao === "ativo");
    return id;
  }

  async function darXp(mestre: Cliente, personagemId: string, xp: number) {
    mestre.enviar({ t: "ficha_operar", personagemId, operacao: { op: "xp", delta: xp } });
    await aguardar(mestre, (p) => p.ficha.xp >= xp);
  }

  it("cria, salva e conclui; incompleto é recusado com o motivo", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.enviar({ t: "personagem_criar" });
    const { personagem } = await jogador.esperar("personagem");
    expect(personagem.situacao).toBe("rascunho");
    jogador.enviar({ t: "personagem_concluir", personagemId: personagem.id });
    const erro = await jogador.esperar("erro");
    expect(erro).toMatchObject({ codigo: "recusado", mensagem: "Dê um nome ao personagem." });
    jogador.enviar({ t: "personagem_salvar", personagemId: personagem.id, ficha: CRIACAO });
    await aguardar(jogador, (p) => p.ficha.nome === CRIACAO.nome);
    jogador.enviar({ t: "personagem_concluir", personagemId: personagem.id });
    await aguardar(jogador, (p) => p.situacao === "ativo");
  });

  it("o rascunho não muda XP nem Honra, mesmo com a mensagem forjada", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.enviar({ t: "personagem_criar" });
    const { personagem } = await jogador.esperar("personagem");
    jogador.ws.send(JSON.stringify({ t: "personagem_salvar", personagemId: personagem.id, ficha: { nome: "Trapaça", xp: 999_999, honra: 20 } }));
    const salvo = await aguardar(jogador, (p) => p.ficha.nome === "Trapaça");
    expect(salvo.personagem.ficha).toMatchObject({ xp: 0, honra: 10 });
  });

  it("depois de ativo, a criação não muda mais", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const id = await personagemAtivo(mestre, jogador);
    jogador.enviar({ t: "personagem_salvar", personagemId: id, ficha: { nome: "Outro" } });
    expect(await jogador.esperar("erro")).toMatchObject({ mensagem: "Só o rascunho muda por aqui." });
  });

  it("XP, Prestígio e Honra são só do mestre", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const id = await personagemAtivo(mestre, jogador);
    for (const operacao of [{ op: "xp", delta: 100 }, { op: "prestigio", delta: 1 }, { op: "honra", delta: 1 }] as const) {
      const desde = jogador.recebidas.length;
      jogador.enviar({ t: "ficha_operar", personagemId: id, operacao });
      expect(await jogador.esperar("erro", () => true, desde)).toMatchObject({ mensagem: "Só o mestre faz isso." });
    }
    await darXp(mestre, id, 300);
    await aguardar(jogador, (p) => p.ficha.xp === 300);
  });

  it("subir de nível vem no evento, para o dono e para o mestre", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const id = await personagemAtivo(mestre, jogador);
    await darXp(mestre, id, 200);
    await aguardar(jogador, (p) => p.ficha.xp === 200);
    const alterado = jogador.eventos().find((e) => e.tipo === "ficha_alterada");
    expect(alterado).toMatchObject({ dados: { rotulo: "XP +200", subiuPara: 3 } });
  });

  it("ficha e registro dela não chegam a outro jogador", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador: ana } = await jogadorAprovado(mestre, codigo, "Ana");
    const { jogador: bia } = await jogadorAprovado(mestre, codigo, "Bia");
    const id = await personagemAtivo(mestre, ana);
    await darXp(mestre, id, 100);
    await aguardar(ana, (p) => p.ficha.xp === 100);
    expect(bia.brutas.join("")).not.toContain(CRIACAO.nome);
    const nova = await abrir();
    nova.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "visitante" } });
    await nova.esperar("visitante");
    expect(nova.brutas.join("")).not.toContain(CRIACAO.nome);
  });

  it("não mexe na ficha de outro jogador", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador: ana } = await jogadorAprovado(mestre, codigo, "Ana");
    const { jogador: bia } = await jogadorAprovado(mestre, codigo, "Bia");
    const id = await personagemAtivo(mestre, ana);
    bia.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "notas", texto: "invadi" } });
    expect(await bia.esperar("erro")).toMatchObject({ mensagem: "Este personagem não é seu." });
  });

  it("o mestre liga, troca e deixa sem jogador; um jogador pode ter vários", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador: ana } = await jogadorAprovado(mestre, codigo, "Ana");
    const { jogador: bia, id: idBia } = await jogadorAprovado(mestre, codigo, "Bia");
    const id = await personagemAtivo(mestre, ana);
    const outro = await personagemAtivo(mestre, ana);

    ana.enviar({ t: "ligar_personagem", personagemId: id, participanteId: idBia });
    expect(await ana.esperar("erro")).toMatchObject({ mensagem: "Só o mestre troca quem controla um personagem." });

    mestre.enviar({ t: "ligar_personagem", personagemId: id, participanteId: idBia });
    await ana.esperar("personagem_removido", (m) => m.personagemId === id);
    await aguardar(bia, (p) => p.id === id && p.participanteId === idBia);

    mestre.enviar({ t: "ligar_personagem", personagemId: outro, participanteId: idBia });
    await aguardar(bia, (p) => p.id === outro);

    mestre.enviar({ t: "ligar_personagem", personagemId: id, participanteId: null });
    await bia.esperar("personagem_removido", (m) => m.personagemId === id);
    await aguardar(mestre, (p) => p.id === id && p.participanteId === null);
  });

  it("recusa ligar a quem foi tirado da mesa", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador: ana } = await jogadorAprovado(mestre, codigo, "Ana");
    const { id: idBia } = await jogadorAprovado(mestre, codigo, "Bia");
    const id = await personagemAtivo(mestre, ana);
    mestre.enviar({ t: "revogar_acesso", participanteId: idBia });
    await mestre.esperar("estado_mestre", (m) => m.jogadores.some((j) => j.id === idBia && j.revogado));
    mestre.enviar({ t: "ligar_personagem", personagemId: id, participanteId: idBia });
    expect(await mestre.esperar("erro")).toMatchObject({ mensagem: "Jogador não encontrado." });
  });

  it("a loja compra, recusa com o motivo e desfaz sem perder o que veio depois", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const id = await personagemAtivo(mestre, jogador);

    jogador.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "comprar", compra: { id: "x", tipo: "vitalidade_aprimorada" } } });
    expect(await jogador.esperar("erro")).toMatchObject({ mensagem: "Só depois do nível 10" });

    await darXp(mestre, id, 1000);
    await aguardar(jogador, (p) => p.ficha.xp === 1000);
    const desde = jogador.recebidas.length;
    jogador.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "comprar", compra: { id: "x", tipo: "vitalidade_aprimorada" } } });
    await aguardar(jogador, (p) => p.ficha.compras.length === 1);
    jogador.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "comprar", compra: { id: "x", tipo: "vitalidade_aprimorada" } } });
    expect(await jogador.esperar("erro", () => true, desde)).toMatchObject({ mensagem: "Custa 1, você tem 0" });

    mestre.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "prestigio", delta: 1 } });
    await aguardar(mestre, (p) => p.ficha.prestigioDoMestre === 1);
    jogador.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "comprar", compra: { id: "x", tipo: "tecnica_avancada", habilidadeId: "habilidade.rufiao.avancada" } } });
    await aguardar(jogador, (p) => p.ficha.compras.length === 2);

    const compras = jogador.eventos().filter((e) => e.tipo === "ficha_alterada" && e.autorId === jogador.eventos().find((x) => x.tipo === "ficha_alterada" && x.autorNome === "Ana")?.autorId);
    const antesDeDesfazer = jogador.recebidas.length;
    jogador.enviar({ t: "ficha_desfazer", eventoId: compras[0]!.id });
    const depois = await aguardar(jogador, (p) => p.ficha.compras.length === 1, antesDeDesfazer);
    expect(depois.personagem.ficha.compras[0]).toMatchObject({ tipo: "tecnica_avancada" });

    const repetido = jogador.recebidas.length;
    jogador.enviar({ t: "ficha_desfazer", eventoId: compras[0]!.id });
    expect(await jogador.esperar("erro", () => true, repetido)).toMatchObject({ mensagem: "Isso já foi desfeito." });
    expect(jogador.eventos().some((e) => e.tipo === "ficha_desfeita")).toBe(true);
  });

  it("o jogador não desfaz o que o mestre fez; o mestre desfaz", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const id = await personagemAtivo(mestre, jogador);
    await darXp(mestre, id, 300);
    await aguardar(jogador, (p) => p.ficha.xp === 300);
    const alvo = jogador.eventos().find((e) => e.tipo === "ficha_alterada")!;
    jogador.enviar({ t: "ficha_desfazer", eventoId: alvo.id });
    expect(await jogador.esperar("erro")).toMatchObject({ mensagem: "Só o mestre desfaz ações de outra pessoa." });
    mestre.enviar({ t: "ficha_desfazer", eventoId: alvo.id });
    await aguardar(jogador, (p) => p.ficha.xp === 0);
  });

  it("escolhe especialização e talento, e a de outra classe é recusada", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const id = await personagemAtivo(mestre, jogador);
    await darXp(mestre, id, 200);
    await aguardar(jogador, (p) => p.ficha.xp === 200);
    jogador.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "especializacao", id: "especializacao.rufiao.bravo" } });
    await aguardar(jogador, (p) => p.ficha.especializacaoId === "especializacao.rufiao.bravo");
    jogador.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "talento_de_nivel", nivel: 2, escolha: { nivel: 2, talentoId: "talento.calejado" } } });
    await aguardar(jogador, (p) => p.ficha.talentos.length === 1);
    const desde = jogador.recebidas.length;
    jogador.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "talento_de_nivel", nivel: 3, escolha: { nivel: 3, talentoId: "talento.calejado" } } });
    expect(await jogador.esperar("erro", () => true, desde)).toMatchObject({ mensagem: "Já tem este talento" });
  });

  it("kit entrega os itens de uma vez, e jogador não entrega kit", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const id = await personagemAtivo(mestre, jogador);
    mestre.enviar({ t: "kit_salvar", kit: { id: "kit-1", nome: "Básico", itens: [{ itemId: "item.bigorna", nome: "Bigorna", quantidade: 1 }, { itemId: null, nome: "Corda", quantidade: 2 }] } });
    await mestre.esperar("estado_mestre", (m) => m.kits.length === 1);
    jogador.enviar({ t: "kit_entregar", personagemId: id, kitId: "kit-1" });
    await jogador.esperar("erro", (m) => m.codigo === "nao_autorizado");
    mestre.enviar({ t: "kit_entregar", personagemId: id, kitId: "kit-1" });
    await aguardar(jogador, (p) => p.ficha.inventario.length === 2);
  });

  it("opções da campanha: Cartas do Destino começam ligadas, e só o mestre muda", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador } = await jogadorAprovado(mestre, codigo, "Ana");
    const { mesa } = await jogador.esperar("bem_vindo");
    expect(mesa.opcoes.cartasDoDestino).toBe(true);
    const opcoes = { ...mesa.opcoes, estresse: true };
    jogador.enviar({ t: "opcoes_campanha", opcoes });
    await jogador.esperar("erro", (m) => m.codigo === "nao_autorizado");
    mestre.enviar({ t: "opcoes_campanha", opcoes });
    await jogador.esperar("opcoes_campanha", (m) => m.opcoes.estresse);
  });

  it("o conteúdo da ficha exige token e não leva criaturas", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { token } = await jogadorAprovado(mestre, codigo, "Ana");
    const url = `http://127.0.0.1:${servidor.porta}/api/conteudo-ficha`;
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { Authorization: "Bearer inventado" } })).status).toBe(401);
    const resposta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    expect(resposta.status).toBe(200);
    const conteudo = (await resposta.json()) as Record<string, unknown[]>;
    expect(conteudo.classes).toHaveLength(2);
    expect(conteudo).not.toHaveProperty("criaturas");
    expect(conteudo).not.toHaveProperty("ameacas");
  });

  it("sem pacote, a mesa abre e a ficha diz que não há conteúdo", async () => {
    await servidor.encerrar();
    rmSync(pasta, { recursive: true, force: true });
    pasta = mkdtempSync(join(tmpdir(), "odm-Área-"));
    servidor = await subir();
    const { mestre } = await mestreComMesa();
    const { mesa } = await mestre.esperar("bem_vindo");
    expect(mesa.conteudo).toBe(false);
  });
});

describe("transporte", () => {
  it("recusa WebSocket de outra origem", async () => {
    await expect(abrir({ Origin: "http://site-de-fora.example" })).rejects.toThrow();
  });

  it("recusa Host que não seja IP nem localhost", async () => {
    await expect(abrir({ Host: "site-de-fora.example" })).rejects.toThrow();
  });

  it("aceita a própria origem", async () => {
    const cliente = await abrir({ Origin: `http://127.0.0.1:${servidor.porta}` });
    expect(cliente.ws.readyState).toBe(WebSocket.OPEN);
  });

  it("a página de teste abre sem mesa, é leve e não mostra nada da campanha", async () => {
    const { codigo } = await mestreComMesa("Segredo de Boa Esperança");
    const resposta = await fetch(`http://127.0.0.1:${servidor.porta}/teste`);
    const pagina = await resposta.text();
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("content-type")).toContain("text/html");
    expect(pagina).toContain("Este aparelho alcançou a mesa");
    expect(pagina.length).toBeLessThan(1500);
    expect(pagina).not.toContain("Segredo");
    expect(pagina).not.toContain(codigo);

    const script = await fetch(`http://127.0.0.1:${servidor.porta}/teste.js`);
    expect(script.headers.get("content-type")).toContain("javascript");
    expect(await script.text()).toContain(CAMINHO_WS);
  });

  it("em desenvolvimento, o painel mostra a porta da página e a situação do firewall", async () => {
    await servidor.encerrar();
    servidor = await iniciarServidor({
      porta: 0,
      host: "127.0.0.1",
      pastaDados: join(pasta, "dados-dev"),
      pastaMigracoes: PASTA_MIGRACOES,
      tokenMestre: TOKEN_MESTRE,
      portaWeb: 5173,
      firewallDev: () => "bloqueado",
    });
    const { mestre } = await mestreComMesa();
    const { rede } = await mestre.esperar("estado_mestre");
    expect(rede.porta).toBe(5173);
    expect(rede.firewallDev).toBe("bloqueado");
  });

  it("responde na rota de saúde", async () => {
    const resposta = await fetch(`http://127.0.0.1:${servidor.porta}/api/saude`);
    expect(await resposta.json()).toEqual({ ok: true, protocolo: VERSAO_PROTOCOLO });
  });

  it("porta ocupada vira um erro claro, e o banco fica liberado", async () => {
    const bloqueio = createServer();
    await new Promise<void>((r) => bloqueio.listen(0, "127.0.0.1", r));
    const porta = (bloqueio.address() as { port: number }).port;
    await expect(
      iniciarServidor({
        porta,
        host: "127.0.0.1",
        pastaDados: join(pasta, "outra"),
        pastaMigracoes: PASTA_MIGRACOES,
        tokenMestre: TOKEN_MESTRE,
      }),
    ).rejects.toBeInstanceOf(PortaOcupada);
    await new Promise((r) => bloqueio.close(r));
    expect(readdirSync(join(pasta, "outra"))).toContain("odm.sqlite");
    rmSync(join(pasta, "outra"), { recursive: true, force: true });
  });
});

describe("combate", () => {
  const criatura = {
    id: "criatura.sombra",
    tipo: "criatura",
    nome: "Sombra",
    fonte: { arquivo: "exemplo.md" },
    texto: "",
    categoria: null,
    descricao: null,
    defesa: 11,
    defesaTexto: "11",
    pv: 13,
    pvTexto: "13 (+7 PV)",
    deslocamentoM: 6,
    atributos: { brutalidade: 1, agilidade: 1, fibra: 1, intelecto: 0, astucia: 0, presenca: 0 },
    extras: [],
    nd: "1",
    xp: 10,
    secoes: [],
  };

  const pacoteDeCombate = () =>
    PacoteConteudo.parse({
      manifesto: { id: "base", nome: "Exemplo", versao: "1.0" },
      conteudo: { ...conteudoExemplo(), regras: [...conteudoExemplo().regras, ...regrasDeCombateExemplo()], efeitos: efeitosExemplo(), criaturas: [criatura] },
    });

  beforeEach(async () => {
    await servidor.encerrar();
    rmSync(pasta, { recursive: true, force: true });
    pasta = mkdtempSync(join(tmpdir(), "odm-Área-"));
    servidor = await subir(undefined, [pacoteDeCombate()]);
  });

  const CRIACAO = { nome: "Zé", origemId: "origem.sem-revisao", classeId: "classe.rufiao", atributos: { brutalidade: 3, agilidade: 2, fibra: 1, intelecto: 0, astucia: 0, presenca: -1 }, pericias: ["pericia.faro"], ferramentas: ["Lima"] };

  async function mesaDeCombate() {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id: jogadorId } = await jogadorAprovado(mestre, codigo, "Ana");
    jogador.enviar({ t: "personagem_criar" });
    const { personagem } = await jogador.esperar("personagem");
    jogador.enviar({ t: "personagem_salvar", personagemId: personagem.id, ficha: CRIACAO });
    await jogador.esperar("personagem", (m) => m.personagem.ficha.nome === "Zé");
    jogador.enviar({ t: "personagem_concluir", personagemId: personagem.id });
    await mestre.esperar("personagem", (m) => m.personagem.situacao === "ativo");
    await jogador.esperar("personagem", (m) => m.personagem.situacao === "ativo");
    return { mestre, jogador, jogadorId, personagemId: personagem.id };
  }

  type CombateVisto = NonNullable<Extract<Msg, { t: "combate" }>["combate"]>;
  const ultimoCombate = (c: Cliente) => ([...c.recebidas].reverse().find((m) => m.t === "combate") as Extract<Msg, { t: "combate" }> | undefined)?.combate ?? null;
  const esperarCombate = (c: Cliente, teste: (m: CombateVisto) => boolean) => {
    const atual = ultimoCombate(c);
    if (atual && teste(atual)) return Promise.resolve({ t: "combate" as const, combate: atual });
    return c.esperar("combate", (m) => !!m.combate && teste(m.combate), c.recebidas.length);
  };

  /* Monta, compra e resolve a iniciativa até poder começar, decidindo carta especial e empate como vier. */
  async function combateEmCurso(mestre: Cliente, personagemId: string) {
    mestre.enviar({ t: "combate_criar", personagens: [personagemId], criaturas: [{ ref: "criatura.sombra", quantidade: 2, elite: false }] });
    await esperarCombate(mestre, (c) => c.fase === "iniciativa");
    mestre.enviar({ t: "iniciativa_comprar" });
    let combate = (await esperarCombate(mestre, (c) => c.combatentes.every((x) => x.carta || x.cartasParaEscolher.length))).combate!;
    for (const c of combate.combatentes.filter((x) => x.usaEfeito === null)) {
      mestre.enviar({ t: "iniciativa_efeito", combatenteId: c.id, usar: false });
      combate = (await esperarCombate(mestre, (x) => x.combatentes.find((y) => y.id === c.id)!.usaEfeito === false)).combate!;
    }
    for (let i = 0; i < 6; i++) {
      const antes = mestre.recebidas.length;
      mestre.enviar({ t: "combate_comecar" });
      const r = await Promise.race([mestre.esperar("combate", (m) => m.combate?.fase === "em_curso", antes), mestre.esperar("erro", () => true, antes)]);
      if (r.t === "combate") return r.combate!;
      const depois = mestre.recebidas.length;
      mestre.enviar({ t: "iniciativa_desempatar" });
      await mestre.esperar("combate", () => true, depois);
    }
    throw new Error("Iniciativa não fechou");
  }

  it("sem as regras de combate aprovadas, diz quais faltam", async () => {
    await servidor.encerrar();
    servidor = await subir(undefined, [pacoteExemplo()]);
    const { mestre } = await mestreComMesa();
    mestre.enviar({ t: "combate_criar", personagens: [], criaturas: [] });
    const erro = await mestre.esperar("erro");
    expect(erro.mensagem).toMatch(/regras revisadas.*regra\.iniciativa/);
  });

  it("monta o combate com o personagem e criaturas numeradas, e o jogador não vê PV nem baralho", async () => {
    const { mestre, jogador, personagemId } = await mesaDeCombate();
    mestre.enviar({ t: "combate_criar", personagens: [personagemId], criaturas: [{ ref: "criatura.sombra", quantidade: 2, elite: true }] });
    const { combate } = await esperarCombate(mestre, (c) => c.fase === "iniciativa");
    expect(combate!.combatentes.map((c) => c.nome)).toEqual(["Zé", "Sombra Elite 1", "Sombra Elite 2"]);
    expect(combate!.combatentes[1]!.pvMaximo).toBe(20);
    expect(combate!.baralho).toHaveLength(54);
    const visto = (await esperarCombate(jogador, (c) => c.fase === "iniciativa")).combate!;
    expect(visto.baralho).toEqual([]);
    expect(visto.combatentes[1]).toMatchObject({ pv: null, pvMaximo: null });
    expect(jogador.brutas.join()).not.toMatch(/"pvMaximo":20|"inversas"/);
  });

  it("o jogador compra a própria carta, mas não compra para todos nem começa o combate", async () => {
    const { mestre, jogador, personagemId } = await mesaDeCombate();
    mestre.enviar({ t: "combate_criar", personagens: [personagemId], criaturas: [{ ref: "criatura.sombra", quantidade: 1, elite: false }] });
    const { combate } = await esperarCombate(jogador, (c) => c.fase === "iniciativa");
    const meu = combate!.combatentes.find((c) => c.personagemId === personagemId)!;
    const outro = combate!.combatentes.find((c) => c.personagemId === null)!;
    jogador.enviar({ t: "iniciativa_comprar" });
    expect((await jogador.esperar("erro")).mensagem).toBe("Só o mestre compra para todos.");
    jogador.enviar({ t: "iniciativa_comprar", combatenteId: outro.id });
    await jogador.esperar("erro", (m) => m.mensagem === "Esta carta não é sua.");
    jogador.enviar({ t: "iniciativa_comprar", combatenteId: meu.id });
    await esperarCombate(jogador, (c) => !!c.combatentes.find((x) => x.id === meu.id)!.carta);
    jogador.enviar({ t: "combate_comecar" });
    await jogador.esperar("erro", (m) => m.mensagem === "Só o mestre faz isso.");
  });

  it("começar exige todas as cartas decididas", async () => {
    const { mestre, personagemId } = await mesaDeCombate();
    mestre.enviar({ t: "combate_criar", personagens: [personagemId], criaturas: [] });
    await esperarCombate(mestre, (c) => c.fase === "iniciativa");
    mestre.enviar({ t: "combate_comecar" });
    expect((await mestre.esperar("erro")).mensagem).toBe("Ainda há quem não comprou carta.");
  });

  it("turnos: PA do turno, guardado no fim, fim da rodada e nova rodada", async () => {
    const { mestre, personagemId } = await mesaDeCombate();
    const combate = await combateEmCurso(mestre, personagemId);
    expect(combate.rodada).toBe(1);
    const primeiro = combate.combatentes.find((c) => c.id === combate.ordem[0])!;
    expect(primeiro.pa.disponiveis).toBeGreaterThanOrEqual(3);
    mestre.enviar({ t: "pa_gastar", combatenteId: primeiro.id, quantos: 1, tipo: "acao" });
    await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === primeiro.id)!.pa.disponiveis === primeiro.pa.disponiveis - 1);
    for (let i = 0; i < 3; i++) {
      mestre.enviar({ t: "turno_encerrar" });
      await esperarCombate(mestre, (c) => (i < 2 ? c.vez === i + 1 : c.fase === "fim_da_rodada"));
    }
    const fim = ultimoCombate(mestre)!;
    expect(fim.combatentes.find((x) => x.id === primeiro.id)!.pa.guardados).toBe(primeiro.pa.disponiveis - 1);
    mestre.enviar({ t: "rodada_nova" });
    const nova = (await esperarCombate(mestre, (c) => c.rodada === 2)).combate!;
    expect(nova.combatentes.every((x) => x.pa.guardados === 0)).toBe(true);
    expect(nova.vez).toBe(0);
  });

  it("fora do turno, o jogador só gasta PA guardado em reação", async () => {
    const { mestre, jogador, personagemId } = await mesaDeCombate();
    const combate = await combateEmCurso(mestre, personagemId);
    const meu = combate.combatentes.find((c) => c.personagemId === personagemId)!;
    if (combate.ordem[0] === meu.id) {
      jogador.enviar({ t: "turno_encerrar" });
      await esperarCombate(jogador, (c) => c.vez === 1);
    }
    jogador.enviar({ t: "pa_gastar", combatenteId: meu.id, quantos: 1, tipo: "acao" });
    expect((await jogador.esperar("erro", (m) => /reação|PA guardado/.test(m.mensagem))).mensagem).toMatch(/reação|PA guardado/);
  });

  it("o terceiro deslocamento dá Exaustão no personagem, e o jogador desfaz o próprio gasto no turno dele", async () => {
    const { mestre, jogador, personagemId } = await mesaDeCombate();
    let combate = await combateEmCurso(mestre, personagemId);
    const meu = combate.combatentes.find((c) => c.personagemId === personagemId)!;
    while (combate.ordem[combate.vez] !== meu.id) {
      const vez = combate.vez;
      mestre.enviar({ t: "turno_encerrar" });
      combate = (await esperarCombate(mestre, (c) => c.vez === vez + 1)).combate!;
    }
    for (let i = 0; i < 3; i++) {
      jogador.enviar({ t: "pa_gastar", combatenteId: meu.id, quantos: 1, tipo: "deslocamento" });
      await esperarCombate(jogador, (c) => c.combatentes.find((x) => x.id === meu.id)!.deslocamentosNaRodada === i + 1);
    }
    const { personagem } = await jogador.esperar("personagem", (m) => m.personagem.vivo.exaustao === 1);
    expect(personagem.id).toBe(personagemId);

    const ultimo = jogador.eventos().filter((e) => e.tipo === "combate_visto").at(-1)!;
    jogador.enviar({ t: "combate_desfazer", eventoId: ultimo.id });
    await jogador.esperar("personagem", (m) => m.personagem.vivo.exaustao === 0);
    await jogador.esperar("evento", (m) => m.evento.tipo === "combate_desfeito");

    jogador.enviar({ t: "turno_encerrar" });
    await esperarCombate(jogador, (c) => c.ordem[c.vez] !== meu.id || c.fase === "fim_da_rodada");
    const segundo = jogador.eventos().filter((e) => e.tipo === "combate_visto" && e.dados.rotulo.includes("deslocamento")).at(-2)!;
    jogador.enviar({ t: "combate_desfazer", eventoId: segundo.id });
    expect((await jogador.esperar("erro", (m) => /turno já acabou/.test(m.mensagem))).mensagem).toMatch(/só o mestre/);
    mestre.enviar({ t: "combate_desfazer", eventoId: segundo.id });
    await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === meu.id)!.deslocamentosNaRodada === 1);
  });

  it("encerrar o combate fecha para todos, e o mestre pode desfazer o encerramento", async () => {
    const { mestre, jogador, personagemId } = await mesaDeCombate();
    await combateEmCurso(mestre, personagemId);
    mestre.enviar({ t: "combate_encerrar" });
    await jogador.esperar("combate", (m) => m.combate === null);
    const fim = mestre.eventos().filter((e) => e.tipo === "combate").at(-1)!;
    mestre.enviar({ t: "combate_desfazer", eventoId: fim.id });
    await jogador.esperar("combate", (m) => m.combate?.fase === "em_curso");
  });

  it("o bestiário vai só para o mestre, pela máquina dele", async () => {
    await mestreComMesa();
    const sem = await fetch(`http://127.0.0.1:${servidor.porta}/api/conteudo-mestre`, { headers: { Authorization: "Bearer outro-token-qualquer-000000" } });
    expect(sem.status).toBe(401);
    const com = await fetch(`http://127.0.0.1:${servidor.porta}/api/conteudo-mestre`, { headers: { Authorization: `Bearer ${TOKEN_MESTRE}` } });
    const corpo = (await com.json()) as { criaturas: { id: string }[] };
    expect(corpo.criaturas.map((c) => c.id)).toEqual(["criatura.sombra"]);
  });
  describe("testes pedidos", () => {
    /* Dados na ordem em que o servidor vai pedir; depois deles, sempre 10. */
    let fila: number[] = [];
    beforeEach(async () => {
      fila = [];
      await servidor.encerrar();
      servidor = await subir((minimo) => fila.shift() ?? Math.max(minimo, 10), [pacoteDeCombate()]);
    });

    type Resultado = Extract<EventoCompleto, { tipo: "teste_resultado" }>;
    const resultado = (c: Cliente, filtro: (r: Resultado) => boolean = () => true, desde = 0) =>
      c.esperar("evento", (m) => m.evento.tipo === "teste_resultado" && filtro(m.evento as Resultado), desde).then((m) => m.evento as Resultado);
    const soma = (r: Resultado) => (r.dados.natural ?? 0) + r.dados.modificadores.reduce((s, p) => s + p.valor, 0);

    it("DT oculta: o jogador rola sem saber a DT, e o resultado chega a ele sem ela", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      fila = [7];
      mestre.enviar({ t: "pedir_teste", pedido: { id: "t1", tipo: "resistencia", atributo: "fibra", dt: 77, dtVisivel: false, personagens: [{ personagemId }] } });
      const { evento: visto } = await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      expect(visto.tipo === "teste_pedido_visto" && visto.dados.pedido.personagens[0]!.dt).toBeNull();

      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t1", personagemId, bonus: 2 } });
      const doMestre = await resultado(mestre);
      expect(visto.tipo === "teste_pedido_visto" && visto.dados.pedido.rotulo).toBe("Resistência de Fibra");
      expect(doMestre.dados).toMatchObject({ estado: "rolado", natural: 7, dt: 77, sucesso: false, rotulo: "Resistência de Fibra" });
      expect(doMestre.dados.total).toBe(soma(doMestre));
      expect(doMestre.dados.modificadores).toContainEqual({ rotulo: "Bônus", valor: 2 });

      const doJogador = await resultado(jogador);
      expect(doJogador.dados.dt).toBeNull();
      expect(doJogador.dados.sucesso).toBe(false);
      expect(jogador.brutas.join()).not.toContain('"dt":77');

      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t1", personagemId } });
      await jogador.esperar("erro", (m) => /já foi feito/.test(m.mensagem));
    });

    it("o ajuste do mestre soma com o do jogador, e vantagem de um anula a desvantagem do outro", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      fila = [4, 18];
      mestre.enviar({
        t: "pedir_teste",
        pedido: { id: "ta", tipo: "habilidade", teste: { alvo: "atributo", atributo: "fibra" }, dt: 10, personagens: [{ personagemId, bonus: -3, modo: "desvantagem" }] },
      });
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "ta", personagemId, bonus: 1, modo: "vantagem" } });
      const r = await resultado(mestre);
      expect(r.dados.dados).toEqual([4]);
      expect(r.dados.modificadores).toContainEqual({ rotulo: "Ajuste do mestre", valor: -3 });
      expect(r.dados.modificadores).toContainEqual({ rotulo: "Bônus", valor: 1 });
    });

    it("passivo: o mestre recebe o valor contra a DT, e o jogador não recebe nenhum byte", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      const antes = jogador.brutas.length;
      mestre.enviar({
        t: "pedir_teste",
        pedido: { id: "t2", tipo: "passivo", teste: { alvo: "pericia", periciaId: "pericia.percepcao" }, dt: 66, origem: "Alçapão", personagens: [{ personagemId }] },
      });
      const r = await resultado(mestre);
      expect(r.dados).toMatchObject({ estado: "passivo", natural: null, dt: 66, sucesso: false });
      expect(r.dados.modificadores[0]).toEqual({ rotulo: "Base", valor: 10 });
      expect(r.dados.total).toBe(r.dados.modificadores.reduce((s, p) => s + p.valor, 0));

      mestre.enviar({ t: "rolar", bonus: 0 });
      await jogador.esperar("evento", (m) => m.evento.tipo === "rolagem", antes);
      const novas = jogador.brutas.slice(antes);
      expect(novas).toHaveLength(1);
      expect(novas.join()).not.toMatch(/Alçapão|percepcao|"dt":66/);
    });

    it("automático rola a resistência sozinho; teste de habilidade continua esperando o jogador", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      jogador.enviar({ t: "automatico", personagemId, ligado: true });
      await jogador.esperar("personagem", (m) => m.personagem.vivo.automatico);

      mestre.enviar({ t: "pedir_teste", pedido: { id: "t3", tipo: "resistencia", atributo: "agilidade", dt: 5, personagens: [{ personagemId }] } });
      expect((await resultado(mestre, (r) => r.dados.pedidoId === "t3")).dados).toMatchObject({ automatico: true, estado: "rolado" });

      const antes = mestre.recebidas.length;
      mestre.enviar({ t: "pedir_teste", pedido: { id: "t4", tipo: "habilidade", teste: { alvo: "atributo", atributo: "intelecto" }, dt: 5, personagens: [{ personagemId }] } });
      await mestre.esperar("evento", (m) => m.evento.tipo === "teste_pedido" && m.evento.dados.pedido.id === "t4", antes);
      mestre.enviar({ t: "rolar", bonus: 0 });
      await mestre.esperar("evento", (m) => m.evento.tipo === "rolagem", antes);
      expect(mestre.eventos().some((e) => e.tipo === "teste_resultado" && e.dados.pedidoId === "t4")).toBe(false);
    });

    it("recusar fica no cartão do mestre; a falha decidida por ele aplica o efeito, com desfazer", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      mestre.enviar({
        t: "pedir_teste",
        pedido: { id: "t5", tipo: "resistencia", atributo: "presenca", dt: 12, personagens: [{ personagemId }], efeitoNaFalha: { efeitoId: "efeito.medroso" }, origem: "Grito" },
      });
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      jogador.enviar({ t: "recusar_teste", pedidoId: "t5", personagemId });
      expect((await resultado(mestre)).dados.estado).toBe("recusado");

      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t5", personagemId } });
      await jogador.esperar("erro", (m) => /mestre decide/.test(m.mensagem));
      jogador.enviar({ t: "decidir_teste", pedidoId: "t5", personagemId, acao: "falha" });
      await jogador.esperar("erro", (m) => /Só o mestre/.test(m.mensagem));

      mestre.enviar({ t: "decidir_teste", pedidoId: "t5", personagemId, acao: "falha" });
      const decidido = await resultado(mestre, (r) => r.dados.estado === "decidido");
      expect(decidido.dados.sucesso).toBe(false);
      expect(decidido.dados.efeitoAplicado).not.toBeNull();
      await jogador.esperar("personagem", (m) => m.personagem.vivo.efeitos.some((e) => e.efeitoId === "efeito.medroso"));

      mestre.enviar({ t: "combate_desfazer", eventoId: decidido.dados.efeitoAplicado! });
      await jogador.esperar("personagem", (m) => m.personagem.vivo.efeitos.length === 0);
    });

    it("Forçar a Rolagem: uma vez, só depois de falhar, com a DT do pacote; o sucesso tira o efeito da falha", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      fila = [1];
      mestre.enviar({
        t: "pedir_teste",
        pedido: { id: "t6", tipo: "habilidade", teste: { alvo: "atributo", atributo: "brutalidade" }, dt: 15, personagens: [{ personagemId }], efeitoNaFalha: { efeitoId: "efeito.medroso" } },
      });
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t6", personagemId } });
      const falha = await resultado(jogador);
      expect(falha.dados.sucesso).toBe(false);
      await jogador.esperar("personagem", (m) => m.personagem.vivo.efeitos.some((e) => e.efeitoId === "efeito.medroso"));

      fila = [19];
      jogador.enviar({ t: "forcar_rolagem", resultadoId: falha.id });
      const forcado = await resultado(mestre, (r) => r.dados.forcado);
      /* A DT cai pelo valor do pacote (−2 no exemplo), e o mestre recebe o lembrete da consequência. */
      expect(forcado.dados).toMatchObject({ dt: 13, sucesso: true, consequencia: true, anteriorId: falha.id, efeitoAplicado: null });
      await jogador.esperar("personagem", (m) => m.personagem.vivo.efeitos.length === 0);

      jogador.enviar({ t: "forcar_rolagem", resultadoId: forcado.id });
      await jogador.esperar("erro", (m) => /depois de uma falha|já foi forçada/.test(m.mensagem));
      jogador.enviar({ t: "forcar_rolagem", resultadoId: falha.id });
      await jogador.esperar("erro", (m) => /substituído/.test(m.mensagem));
    });

    it("resistência não pode ser forçada", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      fila = [1];
      mestre.enviar({ t: "pedir_teste", pedido: { id: "t7", tipo: "resistencia", atributo: "fibra", dt: 15, personagens: [{ personagemId }] } });
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t7", personagemId } });
      const falha = await resultado(jogador);
      jogador.enviar({ t: "forcar_rolagem", resultadoId: falha.id });
      await jogador.esperar("erro", (m) => /só em teste de habilidade/.test(m.mensagem));
    });

    it("contestado: o oponente rola uma vez, fica oculto para o jogador, e no empate vence quem age", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      const pedido = (id: string, quemAge: "personagem" | "oponente") => ({
        id,
        tipo: "contestado" as const,
        teste: { alvo: "pericia" as const, periciaId: "pericia.faro" },
        oponente: { nome: "Vigia", teste: { alvo: "pericia" as const, periciaId: "pericia.percepcao" }, bonus: 0 },
        quemAge,
        personagens: [{ personagemId }],
      });
      /* Sem fila, o oponente tira 10 + 0. */
      mestre.enviar({ t: "pedir_teste", pedido: pedido("t8", "personagem") });
      const { evento: gravado } = await mestre.esperar("evento", (m) => m.evento.tipo === "teste_pedido");
      expect(gravado.tipo === "teste_pedido" && gravado.dados.oponente?.total).toBe(10);
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t8", personagemId } });
      const primeiro = await resultado(mestre, (r) => r.dados.pedidoId === "t8");
      const modificador = primeiro.dados.modificadores.reduce((s, p) => s + p.valor, 0);
      expect(primeiro.dados.sucesso).toBe((primeiro.dados.total ?? 0) >= 10);

      /* Agora o personagem empata, e quem age é o oponente. */
      const antes = jogador.recebidas.length;
      fila = [10, 10 - modificador];
      mestre.enviar({ t: "pedir_teste", pedido: pedido("t9", "oponente") });
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto" && m.evento.dados.pedido.id === "t9", antes);
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t9", personagemId } });
      const empate = await resultado(mestre, (r) => r.dados.pedidoId === "t9");
      expect(empate.dados.total).toBe(10);
      expect(empate.dados.sucesso).toBe(false);
      const visto = await resultado(jogador, (r) => r.dados.pedidoId === "t9");
      expect(visto.dados.oponente).toEqual({ nome: "Oponente", total: null, dados: [], visivel: false });
      expect(jogador.brutas.join()).not.toContain("Vigia");
      expect(visto.dados.rotulo).toBe("Faro (contestado)");
    });

    it("Carta do Destino: o mestre dá, o jogador usa num teste de habilidade e ela some", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      mestre.enviar({ t: "carta_do_destino", personagemId, tem: true });
      await jogador.esperar("personagem", (m) => m.personagem.vivo.cartaDoDestino);
      fila = [2];
      mestre.enviar({ t: "pedir_teste", pedido: { id: "t10", tipo: "habilidade", teste: { alvo: "atributo", atributo: "intelecto" }, dt: 30, personagens: [{ personagemId }] } });
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t10", personagemId, usarCartaDoDestino: true } });
      const r = await resultado(mestre);
      expect(r.dados).toMatchObject({ natural: 20, critico: "acerto", sucesso: true, cartaDoDestino: true });
      await jogador.esperar("personagem", (m) => !m.personagem.vivo.cartaDoDestino);

      jogador.enviar({ t: "teste_rapido", personagemId, tipo: "habilidade", teste: { alvo: "atributo", atributo: "intelecto" }, usarCartaDoDestino: true });
      await jogador.esperar("erro", (m) => /não tem Carta do Destino/.test(m.mensagem));
    });

    it("teste rápido do jogador não tem DT e aparece para todos; Fazer com Calma troca o d20 por 10", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      fila = [3];
      jogador.enviar({ t: "teste_rapido", personagemId, tipo: "habilidade", teste: { alvo: "pericia", periciaId: "pericia.faro" }, opcao: "fazer_com_calma" });
      const r = await resultado(mestre);
      expect(r.dados).toMatchObject({ pedidoId: null, dt: null, sucesso: null, natural: 10, opcao: "fazer_com_calma", rotulo: "Teste de Faro" });
    });

    it("ninguém responde pelo personagem de outro jogador", async () => {
      const { mestre, codigo } = await mestreComMesa();
      const bia = await jogadorAprovado(mestre, codigo, "Bia");
      const ana = await jogadorAprovado(mestre, codigo, "Ana");
      ana.jogador.enviar({ t: "personagem_criar" });
      const { personagem } = await ana.jogador.esperar("personagem");
      ana.jogador.enviar({ t: "personagem_salvar", personagemId: personagem.id, ficha: CRIACAO });
      await ana.jogador.esperar("personagem", (m) => m.personagem.ficha.nome === "Zé");
      ana.jogador.enviar({ t: "personagem_concluir", personagemId: personagem.id });
      await mestre.esperar("personagem", (m) => m.personagem.situacao === "ativo");

      mestre.enviar({ t: "pedir_teste", pedido: { id: "t11", tipo: "resistencia", atributo: "fibra", dt: 10, personagens: [{ personagemId: personagem.id }] } });
      await ana.jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
      bia.jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "t11", personagemId: personagem.id } });
      await bia.jogador.esperar("erro", (m) => /não é seu/.test(m.mensagem));
      expect(bia.jogador.eventos().some((e) => e.tipo === "teste_pedido_visto")).toBe(false);
    });
  });
  describe("ataques, dano e efeitos", () => {
    /* Dados na ordem em que o servidor vai pedir; depois deles, o meio do dado. */
    let fila: number[] = [];
    const garra = {
      id: "criatura.sombra.garra",
      tipo: "acao" as const,
      nome: "Garra",
      rotulo: "Garra",
      fonte: { arquivo: "exemplo.md" },
      texto: "",
      custoPa: 1,
      recargaCriatura: null,
      elite: false,
      inicio: false,
      combo: false,
      secao: "Ações",
      mecanica: { custo: { pa: 1 }, tipo: "corpo_a_corpo", acerto: 4, alcance_m: 1, alvos: 1, dano: { formula: "1d6+2", tipo: "cortante" }, propriedade: "inicio" },
    };
    const pacoteDeAtaque = () => {
      const base = conteudoExemplo();
      return PacoteConteudo.parse({
        manifesto: { id: "base", nome: "Exemplo", versao: "1.0" },
        conteudo: {
          ...base,
          regras: [
            ...base.regras.map((r) => (r.id === "regra.seu-turno" ? { ...r, mecanica: { ...r.mecanica, acao_padrao: { ataque_com_arma: { pa: 1 } } } } : r)),
            ...regrasDeCombateExemplo(),
          ],
          efeitos: [
            ...efeitosExemplo(),
            { id: "efeito.deitado", tipo: "efeito", nome: "Deitado", fonte: { arquivo: "exemplo.md" }, texto: "", mecanica: { acoes: [{ nome: "Levantar", custo: { pa: 1 }, faz: { encerrar: true } }] } },
          ],
          itens: [
            ...base.itens,
            {
              id: "item.porrete",
              tipo: "item",
              nome: "Porrete",
              categoria: "arma",
              fonte: { arquivo: "exemplo.md" },
              texto: "",
              departamento: null,
              preco: null,
              campos: {},
              mecanica: { peso_kg: 1, ataque: { categoria: "armas_simples", tipo: "corpo_a_corpo", alcance_m: 1, atributo: "brutalidade", dano: { formula: "1d6", tipo: "contundente" } } },
            },
          ],
          criaturas: [{ ...criatura, secoes: [{ titulo: "Ações", itens: [garra] }] }],
        },
      });
    };

    beforeEach(async () => {
      fila = [];
      await servidor.encerrar();
      servidor = await subir((minimo, maximo) => fila.shift() ?? Math.min(maximo, Math.max(minimo, 10)), [pacoteDeAtaque()]);
    });

    const esperarRotulo = (c: Cliente, tipo: "combate" | "combate_visto", padrao: RegExp) =>
      c.esperar("evento", (m) => m.evento.tipo === tipo && padrao.test(m.evento.tipo === "combate" ? (m.evento.dados.rotuloMestre ?? m.evento.dados.rotulo) : m.evento.tipo === "combate_visto" ? m.evento.dados.rotulo : ""), 0);

    /* Avança turnos até a vez de quem o teste quer. */
    async function ateAVezDe(mestre: Cliente, id: string) {
      for (let i = 0; i < 8; i++) {
        const c = ultimoCombate(mestre)!;
        if (c.fase === "em_curso" && c.ordem[c.vez] === id) return c;
        const antes = mestre.recebidas.length;
        mestre.enviar(c.fase === "fim_da_rodada" ? { t: "rodada_nova" } : { t: "turno_encerrar" });
        await mestre.esperar("combate", () => true, antes);
      }
      throw new Error("A vez não chegou");
    }

    /* Uma criatura que pode atacar agora sem virar a rodada (que zera o PA guardado): a da vez, ou no fim da rodada
       uma com PA guardado. */
    async function criaturaPronta(mestre: Cliente) {
      for (let i = 0; i < 8; i++) {
        const c = ultimoCombate(mestre)!;
        if (c.fase === "fim_da_rodada") {
          const s = c.combatentes.find((x) => x.tipo === "criatura" && x.pa.guardados > 0);
          if (s) return s.id;
          throw new Error("Nenhuma criatura com PA guardado");
        }
        const vez = c.combatentes.find((x) => x.id === c.ordem[c.vez])!;
        if (vez.tipo === "criatura") return vez.id;
        const antes = mestre.recebidas.length;
        mestre.enviar({ t: "turno_encerrar" });
        await mestre.esperar("combate", () => true, antes);
      }
      throw new Error("Nenhuma criatura pronta");
    }

    async function montar() {
      const mesa = await mesaDeCombate();
      const combate = await combateEmCurso(mesa.mestre, mesa.personagemId);
      const meu = combate.combatentes.find((c) => c.personagemId === mesa.personagemId)!;
      const sombra = combate.combatentes.find((c) => c.tipo === "criatura")!;
      return { ...mesa, meu, sombra };
    }

    it("criatura ataca: rola contra a Defesa, aplica o dano e o jogador não vê o bônus dela", async () => {
      const { mestre, jogador, personagemId, sombra } = await montar();
      await ateAVezDe(mestre, sombra.id);
      const meu = ultimoCombate(mestre)!.combatentes.find((c) => c.personagemId === personagemId)!;
      fila = [15, 3];
      mestre.enviar({ t: "atacar", atacanteId: sombra.id, fonte: { tipo: "acao", acaoId: "criatura.sombra.garra" }, alvos: [meu.id] });
      const { evento } = await esperarRotulo(mestre, "combate", /atacou com Garra/);
      expect(evento.tipo === "combate" && evento.dados.rotuloMestre).toMatch(/19 contra Defesa \d+.*acertou\. 5 de dano cortante/);
      const visto = await esperarRotulo(jogador, "combate_visto", /atacou com Garra/);
      expect(visto.evento.tipo === "combate_visto" && visto.evento.dados.rotulo).not.toMatch(/\(\+/);
      await jogador.esperar("personagem", (m) => m.personagem.id === personagemId && m.personagem.vivo.pv !== null);
    });

    it("com PA guardado, o alvo escolhe a reação antes da rolagem; Esquiva soma Agilidade na Defesa", async () => {
      const { mestre, jogador, meu } = await montar();
      /* Zé guarda os 3 PA no turno dele. */
      await ateAVezDe(mestre, meu.id);
      jogador.enviar({ t: "turno_encerrar" });
      await esperarCombate(mestre, (c) => c.ordem[c.vez] !== meu.id || c.fase === "fim_da_rodada");
      const sombra = { id: await criaturaPronta(mestre) };
      mestre.enviar({ t: "atacar", atacanteId: sombra.id, fonte: { tipo: "acao", acaoId: "criatura.sombra.garra" }, alvos: [meu.id] });
      const { combate } = await esperarCombate(jogador, (c) => !!c.ataquePendente);
      expect(combate!.ataquePendente!.aguardando).toEqual([meu.id]);

      mestre.enviar({ t: ultimoCombate(mestre)!.fase === "fim_da_rodada" ? "rodada_nova" : "turno_encerrar" });
      await mestre.esperar("erro", (m) => /esperando reação/.test(m.mensagem));

      fila = [12, 4];
      jogador.enviar({ t: "reagir", combatenteId: meu.id, reacao: "esquiva" });
      await esperarRotulo(mestre, "combate", /reagiu com Esquiva/);
      const { evento } = await esperarRotulo(mestre, "combate", /atacou com Garra/);
      expect(evento.tipo === "combate" && evento.dados.rotuloMestre).toMatch(/\(Esquiva\)/);
      /* A reação do jogador disparou a rolagem, mas o ataque é do mestre: só ele desfaz. */
      expect(evento.autorNome).toBe("Mestre");
      jogador.enviar({ t: "combate_desfazer", eventoId: evento.id });
      await jogador.esperar("erro", (m) => /outra pessoa/.test(m.mensagem));
      const depois = await esperarCombate(mestre, (c) => !c.ataquePendente);
      const eu = depois.combate!.combatentes.find((c) => c.id === meu.id)!;
      expect(eu.pa.guardados).toBe(2);
      expect(eu.marcas.defesaDeReacao).toBeNull();
    });

    it("o mestre segue sem a reação, ou cancela o ataque", async () => {
      const { mestre, jogador, meu } = await montar();
      await ateAVezDe(mestre, meu.id);
      jogador.enviar({ t: "turno_encerrar" });
      await esperarCombate(mestre, (c) => c.ordem[c.vez] !== meu.id || c.fase === "fim_da_rodada");
      const sombra = { id: await criaturaPronta(mestre) };
      mestre.enviar({ t: "atacar", atacanteId: sombra.id, fonte: { tipo: "acao", acaoId: "criatura.sombra.garra" }, alvos: [meu.id] });
      await esperarCombate(mestre, (c) => !!c.ataquePendente);
      mestre.enviar({ t: "ataque_cancelar" });
      await esperarCombate(mestre, (c) => !c.ataquePendente);
      mestre.enviar({ t: "atacar", atacanteId: sombra.id, fonte: { tipo: "acao", acaoId: "criatura.sombra.garra" }, alvos: [meu.id] });
      await esperarCombate(mestre, (c) => !!c.ataquePendente);
      mestre.enviar({ t: "ataque_seguir" });
      await esperarRotulo(mestre, "combate", /atacou com Garra/);
      expect(ultimoCombate(mestre)!.combatentes.find((c) => c.id === meu.id)!.pa.guardados).toBe(3);
    });

    it("jogador ataca a criatura com a arma equipada: vê acertou ou errou, sem a Defesa nem os PV dela", async () => {
      const { mestre, jogador, personagemId, meu, sombra } = await montar();
      mestre.enviar({ t: "ficha_operar", personagemId, operacao: { op: "dar_item", item: { id: "qualquer", itemId: "item.porrete", nome: "Porrete", quantidade: 1, equipado: false, pesoKg: null } } });
      /* O id do item na ficha é do servidor. */
      const { personagem } = await jogador.esperar("personagem", (m) => m.personagem.ficha.inventario.some((i) => i.itemId === "item.porrete"), 0);
      const itemFichaId = personagem.ficha.inventario.find((i) => i.itemId === "item.porrete")!.id;
      await ateAVezDe(mestre, meu.id);

      jogador.enviar({ t: "atacar", atacanteId: meu.id, fonte: { tipo: "arma", itemFichaId }, alvos: [sombra.id] });
      await jogador.esperar("erro", (m) => /Equipe a arma/.test(m.mensagem));
      jogador.enviar({ t: "ficha_operar", personagemId, operacao: { op: "equipar", itemFichaId, equipado: true } });
      await jogador.esperar("personagem", (m) => m.personagem.ficha.inventario.some((i) => i.id === itemFichaId && i.equipado));

      const antes = jogador.brutas.length;
      fila = [14, 5];
      jogador.enviar({ t: "atacar", atacanteId: meu.id, fonte: { tipo: "arma", itemFichaId }, alvos: [sombra.id] });
      const visto = await esperarRotulo(jogador, "combate_visto", /atacou com Porrete/);
      const dados = visto.evento.tipo === "combate_visto" ? visto.evento.dados : null;
      expect(dados?.rotulo).toMatch(/Sombra 1: \d+, acertou\. \d+ de dano contundente/);
      expect(dados?.rolagem?.alvo).toEqual({ rotulo: "Defesa", valor: null });
      expect(dados?.rolagem?.modificadores.map((m) => m.rotulo)).toEqual(["Brutalidade", "Proficiência"]);
      const novas = jogador.brutas.slice(antes).join();
      expect(novas).not.toMatch(/Defesa 11|"pv":\d|rotuloMestre/);

      /* Segundo ataque no turno: ataques múltiplos, com o valor do pacote (−4 no exemplo). */
      jogador.enviar({ t: "atacar", atacanteId: meu.id, fonte: { tipo: "arma", itemFichaId }, alvos: [sombra.id] });
      const segundo = await jogador.esperar("evento", (m) => m.evento.tipo === "combate_visto" && m.evento.id !== visto.evento.id && /atacou com Porrete/.test(m.evento.dados.rotulo), 0);
      const mods = segundo.evento.tipo === "combate_visto" ? segundo.evento.dados.rolagem?.modificadores : [];
      expect(mods).toContainEqual({ rotulo: "Ataques múltiplos", valor: -4 });
    });

    it("criatura a 0 PV fica derrotada, e o desfazer traz de volta", async () => {
      const { mestre, sombra } = await montar();
      mestre.enviar({ t: "dano_aplicar", combatenteId: sombra.id, valor: 99, tipo: null });
      const { evento } = await esperarRotulo(mestre, "combate", /sofreu dano/);
      expect(evento.tipo === "combate" && evento.dados.rotuloMestre).toMatch(/foi derrotado/);
      await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === sombra.id)!.derrotado);
      mestre.enviar({ t: "combate_desfazer", eventoId: evento.id });
      await esperarCombate(mestre, (c) => !c.combatentes.find((x) => x.id === sombra.id)!.derrotado && c.combatentes.find((x) => x.id === sombra.id)!.pv === 13);
    });

    it("gatilhos: Sangria tira PV no início do turno e pede o teste no fim; passar tira um acúmulo", async () => {
      const { mestre, jogador, personagemId, meu } = await montar();
      mestre.enviar({ t: "efeito_aplicar", alvo: { tipo: "personagem", id: personagemId }, efeitoId: "efeito.sangria", acumulos: 2 });
      await jogador.esperar("personagem", (m) => m.personagem.vivo.efeitos.some((e) => e.efeitoId === "efeito.sangria" && e.acumulos === 2));
      const c = ultimoCombate(mestre)!;
      if (c.ordem[c.vez] === meu.id) {
        jogador.enviar({ t: "turno_encerrar" });
        await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", 0);
        jogador.enviar({ t: "responder_teste", resposta: { pedidoId: (jogador.eventos().find((e) => e.tipo === "teste_pedido_visto") as { dados: { pedido: { id: string } } }).dados.pedido.id, personagemId } });
        await jogador.esperar("evento", (m) => m.evento.tipo === "teste_resultado", 0);
      }
      fila = [3, 2];
      await ateAVezDe(mestre, meu.id);
      const { evento: inicio } = await esperarRotulo(jogador, "combate_visto", /Sangria ×2: .* perdeu 5 PV/);
      expect(inicio.tipo).toBe("combate_visto");

      const antes = jogador.recebidas.length;
      jogador.enviar({ t: "turno_encerrar" });
      const { evento: pedido } = await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", antes);
      expect(pedido.tipo === "teste_pedido_visto" && pedido.dados.pedido.personagens[0]!.dt).toBe(12);
      fila = [20];
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: pedido.tipo === "teste_pedido_visto" ? pedido.dados.pedido.id : "", personagemId } });
      await jogador.esperar("personagem", (m) => m.personagem.vivo.efeitos.find((e) => e.efeitoId === "efeito.sangria")?.acumulos === 1);
    });

    it("ação de efeito: Levantar custa 1 PA no turno e encerra o efeito; fora do turno, não dá", async () => {
      const { mestre, jogador, personagemId, meu } = await montar();
      mestre.enviar({ t: "efeito_aplicar", alvo: { tipo: "combatente", id: meu.id }, efeitoId: "efeito.deitado" });
      const { personagem } = await jogador.esperar("personagem", (m) => m.personagem.vivo.efeitos.some((e) => e.efeitoId === "efeito.deitado"));
      const efeito = personagem.vivo.efeitos.find((e) => e.efeitoId === "efeito.deitado")!;
      const c = ultimoCombate(mestre)!;
      if (c.ordem[c.vez] === meu.id) {
        jogador.enviar({ t: "turno_encerrar" });
        await esperarCombate(mestre, (x) => x.ordem[x.vez] !== meu.id || x.fase === "fim_da_rodada");
      }
      jogador.enviar({ t: "efeito_acao", alvo: { tipo: "personagem", id: personagemId }, efeitoAtivoId: efeito.id, indice: 0 });
      await jogador.esperar("erro", (m) => /só no turno/.test(m.mensagem));
      await ateAVezDe(mestre, meu.id);
      jogador.enviar({ t: "efeito_acao", alvo: { tipo: "personagem", id: personagemId }, efeitoAtivoId: efeito.id, indice: 0 });
      await jogador.esperar("personagem", (m) => !m.personagem.vivo.efeitos.some((e) => e.efeitoId === "efeito.deitado"));
      const agora = await esperarCombate(mestre, (x) => x.combatentes.find((y) => y.id === meu.id)!.pa.disponiveis === 2);
      expect(agora.combate).toBeTruthy();
    });

    it("rolagem livre oculta fica só com o mestre", async () => {
      const { mestre, jogador } = await montar();
      const antes = jogador.brutas.length;
      mestre.enviar({ t: "rolar_livre", rotulo: "Uivo secreto", formula: "2d6+1", oculta: true });
      await mestre.esperar("evento", (m) => m.evento.tipo === "rolagem_livre");
      mestre.enviar({ t: "rolar", bonus: 0 });
      await jogador.esperar("evento", (m) => m.evento.tipo === "rolagem", antes);
      expect(jogador.brutas.slice(antes).join()).not.toContain("Uivo secreto");
      mestre.enviar({ t: "rolar_livre", rotulo: "Errado", formula: "dois dados", oculta: true });
      await mestre.esperar("erro", (m) => /Fórmula inválida/.test(m.mensagem));
    });
  });
  describe("Horda e Recarga", () => {
    let fila: number[] = [];
    const fonte = { arquivo: "exemplo.md" };
    const acao = (id: string, rotulo: string, mecanica: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
      id: `criatura.sombra.${id}`,
      tipo: "acao" as const,
      nome: rotulo,
      rotulo,
      fonte,
      texto: "",
      custoPa: null,
      recargaCriatura: null,
      elite: false,
      inicio: false,
      combo: false,
      secao: "Horda",
      mecanica,
      ...extra,
    });
    /* Números de propósito diferentes do livro: o app lê o pacote. */
    const secoes = [
      {
        titulo: "Ações",
        itens: [
          acao("garra", "Garra", { custo: { pa: 1 }, tipo: "corpo_a_corpo", acerto: 4, alcance_m: 1, alvos: 1, dano: { formula: "1d6+2", tipo: "cortante" } }),
          acao("sopro", "Sopro (Recarga 5–6)", { custo: { pa: 1 }, tipo: "distancia", acerto: 2, alcance_m: 6, alvos: 1, dano: { formula: "2d4", tipo: "frio" } }, { recargaCriatura: "5–6" }),
        ],
      },
      {
        titulo: "Horda",
        itens: [
          acao("formar-horda", "Formar Horda", { requisito: { minimo_integrantes: 3 }, pa_por_turno: 2 }),
          acao("pv", "PV", { dano_por_integrante: 8, desfaz_com_integrantes: 2 }),
          acao("bonus-de-horda", "Bônus de Horda", { bonus: { maximo: 5 } }),
          acao("ameaca-de-massa", "Ameaça de Massa", { testes: [{ em: ["resistencia", "reacoes"], modificador: -2 }] }),
          acao("pressao-de-massa", "Pressão de Massa", { gatilhos: [{ quando: ["inicio_do_turno_do_alvo"], faz: { dano: "bonus_de_horda", tipo: "indefensavel" } }] }),
          acao("ataque-de-horda", "Ataque de Horda (1 PA)", { custo: { pa: 1 }, ataque_a_escolha: ["criatura.sombra.garra"] }, { custoPa: 1 }),
          acao("dano-em-area", "Dano em Área", { ao_receber_dano_em_area: { multiplicador: [{ a_partir_de: 2, vezes: 2 }], maximo: 2 } }),
        ],
      },
    ];
    const pacoteDeHorda = () =>
      PacoteConteudo.parse({
        manifesto: { id: "base", nome: "Exemplo", versao: "1.0" },
        conteudo: { ...conteudoExemplo(), regras: [...conteudoExemplo().regras, ...regrasDeCombateExemplo()], efeitos: efeitosExemplo(), criaturas: [{ ...criatura, secoes }] },
      });

    beforeEach(async () => {
      fila = [];
      await servidor.encerrar();
      servidor = await subir((minimo, maximo) => fila.shift() ?? Math.min(maximo, Math.max(minimo, 10)), [pacoteDeHorda()]);
    });

    const ultimoRotuloMestre = (c: Cliente, padrao: RegExp) =>
      c.esperar("evento", (m) => m.evento.tipo === "combate" && padrao.test(m.evento.dados.rotuloMestre ?? m.evento.dados.rotulo), 0);

    /* Quatro Sombras e o personagem; três formam a Horda ainda na iniciativa. */
    async function comHorda() {
      const mesa = await mesaDeCombate();
      const { mestre, personagemId } = mesa;
      mestre.enviar({ t: "combate_criar", personagens: [personagemId], criaturas: [{ ref: "criatura.sombra", quantidade: 4, elite: false }] });
      const { combate } = await esperarCombate(mestre, (c) => c.fase === "iniciativa");
      const sombras = combate!.combatentes.filter((c) => c.tipo === "criatura");
      mestre.enviar({ t: "horda_formar", integrantes: sombras.slice(0, 3).map((s) => s.id) });
      const { combate: comA } = await esperarCombate(mestre, (c) => c.combatentes.some((x) => x.horda));
      const horda = comA!.combatentes.find((x) => x.horda)!;
      return { ...mesa, horda, sobra: sombras[3]!, sombras };
    }

    it("formar: integrantes saem, a Horda entra com os PV somados e uma carta própria", async () => {
      const { mestre, horda, sombras } = await comHorda();
      expect(horda.nome).toBe("Horda de Sombra (3)");
      expect(horda.pv).toBe(39);
      expect(horda.carta).not.toBeNull();
      const atual = ultimoCombate(mestre)!;
      expect(atual.combatentes.filter((c) => sombras.slice(0, 3).some((s) => s.id === c.id))).toHaveLength(0);
      mestre.enviar({ t: "horda_formar", integrantes: [sombras[3]!.id, horda.id] });
      await mestre.esperar("erro", (m) => /fora de uma Horda/.test(m.mensagem));
    });

    it("dano: a cada 8 sai um integrante; com 2 ou menos, a Horda se desfaz e o desfazer volta tudo", async () => {
      const { mestre, horda } = await comHorda();
      mestre.enviar({ t: "dano_aplicar", combatenteId: horda.id, valor: 8, tipo: null });
      await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === horda.id)?.horda?.integrantes.length === 2 || !c.combatentes.some((x) => x.id === horda.id));
      const { evento } = await ultimoRotuloMestre(mestre, /saíram/);
      expect(evento.tipo === "combate" && evento.dados.rotuloMestre).toMatch(/se desfez: .* com 15 PV, .* com 15 PV/);
      const desfeita = ultimoCombate(mestre)!;
      expect(desfeita.combatentes.some((x) => x.id === horda.id)).toBe(false);
      const voltaram = desfeita.combatentes.filter((x) => horda.horda!.integrantes.some((i) => i.id === x.id));
      expect(voltaram.map((x) => x.pv)).toEqual([15, 15]);
      expect(voltaram.every((x) => x.carta?.valor === horda.carta?.valor)).toBe(true);

      mestre.enviar({ t: "combate_desfazer", eventoId: evento.id });
      await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === horda.id)?.pv === 39);
    });

    it("Dano em Área multiplica depois das defesas da ficha, e o mestre diz quantos espaços cobriu", async () => {
      const { mestre, horda } = await comHorda();
      mestre.enviar({ t: "dano_aplicar", combatenteId: horda.id, valor: 3, tipo: null, espacos: 2 });
      await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === horda.id)?.pv === 33);
    });

    it("Ataque de Horda soma o bônus no acerto e no dano; Recarga gasta e volta no 1d6", async () => {
      const { mestre, personagemId, horda, sobra } = await comHorda();
      mestre.enviar({ t: "iniciativa_comprar" });
      let combate = (await esperarCombate(mestre, (c) => c.combatentes.every((x) => x.carta))).combate!;
      for (const c of combate.combatentes.filter((x) => x.usaEfeito === null)) mestre.enviar({ t: "iniciativa_efeito", combatenteId: c.id, usar: false });
      await esperarCombate(mestre, (c) => c.combatentes.every((x) => x.usaEfeito !== null));
      for (let i = 0; i < 6; i++) {
        const antes = mestre.recebidas.length;
        mestre.enviar({ t: "combate_comecar" });
        const r = await Promise.race([mestre.esperar("combate", (m) => m.combate?.fase === "em_curso", antes), mestre.esperar("erro", () => true, antes)]);
        if (r.t === "combate") break;
        mestre.enviar({ t: "iniciativa_desempatar" });
        await mestre.esperar("combate", () => true, mestre.recebidas.length);
      }
      const ze = ultimoCombate(mestre)!.combatentes.find((c) => c.personagemId === personagemId)!;

      /* Vez da Horda: o Ataque de Horda com a Garra. */
      for (let i = 0; i < 8; i++) {
        combate = ultimoCombate(mestre)!;
        if (combate.fase === "em_curso" && combate.ordem[combate.vez] === horda.id) break;
        const antes = mestre.recebidas.length;
        mestre.enviar(combate.fase === "fim_da_rodada" ? { t: "rodada_nova" } : { t: "turno_encerrar" });
        await mestre.esperar("combate", () => true, antes);
      }
      expect(ultimoCombate(mestre)!.combatentes.find((c) => c.id === horda.id)!.pa.disponiveis).toBe(2);
      mestre.enviar({ t: "atacar", atacanteId: horda.id, fonte: { tipo: "acao", acaoId: "criatura.sombra.ataque-de-horda", escolha: "criatura.sombra.garra" }, alvos: [ze.id] });
      await new Promise((r) => setTimeout(r, 300));
      if (ultimoCombate(mestre)!.ataquePendente) mestre.enviar({ t: "ataque_seguir" });
      const { evento } = await ultimoRotuloMestre(mestre, /atacou com Ataque de Horda \(Garra\)/);
      const mods = evento.tipo === "combate" ? evento.dados.rolagem?.modificadores : [];
      expect(mods).toContainEqual({ rotulo: "Bônus de Horda", valor: 1 });

      /* A Sombra que ficou de fora usa o Sopro: fica gasto até a Recarga. */
      for (let i = 0; i < 8; i++) {
        combate = ultimoCombate(mestre)!;
        if (combate.fase === "em_curso" && combate.ordem[combate.vez] === sobra.id) break;
        const antes = mestre.recebidas.length;
        mestre.enviar(combate.fase === "fim_da_rodada" ? { t: "rodada_nova" } : { t: "turno_encerrar" });
        await mestre.esperar("combate", () => true, antes);
      }
      mestre.enviar({ t: "atacar", atacanteId: sobra.id, fonte: { tipo: "acao", acaoId: "criatura.sombra.sopro" }, alvos: [ze.id] });
      await new Promise((r) => setTimeout(r, 300));
      if (ultimoCombate(mestre)!.ataquePendente) mestre.enviar({ t: "ataque_seguir" });
      await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === sobra.id)!.recargasGastas.includes("criatura.sombra.sopro"));
      mestre.enviar({ t: "atacar", atacanteId: sobra.id, fonte: { tipo: "acao", acaoId: "criatura.sombra.sopro" }, alvos: [ze.id] });
      await mestre.esperar("erro", (m) => /está gasta/.test(m.mensagem));

      /* No próximo turno dela, 1d6 = 6 (o dado de teste dá o máximo): volta. */
      for (let i = 0; i < 10; i++) {
        const antes = mestre.recebidas.length;
        combate = ultimoCombate(mestre)!;
        mestre.enviar(combate.fase === "fim_da_rodada" ? { t: "rodada_nova" } : { t: "turno_encerrar" });
        const { combate: depois } = await mestre.esperar("combate", () => true, antes);
        if (depois?.fase === "em_curso" && depois.ordem[depois.vez] === sobra.id) break;
      }
      const { evento: volta } = await ultimoRotuloMestre(mestre, /Recarga 5–6 de Sopro .* voltou/);
      expect(volta.tipo).toBe("combate");
      await esperarCombate(mestre, (c) => !c.combatentes.find((x) => x.id === sobra.id)!.recargasGastas.length);
    });

    it("Ameaça e Pressão de Massa valem para quem o mestre marcou na área", async () => {
      const { mestre, jogador, personagemId, horda } = await comHorda();
      const ze = ultimoCombate(mestre)!.combatentes.find((c) => c.personagemId === personagemId)!;
      mestre.enviar({ t: "horda_area", hordaId: horda.id, marcados: [ze.id] });
      await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === horda.id)!.horda!.naArea.includes(ze.id));

      /* Ameaça: −2 (valor do pacote) no teste de resistência. */
      mestre.enviar({ t: "pedir_teste", pedido: { id: "massa", tipo: "resistencia", atributo: "fibra", dt: 10, personagens: [{ personagemId }] } });
      await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", 0);
      jogador.enviar({ t: "responder_teste", resposta: { pedidoId: "massa", personagemId } });
      const { evento } = await mestre.esperar("evento", (m) => m.evento.tipo === "teste_resultado", 0);
      expect(evento.tipo === "teste_resultado" && evento.dados.modificadores).toContainEqual({ rotulo: "Ameaça de Massa", valor: -2 });
    });
  });
  describe("Morrendo, Estresse e descansos", () => {
    let fila: number[] = [];
    beforeEach(async () => {
      fila = [];
      await servidor.encerrar();
      servidor = await subir((minimo, maximo) => fila.shift() ?? Math.min(maximo, Math.max(minimo, 10)), [pacoteDeCombate()]);
    });

    const esperarVivo = (c: Cliente, personagemId: string, teste: (v: Personagem["vivo"]) => boolean) =>
      c.esperar("personagem", (m) => m.personagem.id === personagemId && teste(m.personagem.vivo), 0);
    const rotulo = (c: Cliente, padrao: RegExp) => c.esperar("evento", (m) => m.evento.tipo === "combate" && padrao.test(m.evento.dados.rotuloMestre ?? m.evento.dados.rotulo), 0);

    async function ligarEstresse(mestre: Cliente) {
      const { mesa } = mestre.recebidas.find((m) => m.t === "bem_vindo") as Extract<Msg, { t: "bem_vindo" }>;
      mestre.enviar({ t: "opcoes_campanha", opcoes: { ...mesa.opcoes, estresse: true } });
      await mestre.esperar("opcoes_campanha", (m) => m.opcoes.estresse, 0);
    }

    it("a 0 PV entra em Morrendo e Inconsciente, com o Estresse de cair; dano depois é falha, e três falhas vão à tabela", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      await ligarEstresse(mestre);
      const { meu } = await (async () => {
        const combate = await combateEmCurso(mestre, personagemId);
        return { meu: combate.combatentes.find((c) => c.personagemId === personagemId)! };
      })();
      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 99, tipo: null });
      const caiu = await esperarVivo(jogador, personagemId, (v) => !!v.morrendo);
      expect(caiu.personagem.vivo.efeitos.some((e) => e.efeitoId === "efeito.inconsciente")).toBe(true);
      expect(caiu.personagem.vivo.estresse).toBe(3);
      expect(caiu.personagem.vivo.quedasDesdeODescansoLongo).toBe(1);

      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 1, tipo: null });
      await esperarVivo(jogador, personagemId, (v) => v.morrendo?.falhas === 1);
      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 1, tipo: null });
      await esperarVivo(jogador, personagemId, (v) => v.morrendo?.falhas === 2);
      /* Terceira falha: 1d20 = 15 na tabela do exemplo dá 1 de Exaustão; sobrevive estável. */
      fila = [15];
      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 1, tipo: null });
      const fim = await esperarVivo(jogador, personagemId, (v) => !!v.morrendo?.estavel);
      expect(fim.personagem.vivo.exaustao).toBe(1);
      const { evento } = await rotulo(mestre, /três falhas: 1d20 = 15/);
      expect(evento.tipo === "combate" && evento.dados.rotuloMestre).toMatch(/sobreviveu/);
    });

    it("Teste de Morte no início do turno: não deixa encerrar sem rolar; 20 natural acorda com 1 PV", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      const combate = await combateEmCurso(mestre, personagemId);
      const meu = combate.combatentes.find((c) => c.personagemId === personagemId)!;
      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 99, tipo: null });
      await esperarVivo(jogador, personagemId, (v) => !!v.morrendo);
      jogador.enviar({ t: "teste_de_morte", personagemId });
      await jogador.esperar("erro", (m) => /início do seu turno/.test(m.mensagem));

      /* Avança até a vez dele: o teste fica pendente. */
      for (let i = 0; i < 8; i++) {
        const c = ultimoCombate(mestre)!;
        if (c.fase === "em_curso" && c.ordem[c.vez] === meu.id) break;
        const antes = mestre.recebidas.length;
        mestre.enviar(c.fase === "fim_da_rodada" ? { t: "rodada_nova" } : { t: "turno_encerrar" });
        await mestre.esperar("combate", () => true, antes);
      }
      await esperarCombate(mestre, (c) => c.combatentes.find((x) => x.id === meu.id)!.marcas.testeDeMortePendente);
      jogador.enviar({ t: "turno_encerrar" });
      await jogador.esperar("erro", (m) => /Teste de Morte/.test(m.mensagem));

      fila = [20];
      jogador.enviar({ t: "teste_de_morte", personagemId });
      const acordou = await esperarVivo(jogador, personagemId, (v) => !v.morrendo && v.pv === 1);
      expect(acordou.personagem.vivo.pv).toBe(1);
      expect(acordou.personagem.vivo.efeitos.some((e) => e.efeitoId === "efeito.inconsciente")).toBe(false);
      await esperarCombate(mestre, (c) => !c.combatentes.find((x) => x.id === meu.id)!.marcas.testeDeMortePendente);
    });

    it("curar 1 PV encerra o Morrendo; o mestre também estabiliza", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      const combate = await combateEmCurso(mestre, personagemId);
      const meu = combate.combatentes.find((c) => c.personagemId === personagemId)!;
      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 99, tipo: null });
      await esperarVivo(jogador, personagemId, (v) => !!v.morrendo);
      mestre.enviar({ t: "estabilizar", personagemId });
      await esperarVivo(jogador, personagemId, (v) => !!v.morrendo?.estavel);
      mestre.enviar({ t: "pv_ajustar", alvo: { tipo: "personagem", id: personagemId }, delta: 1, temporarios: false });
      const curado = await esperarVivo(jogador, personagemId, (v) => !v.morrendo && v.pv === 1);
      expect(curado.personagem.vivo.pv).toBe(1);
    });

    it("Atitude Imprudente: uma vez por turno, deixa falha pendente; Ímpeto dá 1 PA; as pendentes viram falhas ao cair", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      const combate = await combateEmCurso(mestre, personagemId);
      const meu = combate.combatentes.find((c) => c.personagemId === personagemId)!;
      for (let i = 0; i < 8; i++) {
        const c = ultimoCombate(mestre)!;
        if (c.fase === "em_curso" && c.ordem[c.vez] === meu.id) break;
        const antes = mestre.recebidas.length;
        mestre.enviar(c.fase === "fim_da_rodada" ? { t: "rodada_nova" } : { t: "turno_encerrar" });
        await mestre.esperar("combate", () => true, antes);
      }
      const pa = ultimoCombate(mestre)!.combatentes.find((c) => c.id === meu.id)!.pa.disponiveis;
      jogador.enviar({ t: "atitude_imprudente", combatenteId: meu.id, opcao: "impeto" });
      await esperarCombate(jogador, (c) => c.combatentes.find((x) => x.id === meu.id)!.pa.disponiveis === pa + 1);
      await esperarVivo(jogador, personagemId, (v) => v.falhasPendentes === 1);
      jogador.enviar({ t: "atitude_imprudente", combatenteId: meu.id, opcao: "precisao" });
      await jogador.esperar("erro", (m) => /Uma vez por turno/.test(m.mensagem));

      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 99, tipo: null });
      const caiu = await esperarVivo(jogador, personagemId, (v) => !!v.morrendo);
      expect(caiu.personagem.vivo.morrendo?.falhas).toBe(1);
      expect(caiu.personagem.vivo.falhasPendentes).toBe(0);
    });

    it("descanso: só fora de combate; o curto recupera PV pela Fibra e avisa depois do limite; o longo pede 1 PV", async () => {
      const { mestre, jogador, personagemId } = await mesaDeCombate();
      const combate = await combateEmCurso(mestre, personagemId);
      const meu = combate.combatentes.find((c) => c.personagemId === personagemId)!;
      mestre.enviar({ t: "dano_aplicar", combatenteId: meu.id, valor: 5, tipo: null });
      const ferido = await esperarVivo(jogador, personagemId, (v) => v.pv !== null);
      const pv = ferido.personagem.vivo.pv!;
      mestre.enviar({ t: "descanso", tipo: "curto", personagens: [{ personagemId }] });
      await mestre.esperar("erro", (m) => /Encerre o combate/.test(m.mensagem));
      mestre.enviar({ t: "combate_encerrar" });
      await esperarCombate(mestre, () => true);
      await mestre.esperar("combate", (m) => m.combate === null, 0);

      mestre.enviar({ t: "descanso", tipo: "curto", personagens: [{ personagemId }] });
      const depois = await esperarVivo(jogador, personagemId, (v) => (v.pv ?? 0) > pv);
      expect(depois.personagem.vivo.descansosCurtos).toBe(1);
      mestre.enviar({ t: "descanso", tipo: "curto", personagens: [{ personagemId }] });
      await esperarVivo(jogador, personagemId, (v) => v.descansosCurtos === 2);
      mestre.enviar({ t: "descanso", tipo: "curto", personagens: [{ personagemId }] });
      const { evento } = await mestre.esperar("evento", (m) => m.evento.tipo === "combate" && /descanso longo antes/.test(m.evento.dados.rotulo), 0);
      expect(evento.tipo).toBe("combate");
    });

    it("fichas de classe: o dono gasta e recupera, sem passar do máximo", async () => {
      const { jogador, personagemId } = await mesaDeCombate();
      jogador.enviar({ t: "ficha_classe_ajustar", personagemId, recursoId: "recurso.rufiao.astucia", delta: -1 });
      const gastou = await esperarVivo(jogador, personagemId, (v) => v.fichas["recurso.rufiao.astucia"] !== undefined);
      const atual = gastou.personagem.vivo.fichas["recurso.rufiao.astucia"]!;
      jogador.enviar({ t: "ficha_classe_ajustar", personagemId, recursoId: "recurso.rufiao.astucia", delta: 50 });
      await esperarVivo(jogador, personagemId, (v) => (v.fichas["recurso.rufiao.astucia"] ?? 0) > atual);
      jogador.enviar({ t: "ficha_classe_ajustar", personagemId, recursoId: "recurso.rufiao.astucia", delta: 1 });
      await jogador.esperar("erro", (m) => /no máximo/.test(m.mensagem));
    });
  });
});
