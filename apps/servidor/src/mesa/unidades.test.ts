import { describe, expect, it } from "vitest";
import { conexaoPermitida } from "../transporte";
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
