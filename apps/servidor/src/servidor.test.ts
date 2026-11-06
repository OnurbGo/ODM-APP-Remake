import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer } from "node:net";
import { CAMINHO_WS, MensagemServidor, VERSAO_PROTOCOLO, type EventoCompleto, type MensagemCliente } from "@odm/protocolo";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";
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

async function subir(aleatorio?: (min: number, max: number) => number) {
  return iniciarServidor({
    porta: 0,
    host: "127.0.0.1",
    pastaDados: join(pasta, "Área de Trabalho", "dados"),
    pastaMigracoes: PASTA_MIGRACOES,
    tokenMestre: TOKEN_MESTRE,
    aleatorio,
  });
}

async function abrir(cabecalhos?: Record<string, string>) {
  const cliente = await Cliente.abrir(servidor.porta, cabecalhos);
  clientes.push(cliente);
  return cliente;
}

async function mestreComMesa() {
  const mestre = await abrir();
  mestre.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: TOKEN_MESTRE } });
  await mestre.esperar("sem_mesa");
  mestre.enviar({ t: "criar_mesa", nome: "Mesa de exemplo" });
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
  jogador.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token } });
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

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token } });
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
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token } });
    expect((await volta.esperar("bem_vindo")).eu.nome).toBe("Ana");
  });

  it("a mesma pessoa em outro dispositivo pode ser ligada ao participante atual", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { id } = await jogadorAprovado(mestre, codigo, "Ana");
    const celular = await visitante();
    celular.enviar({ t: "pedir_entrada", nome: "ana", codigo });
    const estado = await mestre.esperar("estado_mestre", (m) => m.pedidos.some((p) => p.nome === "ana"));
    const pedido = estado.pedidos[0]!;
    expect(pedido.mesmoNomeDe).toEqual({ id, nome: "Ana", revogado: false });

    mestre.enviar({ t: "aprovar_entrada", pedidoId: pedido.id, vincularA: id });
    const { token } = await celular.esperar("entrada_aprovada");
    celular.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token } });
    const boasVindas = await celular.esperar("bem_vindo");
    expect(boasVindas.eu.id).toBe(id);
    expect(boasVindas.participantes.filter((p) => p.papel === "jogador")).toHaveLength(1);
  });

  it("revogar derruba a conexão na hora e o token deixa de valer", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, token, id } = await jogadorAprovado(mestre, codigo, "Ana");
    mestre.enviar({ t: "revogar_acesso", participanteId: id });
    await jogador.esperar("acesso_revogado");
    await expect.poll(() => jogador.fechou).toBe(4003);

    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token } });
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
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token }, vistos });
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
        jogadores: [{ jogadorId: "?", bonus: 0, modo: "normal" as const }],
      },
    },
  };

  it("teste passivo não gera nenhuma mensagem para o jogador", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { jogador, id } = await jogadorAprovado(mestre, codigo, "Ana");
    const antes = jogador.brutas.length;
    const antesMestre = mestre.recebidas.length;

    passivo.dados.pedido.jogadores[0]!.jogadorId = id;
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

    passivo.dados.pedido.jogadores[0]!.jogadorId = id;
    servidor.mesa.registrar(evento(passivo));
    mestre.enviar({ t: "rolar", bonus: 0 });
    const { evento: rolagem } = await jogador.esperar("evento", (m) => m.evento.tipo === "rolagem");
    expect(rolagem.n).toBe(antes + 1);

    /* Ao voltar, a numeração continua igual, e o oculto segue fora. */
    const volta = await abrir();
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token } });
    const { eventos } = await volta.esperar("bem_vindo");
    expect(eventos.map((e) => e.n)).toEqual(Array.from({ length: antes + 1 }, (_, i) => i + 1));
    expect(volta.brutas.join()).not.toContain("Porta escondida");
  });

  it("o mestre continua vendo o passivo ao voltar", async () => {
    const { mestre, codigo } = await mestreComMesa();
    const { id } = await jogadorAprovado(mestre, codigo, "Ana");
    passivo.dados.pedido.jogadores[0]!.jogadorId = id;
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
    volta.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", token } });
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
        dados: { pedido: { id: "p", tipo, jogadores: [{ jogadorId: id, bonus: 0, modo: "normal" }], ...resto } as never },
      }),
    );
    const { evento: visto } = await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", antes);
    expect(visto.tipo === "teste_pedido_visto" && visto.dados.pedido.dt).toBeNull();
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
            jogadores: [
              { jogadorId: ana.id, bonus: 2, modo: "normal" },
              { jogadorId: bia.id, dt: 33, bonus: -4, modo: "desvantagem" },
            ],
          },
        },
      }),
    );
    const { evento: visto } = await ana.jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", antes);
    expect(visto.tipo === "teste_pedido_visto" && visto.dados.pedido).toMatchObject({ dt: 15, bonus: 2, modo: "normal" });
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
            jogadores: [{ jogadorId: ana.id, bonus: 0, modo: "normal" }],
          },
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
            jogadores: [{ jogadorId: id, bonus: 0, modo: "normal" }],
          },
        },
      }),
    );
    await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto", antes);
    expect(jogador.brutas.join()).not.toMatch(/Vigia oculto|"bonus":55|pericia\.outra/);
  });

  it("pedir teste ainda responde indisponível para o mestre", async () => {
    const { mestre } = await mestreComMesa();
    mestre.enviar({
      t: "pedir_teste",
      pedido: { id: "p", tipo: "resistencia", atributo: "fibra", dt: 10, dtVisivel: false, jogadores: [{ jogadorId: "j" }] },
    });
    await mestre.esperar("erro", (m) => m.codigo === "indisponivel");
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
