import type { Frequencia, Recuperacao } from "@odm/conteudo";
import type { Alvo, EstadoVivo, Mudanca } from "@odm/protocolo";
import type { FichaCalculada, HabilidadeDaFicha, TalentoDaFicha } from "../ficha/calculo";
import type { ContextoCombate } from "./contexto";

/* Fichas de classe e usos de habilidade (especificação 4.4) e descansos (Jogador, Viagens, "Descansos"). */

export const fichasAtuais = (vivo: EstadoVivo, ficha: FichaCalculada["fichasDeClasse"][number]) => Math.min(ficha.maximo.valor, vivo.fichas[ficha.id] ?? ficha.inicial);

type ComUsos = Pick<HabilidadeDaFicha | TalentoDaFicha, "id" | "nome" | "mecanica">;

/* "Metade de Astúcia para cima" e afins ficam de fora até a mecânica dizer um número. */
export function usosMaximos(h: ComUsos, calc: FichaCalculada): number | null {
  const q = h.mecanica?.usos?.quantidade;
  if (typeof q === "number") return q;
  if (q === "metade_de_astucia_para_cima") return Math.max(1, Math.ceil(calc.atributos.astucia.valor / 2));
  return null;
}

export const usosRestantes = (h: ComUsos, vivo: EstadoVivo, calc: FichaCalculada) => {
  const maximo = usosMaximos(h, calc);
  return maximo === null ? null : Math.max(0, maximo - (vivo.usos[h.id] ?? 0));
};

/* Gasto de habilidade: PA é do combate; aqui ficam fichas e usos. */
export function gastarHabilidade(alvo: Alvo, h: ComUsos, vivo: EstadoVivo, calc: FichaCalculada): { mudancas: Mudanca[] } | { recusado: string } {
  const mudancas: Mudanca[] = [];
  const restantes = usosRestantes(h, vivo, calc);
  if (restantes === 0) return { recusado: `${h.nome} já foi usada. Volta ${QUANDO_VOLTA[h.mecanica!.usos!.por]}.` };
  if ((vivo.esperaDeLongos[h.id] ?? 0) > 0) return { recusado: `${h.nome} volta depois de mais ${vivo.esperaDeLongos[h.id]} descanso(s) longo(s).` };
  if (restantes !== null) mudancas.push({ op: "uso", alvo, habilidadeId: h.id, delta: 1 });
  if (h.mecanica?.usos?.por === "tres_descansos_longos") mudancas.push({ op: "espera_de_longos", alvo, habilidadeId: h.id, delta: 3 });
  const fichas = h.mecanica?.custo?.fichas;
  if (fichas) {
    const ficha = calc.fichasDeClasse.find((f) => f.id === fichas.recurso);
    const atual = ficha ? fichasAtuais(vivo, ficha) : 0;
    if (atual < fichas.quantidade) return { recusado: `Faltam fichas: custa ${fichas.quantidade}, você tem ${atual}.` };
    mudancas.push(...ajustarFicha(alvo, vivo, ficha!, -fichas.quantidade));
  }
  return { mudancas };
}

/* Grava o valor inicial das fichas que o estado ainda não tem. Sem isto, desfazer a primeira mudança deixaria a
   ficha em 0 em vez de voltar ao inicial. O servidor chama ao carregar o personagem, sem gerar evento. */
export function completarFichas(vivo: EstadoVivo, calc: FichaCalculada): EstadoVivo {
  const faltam = calc.fichasDeClasse.filter((f) => vivo.fichas[f.id] === undefined);
  if (!faltam.length) return vivo;
  return { ...vivo, fichas: { ...vivo.fichas, ...Object.fromEntries(faltam.map((f) => [f.id, f.inicial])) } };
}

export function ajustarFicha(alvo: Alvo, vivo: EstadoVivo, ficha: FichaCalculada["fichasDeClasse"][number], delta: number): Mudanca[] {
  const atual = fichasAtuais(vivo, ficha);
  const novo = Math.min(ficha.maximo.valor, Math.max(0, atual + delta));
  return novo === atual ? [] : [{ op: "ficha", alvo, recursoId: ficha.id, delta: novo - (vivo.fichas[ficha.id] ?? 0) }];
}

export const QUANDO_VOLTA: Record<Frequencia, string> = {
  descanso_curto: "no descanso curto",
  descanso_longo: "no descanso longo",
  tres_descansos_longos: "depois de três descansos longos",
  combate: "no fim do combate",
  sessao: "quando o mestre marcar (sessão)",
  semana: "quando o mestre marcar (semana)",
  sete_dias: "quando o mestre marcar (7 dias)",
  turno: "no próximo turno",
  rodada: "na próxima rodada",
};

function recuperarFichas(alvo: Alvo, vivo: EstadoVivo, calc: FichaCalculada, quando: Recuperacao["quando"]) {
  const mudancas: Mudanca[] = [];
  for (const ficha of calc.fichasDeClasse) {
    const regra = ficha.recupera.find((r) => r.quando === quando);
    if (!regra) continue;
    const maximo = ficha.maximo.valor;
    const quantidade =
      regra.quantidade === "todas" ? maximo : regra.quantidade === "metade_do_maximo" ? Math.max(regra.minimo ?? 0, regra.arredonda === "cima" ? Math.ceil(maximo / 2) : Math.floor(maximo / 2)) : regra.quantidade;
    mudancas.push(...ajustarFicha(alvo, vivo, ficha, quantidade));
  }
  return mudancas;
}

function zerarUsos(alvo: Alvo, vivo: EstadoVivo, habilidades: readonly ComUsos[], por: readonly Frequencia[]) {
  return habilidades.flatMap((h): Mudanca[] => {
    const usados = vivo.usos[h.id] ?? 0;
    return usados && h.mecanica?.usos && por.includes(h.mecanica.usos.por) ? [{ op: "uso", alvo, habilidadeId: h.id, delta: -usados }] : [];
  });
}

/* "Por combate" volta ao fim do combate (especificação 14, decisão de 06/11/2026). */
export const usosDoCombate = (alvo: Alvo, vivo: EstadoVivo, habilidades: readonly ComUsos[]) => zerarUsos(alvo, vivo, habilidades, ["combate"]);

const ID_BEBADO = "efeito.bebado";
const ID_LOUCURA = "efeito.loucura-frenetica";
const ID_BEM_NUTRIDO = "efeito.bem-nutrido";

export type Descanso = {
  mudancas: Mudanca[];
  /* O que a tela mostra: "+5 PV (Fibra)", "Fichas de Ardil +1". */
  resumo: string[];
  avisos: string[];
};

export function descansoCurto(
  alvo: Alvo,
  vivo: EstadoVivo,
  calc: FichaCalculada,
  habilidades: readonly ComUsos[],
  ctx: ContextoCombate,
  /* Dados de Vida gastos, já rolados (um valor por dado). */
  dadosDeVida: readonly number[] = [],
): Descanso {
  const mudancas: Mudanca[] = [];
  const resumo: string[] = [];
  const avisos: string[] = [];
  const limite = ctx.regras.descansos?.curtos_antes_do_longo;
  if (limite !== undefined && vivo.descansosCurtos >= limite) avisos.push(`Já foram ${vivo.descansosCurtos} descansos curtos: o livro pede um descanso longo antes do próximo.`);
  const fibra = calc.atributos.fibra.valor;
  const regra = ctx.regras.descansoCurto?.recupera_pv;
  const natural = Math.max(regra?.minimo ?? 1, fibra);
  const porDados = dadosDeVida.reduce((s, d) => s + d + fibra, 0);
  mudancas.push({ op: "somar", alvo, campo: "pv", delta: natural + porDados });
  resumo.push(`+${natural} PV (Fibra)`);
  if (dadosDeVida.length) {
    mudancas.push({ op: "somar", alvo, campo: "dadosDeVidaGastos", delta: dadosDeVida.length });
    resumo.push(`+${porDados} PV (${dadosDeVida.length} Dado${dadosDeVida.length > 1 ? "s" : ""} de Vida)`);
  }
  mudancas.push(...recuperarFichas(alvo, vivo, calc, "descanso_curto"));
  mudancas.push(...zerarUsos(alvo, vivo, habilidades, ["descanso_curto"]));
  mudancas.push(...efeitosNoDescanso(alvo, vivo, "curto"));
  if (vivo.falhasPendentes) mudancas.push({ op: "somar", alvo, campo: "falhasPendentes", delta: -vivo.falhasPendentes });
  mudancas.push(...estresseNoDescanso(alvo, vivo, ctx, "curto"));
  mudancas.push({ op: "somar", alvo, campo: "descansosCurtos", delta: 1 });
  return { mudancas, resumo, avisos };
}

export function descansoLongo(
  alvo: Alvo,
  vivo: EstadoVivo,
  calc: FichaCalculada,
  habilidades: readonly ComUsos[],
  ctx: ContextoCombate,
  opcoes: { alimentado: boolean; cuidadosMedicos?: boolean },
): Descanso | { recusado: string } {
  const pv = vivo.pv ?? calc.pvMaximo.valor;
  if (pv < 1) return { recusado: "Com 0 PV não há descanso longo: o personagem precisa de pelo menos 1 PV." };
  const mudancas: Mudanca[] = [];
  const resumo: string[] = [];
  const minimo = ctx.regras.descansoLongo?.recupera_pv.minimo ?? 1;
  const cura = Math.max(minimo, Math.floor(calc.pvMaximo.valor / 2));
  mudancas.push({ op: "somar", alvo, campo: "pv", delta: cura });
  resumo.push(`+${cura} PV (metade do máximo)`);
  if (vivo.dadosDeVidaGastos) {
    const volta = Math.min(vivo.dadosDeVidaGastos, Math.max(1, Math.floor(vivo.dadosDeVidaGastos / 2)));
    mudancas.push({ op: "somar", alvo, campo: "dadosDeVidaGastos", delta: -volta });
    resumo.push(`${volta} Dado${volta > 1 ? "s" : ""} de Vida de volta`);
  }
  mudancas.push(...recuperarFichas(alvo, vivo, calc, "descanso_longo"));
  /* O longo também devolve os usos por descanso curto (suposição 2 do plano, aprovada). */
  mudancas.push(...zerarUsos(alvo, vivo, habilidades, ["descanso_longo", "descanso_curto"]));
  for (const [id, faltam] of Object.entries(vivo.esperaDeLongos)) if (faltam) mudancas.push({ op: "espera_de_longos", alvo, habilidadeId: id, delta: -1 });
  for (const [id, usados] of Object.entries(vivo.usos)) {
    const h = habilidades.find((x) => x.id === id);
    if (usados && h?.mecanica?.usos?.por === "tres_descansos_longos" && (vivo.esperaDeLongos[id] ?? 0) <= 1) mudancas.push({ op: "uso", alvo, habilidadeId: id, delta: -usados });
  }
  mudancas.push(...efeitosNoDescanso(alvo, vivo, "longo"));
  const exaustao = (opcoes.alimentado ? 1 : 0) + (opcoes.cuidadosMedicos ? 1 : 0);
  if (exaustao && vivo.exaustao) {
    mudancas.push({ op: "somar", alvo, campo: "exaustao", delta: -Math.min(exaustao, vivo.exaustao) });
    resumo.push(`Exaustão −${Math.min(exaustao, vivo.exaustao)}`);
  }
  if (vivo.falhasPendentes) mudancas.push({ op: "somar", alvo, campo: "falhasPendentes", delta: -vivo.falhasPendentes });
  if (vivo.quedasDesdeODescansoLongo) mudancas.push({ op: "somar", alvo, campo: "quedasDesdeODescansoLongo", delta: -vivo.quedasDesdeODescansoLongo });
  if (vivo.descansosCurtos) mudancas.push({ op: "somar", alvo, campo: "descansosCurtos", delta: -vivo.descansosCurtos });
  mudancas.push(...estresseNoDescanso(alvo, vivo, ctx, "longo"));
  return { mudancas, resumo, avisos: [] };
}

/* Bêbado cai 1 nível no curto; Loucura Frenética some em qualquer descanso; Bem-nutrido acaba no curto. */
function efeitosNoDescanso(alvo: Alvo, vivo: EstadoVivo, tipo: "curto" | "longo"): Mudanca[] {
  const mudancas: Mudanca[] = [];
  for (const e of vivo.efeitos) {
    if (e.efeitoId === ID_LOUCURA) mudancas.push({ op: "efeito_sai", alvo, efeito: e });
    if (tipo === "curto" && e.efeitoId === ID_BEM_NUTRIDO) mudancas.push({ op: "efeito_sai", alvo, efeito: e });
    if (tipo === "curto" && e.efeitoId === ID_BEBADO) {
      const nivel = (e.nivel ?? 1) - 1;
      mudancas.push(nivel <= 0 ? { op: "efeito_sai", alvo, efeito: e } : { op: "efeito_muda", alvo, antes: e, depois: { ...e, nivel, contadores: { ...e.contadores, doses: 0 } } });
    }
  }
  return mudancas;
}

/* Alívio de 2 (curto) e 5 (longo); com 0 de Estresse, as aflições acabam; o longo encerra as virtudes. */
function estresseNoDescanso(alvo: Alvo, vivo: EstadoVivo, ctx: ContextoCombate, tipo: "curto" | "longo"): Mudanca[] {
  if (!ctx.opcoes.estresse) return [];
  const alivios = ctx.regras.aliviandoEstresse?.alivios as Record<string, { estresse?: number }> | undefined;
  const alivio = Math.abs(alivios?.[tipo === "curto" ? "descanso_curto" : "descanso_longo"]?.estresse ?? 0);
  const mudancas: Mudanca[] = [];
  const depois = Math.max(0, vivo.estresse - alivio);
  if (depois !== vivo.estresse) mudancas.push({ op: "somar", alvo, campo: "estresse", delta: depois - vivo.estresse });
  if (depois === 0 && vivo.aflicoes.length) mudancas.push({ op: "crise", alvo, lista: "aflicoes", antes: vivo.aflicoes, depois: [] });
  if (tipo === "longo" && vivo.virtudes.length) mudancas.push({ op: "crise", alvo, lista: "virtudes", antes: vivo.virtudes, depois: [] });
  return mudancas;
}
