import type { Conteudo } from "@odm/conteudo";

/* Tudo aqui é fictício: o repositório é público e não leva texto nem tabela dos livros. */
export const fonte = { arquivo: "exemplo.md" };
const regra = (id: string, mecanica: Record<string, unknown>) => ({ id, tipo: "regra" as const, nome: id, fonte, texto: "", mecanica });

export const conteudoExemplo = (): Conteudo =>
  ({
    efeitos: [],
    criaturas: [],
    ameacas: [],
    modificacoes: [],
    municoes: [],
    propriedades: [],
    tabelas: [
      {
        ...regra("tabela.xp-por-nivel", {
          xp_por_nivel: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [String(i + 1), i * 100])),
          nivel_maximo: 20,
        }),
        tipo: "tabela",
        cabecalho: [],
        linhas: [],
      },
      {
        ...regra("tabela.bonus-de-proficiencia", {
          faixas: [
            { de: 1, ate: 10, bonus: 2 },
            { de: 11, ate: 20, bonus: 4 },
          ],
        }),
        tipo: "tabela",
        cabecalho: [],
        linhas: [],
      },
      { ...regra("tabela.categorias-de-proficiencia", { categorias: [{ id: "armadura_leve", grupo: "armadura" }] }), tipo: "tabela", cabecalho: [], linhas: [] },
    ],
    regras: [
      regra("regra.atribuindo-atributos", { valores: [3, 2, 1, 0, 0, -1], apos_modificadores: { minimo: -1, maximo: 5 } }),
      regra("regra.regra-de-carga", { limite_kg: { base: 4, por_fibra: 3, minimo: 4 } }),
      regra("regra.seu-turno", { pa_por_turno: 3 }),
      regra("regra.estresse-maximo", { formula: { base: 7, soma: ["intelecto"] } }),
      regra("regra.como-gastar-seus-pontos-de-prestigio", {
        pontos: { um_por_nivel_alcancado: { de: 11, ate: 20 } },
        opcoes: [
          { id: "tecnica_avancada", custo: 1 },
          { id: "tecnica_lendaria", custo: 2, exige: { tecnicas_avancadas: 1 } },
          { id: "talento_ou_proficiencia", custo: 1 },
          { id: "vitalidade_aprimorada", custo: 1, pv_maximo: 5, repetivel: true },
        ],
        ponto_de_fibra: { pv_maximo_por_nivel_de_classe: 1, ate_o_nivel: 10 },
      }),
      regra("regra.defesa-sem-armadura", { formula: { base: 9, soma: ["agilidade"] } }),
      regra("regra.deslocamento-base", { metros: 5 }),
    ],
    pericias: [
      { id: "pericia.faro", tipo: "pericia", nome: "FARO", exibir: "Faro", atributo: "astucia", fonte, texto: "" },
      { id: "pericia.percepcao", tipo: "pericia", nome: "PERCEPCAO", exibir: "Percepção", atributo: "astucia", fonte, texto: "" },
      { id: "pericia.manha", tipo: "pericia", nome: "MANHA", exibir: "Manha", atributo: "presenca", fonte, texto: "" },
    ],
    origens: [
      {
        id: "origem.ferreiro",
        tipo: "origem",
        nome: "Ferreiro",
        fonte,
        texto: "",
        pericias: null,
        ferramentas: null,
        mecanica: { concede: { atributos: { brutalidade: 1 }, pericias: ["pericia.manha"] }, modifica: [{ alvo: "rd", valor: 1, enquanto: "sem_armadura" }] },
      },
      { id: "origem.sem-revisao", tipo: "origem", nome: "Sem revisão", fonte, texto: "", pericias: null, ferramentas: null },
    ],
    talentos: [
      { id: "talento.teimoso", tipo: "talento", nome: "Teimoso", fonte, texto: "", mecanica: { concede: { atributo_a_escolha: { pontos: 1, maximo: 5 } }, repetivel: true } },
      { id: "talento.resistente", tipo: "talento", nome: "Resistente", fonte, texto: "", mecanica: { concede: { resistencia_a_escolha: true }, repetivel: true } },
      { id: "talento.versado", tipo: "talento", nome: "Versado", fonte, texto: "", mecanica: { concede: { escolher: { rotulo: "Perícia", quantidade: 1, de: "pericias" } } } },
      { id: "talento.calejado", tipo: "talento", nome: "Calejado", fonte, texto: "", mecanica: { modifica: [{ alvo: "defesa", valor: 1 }] } },
    ],
    classes: [
      {
        id: "classe.rufiao",
        tipo: "classe",
        nome: "Rufião",
        fonte,
        texto: "",
        descricao: "",
        caracteristicas: {},
        tabela: [
          { nivel: 1, caracteristicas: "Soco", colunas: { Fôlego: "2" } },
          { nivel: 2, caracteristicas: "Guarda", colunas: { Fôlego: "4" } },
          { nivel: 3, caracteristicas: "Especialização", colunas: { Fôlego: "6" } },
        ],
        mecanica: {
          dado_de_vida: "d8",
          pv: { primeiro_nivel: 20, por_nivel: 4 },
          proficiencias: { armaduras: ["armadura_leve"], armas: ["armas_simples"], ferramentas: [], ferramentas_a_escolher: 1, trocas: [{ ganha: "armadura_media", sacrifica: { pericias_ou_ferramentas: 1 } }] },
          pericias: { escolher: 1, de: ["pericia.faro", "pericia.percepcao"] },
          niveis: {
            "1": { ganha: ["habilidade.rufiao.soco", "recurso.rufiao.folego", "recurso.rufiao.astucia"] },
            "2": { ganha: ["habilidade.rufiao.guarda"], talento: true },
            "3": { especializacao: true, habilidades_de_especializacao: true, escolher: { rotulo: "Golpes", quantidade: 2, de: "golpes" } },
            "10": { ganha: ["habilidade.rufiao.mais-folego"] },
          },
          listas: { golpes: ["habilidade.rufiao.jab", "habilidade.rufiao.gancho", "habilidade.rufiao.direto"] },
        },
      },
      { id: "classe.crua", tipo: "classe", nome: "Crua", fonte, texto: "", descricao: "", caracteristicas: {}, tabela: [] },
    ],
    especializacoes: [
      { id: "especializacao.rufiao.bravo", tipo: "especializacao", nome: "Bravo", classe: "Rufião", fonte, texto: "", descricao: "" },
      { id: "especializacao.rufiao.manso", tipo: "especializacao", nome: "Manso", classe: "Rufião", fonte, texto: "", descricao: "" },
    ],
    habilidades: [
      { id: "habilidade.rufiao.soco", nome: "Soco", tituloLivro: "Soco", classe: "Rufião", especializacao: null },
      {
        id: "habilidade.rufiao.guarda",
        nome: "Guarda",
        tituloLivro: "Guarda",
        classe: "Rufião",
        especializacao: null,
        mecanica: { defesa_sem_armadura: { base: 10, soma: ["agilidade", "astucia"], permite_escudo: false } },
      },
      { id: "habilidade.rufiao.mais-folego", nome: "Mais Fôlego", tituloLivro: "Mais Fôlego", classe: "Rufião", especializacao: null },
      { id: "habilidade.rufiao.bravo.urro", nome: "Urro", tituloLivro: "Urro", classe: "Rufião", especializacao: "Bravo", nivel: 3 },
      { id: "habilidade.rufiao.bravo.rugido", nome: "Rugido", tituloLivro: "Rugido", classe: "Rufião", especializacao: "Bravo", nivel: 7 },
      { id: "habilidade.rufiao.bravo.lista", nome: "Lista", tituloLivro: "Lista", classe: "Rufião", especializacao: "Bravo" },
      { id: "habilidade.rufiao.manso.sopro", nome: "Sopro", tituloLivro: "Sopro", classe: "Rufião", especializacao: "Manso", nivel: 3 },
      { id: "habilidade.rufiao.avancada", nome: "Avançada", tituloLivro: "Avançada", classe: "Rufião", especializacao: null, tecnica: "avancada" },
      { id: "habilidade.rufiao.manso.avancada", nome: "Avançada Mansa", tituloLivro: "Mansa", classe: "Rufião", especializacao: "Manso", tecnica: "avancada" },
      { id: "habilidade.rufiao.lendaria", nome: "Lendária", tituloLivro: "Lendária", classe: "Rufião", especializacao: null, tecnica: "lendaria" },
      { id: "habilidade.rufiao.jab", nome: "Jab", tituloLivro: "Jab", classe: "Rufião", especializacao: null },
    ].map((h) => ({ ...h, tipo: "habilidade" as const, fonte, texto: "" })),
    recursos: [
      {
        id: "recurso.rufiao.folego",
        nome: "Fichas de Fôlego",
        especializacao: null,
        mecanica: { maximo: { coluna: "Fôlego" }, aumenta: [{ com: "habilidade.rufiao.mais-folego", soma: 2 }], recupera: [{ quando: "descanso_longo", quantidade: "todas" }] },
      },
      { id: "recurso.rufiao.astucia", nome: "Fichas de Astúcia", especializacao: null, mecanica: { maximo: { soma: ["proficiencia", "astucia"], minimo: 1 }, dt: { base: 8, soma: ["proficiencia", "astucia"] } } },
      { id: "recurso.rufiao.bravo.raiva", nome: "Fichas de Raiva", especializacao: "Bravo", mecanica: { maximo: { valor: 3 }, inicial: 0 } },
      { id: "recurso.rufiao.manso.calma", nome: "Fichas de Calma", especializacao: "Manso", mecanica: { maximo: { valor: 3 }, inicial: 0 } },
    ].map((r) => ({ ...r, tipo: "recurso" as const, classe: "Rufião", fonte, texto: "" })),
    itens: [
      { id: "item.colete", nome: "Colete", categoria: "protecao", mecanica: { peso_kg: 2, protecao: { categoria: "armadura_leve", defesa: 12, soma_agilidade: true, agilidade_maxima: 2, rd: 1 } } },
      { id: "item.placas", nome: "Placas", categoria: "protecao", mecanica: { peso_kg: 9, protecao: { categoria: "armadura_pesada", defesa: 17, soma_agilidade: false } } },
      { id: "item.escudo", nome: "Tampa", categoria: "protecao", mecanica: { peso_kg: 1, protecao: { categoria: "escudo", bonus_defesa: 2, soma_agilidade: false } } },
      { id: "item.bigorna", nome: "Bigorna", categoria: "equipamento", mecanica: { peso_kg: 8 } },
      { id: "item.mochila", nome: "Mochila", categoria: "equipamento", mecanica: { peso_kg: 1, carga_extra_kg: 6 } },
    ].map((i) => ({ ...i, tipo: "item" as const, fonte, texto: "", departamento: null, preco: null, campos: {} })),
  }) as unknown as Conteudo;
