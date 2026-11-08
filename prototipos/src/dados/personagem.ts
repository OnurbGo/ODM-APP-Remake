/* Personagem e inventário fictícios para o protótipo da tela do personagem (fase 6, etapa 5).
   Nomes, textos e números são inventados: nada aqui vem dos livros. */

export type Categoria = "corpo_a_corpo" | "distancia" | "armadura" | "escudo" | "municao" | "consumivel" | "ferramenta" | "geral";
export type Raridade = "comum" | "incomum" | "raro" | "extraordinario" | "unico";

export type ItemProto = {
  id: string;
  nome: string;
  categoria: Categoria;
  raridade: Raridade;
  quantidade: number;
  pesoKg: number;
  equipado: boolean;
  texto: string;
  ataque?: { acerto: number; dano: string; alcance: string; finesse?: boolean; modos?: string[] };
  defesa?: number;
  usavel?: boolean;
  novo?: boolean;
};

export const CATEGORIAS: { id: Categoria | "tudo"; nome: string }[] = [
  { id: "tudo", nome: "Tudo" },
  { id: "corpo_a_corpo", nome: "Corpo a corpo" },
  { id: "distancia", nome: "À distância" },
  { id: "armadura", nome: "Armaduras" },
  { id: "escudo", nome: "Escudos" },
  { id: "municao", nome: "Munição" },
  { id: "consumivel", nome: "Consumíveis" },
  { id: "ferramenta", nome: "Ferramentas" },
  { id: "geral", nome: "Outros" },
];

export const PERSONAGEM = {
  nome: "Dalva Ferrão",
  classe: "Caçadora",
  nivel: 4,
  pv: 23,
  pvMaximo: 31,
  defesa: 14,
  deslocamento: 6,
  dinheiro: 1840,
  cargaSobrecarregado: 20,
  cargaImobilizado: 40,
};

export const ITENS_PROTO: ItemProto[] = [
  { id: "1", nome: "Revólver de seis tiros", categoria: "distancia", raridade: "comum", quantidade: 1, pesoKg: 1.2, equipado: true, texto: "Revólver de cano curto, confiável no frio e na poeira.", ataque: { acerto: 5, dano: "1d10+3", alcance: "10 m (máx. 20 m)" } },
  { id: "2", nome: "Carabina de alavanca", categoria: "distancia", raridade: "incomum", quantidade: 1, pesoKg: 3.4, equipado: true, texto: "Carabina de repetição com coronha marcada a faca.", ataque: { acerto: 5, dano: "2d8+3", alcance: "20 m (máx. 40 m)" } },
  { id: "3", nome: "Faca de esfolar", categoria: "corpo_a_corpo", raridade: "comum", quantidade: 1, pesoKg: 0.3, equipado: true, texto: "Lâmina fina e curva. Leve: dá para usar Brutalidade ou Agilidade.", ataque: { acerto: 5, dano: "1d4+3", alcance: "1 m", finesse: true } },
  { id: "4", nome: "Machadinha", categoria: "corpo_a_corpo", raridade: "comum", quantidade: 1, pesoKg: 1, equipado: false, texto: "Machadinha de cabo curto, boa para lenha e para o resto.", ataque: { acerto: 3, dano: "1d6+1", alcance: "1 m" } },
  { id: "5", nome: "Gibão de couro", categoria: "armadura", raridade: "comum", quantidade: 1, pesoKg: 6, equipado: true, texto: "Couro curtido em camadas, com reforço nos ombros.", defesa: 2 },
  { id: "6", nome: "Escudo de tábuas", categoria: "escudo", raridade: "comum", quantidade: 1, pesoKg: 3, equipado: false, texto: "Tábuas pregadas e cintadas de ferro.", defesa: 1 },
  { id: "7", nome: "Pistola de dois canos", categoria: "distancia", raridade: "raro", quantidade: 1, pesoKg: 1.5, equipado: false, novo: true, texto: "Dois modos: tiro de bala ou carga de chumbo, que espalha.", ataque: { acerto: 5, dano: "2d6+3", alcance: "8 m", modos: ["Bala", "Chumbo"] } },
  { id: "8", nome: "Munição curta", categoria: "municao", raridade: "comum", quantidade: 34, pesoKg: 0.02, equipado: false, texto: "Cartuchos para revólver e pistola." },
  { id: "9", nome: "Munição média", categoria: "municao", raridade: "comum", quantidade: 18, pesoKg: 0.03, equipado: false, texto: "Cartuchos para carabina." },
  { id: "10", nome: "Ataduras", categoria: "consumivel", raridade: "comum", quantidade: 4, pesoKg: 0.1, equipado: false, usavel: true, texto: "Faixas de pano limpo. Usar: trata um ferimento que sangra." },
  { id: "11", nome: "Tônico amargo", categoria: "consumivel", raridade: "incomum", quantidade: 2, pesoKg: 0.2, equipado: false, usavel: true, novo: true, texto: "Garrafinha escura de gosto horrível. Usar: recupera um pouco de fôlego." },
  { id: "12", nome: "Charque", categoria: "consumivel", raridade: "comum", quantidade: 6, pesoKg: 0.2, equipado: false, usavel: true, texto: "Carne seca para a estrada. Uma porção por refeição." },
  { id: "13", nome: "Corda de 15 m", categoria: "ferramenta", raridade: "comum", quantidade: 1, pesoKg: 2, equipado: false, texto: "Corda de sisal trançado." },
  { id: "14", nome: "Kit de armeiro", categoria: "ferramenta", raridade: "incomum", quantidade: 1, pesoKg: 1.5, equipado: false, texto: "Chaves, molas e óleo para manter as armas em ordem." },
  { id: "15", nome: "Lampião", categoria: "ferramenta", raridade: "comum", quantidade: 1, pesoKg: 1, equipado: true, texto: "Lampião a querosene, com alça." },
  { id: "16", nome: "Saco de dormir", categoria: "geral", raridade: "comum", quantidade: 1, pesoKg: 2.5, equipado: false, texto: "Lona encerada e um cobertor de lã." },
  { id: "17", nome: "Medalha de prata", categoria: "geral", raridade: "unico", quantidade: 1, pesoKg: 0.05, equipado: false, texto: "Medalha gasta com um nome riscado. Ninguém sabe de quem era." },
  { id: "18", nome: "Mapa rasgado", categoria: "geral", raridade: "extraordinario", quantidade: 1, pesoKg: 0, equipado: false, novo: true, texto: "Metade de um mapa a carvão, com um X perto de um rio sem nome." },
];

/* As quatro silhuetas do retrato: no app, a arte dos livros pintada de preto. Aqui, desenhos provisórios. */
export const SILHUETAS = [
  { id: "silhueta.pistoleiro", nome: "Pistoleiro" },
  { id: "silhueta.barbaro", nome: "Bárbaro" },
  { id: "silhueta.espiao", nome: "Espião" },
  { id: "silhueta.medico-de-campo", nome: "Médico de Campo" },
];
