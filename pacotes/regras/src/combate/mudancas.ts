import { estadoVivoNovo, type Alvo, type CampoNumerico, type Combatente, type EstadoCombate, type EstadoVivo, type Mudanca } from "@odm/protocolo";

/* Especificação 5.2: toda mudança tem inversa. Aplicar a inversa sobre o estado de agora desfaz só aquela
   mudança: o mestre pode desfazer em qualquer ordem e nada do que veio depois se perde. Número muda por
   diferença, e a inversa leva a diferença que de fato entrou (depois dos limites). */

export type Mundo = {
  vivos: Readonly<Record<string, EstadoVivo>>;
  combate: EstadoCombate | null;
};

/* Limites que dependem da ficha (PV máximo). Quem chama calcula; o motor só corta. */
export type Limites = { pvMaximo: (alvo: Alvo) => number | null };
const SEM_LIMITES: Limites = { pvMaximo: () => null };

export class MudancaInvalida extends Error {}

const vivoDe = (mundo: Mundo, id: string) => mundo.vivos[id] ?? estadoVivoNovo();

function combatente(mundo: Mundo, id: string): Combatente {
  const c = mundo.combate?.combatentes.find((x) => x.id === id);
  if (!c) throw new MudancaInvalida(`Combatente não está no combate: ${id}`);
  return c;
}

function trocarVivo(mundo: Mundo, id: string, vivo: EstadoVivo): Mundo {
  return { ...mundo, vivos: { ...mundo.vivos, [id]: vivo } };
}

function trocarCombatente(mundo: Mundo, novo: Combatente): Mundo {
  if (!mundo.combate) throw new MudancaInvalida("Sem combate");
  return { ...mundo, combate: { ...mundo.combate, combatentes: mundo.combate.combatentes.map((c) => (c.id === novo.id ? novo : c)) } };
}

const LIMITE_EXAUSTAO = 6;
const LIMITE_FALHAS_PENDENTES = 3;

/* Lê e grava um campo numérico, onde quer que ele more. */
function lerNumero(mundo: Mundo, alvo: Alvo, campo: CampoNumerico, limites: Limites): { atual: number; minimo: number; maximo: number } {
  if (alvo.tipo === "personagem") {
    const v = vivoDe(mundo, alvo.id);
    const maximoPv = limites.pvMaximo(alvo);
    switch (campo) {
      case "pv":
        return { atual: v.pv ?? maximoPv ?? 0, minimo: 0, maximo: maximoPv ?? Number.MAX_SAFE_INTEGER };
      case "exaustao":
        return { atual: v.exaustao, minimo: 0, maximo: LIMITE_EXAUSTAO };
      case "falhasPendentes":
        return { atual: v.falhasPendentes, minimo: 0, maximo: LIMITE_FALHAS_PENDENTES };
      case "pvTemporarios":
      case "estresse":
      case "quedasDesdeODescansoLongo":
      case "descansosCurtos":
      case "dadosDeVidaGastos":
        return { atual: v[campo], minimo: 0, maximo: Number.MAX_SAFE_INTEGER };
      default:
        throw new MudancaInvalida(`Campo ${campo} não é do personagem`);
    }
  }
  const c = combatente(mundo, alvo.id);
  switch (campo) {
    case "pv":
      return { atual: c.pv ?? 0, minimo: 0, maximo: c.pvMaximo ?? Number.MAX_SAFE_INTEGER };
    case "pvTemporarios":
      return { atual: c.pvTemporarios, minimo: 0, maximo: Number.MAX_SAFE_INTEGER };
    case "pa.disponiveis":
    case "pa.guardados":
    case "pa.bloqueados":
      return { atual: c.pa[campo.slice(3) as "disponiveis"], minimo: 0, maximo: Number.MAX_SAFE_INTEGER };
    case "deslocamentosNaRodada":
    case "ataquesNoTurno":
      return { atual: c[campo], minimo: 0, maximo: Number.MAX_SAFE_INTEGER };
    default:
      throw new MudancaInvalida(`Campo ${campo} não é do combatente`);
  }
}

function gravarNumero(mundo: Mundo, alvo: Alvo, campo: CampoNumerico, valor: number): Mundo {
  if (alvo.tipo === "personagem") return trocarVivo(mundo, alvo.id, { ...vivoDe(mundo, alvo.id), [campo]: valor });
  const c = combatente(mundo, alvo.id);
  if (campo.startsWith("pa.")) return trocarCombatente(mundo, { ...c, pa: { ...c.pa, [campo.slice(3)]: valor } });
  return trocarCombatente(mundo, { ...c, [campo]: valor });
}

function somarNoMapa(mapa: Readonly<Record<string, number>>, chave: string, delta: number) {
  const valor = Math.max(0, (mapa[chave] ?? 0) + delta);
  return { mapa: { ...mapa, [chave]: valor }, aplicado: valor - (mapa[chave] ?? 0) };
}

function efeitosDe(mundo: Mundo, alvo: Alvo) {
  return alvo.tipo === "personagem" ? vivoDe(mundo, alvo.id).efeitos : combatente(mundo, alvo.id).efeitos;
}

function trocarEfeitos(mundo: Mundo, alvo: Alvo, efeitos: EstadoVivo["efeitos"]): Mundo {
  if (alvo.tipo === "personagem") return trocarVivo(mundo, alvo.id, { ...vivoDe(mundo, alvo.id), efeitos });
  return trocarCombatente(mundo, { ...combatente(mundo, alvo.id), efeitos });
}

function exigirPersonagem(alvo: Alvo) {
  if (alvo.tipo !== "personagem") throw new MudancaInvalida("Só personagem tem isso");
  return alvo.id;
}

function exigirCombatente(alvo: Alvo) {
  if (alvo.tipo !== "combatente") throw new MudancaInvalida("Só combatente tem isso");
  return alvo.id;
}

export function aplicarMudanca(mundo: Mundo, m: Mudanca, limites: Limites = SEM_LIMITES): { mundo: Mundo; inversa: Mudanca } {
  switch (m.op) {
    case "somar": {
      const { atual, minimo, maximo } = lerNumero(mundo, m.alvo, m.campo, limites);
      const novo = Math.min(maximo, Math.max(minimo, atual + m.delta));
      return { mundo: gravarNumero(mundo, m.alvo, m.campo, novo), inversa: { ...m, delta: atual - novo } };
    }
    case "ficha":
    case "uso":
    case "espera_de_longos": {
      const id = exigirPersonagem(m.alvo);
      const v = vivoDe(mundo, id);
      const chave = m.op === "ficha" ? m.recursoId : m.habilidadeId;
      const campo = m.op === "ficha" ? "fichas" : m.op === "uso" ? "usos" : "esperaDeLongos";
      const { mapa, aplicado } = somarNoMapa(v[campo], chave, m.delta);
      return { mundo: trocarVivo(mundo, id, { ...v, [campo]: mapa }), inversa: { ...m, delta: -aplicado } };
    }
    case "efeito_entra": {
      const lista = efeitosDe(mundo, m.alvo);
      if (lista.some((e) => e.id === m.efeito.id)) throw new MudancaInvalida("Efeito repetido");
      return { mundo: trocarEfeitos(mundo, m.alvo, [...lista, m.efeito]), inversa: { op: "efeito_sai", alvo: m.alvo, efeito: m.efeito } };
    }
    case "efeito_sai": {
      const lista = efeitosDe(mundo, m.alvo);
      return { mundo: trocarEfeitos(mundo, m.alvo, lista.filter((e) => e.id !== m.efeito.id)), inversa: { op: "efeito_entra", alvo: m.alvo, efeito: m.efeito } };
    }
    case "efeito_muda": {
      const lista = efeitosDe(mundo, m.alvo);
      if (!lista.some((e) => e.id === m.antes.id)) throw new MudancaInvalida("Efeito não encontrado");
      return { mundo: trocarEfeitos(mundo, m.alvo, lista.map((e) => (e.id === m.antes.id ? m.depois : e))), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "morrendo": {
      const id = exigirPersonagem(m.alvo);
      return { mundo: trocarVivo(mundo, id, { ...vivoDe(mundo, id), morrendo: m.depois }), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "carta_do_destino": {
      const id = exigirPersonagem(m.alvo);
      return { mundo: trocarVivo(mundo, id, { ...vivoDe(mundo, id), cartaDoDestino: m.depois }), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "crise": {
      const id = exigirPersonagem(m.alvo);
      return { mundo: trocarVivo(mundo, id, { ...vivoDe(mundo, id), [m.lista]: m.depois }), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "sequelas": {
      const id = exigirPersonagem(m.alvo);
      return { mundo: trocarVivo(mundo, id, { ...vivoDe(mundo, id), sequelas: m.depois }), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "marcas": {
      const c = combatente(mundo, exigirCombatente(m.alvo));
      return { mundo: trocarCombatente(mundo, { ...c, marcas: m.depois }), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "recarga": {
      const c = combatente(mundo, exigirCombatente(m.alvo));
      const estava = c.recargasGastas.includes(m.acaoId);
      const recargasGastas = m.gasta ? [...new Set([...c.recargasGastas, m.acaoId])] : c.recargasGastas.filter((a) => a !== m.acaoId);
      return { mundo: trocarCombatente(mundo, { ...c, recargasGastas }), inversa: { ...m, gasta: estava } };
    }
    case "derrotado": {
      const c = combatente(mundo, exigirCombatente(m.alvo));
      return { mundo: trocarCombatente(mundo, { ...c, derrotado: m.depois }), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "horda": {
      const c = combatente(mundo, exigirCombatente(m.alvo));
      return { mundo: trocarCombatente(mundo, { ...c, horda: m.depois }), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "combatente_entra": {
      if (!mundo.combate) throw new MudancaInvalida("Sem combate");
      if (mundo.combate.combatentes.some((c) => c.id === m.combatente.id)) throw new MudancaInvalida("Combatente repetido");
      const ordem = [...mundo.combate.ordem];
      if (m.posicao !== null) ordem.splice(Math.min(m.posicao, ordem.length), 0, m.combatente.id);
      return {
        mundo: { ...mundo, combate: { ...mundo.combate, combatentes: [...mundo.combate.combatentes, m.combatente], ordem } },
        inversa: { op: "combatente_sai", combatente: m.combatente, posicao: m.posicao },
      };
    }
    case "combatente_sai": {
      if (!mundo.combate) throw new MudancaInvalida("Sem combate");
      const atual = combatente(mundo, m.combatente.id);
      const posicao = mundo.combate.ordem.indexOf(atual.id);
      return {
        mundo: {
          ...mundo,
          combate: { ...mundo.combate, combatentes: mundo.combate.combatentes.filter((c) => c.id !== atual.id), ordem: mundo.combate.ordem.filter((id) => id !== atual.id) },
        },
        inversa: { op: "combatente_entra", combatente: atual, posicao: posicao < 0 ? null : posicao },
      };
    }
    case "combatente_muda": {
      /* Só os campos que esta mudança de fato mexeu: desfazer uma compra de carta não apaga o PA de agora. */
      const atual = combatente(mundo, m.antes.id);
      const chaves = (Object.keys(m.depois) as (keyof Combatente)[]).filter((k) => JSON.stringify(m.antes[k]) !== JSON.stringify(m.depois[k]));
      const novo = { ...atual, ...Object.fromEntries(chaves.map((k) => [k, m.depois[k]])) } as Combatente;
      return { mundo: trocarCombatente(mundo, novo), inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "andamento": {
      if (!mundo.combate) throw new MudancaInvalida("Sem combate");
      return { mundo: { ...mundo, combate: { ...mundo.combate, ...m.depois } }, inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "ataque_pendente": {
      if (!mundo.combate) throw new MudancaInvalida("Sem combate");
      return { mundo: { ...mundo, combate: { ...mundo.combate, ataquePendente: m.depois } }, inversa: { ...m, antes: m.depois, depois: m.antes } };
    }
    case "combate_comeca":
      if (mundo.combate && mundo.combate.fase !== "encerrado") throw new MudancaInvalida("Já há um combate");
      return { mundo: { ...mundo, combate: m.combate }, inversa: { op: "combate_termina", combate: m.combate } };
    case "combate_termina": {
      const atual = mundo.combate ?? m.combate;
      return { mundo: { ...mundo, combate: null }, inversa: { op: "combate_comeca", combate: atual } };
    }
  }
}

/* Aplica em sequência e devolve as inversas na ordem de desfazer (a última primeiro). */
export function aplicarMudancas(mundo: Mundo, mudancas: readonly Mudanca[], limites: Limites = SEM_LIMITES) {
  let atual = mundo;
  const inversas: Mudanca[] = [];
  for (const m of mudancas) {
    const r = aplicarMudanca(atual, m, limites);
    atual = r.mundo;
    inversas.unshift(r.inversa);
  }
  return { mundo: atual, inversas };
}
