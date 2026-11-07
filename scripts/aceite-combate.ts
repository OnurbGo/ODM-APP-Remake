/* npm run combate:aceite: um combate inteiro com Zumbis e Horda, do pedido de entrada ao descanso, pelo WebSocket,
   com o servidor de verdade e o pacote real. Os dados vêm de uma semente fixa: a mesma semente, o mesmo combate.
   "-- --previa" usa o pacote com as propostas (%LOCALAPPDATA%\ODM-dev\conteudo-previa).
   O relatório fica fora dos repositórios, porque traz nomes do livro. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ATRIBUTOS } from "@odm/conteudo";
import { lerPasta, pastaConteudo } from "@odm/conteudo/pasta";
import {
  CAMINHO_WS,
  MensagemServidor,
  VERSAO_PROTOCOLO,
  fichaVazia,
  opcoesPadrao,
  type Combatente,
  type EstadoCombate,
  type FichaDados,
  type MensagemCliente,
  type Personagem,
} from "@odm/protocolo";
import { criarContexto, criarContextoCombate, recortarConteudoFicha, vagasDeProficiencia } from "@odm/regras";
import { iniciarServidor } from "@odm/servidor";
import { WebSocket } from "ws";

type Msg = MensagemServidor;
const TOKEN = "token-do-aceite-do-combate-000000000";
const previa = process.argv.includes("--previa");
const pasta = previa ? join(process.env.LOCALAPPDATA ?? "", "ODM-dev", "conteudo-previa") : pastaConteudo();
const pacote = lerPasta(pasta).find((l) => l.pacote?.manifesto.id === "base")?.pacote;
if (!pacote) throw new Error(`Sem pacote base em ${pasta}`);
/* Sem as regras de combate aprovadas, o combate nem abre: diz quais faltam e para aqui. */
const regrasDoCombate = criarContextoCombate(pacote.conteudo);
if (!regrasDoCombate.ok) {
  console.error("O pacote ainda não tem estas regras de combate aprovadas (rode com -- --previa para testar com as propostas):");
  console.error(regrasDoCombate.faltando.map((id) => `- ${id}`).join("\n"));
  process.exit(1);
}

/* mulberry32: a mesma semente dá os mesmos dados, para o combate ser repetível. */
function semente(valor: number) {
  let a = valor >>> 0;
  return (minimo: number, maximo: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const x = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return minimo + Math.floor(x * (maximo - minimo + 1));
  };
}

class Cliente {
  readonly recebidas: Msg[] = [];
  readonly brutas: string[] = [];
  private readonly esperas: { teste: (m: Msg) => boolean; ok: (m: Msg) => void }[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.on("message", (dado) => {
      const texto = dado.toString();
      this.brutas.push(texto);
      const m = MensagemServidor.parse(JSON.parse(texto));
      this.recebidas.push(m);
      for (const e of [...this.esperas]) {
        if (e.teste(m)) {
          this.esperas.splice(this.esperas.indexOf(e), 1);
          e.ok(m);
        }
      }
    });
  }
  static abrir(porta: number) {
    return new Promise<Cliente>((ok, falha) => {
      const ws = new WebSocket(`ws://127.0.0.1:${porta}${CAMINHO_WS}`);
      const c = new Cliente(ws);
      ws.once("open", () => ok(c));
      ws.once("error", falha);
    });
  }
  enviar(m: MensagemCliente) {
    this.ws.send(JSON.stringify(m));
  }
  esperar<T extends Msg["t"]>(tipo: T, filtro: (m: Extract<Msg, { t: T }>) => boolean = () => true, desde = 0, ms = 4000) {
    const teste = (m: Msg) => m.t === tipo && filtro(m as Extract<Msg, { t: T }>);
    const ja = this.recebidas.slice(desde).find(teste);
    if (ja) return Promise.resolve(ja as Extract<Msg, { t: T }>);
    return new Promise<Extract<Msg, { t: T }>>((ok, falha) => {
      this.esperas.push({ teste, ok: (m) => ok(m as Extract<Msg, { t: T }>) });
      setTimeout(() => falha(new Error(`Não chegou "${tipo}"`)), ms).unref();
    });
  }
  ultimoCombate(): EstadoCombate | null {
    for (let i = this.recebidas.length - 1; i >= 0; i--) {
      const m = this.recebidas[i]!;
      if (m.t === "combate") return m.combate;
    }
    return null;
  }
  personagem(id: string): Personagem | null {
    for (let i = this.recebidas.length - 1; i >= 0; i--) {
      const m = this.recebidas[i]!;
      if (m.t === "personagem" && m.personagem.id === id) return m.personagem;
    }
    return null;
  }
}

const falhas: string[] = [];
const notas: string[] = [];
const conferir = (ok: boolean, texto: string) => {
  if (!ok) falhas.push(texto);
};
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

const temporaria = mkdtempSync(join(tmpdir(), "odm-aceite-combate-"));
const servidor = await iniciarServidor({
  porta: 0,
  host: "127.0.0.1",
  pastaDados: join(temporaria, "dados"),
  pastaMigracoes: resolve(import.meta.dirname, "../apps/servidor/migracoes"),
  tokenMestre: TOKEN,
  pacotes: [pacote],
  aleatorio: semente(20261107),
});

let mestre!: Cliente;
let jogador!: Cliente;

/* Manda e espera o registro andar (ou o erro). Cada ação do combate grava um evento. */
async function agir(quem: Cliente, m: MensagemCliente, rotulo: string) {
  const antesM = mestre.recebidas.length;
  const antesQ = quem.recebidas.length;
  quem.enviar(m);
  const r = await Promise.race([
    mestre.esperar("evento", () => true, antesM).then(() => null),
    quem.esperar("erro", () => true, antesQ).then((e) => e.mensagem ?? e.codigo),
  ]).catch((e: Error) => e.message);
  await espera(30);
  if (r) falhas.push(`${rotulo}: ${r}`);
  return !r;
}

try {
  /* ---------- Mesa, jogador e personagem ---------- */
  mestre = await Cliente.abrir(servidor.porta);
  mestre.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: TOKEN } });
  await mestre.esperar("campanhas");
  mestre.enviar({ t: "criar_campanha", nome: "Aceite do combate", pacotes: ["base"], opcoes: { ...opcoesPadrao(), estresse: true } });
  await mestre.esperar("bem_vindo");
  const { codigo } = await mestre.esperar("estado_mestre");

  jogador = await Cliente.abrir(servidor.porta);
  jogador.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "visitante" } });
  await jogador.esperar("visitante");
  jogador.enviar({ t: "pedir_entrada", nome: "Jogadora", codigo });
  await jogador.esperar("entrada_aguardando");
  const { pedidos } = await mestre.esperar("estado_mestre", (m) => m.pedidos.length > 0);
  mestre.enviar({ t: "aprovar_entrada", pedidoId: pedidos[0]!.id });
  const { token } = await jogador.esperar("entrada_aprovada");
  jogador.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "jogador", tokens: [token] } });
  await jogador.esperar("bem_vindo");

  const r = criarContexto(recortarConteudoFicha(pacote.conteudo), { ...opcoesPadrao(), estresse: true });
  if (!r.ok) throw new Error(`Regras da ficha sem aprovação: ${r.faltando.join(", ")}`);
  const ctx = r.contexto;
  const classe = [...ctx.classes.values()].find((c) => c.mecanica)!;
  const origem = [...ctx.origens.values()][0];
  const valores = ctx.regras.atributos.valores;
  let ficha: FichaDados = { ...fichaVazia(), nome: "Aceite", classeId: classe.id, origemId: origem?.id ?? null, atributos: Object.fromEntries(ATRIBUTOS.map((a, i) => [a, valores[i]])) };
  const vagas = vagasDeProficiencia(ficha, ctx)!;
  const pedido = origem?.mecanica?.concede?.escolher;
  ficha = {
    ...ficha,
    pericias: vagas.lista.slice(0, vagas.pericias),
    ferramentas: Array.from({ length: vagas.ferramentas }, (_, i) => `Ferramenta ${i + 1}`),
    escolhasDaOrigem: pedido && pedido.de !== "pericias" ? pedido.de.slice(0, pedido.quantidade) : [],
  };
  jogador.enviar({ t: "personagem_criar" });
  const { personagem: criado } = await jogador.esperar("personagem");
  const personagemId = criado.id;
  jogador.enviar({ t: "personagem_salvar", personagemId, ficha });
  await jogador.esperar("personagem", (m) => m.personagem.ficha.nome === "Aceite");
  jogador.enviar({ t: "personagem_concluir", personagemId });
  await mestre.esperar("personagem", (m) => m.personagem.id === personagemId && m.personagem.situacao === "ativo");
  notas.push(`Personagem: ${classe.nome}, origem ${origem?.nome ?? "nenhuma"}.`);

  /* A arma: a primeira simples corpo a corpo com dados de ataque no pacote. */
  const arma = pacote.conteudo.itens.find((i) => {
    const a = (i.mecanica as { ataque?: { categoria?: string; tipo?: string; dano?: unknown } } | undefined)?.ataque;
    return a?.dano && a.tipo === "corpo_a_corpo" && a.categoria === "armas_simples";
  });
  if (!arma) throw new Error("Nenhuma arma simples corpo a corpo com mecânica no pacote (use --previa).");
  mestre.enviar({ t: "ficha_operar", personagemId, operacao: { op: "dar_item", item: { id: "x", itemId: arma.id, nome: arma.nome, quantidade: 1, equipado: false, pesoKg: null } } });
  const { personagem: armado } = await jogador.esperar("personagem", (m) => m.personagem.ficha.inventario.some((i) => i.itemId === arma.id));
  const itemFichaId = armado.ficha.inventario.find((i) => i.itemId === arma.id)!.id;
  await agir(jogador, { t: "ficha_operar", personagemId, operacao: { op: "equipar", itemFichaId, equipado: true } }, "Equipar a arma");
  notas.push(`Arma: ${arma.nome}.`);

  /* ---------- Combate: 6 Zumbis, 5 em Horda (com 3, a primeira baixa já desfaz a Horda) ---------- */
  if (!(await agir(mestre, { t: "combate_criar", personagens: [personagemId], criaturas: [{ ref: "criatura.zumbi", quantidade: 6, elite: false }] }, "Montar o combate"))) throw new Error("O combate não abriu: veja as falhas.");
  const zumbis = mestre.ultimoCombate()!.combatentes.filter((c) => c.tipo === "criatura");
  await agir(mestre, { t: "horda_formar", integrantes: zumbis.slice(0, 5).map((z) => z.id) }, "Formar a Horda");
  conferir(!!mestre.ultimoCombate()?.combatentes.some((c) => c.horda), "A Horda não se formou");
  /* O personagem está colado na Horda: Ameaça e Pressão de Massa valem para ele. */
  const horda = mestre.ultimoCombate()!.combatentes.find((c) => c.horda)!;
  const meuNoCombate = mestre.ultimoCombate()!.combatentes.find((c) => c.personagemId === personagemId)!;
  await agir(mestre, { t: "horda_area", hordaId: horda.id, marcados: [meuNoCombate.id] }, "Marcar a área da Horda");
  await agir(mestre, { t: "iniciativa_comprar" }, "Comprar a iniciativa");
  for (const c of mestre.ultimoCombate()!.combatentes.filter((x) => x.usaEfeito === null)) await agir(mestre, { t: "iniciativa_efeito", combatenteId: c.id, usar: false }, "Decidir carta especial");
  for (let i = 0; i < 6; i++) {
    const antes = mestre.recebidas.length;
    mestre.enviar({ t: "combate_comecar" });
    const ok = await Promise.race([mestre.esperar("combate", (m) => m.combate?.fase === "em_curso", antes).then(() => true), mestre.esperar("erro", () => true, antes).then(() => false)]);
    if (ok) break;
    await agir(mestre, { t: "iniciativa_desempatar" }, "Desempatar");
  }
  conferir(mestre.ultimoCombate()?.fase === "em_curso", "O combate não começou");
  notas.push(`Ordem: ${mestre.ultimoCombate()!.ordem.map((id) => mestre.ultimoCombate()!.combatentes.find((c) => c.id === id)!.nome).join(" → ")}.`);

  const inimigos = () => mestre.ultimoCombate()!.combatentes.filter((c) => c.tipo !== "personagem" && !c.derrotado);
  const eu = () => mestre.ultimoCombate()!.combatentes.find((c) => c.personagemId === personagemId)!;
  let reagiu = false;
  let imprudente = false;
  let aliados = 0;
  let derrubado = false;
  let testes = 0;

  for (let passo = 0; passo < 80 && inimigos().length; passo++) {
    const combate = mestre.ultimoCombate()!;
    if (combate.fase === "fim_da_rodada") {
      await agir(mestre, { t: "rodada_nova" }, "Nova rodada");
      continue;
    }
    const vez: Combatente = combate.combatentes.find((c) => c.id === combate.ordem[combate.vez])!;

    /* Na rodada 2, uma armadilha derruba o personagem: Morrendo, Teste de Morte e a cura de um aliado. */
    if (combate.rodada === 2 && !derrubado) {
      derrubado = true;
      await agir(mestre, { t: "dano_aplicar", combatenteId: eu().id, valor: 999, tipo: null }, "Armadilha");
      conferir(!!mestre.personagem(personagemId)?.vivo.morrendo, "O personagem não entrou em Morrendo a 0 PV");
    }
    const vivo = mestre.personagem(personagemId)?.vivo;

    if (vez.personagemId) {
      if (vez.marcas.testeDeMortePendente) {
        await agir(jogador, { t: "teste_de_morte", personagemId }, "Teste de Morte");
        testes++;
        /* Depois do primeiro teste, um aliado cura: 1 PV já tira do Morrendo. */
        if (mestre.personagem(personagemId)?.vivo.morrendo) await agir(mestre, { t: "pv_ajustar", alvo: { tipo: "personagem", id: personagemId }, delta: 8, temporarios: false }, "Cura do aliado");
        conferir(!mestre.personagem(personagemId)?.vivo.morrendo, "A cura não tirou do Morrendo");
      }
      else if (!vivo?.morrendo) {
        const alvo = inimigos().find((c) => c.horda) ?? inimigos()[0]!;
        if (!imprudente) imprudente = await agir(jogador, { t: "atitude_imprudente", combatenteId: vez.id, opcao: "precisao" }, "Atitude Imprudente");
        await agir(jogador, { t: "atacar", atacanteId: vez.id, fonte: { tipo: "arma", itemFichaId }, alvos: [alvo.id], opcoes: { alemDoAlcance: false, bonus: 0, modo: "normal" } }, "Ataque do jogador");
      }
      /* Estável: o mestre cura, como um aliado faria, e o Morrendo acaba. */
      if (mestre.personagem(personagemId)?.vivo.morrendo?.estavel) await agir(mestre, { t: "pv_ajustar", alvo: { tipo: "personagem", id: personagemId }, delta: 6, temporarios: false }, "Cura");
      await agir(jogador, { t: "turno_encerrar" }, "Encerrar o turno do jogador");
      continue;
    }

    if (!vivo?.morrendo) {
      const acao = vez.horda ? { tipo: "acao" as const, acaoId: "criatura.zumbi.ataque-de-horda", escolha: "criatura.zumbi.pancada" } : { tipo: "acao" as const, acaoId: "criatura.zumbi.pancada" };
      await agir(mestre, { t: "atacar", atacanteId: vez.id, fonte: acao, alvos: [eu().id], opcoes: { alemDoAlcance: false, bonus: 0, modo: "normal" } }, `Ataque de ${vez.nome}`);
      const pendente = mestre.ultimoCombate()?.ataquePendente;
      if (pendente?.aguardando.includes(eu().id)) {
        if (!reagiu) reagiu = await agir(jogador, { t: "reagir", combatenteId: eu().id, reacao: "esquiva" }, "Esquiva");
        else await agir(mestre, { t: "ataque_seguir" }, "Seguir sem reação");
        await espera(50);
      }
    }
    /* Os outros heróis da mesa, que o roteiro não joga: o mestre aplica o dano deles. Na Horda, como área. */
    const alvo = vez.horda ?? inimigos()[0];
    if (alvo && aliados < 12) {
      aliados++;
      const h = inimigos().find((c) => c.horda);
      if (h) await agir(mestre, { t: "dano_aplicar", combatenteId: h.id, valor: 3, tipo: "fogo", espacos: 3 }, "Dano em área na Horda");
      else await agir(mestre, { t: "dano_aplicar", combatenteId: inimigos()[0]!.id, valor: 5, tipo: null }, "Dano dos aliados");
    }
    if (inimigos().length) await agir(mestre, { t: "turno_encerrar" }, `Encerrar o turno de ${vez.nome}`);
  }
  conferir(inimigos().length === 0, `Sobraram inimigos: ${inimigos().map((c) => c.nome).join(", ")}`);

  /* ---------- Fim, desfazer e descanso ---------- */
  await agir(mestre, { t: "combate_encerrar" }, "Encerrar o combate");
  const fim = [...mestre.recebidas].reverse().find((m) => m.t === "evento" && m.evento.tipo === "combate");
  if (fim?.t === "evento") {
    await agir(mestre, { t: "combate_desfazer", eventoId: fim.evento.id }, "Desfazer o encerramento");
    conferir(!!mestre.ultimoCombate(), "Desfazer o encerramento não trouxe o combate de volta");
    await agir(mestre, { t: "combate_encerrar" }, "Encerrar de novo");
  }
  const id = "aceite-resistencia";
  await agir(mestre, { t: "pedir_teste", pedido: { id, tipo: "resistencia", atributo: "fibra", dt: 12, personagens: [{ personagemId }] } }, "Pedir resistência");
  await jogador.esperar("evento", (m) => m.evento.tipo === "teste_pedido_visto");
  await agir(jogador, { t: "responder_teste", resposta: { pedidoId: id, personagemId } }, "Responder o teste");
  const antesPassivo = jogador.brutas.length;
  await agir(mestre, { t: "pedir_teste", pedido: { id: "aceite-passivo", tipo: "passivo", teste: { alvo: "atributo", atributo: "astucia" }, dt: 15, origem: "Segredo do aceite", personagens: [{ personagemId }] } }, "Teste passivo");
  await agir(mestre, { t: "descanso", tipo: "curto", personagens: [{ personagemId, dadosDeVida: 1 }] }, "Descanso curto");
  conferir(!jogador.brutas.slice(antesPassivo).join().includes("Segredo do aceite"), "O passivo chegou ao jogador");

  /* ---------- Visibilidade: o que o aparelho do jogador recebeu ---------- */
  for (const m of jogador.recebidas) {
    if (m.t !== "combate" || !m.combate) continue;
    conferir(m.combate.baralho.length === 0, "O jogador recebeu o baralho");
    for (const c of m.combate.combatentes) if (c.tipo !== "personagem") conferir(c.pv === null && c.pvMaximo === null, `O jogador recebeu PV de ${c.nome}`);
  }
  conferir(!jogador.brutas.join().includes("rotuloMestre"), "O jogador recebeu o rótulo do mestre");

  const rotulos = mestre.recebidas.flatMap((m) => (m.t === "evento" && m.evento.tipo === "combate" ? [m.evento.dados.rotuloMestre ?? m.evento.dados.rotulo] : []));
  conferir(rotulos.some((t) => /formaram uma Horda/.test(t)), "Não houve Horda");
  conferir(rotulos.some((t) => /se desfez|destruída/.test(t)), "A Horda não se desfez nem foi destruída");
  conferir(rotulos.some((t) => /atacou com Ataque de Horda/.test(t)), "A Horda não fez o Ataque de Horda");
  conferir(rotulos.some((t) => /reagiu com Esquiva/.test(t)) || !reagiu, "A Esquiva não ficou no registro");
  conferir(testes > 0, "Não houve Teste de Morte");
  conferir(rotulos.some((t) => /Pressão de Massa/.test(t)), "A Pressão de Massa não aconteceu");

  const linhas = [
    "# Aceite do combate",
    "",
    `Pacote: ${pacote.manifesto.nome} ${pacote.manifesto.versao}${previa ? " (prévia com propostas)" : ""}.`,
    "",
    ...notas.map((n) => `- ${n}`),
    "",
    "## Registro do mestre",
    "",
    ...mestre.recebidas.flatMap((m) => {
      if (m.t !== "evento") return [];
      const e = m.evento;
      if (e.tipo === "combate") return [`- ${e.dados.rotuloMestre ?? e.dados.rotulo}`];
      if (e.tipo === "teste_resultado") return [`- ${e.dados.personagemNome}: ${e.dados.rotulo}, ${e.dados.total ?? "-"} contra DT ${e.dados.dt ?? "-"}, ${e.dados.sucesso ? "sucesso" : "falha"}`];
      return [];
    }),
    "",
    falhas.length ? `## Falhas\n\n${falhas.map((f) => `- ${f}`).join("\n")}` : "Tudo certo.",
    "",
  ];
  const destino = join(pasta, "..", "aceite-combate.md");
  writeFileSync(destino, linhas.join("\n"));
  console.log(`${rotulos.length} ações de combate. Relatório: ${destino}`);
} catch (erro) {
  falhas.push(erro instanceof Error ? erro.message : String(erro));
} finally {
  mestre?.ws.terminate();
  jogador?.ws.terminate();
  await servidor.encerrar();
  rmSync(temporaria, { recursive: true, force: true });
}
if (falhas.length) {
  console.error(falhas.join("\n"));
  process.exit(1);
}
console.log("Tudo certo.");
