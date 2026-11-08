import { describe, expect, it } from "vitest";
import { conexaoPermitida } from "../transporte";
import { combateCom, combatente } from "../../../../pacotes/regras/src/combate/exemplo";
import { projetarCombate } from "./combate";
import { LimiteTentativas } from "./limite";

describe("LimiteTentativas", () => {
  it("bloqueia ao atingir o máximo e libera depois da janela", () => {
    const limite = new LimiteTentativas(2, 1000);
    limite.registrarErro("ip", 0);
    expect(limite.bloqueado("ip", 10)).toBe(false);
    limite.registrarErro("ip", 20);
    expect(limite.bloqueado("ip", 30)).toBe(true);
    expect(limite.bloqueado("ip", 1000)).toBe(false);
  });

  it("conta cada chave em separado", () => {
    const limite = new LimiteTentativas(1, 1000);
    limite.registrarErro("a", 0);
    expect(limite.bloqueado("a", 1)).toBe(true);
    expect(limite.bloqueado("b", 1)).toBe(false);
  });

  it("limpar zera a contagem", () => {
    const limite = new LimiteTentativas(1, 1000);
    limite.registrarErro("a", 0);
    limite.limpar("a");
    expect(limite.bloqueado("a", 1)).toBe(false);
  });
});

describe("conexaoPermitida", () => {
  it.each([
    ["192.168.0.10:47821", "http://192.168.0.10:47821"],
    ["25.10.20.30:47821", "http://25.10.20.30:47821"],
    ["localhost:5173", "http://localhost:5173"],
    ["127.0.0.1:47821", undefined],
    ["[::1]:47821", "http://[::1]:47821"],
  ])("aceita Host %s com Origin %s", (host, origem) => {
    expect(conexaoPermitida(host, origem)).toBe(true);
  });

  it.each([
    ["site-de-fora.example:47821", "http://site-de-fora.example:47821"],
    ["192.168.0.10:47821", "http://site-de-fora.example"],
    ["192.168.0.10:47821", "origem quebrada"],
    [undefined, undefined],
  ])("recusa Host %s com Origin %s", (host, origem) => {
    expect(conexaoPermitida(host, origem)).toBe(false);
  });
});

describe("iniciativa oculta (decisão de 07/11/2026)", () => {
  const jogador = { id: "jog", papel: "jogador" as const };
  const mestre = { id: "mes", papel: "mestre" as const };
  const carta = (valor: "A" | "K" | "7") => ({ id: `c-${valor}`, valor, naipe: "copas" as const });
  const base = () => [
    combatente("zumbi", { tipo: "criatura", nome: "Zumbi", ref: "criatura.zumbi", carta: carta("A") }),
    combatente("ze", { tipo: "personagem", nome: "Zé", personagemId: "p-ze", carta: carta("K") }),
    combatente("lobo", { tipo: "criatura", nome: "Lobo", ref: "criatura.lobo", carta: carta("7") }),
  ];
  const dono = (id: string) => (id === "p-ze" ? "jog" : null);

  it("na primeira rodada, cada posição que ainda não agiu é \"?\" no lugar certo, inclusive a do jogador", () => {
    const [zumbi, ze, lobo] = base();
    const combate = combateCom([{ ...zumbi!, revelado: true }, ze!, lobo!], { fase: "em_curso", rodada: 1, vez: 0, ordem: ["zumbi", "ze", "lobo"] });
    const visto = projetarCombate(combate, jogador, dono)!;
    expect(visto.ordem).toEqual(["zumbi", "oculto-1", "oculto-2"]);
    expect(visto.vez).toBe(0);
    expect(visto.combatentes.find((c) => c.id === "ze")!.carta).toBeNull();
    expect(visto.combatentes.find((c) => c.id === "lobo")!.carta).toBeNull();
    expect(JSON.stringify(visto.ordem)).not.toMatch(/lobo|ze/);
    /* O mestre vê tudo. */
    expect(projetarCombate(combate, mestre, dono)!.ordem).toEqual(["zumbi", "ze", "lobo"]);
  });

  it("quem entra depois aparece como \"?\" no fim e, na vez dele, na posição certa", () => {
    const [zumbi, ze, lobo] = base();
    const todos = [{ ...zumbi!, revelado: true }, { ...ze!, revelado: true }, lobo!];
    const segunda = combateCom(todos, { fase: "em_curso", rodada: 2, vez: 1, ordem: ["zumbi", "lobo", "ze"] });
    /* Na vez do Zé, o Lobo (que entrou depois e ainda não agiu) vai para o fim como "?". */
    const antes = projetarCombate({ ...segunda, vez: 2 }, jogador, dono)!;
    expect(antes.ordem).toEqual(["zumbi", "ze", "oculto-1"]);
    expect(antes.ordem[antes.vez]).toBe("ze");
    const depois = projetarCombate({ ...segunda, combatentes: todos.map((c) => ({ ...c, revelado: true })) }, jogador, dono)!;
    expect(depois.ordem).toEqual(["zumbi", "lobo", "ze"]);
  });

  it("na compra da iniciativa, o jogador vê só a própria carta", () => {
    const combate = combateCom(base(), { fase: "iniciativa", ordem: [] });
    const visto = projetarCombate(combate, jogador, dono)!;
    expect(visto.combatentes.find((c) => c.id === "ze")!.carta).toEqual(carta("K"));
    expect(visto.combatentes.find((c) => c.id === "zumbi")!.carta).toBeNull();
    expect(visto.combatentes.find((c) => c.id === "lobo")!.carta).toBeNull();
  });
});
