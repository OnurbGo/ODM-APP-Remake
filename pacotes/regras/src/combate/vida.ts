import type { Alvo, EstadoVivo, MarcaDeCrise, Mudanca } from "@odm/protocolo";
import type { Aleatorio } from "../dados";
import type { ContextoCombate } from "./contexto";

/* Morrendo, Exaustão, Estresse e Crise (Jogador, "Morrendo" e "Estresse"). Cada função devolve as mudanças,
   e quem chama aplica e registra: assim tudo tem desfazer. */

const ID_INCONSCIENTE = "efeito.inconsciente";

export type Consequencia = { rolagem: number; exaustao: number; sequela: boolean };

export function consequenciaDeMorte(rolagem: number, ctx: ContextoCombate): Consequencia {
  const linha = ctx.regras.morrendo?.consequencia.find((l) => rolagem >= l.de && rolagem <= l.ate);
  return { rolagem, exaustao: linha?.exaustao ?? 0, sequela: !!linha?.sequela };
}

/* Chegou a 0 PV: Inconsciente, Morrendo, Exaustão por queda repetida e as falhas pendentes da Atitude Imprudente. */
export function entrarEmMorrendo(alvo: Alvo, vivo: EstadoVivo, ctx: ContextoCombate, novoId: () => string) {
  const mudancas: Mudanca[] = [];
  const falhas = Math.min(3, vivo.falhasPendentes);
  mudancas.push({ op: "morrendo", alvo, antes: vivo.morrendo, depois: { sucessos: 0, falhas, estavel: false } });
  if (vivo.falhasPendentes) mudancas.push({ op: "somar", alvo, campo: "falhasPendentes", delta: -vivo.falhasPendentes });
  const repetida = vivo.quedasDesdeODescansoLongo > 0;
  const exaustaoPorQueda = repetida ? (ctx.regras.quedas?.nova_queda_antes_do_descanso_longo.exaustao ?? 0) : 0;
  if (exaustaoPorQueda) mudancas.push({ op: "somar", alvo, campo: "exaustao", delta: exaustaoPorQueda });
  mudancas.push({ op: "somar", alvo, campo: "quedasDesdeODescansoLongo", delta: 1 });
  if (!vivo.efeitos.some((e) => e.efeitoId === ID_INCONSCIENTE)) {
    mudancas.push({ op: "efeito_entra", alvo, efeito: { id: novoId(), efeitoId: ID_INCONSCIENTE, nome: "Inconsciente", acumulos: 1, nivel: null, turnosRestantes: null, origem: "Morrendo", contadores: {} } });
  }
  return { mudancas, falhasImediatas: falhas, exaustaoPorQueda };
}

export type ResultadoTesteDeMorte = {
  natural: number;
  sucesso: boolean;
  acorda: boolean;
  estabiliza: boolean;
  tresFalhas: boolean;
  morrendo: EstadoVivo["morrendo"];
};

export function testeDeMorte(natural: number, vivo: EstadoVivo, ctx: ContextoCombate): ResultadoTesteDeMorte {
  const atual = vivo.morrendo ?? { sucessos: 0, falhas: 0, estavel: false };
  const minimo = ctx.regras.morrendo?.teste_de_morte.sucesso_a_partir_de ?? 10;
  if (natural === 20) return { natural, sucesso: true, acorda: true, estabiliza: false, tresFalhas: false, morrendo: null };
  const sucesso = natural >= minimo;
  const depois = { ...atual, sucessos: atual.sucessos + (sucesso ? 1 : 0), falhas: atual.falhas + (sucesso ? 0 : 1) };
  if (depois.sucessos >= 3) return { natural, sucesso, acorda: false, estabiliza: true, tresFalhas: false, morrendo: { ...depois, estavel: true } };
  return { natural, sucesso, acorda: false, estabiliza: false, tresFalhas: depois.falhas >= 3, morrendo: depois };
}

/* Dano em quem está Morrendo: 1 falha. Estável que sofre dano volta a Morrendo com 1 falha (não conta como queda). */
export function danoEmMorrendo(vivo: EstadoVivo, ctx: ContextoCombate) {
  const falhas = ctx.regras.estabilizando?.dano_em_morrendo.falhas ?? 1;
  const atual = vivo.morrendo;
  if (!atual) return null;
  const depois = atual.estavel ? { sucessos: 0, falhas, estavel: false } : { ...atual, falhas: atual.falhas + falhas };
  return { depois, tresFalhas: depois.falhas >= 3 };
}

export const estaMorto = (vivo: EstadoVivo) => vivo.exaustao >= 6;

/* ---------- Estresse ---------- */

export const ID_AMEDRONTADO = "efeito.amedrontado";

/* Ganho de um acontecimento. Medo soma 1 uma vez; a Crise acontece no máximo uma vez, e o excedente some. */
export function ganharEstresse(alvo: Alvo, vivo: EstadoVivo, ganho: number, maximo: number) {
  if (ganho <= 0) return { mudancas: [] as Mudanca[], crise: false };
  const medo = vivo.efeitos.some((e) => e.efeitoId === ID_AMEDRONTADO) ? 1 : 0;
  const novo = Math.min(maximo, vivo.estresse + ganho + medo);
  const crise = novo >= maximo;
  return { mudancas: [{ op: "somar", alvo, campo: "estresse", delta: novo - vivo.estresse }] as Mudanca[], crise, medo };
}

export function aliviarEstresse(alvo: Alvo, vivo: EstadoVivo, alivio: number): Mudanca[] {
  const delta = -Math.min(vivo.estresse, Math.abs(alivio));
  return delta ? [{ op: "somar", alvo, campo: "estresse", delta }] : [];
}

export type ResultadoCrise = { mudancas: Mudanca[]; tipo: "aflicao" | "virtude"; linha: string; nome: string; intensidade: number; formula: string };

/* Crise: Estresse vai à metade do máximo (para baixo), 1d6 decide aflição (1–4) ou virtude (5–6), e outro 1d6 a linha.
   O dano da aflição e os PV temporários da virtude ficam com quem chama, porque dependem do nível. */
export function resolverCrise(alvo: Alvo, vivo: EstadoVivo, maximo: number, ctx: ContextoCombate, aleatorio: Aleatorio): ResultadoCrise | null {
  const crise = ctx.regras.crise;
  const virtudes = ctx.regras.virtudes;
  if (!crise || !virtudes) return null;
  const mudancas: Mudanca[] = [{ op: "somar", alvo, campo: "estresse", delta: Math.floor(maximo / 2) - vivo.estresse }];
  const lado = aleatorio(1, 6) <= 4 ? "aflicao" : "virtude";
  const linhaRolada = aleatorio(1, 6);
  const tabela = lado === "aflicao" ? crise.aflicoes : virtudes.virtudes;
  const chave = Object.keys(tabela).find((k) => {
    const [de, ate = de] = k.split("-").map(Number);
    return linhaRolada >= de! && linhaRolada <= ate!;
  });
  if (!chave) return null;
  const lista: MarcaDeCrise[] = lado === "aflicao" ? vivo.aflicoes : vivo.virtudes;
  const ja = lista.find((m) => m.linha === chave);
  const marca: MarcaDeCrise = { linha: chave, nome: tabela[chave]!.nome, intensidade: ja ? 2 : 1 };
  const depois = ja ? lista.map((m) => (m.linha === chave ? marca : m)) : [...lista, marca];
  mudancas.push({ op: "crise", alvo, lista: lado === "aflicao" ? "aflicoes" : "virtudes", antes: lista, depois });
  return { mudancas, tipo: lado, linha: chave, nome: marca.nome, intensidade: marca.intensidade, formula: "1d6" };
}
