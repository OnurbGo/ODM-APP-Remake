import { describe, expect, it } from "vitest";
import { origemDaMesa, origemDe, portaValida } from "./endereco";

describe("origemDe", () => {
  it("funciona no esquema próprio da tela inicial", () => {
    expect(origemDe("odm://app/inicio.html")).toBe("odm://app");
  });

  it("funciona em http, com a porta", () => {
    expect(origemDe("http://127.0.0.1:47821/?x=1")).toBe("http://127.0.0.1:47821");
  });

  it("devolve null para texto que não é endereço", () => {
    expect(origemDe("")).toBeNull();
  });
});

describe("origemDaMesa", () => {
  it.each([
    ["192.168.0.10", "http://192.168.0.10:47821"],
    ["192.168.0.10:5000", "http://192.168.0.10:5000"],
    [" 25.1.2.3:47821 ", "http://25.1.2.3:47821"],
    ["http://26.1.2.3:47821/", "http://26.1.2.3:47821"],
    ["http://26.1.2.3:47821/?codigo=ABC234", "http://26.1.2.3:47821"],
  ])("aceita %s", (texto, origem) => {
    expect(origemDaMesa(texto)).toBe(origem);
  });

  it.each([
    "",
    "   ",
    "isto tem espaço",
    "https://192.168.0.10",
    "file:///C:/segredo.txt",
    "javascript:alert(1)",
    "http://usuario:senha@192.168.0.10",
    "192.168.0.10:80",
    "192.168.0.10:99999",
  ])("recusa %s", (texto) => {
    expect(origemDaMesa(texto)).toBeNull();
  });
});

describe("portaValida", () => {
  it("aceita de 1024 a 65535", () => {
    expect(portaValida(1024)).toBe(true);
    expect(portaValida(47822)).toBe(true);
    expect(portaValida(65535)).toBe(true);
  });

  it.each([1023, 65536, 2.5, "47821", null])("recusa %s", (valor) => {
    expect(portaValida(valor)).toBe(false);
  });
});
