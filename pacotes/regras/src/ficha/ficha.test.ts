import { fichaVazia, opcoesPadrao, type CompraPrestigio, type FichaDados, type OpcoesCampanha, type Operacao } from "@odm/protocolo";
import { describe, expect, it } from "vitest";
import {
  aplicarOperacao,
  calcularFicha,
  comprar,
  criarContexto,
  errosDaCriacao,
  habilidadesDaFicha,
  lerRegrasFicha,
  motivoParaNaoDesfazer,
  nivelDoXp,
  opcoesDaLoja,
  opcoesDoTalento,
  pendenciasDeNivel,
  pontosDePrestigio,
  recortarConteudoFicha,
  soDoMestre,
  tecnicasDaLoja,
  vagasDeProficiencia,
  type ContextoFicha,
} from "../index";
import { conteudoExemplo, fonte } from "./exemplo";

function contexto(opcoes: Partial<OpcoesCampanha> = {}): ContextoFicha {
  const r = criarContexto(recortarConteudoFicha(conteudoExemplo()), { ...opcoesPadrao(), ...opcoes });
  if (!r.ok) throw new Error(`Faltou: ${r.faltando.join(", ")}`);
  return r.contexto;
}

/* Fibra 2, Agilidade 3, Astúcia 1: o suficiente para distinguir cada conta. */
const ficha = (extra: Partial<FichaDados> = {}): FichaDados => ({
  ...fichaVazia(),
  nome: "Zé Ninguém",
  classeId: "classe.rufiao",
  atributos: { brutalidade: 0, agilidade: 3, fibra: 2, intelecto: 0, astucia: 1, presenca: -1 },
  ...extra,
});

const xpDoNivel = (nivel: number) => (nivel - 1) * 100;
const item = (itemId: string, nome: string, equipado = true, quantidade = 1) => ({ id: `${itemId}-1`, itemId, nome, quantidade, equipado, pesoKg: null });
const vitalidade = (id: string): CompraPrestigio => ({ id, tipo: "vitalidade_aprimorada" });

describe("regras do pacote", () => {
  it("sem a mecânica aprovada, diz qual regra falta", () => {
    const conteudo = conteudoExemplo();
    conteudo.regras = conteudo.regras.filter((r) => r.id !== "regra.deslocamento-base");
    const lido = lerRegrasFicha(conteudo);
    expect(lido).toEqual({ ok: false, faltando: ["regra.deslocamento-base"] });
  });

  it("o jogador não recebe tabela do mestre no recorte", () => {
    const conteudo = conteudoExemplo();
    conteudo.tabelas.push({ id: "tabela.encontros", tipo: "tabela", nome: "Encontros", fonte, texto: "", cabecalho: [], linhas: [] });
    expect(recortarConteudoFicha(conteudo).tabelas.map((t) => t.id)).not.toContain("tabela.encontros");
  });
});

describe("nível e proficiência", () => {
  const ctx = contexto();

  it("sobe exatamente no XP da tabela", () => {
    expect(nivelDoXp(99, ctx.regras)).toBe(1);
    expect(nivelDoXp(100, ctx.regras)).toBe(2);
    expect(nivelDoXp(999_999, ctx.regras)).toBe(20);
  });

  it("bônus de proficiência segue a faixa", () => {
    expect(calcularFicha(ficha({ xp: xpDoNivel(10) }), ctx).proficiencia).toBe(2);
    expect(calcularFicha(ficha({ xp: xpDoNivel(11) }), ctx).proficiencia).toBe(4);
  });
});

describe("Pontos de Vida", () => {
  const ctx = contexto();

  it("mostra a conta do primeiro nível", () => {
    const { pvMaximo } = calcularFicha(ficha(), ctx);
    expect(pvMaximo.valor).toBe(22);
    expect(pvMaximo.conta.map((p) => p.valor)).toEqual([20, 0, 2]);
  });

  it("soma por nível até o 10 e para de subir depois", () => {
    expect(calcularFicha(ficha({ xp: xpDoNivel(3) }), ctx).pvMaximo.valor).toBe(20 + 2 * 4 + 3 * 2);
    expect(calcularFicha(ficha({ xp: xpDoNivel(10) }), ctx).pvMaximo.valor).toBe(20 + 9 * 4 + 10 * 2);
    expect(calcularFicha(ficha({ xp: xpDoNivel(15) }), ctx).pvMaximo.valor).toBe(20 + 9 * 4 + 10 * 2);
  });

  it("um ponto de Fibra comprado no nível 11 dá 10 PV de uma vez", () => {
    const antes = ficha({ xp: xpDoNivel(11) });
    const talento: CompraPrestigio = { id: "c1", tipo: "talento", talentoId: "talento.teimoso", atributo: "fibra" };
    const depois = comprar(antes, talento, contexto());
    if (!depois.ok) throw new Error(depois.motivo);
    expect(calcularFicha(depois.ficha, ctx).pvMaximo.valor - calcularFicha(antes, ctx).pvMaximo.valor).toBe(10);
  });

  it("Vitalidade Aprimorada soma 5 por compra", () => {
    const f = ficha({ xp: xpDoNivel(12), compras: [vitalidade("a"), vitalidade("b")] });
    expect(calcularFicha(f, ctx).pvMaximo.valor).toBe(20 + 36 + 20 + 10);
  });
});

describe("Defesa", () => {
  const ctx = contexto();

  it("sem armadura usa a regra geral", () => {
    expect(calcularFicha(ficha(), ctx).defesa.valor).toBe(12);
  });

  it("habilidade substitui a conta quando dá mais", () => {
    const { defesa } = calcularFicha(ficha({ xp: xpDoNivel(2) }), ctx);
    expect(defesa.valor).toBe(14);
    expect(defesa.conta[0]?.rotulo).toBe("Guarda");
  });

  it("escudo anula a habilidade que não permite escudo, mas soma o próprio bônus", () => {
    const f = ficha({ xp: xpDoNivel(2), inventario: [item("item.escudo", "Tampa")] });
    expect(calcularFicha(f, ctx).defesa.valor).toBe(12 + 2);
  });

  it("armadura respeita o limite de Agilidade", () => {
    const f = ficha({ inventario: [item("item.colete", "Colete")] });
    expect(calcularFicha(f, ctx).defesa.valor).toBe(12 + 2);
  });

  it("modificador vindo de talento entra na conta com o nome dele", () => {
    const f = ficha({ xp: xpDoNivel(2), talentos: [{ nivel: 2, talentoId: "talento.calejado" }] });
    const { defesa } = calcularFicha(f, ctx);
    expect(defesa.valor).toBe(15);
    expect(defesa.conta.at(-1)).toEqual({ rotulo: "Calejado", valor: 1 });
  });

  it("ajuste manual fica marcado e aparece na conta", () => {
    const f = ficha({ ajustes: { defesa: { valor: 2, motivo: "benção" } } });
    const { defesa } = calcularFicha(f, ctx);
    expect(defesa.valor).toBe(14);
    expect(defesa.ajuste).toEqual({ valor: 2, motivo: "benção" });
    expect(defesa.conta.at(-1)?.rotulo).toBe("Ajuste manual: benção");
  });
});

describe("origem", () => {
  const ctx = contexto();

  it("aplica atributo, perícia e RD condicional", () => {
    const f = ficha({ origemId: "origem.ferreiro" });
    const c = calcularFicha(f, ctx);
    expect(c.atributos.brutalidade.valor).toBe(1);
    expect(c.pericias.find((p) => p.id === "pericia.manha")).toMatchObject({ treinada: true, total: { valor: 1 } });
    expect(c.rd.valor).toBe(1);
    expect(calcularFicha({ ...f, inventario: [item("item.placas", "Placas")] }, ctx).rd.valor).toBe(0);
  });

  it("origem sem revisão não muda nada", () => {
    expect(calcularFicha(ficha({ origemId: "origem.sem-revisao" }), ctx).rd.valor).toBe(0);
  });
});

describe("carga e deslocamento", () => {
  const ctx = contexto();

  it("limite com Fibra, e mínimo com Fibra negativa", () => {
    expect(calcularFicha(ficha(), ctx).carga.limite.valor).toBe(10);
    const fraco = ficha({ atributos: { ...ficha().atributos, fibra: -1 } });
    expect(calcularFicha(fraco, ctx).carga.limite.valor).toBe(4);
  });

  it("acima do limite fica Sobrecarregado, com metade do deslocamento", () => {
    const f = ficha({ inventario: [item("item.bigorna", "Bigorna", false, 2)] });
    const c = calcularFicha(f, ctx);
    expect(c.carga.condicao).toBe("sobrecarregado");
    expect(c.deslocamento.valor).toBe(3);
  });

  it("no dobro do limite fica imobilizado", () => {
    const c = calcularFicha(ficha({ inventario: [item("item.bigorna", "Bigorna", false, 3)] }), ctx);
    expect(c.carga.condicao).toBe("imobilizado");
    expect(c.deslocamento.valor).toBe(0);
  });

  it("mochila equipada aumenta o limite", () => {
    expect(calcularFicha(ficha({ inventario: [item("item.mochila", "Mochila")] }), ctx).carga.limite.valor).toBe(16);
  });

  it("armadura sem proficiência tira deslocamento", () => {
    expect(calcularFicha(ficha({ inventario: [item("item.placas", "Placas")] }), ctx).deslocamento.valor).toBe(2);
    expect(calcularFicha(ficha({ inventario: [item("item.colete", "Colete")] }), ctx).deslocamento.valor).toBe(5);
  });
});

describe("Estresse", () => {
  it("só existe com a opção da campanha ligada", () => {
    expect(calcularFicha(ficha(), contexto()).estresseMaximo).toBeNull();
    expect(calcularFicha(ficha(), contexto({ estresse: true })).estresseMaximo?.valor).toBe(7);
  });
});

describe("fichas de classe", () => {
  const ctx = contexto();
  const de = (f: FichaDados, id: string) => calcularFicha(f, ctx).fichasDeClasse.find((r) => r.id === id);

  it("máximo pela coluna da tabela, no nível atual", () => {
    expect(de(ficha({ xp: xpDoNivel(2) }), "recurso.rufiao.folego")?.maximo.valor).toBe(4);
  });

  it("máximo pela soma, com mínimo", () => {
    expect(de(ficha(), "recurso.rufiao.astucia")?.maximo.valor).toBe(3);
    const f = ficha({ atributos: { ...ficha().atributos, astucia: -1 }, xp: 0 });
    expect(de(f, "recurso.rufiao.astucia")?.maximo.valor).toBe(1);
  });

  it("DT da ficha", () => {
    expect(de(ficha(), "recurso.rufiao.astucia")?.dt?.valor).toBe(11);
  });

  it("habilidade aumenta o máximo a partir do nível dela", () => {
    expect(de(ficha({ xp: xpDoNivel(10) }), "recurso.rufiao.folego")?.maximo.conta.at(-1)).toEqual({ rotulo: "Mais Fôlego", valor: 2 });
  });

  it("ficha da especialização só entra com ela escolhida, e a que se acumula começa em zero", () => {
    expect(de(ficha({ xp: xpDoNivel(3) }), "recurso.rufiao.bravo.raiva")).toBeUndefined();
    const f = ficha({ xp: xpDoNivel(3), especializacaoId: "especializacao.rufiao.bravo" });
    expect(de(f, "recurso.rufiao.bravo.raiva")?.inicial).toBe(0);
    expect(de(f, "recurso.rufiao.manso.calma")).toBeUndefined();
  });
});

describe("habilidades e escolhas por nível", () => {
  const ctx = contexto();
  const ids = (f: FichaDados) => habilidadesDaFicha(f, ctx).map((h) => h.id);

  it("as da tabela entram sozinhas no nível indicado", () => {
    expect(ids(ficha())).toEqual(["habilidade.rufiao.soco"]);
    expect(ids(ficha({ xp: xpDoNivel(2) }))).toContain("habilidade.rufiao.guarda");
  });

  it("da especialização entram até o nível atual; lista sem nível entra junto", () => {
    const base = ficha({ especializacaoId: "especializacao.rufiao.bravo" });
    expect(ids({ ...base, xp: xpDoNivel(3) })).toEqual(expect.arrayContaining(["habilidade.rufiao.bravo.urro", "habilidade.rufiao.bravo.lista"]));
    expect(ids({ ...base, xp: xpDoNivel(3) })).not.toContain("habilidade.rufiao.bravo.rugido");
    expect(ids({ ...base, xp: xpDoNivel(7) })).toContain("habilidade.rufiao.bravo.rugido");
  });

  it("habilidade que saiu do pacote fica com a cópia e o aviso", () => {
    const f = ficha({ habilidadesDoMestre: ["habilidade.sumiu"], copias: { "habilidade.sumiu": { nome: "Antiga", texto: "Texto" } } });
    expect(habilidadesDaFicha(f, ctx).find((h) => h.id === "habilidade.sumiu")).toMatchObject({ nome: "Antiga", foraDoLivro: true });
  });

  it("pede o que o nível pede, e para depois de escolhido", () => {
    const f = ficha({ xp: xpDoNivel(3) });
    expect(pendenciasDeNivel(f, ctx).map((p) => [p.tipo, p.nivel])).toEqual([
      ["talento", 2],
      ["especializacao", 3],
      ["escolha", 3],
    ]);
    const pronta = ficha({
      xp: xpDoNivel(3),
      talentos: [{ nivel: 2, talentoId: "talento.calejado" }],
      especializacaoId: "especializacao.rufiao.manso",
      escolhasDeNivel: { "3": ["habilidade.rufiao.jab", "habilidade.rufiao.gancho"] },
    });
    expect(pendenciasDeNivel(pronta, ctx)).toEqual([]);
  });

  it("escolha pela metade mostra quantas faltam e tira da lista o que já foi", () => {
    const f = ficha({ xp: xpDoNivel(3), talentos: [{ nivel: 2, talentoId: "talento.calejado" }], especializacaoId: "especializacao.rufiao.manso", escolhasDeNivel: { "3": ["habilidade.rufiao.jab"] } });
    expect(pendenciasDeNivel(f, ctx)).toEqual([
      { tipo: "escolha", nivel: 3, rotulo: "Golpes", quantidade: 1, opcoes: ["habilidade.rufiao.gancho", "habilidade.rufiao.direto"] },
    ]);
  });
});

describe("loja de prestígio", () => {
  const ctx = contexto();
  const motivo = (f: FichaDados, id: string) => opcoesDaLoja(f, ctx).find((o) => o.id === id)?.motivo;

  it("um ponto por nível alcançado entre 11 e 20", () => {
    expect(pontosDePrestigio(ficha({ xp: xpDoNivel(10) }), ctx).ganhos).toBe(0);
    expect(pontosDePrestigio(ficha({ xp: xpDoNivel(11) }), ctx).ganhos).toBe(1);
    expect(pontosDePrestigio(ficha({ xp: xpDoNivel(20) }), ctx).ganhos).toBe(10);
    expect(pontosDePrestigio(ficha({ xp: 999_999 }), ctx).ganhos).toBe(10);
  });

  it("pontos do mestre somam ao saldo", () => {
    expect(pontosDePrestigio(ficha({ xp: xpDoNivel(11), prestigioDoMestre: 2 }), ctx).saldo).toBe(3);
  });

  it("fechada antes do nível 11, com o motivo no botão", () => {
    expect(motivo(ficha({ xp: xpDoNivel(10), prestigioDoMestre: 3 }), "vitalidade_aprimorada")).toBe("Só depois do nível 10");
  });

  it("sem saldo mostra o preço e o que tem", () => {
    expect(motivo(ficha({ xp: xpDoNivel(11), compras: [vitalidade("a")] }), "tecnica_avancada")).toBe("Custa 1, você tem 0");
  });

  it("Técnica Lendária exige uma Avançada antes do preço", () => {
    expect(motivo(ficha({ xp: xpDoNivel(20) }), "tecnica_lendaria")).toBe("Exige uma Técnica Avançada");
    const comAvancada = ficha({ xp: xpDoNivel(12), compras: [{ id: "a", tipo: "tecnica_avancada", habilidadeId: "habilidade.rufiao.avancada" }] });
    expect(motivo(comAvancada, "tecnica_lendaria")).toBe("Custa 2, você tem 1");
  });

  it("Polivalência fica bloqueada, com o motivo certo", () => {
    expect(motivo(ficha({ xp: xpDoNivel(20) }), "polivalencia")).toBe("Polivalência desligada na campanha");
    expect(opcoesDaLoja(ficha({ xp: xpDoNivel(20) }), contexto({ polivalencia: true })).find((o) => o.id === "polivalencia")?.motivo).toBe("Exige o pacote A Ordem no Caos");
  });

  it("técnicas: só da própria classe e da especialização escolhida", () => {
    const f = ficha({ xp: xpDoNivel(12), especializacaoId: "especializacao.rufiao.bravo" });
    expect(tecnicasDaLoja(f, ctx, "avancada").map((t) => t.id)).toEqual(["habilidade.rufiao.avancada"]);
  });

  it("recusa comprar a mesma técnica duas vezes", () => {
    const compra: CompraPrestigio = { id: "a", tipo: "tecnica_avancada", habilidadeId: "habilidade.rufiao.avancada" };
    const f = ficha({ xp: xpDoNivel(12), compras: [compra] });
    expect(comprar(f, { ...compra, id: "b" }, ctx)).toEqual({ ok: false, motivo: "Já comprada" });
  });

  it("talento repetível aceita de novo; quem pede atributo não repete o mesmo", () => {
    const repetivel = ficha({ xp: xpDoNivel(13), compras: [{ id: "a", tipo: "talento", talentoId: "talento.teimoso", atributo: "fibra" }] });
    expect(comprar(repetivel, { id: "b", tipo: "talento", talentoId: "talento.teimoso", atributo: "fibra" }, ctx).ok).toBe(true);
    const senso = ficha({ xp: xpDoNivel(13), compras: [{ id: "a", tipo: "talento", talentoId: "talento.resistente", atributo: "fibra" }] });
    expect(comprar(senso, { id: "b", tipo: "talento", talentoId: "talento.resistente", atributo: "fibra" }, ctx)).toEqual({ ok: false, motivo: "Já escolheu este atributo" });
    expect(comprar(senso, { id: "b", tipo: "talento", talentoId: "talento.resistente", atributo: "astucia" }, ctx).ok).toBe(true);
    expect(calcularFicha(senso, ctx).resistencias.fibra.valor).toBe(2 + 4);
  });

  it("talento com escolha dá a proficiência escolhida", () => {
    const f = ficha({ xp: xpDoNivel(11), compras: [{ id: "a", tipo: "talento", talentoId: "talento.versado", escolhas: ["pericia.faro"] }] });
    expect(calcularFicha(f, ctx).pericias.find((p) => p.id === "pericia.faro")?.treinada).toBe(true);
    expect(opcoesDoTalento("talento.versado", ctx)).toMatchObject({ quantidade: 1 });
  });

  it("modificador por nível e por atributo", () => {
    const conteudo = conteudoExemplo();
    conteudo.origens.push({ id: "origem.forte", tipo: "origem", nome: "Forte", fonte, texto: "", pericias: null, ferramentas: null, mecanica: { modifica: [{ alvo: "pv_maximo", valor: 1, por_nivel: true }, { alvo: "rd", valor: 0, atributo: "fibra", enquanto: "sem_armadura_nem_escudo" }] } });
    const r = criarContexto(recortarConteudoFicha(conteudo));
    if (!r.ok) throw new Error();
    const f = ficha({ origemId: "origem.forte", xp: xpDoNivel(5) });
    expect(calcularFicha(f, r.contexto).pvMaximo.valor).toBe(20 + 16 + 10 + 5);
    expect(calcularFicha(f, r.contexto).rd.valor).toBe(2);
  });

  it("proteção com penalidade de deslocamento e sem limite de Agilidade", () => {
    const conteudo = conteudoExemplo();
    conteudo.itens.push({ id: "item.gibao", tipo: "item", nome: "Gibão", categoria: "protecao", fonte, texto: "", departamento: null, preco: null, campos: {}, mecanica: { protecao: { categoria: "armadura_leve", defesa: 11, soma_agilidade: true, agilidade_maxima: null, deslocamento: -1 } } });
    const r = criarContexto(recortarConteudoFicha(conteudo));
    if (!r.ok) throw new Error();
    const c = calcularFicha(ficha({ inventario: [item("item.gibao", "Gibão")] }), r.contexto);
    expect(c.defesa.valor).toBe(14);
    expect(c.deslocamento.valor).toBe(4);
  });

  it("recusa técnica de outra especialização mesmo com id válido", () => {
    const f = ficha({ xp: xpDoNivel(12), especializacaoId: "especializacao.rufiao.bravo" });
    const compra: CompraPrestigio = { id: "a", tipo: "tecnica_avancada", habilidadeId: "habilidade.rufiao.manso.avancada" };
    expect(comprar(f, compra, ctx).ok).toBe(false);
  });

  it("atributo para no máximo 5, e talento comum não repete", () => {
    const forte = ficha({ xp: xpDoNivel(13), atributos: { ...ficha().atributos, agilidade: 5 } });
    expect(comprar(forte, { id: "a", tipo: "talento", talentoId: "talento.teimoso", atributo: "agilidade" }, ctx)).toEqual({ ok: false, motivo: "Máximo 5 neste atributo" });
    expect(comprar(forte, { id: "a", tipo: "talento", talentoId: "talento.teimoso" }, ctx)).toEqual({ ok: false, motivo: "Escolha o atributo" });
    const comTalento = ficha({ xp: xpDoNivel(13), talentos: [{ nivel: 2, talentoId: "talento.calejado" }] });
    expect(comprar(comTalento, { id: "a", tipo: "talento", talentoId: "talento.calejado" }, ctx)).toEqual({ ok: false, motivo: "Já tem este talento" });
  });

  it("proficiência comprada vale na ficha", () => {
    const f = comprar(ficha({ xp: xpDoNivel(11) }), { id: "a", tipo: "proficiencia", genero: "pericia", valor: "pericia.faro" }, ctx);
    if (!f.ok) throw new Error(f.motivo);
    expect(calcularFicha(f.ficha, ctx).pericias.find((p) => p.id === "pericia.faro")?.treinada).toBe(true);
  });

  it("Avançada que sustenta uma Lendária não se desfaz", () => {
    const f = ficha({
      xp: xpDoNivel(14),
      compras: [
        { id: "a", tipo: "tecnica_avancada", habilidadeId: "habilidade.rufiao.avancada" },
        { id: "l", tipo: "tecnica_lendaria", habilidadeId: "habilidade.rufiao.lendaria" },
      ],
    });
    expect(motivoParaNaoDesfazer(f, "a", ctx)).toBe("Lendária depende desta compra");
    expect(motivoParaNaoDesfazer(f, "l", ctx)).toBeNull();
  });
});

describe("criação", () => {
  const ctx = contexto();
  const completa = (): FichaDados =>
    ficha({
      origemId: "origem.sem-revisao",
      atributos: { brutalidade: 3, agilidade: 2, fibra: 1, intelecto: 0, astucia: 0, presenca: -1 },
      pericias: ["pericia.faro"],
      ferramentas: ["Lima"],
    });

  it("completa não tem erro", () => {
    expect(errosDaCriacao(completa(), ctx)).toEqual([]);
  });

  it("aponta o passo de cada erro", () => {
    const passos = errosDaCriacao({ ...fichaVazia() }, ctx).map((e) => e.passo);
    expect(passos).toEqual(expect.arrayContaining(["conceito", "origem", "classe", "atributos"]));
  });

  it("recusa distribuição que não usa cada número uma vez", () => {
    const f = { ...completa(), atributos: { ...completa().atributos, brutalidade: 2 } };
    expect(errosDaCriacao(f, ctx).map((e) => e.passo)).toContain("atributos");
  });

  it("origem que leva acima do limite é erro", () => {
    const conteudo = recortarConteudoFicha(conteudoExemplo());
    const r = criarContexto(conteudo);
    if (!r.ok) throw new Error();
    const f: FichaDados = { ...completa(), origemId: "origem.ferreiro", atributos: { ...completa().atributos } };
    expect(errosDaCriacao({ ...f, atributos: { ...f.atributos, brutalidade: 5 } }, r.contexto).length).toBeGreaterThan(0);
  });

  it("recusa perícia fora da lista da classe", () => {
    const f = { ...completa(), pericias: ["pericia.manha"] };
    expect(errosDaCriacao(f, ctx).map((e) => e.mensagem)).toContain("Há perícia fora da lista da classe.");
  });

  it("classe sem revisão não fecha a criação", () => {
    expect(errosDaCriacao({ ...completa(), classeId: "classe.crua" }, ctx).map((e) => e.mensagem)).toContain("Esta classe ainda não foi revisada para o app.");
  });

  it("troca de proficiência custa vaga", () => {
    const f: FichaDados = { ...completa(), trocas: ["armadura_media"], ferramentas: [] };
    expect(vagasDeProficiencia(f, ctx)?.total).toBe(1);
    expect(errosDaCriacao(f, ctx)).toEqual([]);
    expect(calcularFicha(f, ctx).carga.condicao).toBe("normal");
  });
});

describe("operações", () => {
  it.each<[Operacao]>([
    [{ op: "xp", delta: 100 }],
    [{ op: "prestigio", delta: 1 }],
    [{ op: "dinheiro", delta: -30 }],
    [{ op: "especializacao", id: "especializacao.rufiao.bravo" }],
    [{ op: "ajuste", campo: "defesa", ajuste: { valor: 1 } }],
    [{ op: "passo_redencao", indice: 2, feito: true }],
    [{ op: "notas", texto: "novo" }],
    [{ op: "dar_habilidade", id: "habilidade.x" }],
    [{ op: "dar_item", item: item("item.bigorna", "Bigorna") }],
    [{ op: "comprar", compra: vitalidade("a") }],
    [{ op: "talento_de_nivel", nivel: 2, escolha: { nivel: 2, talentoId: "talento.calejado" } }],
    [{ op: "escolhas_de_nivel", nivel: 3, ids: ["habilidade.rufiao.jab"] }],
  ])("desfazer $0.op volta ao que era", (op) => {
    const antes = ficha();
    const { ficha: depois, inversa } = aplicarOperacao(antes, op);
    expect(depois).not.toEqual(antes);
    const { ficha: voltou } = aplicarOperacao(depois, inversa);
    const semChaveVazia = { ...voltou, escolhasDeNivel: Object.fromEntries(Object.entries(voltou.escolhasDeNivel).filter(([, v]) => v.length)) };
    expect(semChaveVazia).toEqual(antes);
  });

  it("desfazer uma compra antiga mantém a que veio depois", () => {
    const { ficha: um, inversa } = aplicarOperacao(ficha(), { op: "comprar", compra: vitalidade("a") });
    const { ficha: dois } = aplicarOperacao(um, { op: "comprar", compra: vitalidade("b") });
    expect(aplicarOperacao(dois, inversa).ficha.compras.map((c) => c.id)).toEqual(["b"]);
  });

  it("Honra fica entre 0 e 20, e desfazer devolve só o que mudou", () => {
    const f = ficha({ honra: 19 });
    const { ficha: depois, inversa } = aplicarOperacao(f, { op: "honra", delta: 5 });
    expect(depois.honra).toBe(20);
    expect(aplicarOperacao(depois, inversa).ficha.honra).toBe(19);
  });

  it("XP, Prestígio e Honra são só do mestre; compra é do jogador", () => {
    expect(soDoMestre({ op: "xp", delta: 1 })).toBe(true);
    expect(soDoMestre({ op: "prestigio", delta: 1 })).toBe(true);
    expect(soDoMestre({ op: "honra", delta: 1 })).toBe(true);
    expect(soDoMestre({ op: "comprar", compra: vitalidade("a") })).toBe(false);
  });
});
