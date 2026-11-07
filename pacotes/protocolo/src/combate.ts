import { z } from "zod";

/* Estado de combate e estado vivo do personagem (especificação 5.2 e 6.3). O servidor guarda e valida;
   o motor de regras (pacotes/regras/src/combate) calcula. Todo número que muda em jogo mora aqui, fora da
   ficha: a ficha guarda escolhas, e isto guarda o que aconteceu. */

const Id = z.string().min(1).max(160);
const Inteiro = z.number().int();
const Contagem = z.number().int().min(0).max(10_000);

export const VALORES_CARTA = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A", "coringa"] as const;
export const ValorCarta = z.enum(VALORES_CARTA);
export type ValorCarta = z.infer<typeof ValorCarta>;
export const Naipe = z.enum(["espadas", "copas", "paus", "ouros"]);
export type Naipe = z.infer<typeof Naipe>;
/* O Coringa não tem naipe. "id" separa os dois Coringas. */
export const Carta = z.object({ id: Id, valor: ValorCarta, naipe: Naipe.nullable() });
export type Carta = z.infer<typeof Carta>;

/* Um efeito aplicado a alguém. "efeitoId" é o do pacote; o resto é a situação dele agora. */
export const EfeitoAtivo = z.object({
  id: Id,
  efeitoId: Id,
  nome: z.string().max(120),
  acumulos: Contagem.default(1),
  /* Níveis de Bêbado e Loucura Frenética. A Exaustão tem campo próprio no estado vivo. */
  nivel: Contagem.nullable().default(null),
  /* Desconta no fim do turno de quem sofre o efeito. Nulo enquanto durar. */
  turnosRestantes: Contagem.nullable().default(null),
  origem: z.string().max(160).nullable().default(null),
  /* Contadores próprios do efeito, como as doses de Bêbado. */
  contadores: z.record(z.string(), Inteiro).default({}),
});
export type EfeitoAtivo = z.infer<typeof EfeitoAtivo>;

export const Morrendo = z.object({ sucessos: Contagem, falhas: Contagem, estavel: z.boolean() });
export type Morrendo = z.infer<typeof Morrendo>;

/* Aflição ou virtude da Crise: a linha da tabela e a intensidade (1 ou 2). */
export const MarcaDeCrise = z.object({ linha: z.string().max(8), nome: z.string().max(60), intensidade: z.number().int().min(1).max(2) });
export type MarcaDeCrise = z.infer<typeof MarcaDeCrise>;

export const EstadoVivo = z.object({
  /* Nulo = cheio. Assim a ficha nova e o personagem que sobe de nível começam com o máximo. */
  pv: Inteiro.nullable().default(null),
  pvTemporarios: Contagem.default(0),
  exaustao: z.number().int().min(0).max(6).default(0),
  estresse: Contagem.default(0),
  /* Fichas de classe atuais. Sem a chave, vale o valor inicial da ficha. */
  fichas: z.record(z.string(), Contagem).default({}),
  /* Quantas vezes cada habilidade foi usada desde a última recuperação. */
  usos: z.record(z.string(), Contagem).default({}),
  /* Para "uma vez a cada três descansos longos": quantos longos faltam. */
  esperaDeLongos: z.record(z.string(), Contagem).default({}),
  efeitos: z.array(EfeitoAtivo).max(60).default([]),
  morrendo: Morrendo.nullable().default(null),
  quedasDesdeODescansoLongo: Contagem.default(0),
  descansosCurtos: Contagem.default(0),
  dadosDeVidaGastos: Contagem.default(0),
  falhasPendentes: z.number().int().min(0).max(3).default(0),
  cartaDoDestino: z.boolean().default(false),
  aflicoes: z.array(MarcaDeCrise).max(6).default([]),
  virtudes: z.array(MarcaDeCrise).max(3).default([]),
  sequelas: z.array(z.string().max(60)).max(12).default([]),
  /* "Rolar resistências automaticamente" (especificação 8.4), escolhido pelo jogador. */
  automatico: z.boolean().default(false),
});
export type EstadoVivo = z.infer<typeof EstadoVivo>;
export const estadoVivoNovo = (): EstadoVivo => EstadoVivo.parse({});

export const TipoCombatente = z.enum(["personagem", "criatura", "npc"]);
export type TipoCombatente = z.infer<typeof TipoCombatente>;

/* PA do turno. "disponiveis" vale no próprio turno; o que sobra vira "guardados" até o fim da rodada. */
export const PontosDeAcao = z.object({
  disponiveis: Contagem.default(0),
  guardados: Contagem.default(0),
  /* Perdidos por efeito neste turno (Amedrontado, Debilitado): só para a tela mostrar. */
  bloqueados: Contagem.default(0),
});
export type PontosDeAcao = z.infer<typeof PontosDeAcao>;

export const IntegranteHorda = z.object({ id: Id, nome: z.string().max(80), pv: Inteiro, elite: z.boolean().default(false) });
export type IntegranteHorda = z.infer<typeof IntegranteHorda>;

export const Horda = z.object({
  integrantes: z.array(IntegranteHorda).max(60),
  /* PV somados ao formar: quem sai leva os próprios PV, então a conta é sempre "inicial − dano acumulado". */
  pvInicial: Contagem.default(0),
  danoAcumulado: Contagem.default(0),
  /* Marcados pelo mestre: o app não tem mapa (ataques-mecanica.yml). */
  naArea: z.array(Id).max(30).default([]),
  /* Pressão de Massa: uma vez por rodada por criatura. */
  pressaoNaRodada: z.array(Id).max(30).default([]),
});
export type Horda = z.infer<typeof Horda>;

/* Benefícios de curta duração que o motor precisa lembrar entre ações. */
export const Marcas = z.object({
  /* Rainha: a primeira reação não custa PA, até o início do próximo turno de quem deu. */
  reacaoSemCusto: z.object({ ate: Id }).nullable().default(null),
  /* Rei: vantagem no próximo teste de ataque ou habilidade. */
  vantagemNoProximo: z.boolean().default(false),
  /* Valete: um deslocamento sem custo no primeiro turno. */
  deslocamentoSemCusto: Contagem.default(0),
  /* Ás: PA extra no primeiro turno. */
  paExtraNoPrimeiroTurno: Contagem.default(0),
  /* Esquiva e Bloqueio: soma à Defesa contra o próximo ataque, até o fim da rodada. */
  defesaDeReacao: z.object({ valor: Inteiro, rotulo: z.string().max(40) }).nullable().default(null),
  /* Início e Combo: um ataque com Início acertou neste turno, e o Combo seguinte não sofre ataques múltiplos. */
  comboLiberado: z.boolean().default(false),
  /* Morrendo: o Teste de Morte do início do turno ainda não foi feito. */
  testeDeMortePendente: z.boolean().default(false),
  /* Atitude Imprudente (Jogador, Morrendo): a opção que vale no próximo ataque, e se já foi usada neste turno. */
  imprudente: z.enum(["precisao", "potencia", "violencia"]).nullable().default(null),
  imprudenteNoTurno: z.boolean().default(false),
});
export type Marcas = z.infer<typeof Marcas>;

export const Combatente = z.object({
  id: Id,
  tipo: TipoCombatente,
  nome: z.string().min(1).max(80),
  /* Personagem da campanha: o estado vivo dele fica no personagem, não aqui. */
  personagemId: Id.nullable().default(null),
  /* Criatura ou ameaça do pacote. */
  ref: Id.nullable().default(null),
  elite: z.boolean().default(false),
  agilidade: Inteiro.default(0),
  carta: Carta.nullable().default(null),
  /* Redenção completa: duas cartas para escolher. */
  cartasParaEscolher: z.array(Carta).max(3).default([]),
  /* Desempate por nova compra: as cartas extras, na ordem em que saíram. A carta da iniciativa continua a mesma. */
  desempate: z.array(Carta).max(10).default([]),
  /* null = ainda não escolheu entre efeito e prioridade. */
  usaEfeito: z.boolean().nullable().default(null),
  /* Coringa: os dois que trocam de lugar. Rei e Rainha: o aliado que recebe (pode ser quem usou). */
  alvosDoEfeito: z.array(Id).max(2).default([]),
  /* Efeitos de carta especial já usados neste combate (decisão de 07/11/2026: por pessoa). */
  efeitosUsados: z.array(ValorCarta).default([]),
  /* Já teve o primeiro turno do combate (Ás e Valete valem só nele). */
  jaAgiu: z.boolean().default(false),
  pa: PontosDeAcao.default({ disponiveis: 0, guardados: 0, bloqueados: 0 }),
  deslocamentosNaRodada: Contagem.default(0),
  ataquesNoTurno: Contagem.default(0),
  marcas: Marcas.default({ reacaoSemCusto: null, vantagemNoProximo: false, deslocamentoSemCusto: 0, paExtraNoPrimeiroTurno: 0, defesaDeReacao: null, comboLiberado: false, testeDeMortePendente: false, imprudente: null, imprudenteNoTurno: false }),
  /* Só criatura e NPC: o personagem usa o estado vivo dele. */
  pv: Inteiro.nullable().default(null),
  pvMaximo: Inteiro.nullable().default(null),
  pvTemporarios: Contagem.default(0),
  efeitos: z.array(EfeitoAtivo).max(60).default([]),
  /* Habilidades com Recarga X–Y já gastas. */
  recargasGastas: z.array(Id).max(40).default([]),
  derrotado: z.boolean().default(false),
  horda: Horda.nullable().default(null),
});
export type Combatente = z.infer<typeof Combatente>;

/* ---------- Ataques ---------- */

/* Com o quê: a ação da ficha da criatura ou a arma equipada do personagem. */
export const FonteDeAtaque = z.discriminatedUnion("tipo", [
  /* "escolha": no Ataque de Horda, a Pancada ou a Mordida. */
  z.object({ tipo: z.literal("acao"), acaoId: Id, escolha: Id.optional() }),
  z.object({ tipo: z.literal("arma"), itemFichaId: Id }),
]);
export type FonteDeAtaque = z.infer<typeof FonteDeAtaque>;

export const Reacao = z.enum(["esquiva", "bloqueio", "nenhuma"]);
export type Reacao = z.infer<typeof Reacao>;

export const OpcoesDeAtaque = z.object({
  /* O app não tem mapa: quem ataca marca. Além do alcance efetivo dá desvantagem. */
  alemDoAlcance: z.boolean().default(false),
  bonus: z.number().int().min(-99).max(99).default(0),
  modo: z.enum(["normal", "vantagem", "desvantagem"]).default("normal"),
});
export type OpcoesDeAtaque = z.infer<typeof OpcoesDeAtaque>;

/* Janela de reação (decisão de 06/11/2026): quem tem PA guardado escolhe antes da rolagem. */
export const AtaquePendente = z.object({
  id: Id,
  atacanteId: Id,
  /* Quem mandou atacar: o ataque fica no nome dele, mesmo quando é a reação de outro que dispara a rolagem. */
  autorId: Id.nullable().default(null),
  fonte: FonteDeAtaque,
  rotulo: z.string().max(160),
  alvos: z.array(Id).min(1).max(20),
  aguardando: z.array(Id).max(20),
  reacoes: z.record(z.string(), Reacao).default({}),
  opcoes: OpcoesDeAtaque.default({ alemDoAlcance: false, bonus: 0, modo: "normal" }),
});
export type AtaquePendente = z.infer<typeof AtaquePendente>;

/* A rolagem que a tela anima. O mestre recebe a inteira; o jogador, a versão sem a Defesa da criatura. */
export const RolagemDeCombate = z.object({
  titulo: z.string().max(160),
  subtitulo: z.string().max(160).nullable().default(null),
  dados: z.array(Inteiro).max(6),
  escolhido: Contagem,
  cartas: z.array(z.object({ valor: ValorCarta, naipe: Naipe.nullable(), valeu: z.boolean() })).max(3).default([]),
  modificadores: z.array(z.object({ rotulo: z.string().max(80), valor: Inteiro })).max(30),
  total: Inteiro,
  alvo: z.object({ rotulo: z.string().max(80), valor: Inteiro.nullable() }).nullable(),
  resultado: z.object({ texto: z.string().max(40), bom: z.boolean() }).nullable(),
  natural: Inteiro.nullable(),
  notaFinal: z.string().max(300).nullable().default(null),
  /* Quem vê a animação: quem atacou e o jogador atacado. */
  para: z.array(Id).max(20).default([]),
});
export type RolagemDeCombate = z.infer<typeof RolagemDeCombate>;

export const FaseCombate = z.enum(["iniciativa", "em_curso", "fim_da_rodada", "encerrado"]);
export type FaseCombate = z.infer<typeof FaseCombate>;

export const EstadoCombate = z.object({
  id: Id,
  fase: FaseCombate,
  rodada: Contagem,
  /* Índice em "ordem" de quem age agora. */
  vez: Contagem,
  ordem: z.array(Id).max(60),
  combatentes: z.array(Combatente).max(60),
  baralho: z.array(Carta).max(54),
  ataquePendente: AtaquePendente.nullable().default(null),
});
export type EstadoCombate = z.infer<typeof EstadoCombate>;

/* ---------- Mudanças: tudo o que acontece em combate, sempre com a inversa ---------- */

/* Quem a mudança atinge: um personagem (estado vivo) ou um combatente (criatura, NPC ou PA de qualquer um). */
export const Alvo = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("personagem"), id: Id }),
  z.object({ tipo: z.literal("combatente"), id: Id }),
]);
export type Alvo = z.infer<typeof Alvo>;

export const CampoNumerico = z.enum([
  "pv",
  "pvTemporarios",
  "exaustao",
  "estresse",
  "quedasDesdeODescansoLongo",
  "descansosCurtos",
  "dadosDeVidaGastos",
  "falhasPendentes",
  "pa.disponiveis",
  "pa.guardados",
  "pa.bloqueados",
  "deslocamentosNaRodada",
  "ataquesNoTurno",
]);
export type CampoNumerico = z.infer<typeof CampoNumerico>;

const Delta = z.number().int().min(-100_000).max(100_000);

/* Desfazer aplica a inversa sobre o estado de agora, não volta uma foto: por isso o mestre desfaz em qualquer
   ordem sem perder o que veio depois. Número muda por diferença; o resto troca "antes" por "depois". */
export const Mudanca = z.discriminatedUnion("op", [
  z.object({ op: z.literal("somar"), alvo: Alvo, campo: CampoNumerico, delta: Delta }),
  z.object({ op: z.literal("ficha"), alvo: Alvo, recursoId: Id, delta: Delta }),
  z.object({ op: z.literal("uso"), alvo: Alvo, habilidadeId: Id, delta: Delta }),
  z.object({ op: z.literal("espera_de_longos"), alvo: Alvo, habilidadeId: Id, delta: Delta }),
  z.object({ op: z.literal("efeito_entra"), alvo: Alvo, efeito: EfeitoAtivo }),
  z.object({ op: z.literal("efeito_sai"), alvo: Alvo, efeito: EfeitoAtivo }),
  z.object({ op: z.literal("efeito_muda"), alvo: Alvo, antes: EfeitoAtivo, depois: EfeitoAtivo }),
  z.object({ op: z.literal("morrendo"), alvo: Alvo, antes: Morrendo.nullable(), depois: Morrendo.nullable() }),
  z.object({ op: z.literal("carta_do_destino"), alvo: Alvo, antes: z.boolean(), depois: z.boolean() }),
  z.object({ op: z.literal("crise"), alvo: Alvo, lista: z.enum(["aflicoes", "virtudes"]), antes: z.array(MarcaDeCrise), depois: z.array(MarcaDeCrise) }),
  z.object({ op: z.literal("sequelas"), alvo: Alvo, antes: z.array(z.string()), depois: z.array(z.string()) }),
  z.object({ op: z.literal("marcas"), alvo: Alvo, antes: Marcas, depois: Marcas }),
  z.object({ op: z.literal("recarga"), alvo: Alvo, acaoId: Id, gasta: z.boolean() }),
  z.object({ op: z.literal("derrotado"), alvo: Alvo, antes: z.boolean(), depois: z.boolean() }),
  z.object({ op: z.literal("horda"), alvo: Alvo, antes: Horda.nullable(), depois: Horda.nullable() }),
  z.object({ op: z.literal("combatente_entra"), combatente: Combatente, posicao: Contagem.nullable() }),
  z.object({ op: z.literal("combatente_sai"), combatente: Combatente, posicao: Contagem.nullable() }),
  z.object({ op: z.literal("combatente_muda"), antes: Combatente, depois: Combatente }),
  /* Rodada, vez, ordem, fase e baralho mudam juntos ao avançar e ao montar a iniciativa. */
  z.object({
    op: z.literal("andamento"),
    antes: EstadoCombate.pick({ fase: true, rodada: true, vez: true, ordem: true, baralho: true }),
    depois: EstadoCombate.pick({ fase: true, rodada: true, vez: true, ordem: true, baralho: true }),
  }),
  z.object({ op: z.literal("ataque_pendente"), antes: AtaquePendente.nullable(), depois: AtaquePendente.nullable() }),
  z.object({ op: z.literal("combate_comeca"), combate: EstadoCombate }),
  z.object({ op: z.literal("combate_termina"), combate: EstadoCombate }),
]);
export type Mudanca = z.infer<typeof Mudanca>;
