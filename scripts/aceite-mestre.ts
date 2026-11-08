/* npm run mestre:aceite: as ferramentas do mestre da fase 6, do pedido de entrada ao diário, pelo WebSocket, com o
   servidor de verdade e o pacote real: encontro salvo e avaliado, combate com iniciativa oculta, XP, missão com
   etapa oculta, loja com compra e desfazer, mundo, Jogo do 21, NPC, marco e "Mostrar". Os nomes são fictícios.
   O relatório fica fora dos repositórios. "-- --previa" usa o pacote com as propostas. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { ATRIBUTOS, ID_JOGO_DO_21 } from "@odm/conteudo";
import { lerPasta, pastaConteudo } from "@odm/conteudo/pasta";
import { CAMINHO_WS, MensagemServidor, VERSAO_PROTOCOLO, fichaVazia, opcoesPadrao, type FichaDados, type MensagemCliente } from "@odm/protocolo";
import { avaliarEncontro, criarContexto, ehLendaria, lerRegrasEncontro, nivelDoXp, precoEmReais, recortarConteudoFicha, vagasDeProficiencia, xpDaCriatura } from "@odm/regras";
import { iniciarServidor } from "@odm/servidor";
import { WebSocket } from "ws";

type Msg = MensagemServidor;
const TOKEN = "token-do-aceite-do-mestre-0000000000";
const previa = process.argv.includes("--previa");
const pasta = previa ? join(process.env.LOCALAPPDATA ?? "", "ODM-dev", "conteudo-previa") : pastaConteudo();
const pacote = lerPasta(pasta).find((l) => l.pacote?.manifesto.id === "base")?.pacote;
if (!pacote) throw new Error(`Sem pacote base em ${pasta}`);

class Cliente {
  readonly recebidas: Msg[] = [];
  private readonly esperas: { teste: (m: Msg) => boolean; ok: (m: Msg) => void }[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.on("message", (dado) => {
      const m = MensagemServidor.parse(JSON.parse(dado.toString()));
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
  ultimo<T extends Msg["t"]>(tipo: T): Extract<Msg, { t: T }> | undefined {
    for (let i = this.recebidas.length - 1; i >= 0; i--) if (this.recebidas[i]!.t === tipo) return this.recebidas[i] as Extract<Msg, { t: T }>;
    return undefined;
  }
}

const falhas: string[] = [];
const notas: string[] = [];
const conferir = (ok: boolean, texto: string) => {
  if (ok) notas.push(`ok: ${texto}`);
  else falhas.push(texto);
};
const temporaria = mkdtempSync(join(tmpdir(), "odm-aceite-mestre-"));
const servidor = await iniciarServidor({
  porta: 0,
  host: "127.0.0.1",
  pastaDados: join(temporaria, "dados"),
  pastaMigracoes: resolve(import.meta.dirname, "../apps/servidor/migracoes"),
  tokenMestre: TOKEN,
  pacotes: [pacote],
});
let mestre!: Cliente;
let jogador!: Cliente;

try {
  /* ---------- Mesa, jogador e personagem ---------- */
  mestre = await Cliente.abrir(servidor.porta);
  mestre.enviar({ t: "ola", versao: VERSAO_PROTOCOLO, credencial: { tipo: "mestre", token: TOKEN } });
  await mestre.esperar("campanhas");
  mestre.enviar({ t: "criar_campanha", nome: "Aceite do mestre", pacotes: ["base"], opcoes: opcoesPadrao() });
  const { mesa } = await mestre.esperar("bem_vindo");
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

  const r = criarContexto(recortarConteudoFicha(pacote.conteudo), opcoesPadrao());
  if (!r.ok) throw new Error(`Regras da ficha sem aprovação: ${r.faltando.join(", ")}`);
  const ctx = r.contexto;
  const classe = [...ctx.classes.values()].find((c) => c.mecanica)!;
  const origem = [...ctx.origens.values()][0];
  let ficha: FichaDados = { ...fichaVazia(), nome: "Aceite", classeId: classe.id, origemId: origem?.id ?? null, atributos: Object.fromEntries(ATRIBUTOS.map((a, i) => [a, ctx.regras.atributos.valores[i]])) };
  const vagas = vagasDeProficiencia(ficha, ctx)!;
  const escolha = origem?.mecanica?.concede?.escolher;
  ficha = { ...ficha, pericias: vagas.lista.slice(0, vagas.pericias), ferramentas: Array.from({ length: vagas.ferramentas }, (_, i) => `Ferramenta ${i + 1}`), escolhasDaOrigem: escolha && escolha.de !== "pericias" ? escolha.de.slice(0, escolha.quantidade) : [] };
  jogador.enviar({ t: "personagem_criar" });
  const { personagem: criado } = await jogador.esperar("personagem");
  const id = criado.id;
  jogador.enviar({ t: "personagem_salvar", personagemId: id, ficha });
  await jogador.esperar("personagem", (m) => m.personagem.ficha.nome === "Aceite");
  jogador.enviar({ t: "personagem_concluir", personagemId: id });
  await mestre.esperar("personagem", (m) => m.personagem.id === id && m.personagem.situacao === "ativo");
  const personagemAgora = () => jogador.ultimo("personagem")!.personagem;

  /* ---------- Encontro salvo e avaliado ---------- */
  const regrasEncontro = lerRegrasEncontro(pacote.conteudo);
  const zumbi = pacote.conteudo.criaturas.find((c) => c.id === "criatura.zumbi") ?? pacote.conteudo.criaturas.find((c) => !ehLendaria(c) && c.xp)!;
  const nivel = nivelDoXp(0, ctx.regras);
  const avaliacao = avaliarEncontro([{ nome: zumbi.nome, quantidade: 2, xp: xpDaCriatura(zumbi, false, regrasEncontro).xp, lendaria: false }], [nivel], regrasEncontro);
  conferir(avaliacao.grau !== null || !regrasEncontro.lidas.montando, `Encontro avaliado: ${avaliacao.xpTotal} XP, ${avaliacao.grau ?? "sem a regra aprovada"}`);
  mestre.enviar({ t: "cadastro_salvar", cadastro: { tipo: "encontro", dados: { nome: "Emboscada no moinho", criaturas: [{ ref: zumbi.id, quantidade: 2, elite: false, xp: null }], notas: "", missaoId: null } } });
  await mestre.esperar("cadastros", (m) => m.lista.some((c) => c.tipo === "encontro"));
  conferir(!jogador.ultimo("cadastros")?.lista.some((c) => c.tipo === "encontro"), "O encontro salvo não chega ao jogador");

  /* ---------- Combate com iniciativa oculta e XP no fim ---------- */
  mestre.enviar({ t: "combate_criar", personagens: [id], criaturas: [{ ref: zumbi.id, quantidade: 2, elite: false }] });
  await mestre.esperar("combate", (m) => m.combate?.fase === "iniciativa");
  mestre.enviar({ t: "iniciativa_comprar" });
  await mestre.esperar("combate", (m) => !!m.combate?.combatentes.every((c) => c.carta || c.cartasParaEscolher.length));
  for (const c of mestre.ultimo("combate")!.combate!.combatentes.filter((x) => x.usaEfeito === null)) {
    mestre.enviar({ t: "iniciativa_efeito", combatenteId: c.id, usar: false });
    await mestre.esperar("combate", (m) => m.combate?.combatentes.find((x) => x.id === c.id)?.usaEfeito === false);
  }
  for (let i = 0; i < 6 && mestre.ultimo("combate")?.combate?.fase !== "em_curso"; i++) {
    const antes = mestre.recebidas.length;
    mestre.enviar({ t: "combate_comecar" });
    const ok = await Promise.race([mestre.esperar("combate", (m) => m.combate?.fase === "em_curso", antes).then(() => true), mestre.esperar("erro", () => true, antes).then(() => false)]);
    if (!ok) mestre.enviar({ t: "iniciativa_desempatar" });
  }
  await jogador.esperar("combate", (m) => m.combate?.fase === "em_curso");
  const visto = jogador.ultimo("combate")!.combate!;
  const ocultos = visto.combatentes.filter((c) => !c.revelado).length;
  /* Quem ainda não agiu: a posição na ordem é um "?" opaco e a carta não chega. O nome continua na lista,
     para o jogador poder escolher o alvo. */
  const opacos = visto.ordem.filter((x) => x.startsWith("oculto-")).length;
  conferir(ocultos >= 1 && opacos === ocultos && visto.combatentes.filter((c) => !c.revelado).every((c) => c.carta === null), `Iniciativa oculta: ${opacos} de ${visto.ordem.length} posições como "?" e sem a carta, para o jogador`);
  mestre.enviar({ t: "combate_encerrar" });
  await mestre.esperar("combate", (m) => m.combate === null || m.combate.fase === "encerrado");
  const xpCombate = (xpDaCriatura(zumbi, false, regrasEncontro).xp ?? 0) * 2;
  mestre.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "xp", delta: xpCombate } });
  await jogador.esperar("personagem", (m) => m.personagem.ficha.xp === xpCombate);
  conferir(personagemAgora().ficha.xp === xpCombate, `XP do combate entregue: ${xpCombate}`);

  /* ---------- Missão: etapa oculta não sai do mestre ---------- */
  const SEGREDO = "SEGREDO-DO-ACEITE";
  const etapa = (jogadores: string, visivel: boolean) => ({ jogadores, mestre: SEGREDO, visivel });
  mestre.enviar({
    t: "cadastro_salvar",
    cadastro: { tipo: "missao", dados: { titulo: "O sino quebrado", situacao: "ativa", visivel: true, notas: SEGREDO, etapas: { inicio: etapa("O sino parou.", true), investigacao: etapa(SEGREDO, false), conflito: etapa("", false), desfecho: etapa("", false) } } as never },
  });
  await jogador.esperar("cadastros", (m) => m.lista.some((c) => c.tipo === "missao"));
  conferir(!JSON.stringify(jogador.recebidas).includes(SEGREDO), "Missão visível chega sem notas nem etapa oculta");
  mestre.enviar({ t: "ficha_operar", personagemId: id, operacao: { op: "dinheiro", delta: 500 } });
  await jogador.esperar("personagem", (m) => m.personagem.ficha.dinheiro === 500);

  /* ---------- Loja: compra na hora, desfazer do mestre ---------- */
  const item = pacote.conteudo.itens.find((i) => (precoEmReais(i.preco) ?? 0) > 0 && (precoEmReais(i.preco) ?? 0) <= 200)!;
  const preco = precoEmReais(item.preco)!;
  mestre.enviar({ t: "cadastro_salvar", cadastro: { tipo: "loja", dados: { nome: "Armazém do aceite", aberta: true, caixa: 1000, itens: [{ id: "linha-1", itemId: item.id, nome: item.nome, preco, quantidade: 3 }] } as never } });
  const { lista } = await jogador.esperar("cadastros", (m) => m.lista.some((c) => c.tipo === "loja"));
  const loja = lista.find((c) => c.tipo === "loja")!;
  jogador.enviar({ t: "loja_comprar", lojaId: loja.id, linhaId: "linha-1", quantidade: 1, personagemId: id });
  await jogador.esperar("personagem", (m) => m.personagem.ficha.dinheiro === 500 - preco);
  conferir(personagemAgora().ficha.inventario.some((i) => i.itemId === item.id), `Compra: ${item.nome} por R$ ${preco}`);
  const compra = [...mestre.recebidas].reverse().find((m) => m.t === "evento" && m.evento.tipo === "ficha_alterada");
  if (compra?.t === "evento") mestre.enviar({ t: "ficha_desfazer", eventoId: compra.evento.id });
  await jogador.esperar("personagem", (m) => m.personagem.ficha.dinheiro === 500);
  const lojaDepois = await mestre.esperar("cadastros", (m) => m.lista.some((c) => c.tipo === "loja" && c.dados.itens[0]!.quantidade === 3));
  conferir(!!lojaDepois, "Desfazer da compra devolve dinheiro, item e estoque");

  /* ---------- Mundo, Jogo do 21, NPC, marco e Mostrar ---------- */
  const mod = pacote.conteudo.modificadores[0];
  if (mod) {
    mestre.enviar({ t: "opcoes_campanha", opcoes: { ...mesa.opcoes, mundo: [{ id: mod.id, campoAberto: false }] } });
    await jogador.esperar("opcoes_campanha", (m) => m.opcoes.mundo.length === 1);
    conferir(true, `Modificador ligado chega a todos: ${mod.nome}`);
  }
  if (pacote.conteudo.regras.find((x) => x.id === ID_JOGO_DO_21)?.mecanica) {
    mestre.enviar({ t: "jogo21_abrir", personagemId: id, local: "Baú" });
    const { lista: jogos } = await jogador.esperar("jogos21", (m) => m.lista.length === 1);
    jogador.enviar({ t: "jogo21_parar", jogoId: jogos[0]!.id, asesComo11: 0 });
    const ev = await mestre.esperar("evento", (m) => m.evento.tipo === "jogo21");
    conferir(ev.evento.tipo === "jogo21", `Jogo do 21: ${ev.evento.tipo === "jogo21" ? ev.evento.dados.rotulo : ""}`);
  }
  mestre.enviar({ t: "cadastro_salvar", cadastro: { tipo: "npc", dados: { nome: "Seu Tião", resumo: "Ferreiro.", segredo: SEGREDO, visivel: true } as never } });
  mestre.enviar({ t: "cadastro_salvar", cadastro: { tipo: "marco", dados: { titulo: "O sino parou", visivel: true, aconteceu: true } as never } });
  await jogador.esperar("cadastros", (m) => m.lista.some((c) => c.tipo === "npc") && m.lista.some((c) => c.tipo === "marco"));
  conferir(!JSON.stringify(jogador.recebidas).includes(SEGREDO), "NPC e marco visíveis chegam sem segredo");
  mestre.enviar({ t: "mostrar", mostra: { titulo: "Carta rasgada", texto: "Encontre-me no moinho.", imagem: null, para: [] } });
  await jogador.esperar("mostrando", (m) => m.mostra?.titulo === "Carta rasgada");
  mestre.enviar({ t: "mostrar_fechar" });
  await jogador.esperar("mostrando", (m) => m.mostra === null, jogador.recebidas.length);
  conferir(true, "Mostrar abre e fecha para o jogador");
  mestre.enviar({ t: "cadastro_salvar", cadastro: { tipo: "diario", dados: { sessao: 1, texto: "Sessão de aceite.", visivel: true } as never } });
  await jogador.esperar("cadastros", (m) => m.lista.some((c) => c.tipo === "diario"));
  conferir(true, "Diário visível chega ao jogador");

  const relatorio = ["# Aceite do mestre", "", `Pacote: ${pacote.manifesto.nome} ${pacote.manifesto.versao}${previa ? " (prévia com propostas)" : ""}.`, "", ...notas.map((n) => `- ${n}`), "", falhas.length ? `## Falhas\n\n${falhas.map((f) => `- ${f}`).join("\n")}` : "Tudo certo.", ""];
  const destino = join(pasta, "..", "aceite-mestre.md");
  writeFileSync(destino, relatorio.join("\n"));
  console.log(`Relatório: ${destino}`);
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
