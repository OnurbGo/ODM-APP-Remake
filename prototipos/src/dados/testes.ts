import type { Atributo, Efeito } from "./exemplo";

/* Pedidos fictícios para ver cada estado da rolagem. Os d20 fixos existem para mostrar casos
   específicos; sem eles, o protótipo sorteia. Só condições citadas na especificação. */

export type Condicao = {
  nome: string;
  mod?: number;
  vantagem?: boolean;
  desvantagem?: boolean;
  falhaAutomatica?: boolean;
};

export type PedidoTeste = {
  id: string;
  rotulo: string;
  origem: string;
  atributo: Atributo;
  dt: number;
  dtVisivel: boolean;
  condicoes: Condicao[];
  habilidades: string[];
  dados?: number[];
  automatico?: boolean;
  efeitoNaFalha?: Efeito;
};

const EXAUSTAO: Condicao = { nome: "Exaustão 1", mod: -2 };
const ENVENENADO: Condicao = { nome: "Envenenado", desvantagem: true };
const ATORDOADO: Condicao = { nome: "Atordoado", falhaAutomatica: true };

export const PEDIDOS: PedidoTeste[] = [
  {
    id: "popup",
    rotulo: "Pop-up com DT oculta",
    origem: "Ataque de Andarilho Podre",
    atributo: "Agilidade",
    dt: 15,
    dtVisivel: false,
    condicoes: [EXAUSTAO],
    habilidades: ["passo-poeira", "tiro-aviso"],
    efeitoNaFalha: { id: "impedido", nome: "Impedido", tom: "perigo", turnos: 1 },
  },
  {
    id: "visivel",
    rotulo: "Efeito com DT visível",
    origem: "Efeito: Hemorragia",
    atributo: "Fibra",
    dt: 15,
    dtVisivel: true,
    condicoes: [EXAUSTAO],
    habilidades: [],
  },
  {
    id: "desvantagem",
    rotulo: "Envenenado: 2d20",
    origem: "Pedido do mestre",
    atributo: "Fibra",
    dt: 13,
    dtVisivel: false,
    condicoes: [ENVENENADO, EXAUSTAO],
    habilidades: [],
    dados: [14, 6],
  },
  {
    id: "vantagem",
    rotulo: "Duas fontes: 3d20",
    origem: "Pedido do mestre",
    atributo: "Agilidade",
    dt: 15,
    dtVisivel: false,
    condicoes: [
      { nome: "Mão Firme", vantagem: true },
      { nome: "Benzido pela Irmã", vantagem: true },
    ],
    habilidades: [],
    dados: [5, 17, 11],
  },
  {
    id: "auto-habilidade",
    rotulo: "Automático: pausa e pergunta",
    origem: "Ataque de Bando de Carniças",
    atributo: "Agilidade",
    dt: 14,
    dtVisivel: false,
    condicoes: [EXAUSTAO],
    habilidades: ["passo-poeira"],
    automatico: true,
  },
  {
    id: "auto-direto",
    rotulo: "Automático: rola direto",
    origem: "Pedido do mestre",
    atributo: "Presença",
    dt: 12,
    dtVisivel: false,
    condicoes: [],
    habilidades: [],
    automatico: true,
  },
  {
    id: "atordoado",
    rotulo: "Atordoado: falha automática",
    origem: "Ataque de Andarilho Podre",
    atributo: "Agilidade",
    dt: 15,
    dtVisivel: false,
    condicoes: [ATORDOADO],
    habilidades: [],
  },
  {
    id: "vinte",
    rotulo: "20 natural que falha",
    origem: "Pedido do mestre",
    atributo: "Agilidade",
    dt: 30,
    dtVisivel: true,
    condicoes: [EXAUSTAO],
    habilidades: [],
    dados: [20],
  },
  {
    id: "um",
    rotulo: "1 natural que passa",
    origem: "Pedido do mestre",
    atributo: "Agilidade",
    dt: 4,
    dtVisivel: true,
    condicoes: [EXAUSTAO],
    habilidades: [],
    dados: [1],
  },
];

export const BONUS_HABILIDADE = 2;
export const DEFESA_OCULTA = 13;
