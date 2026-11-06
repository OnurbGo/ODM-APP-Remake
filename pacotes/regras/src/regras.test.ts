import { describe, expect, it } from "vitest";
import { alcancaDT, rolarD20, somarModificadores, totalDaRolagem } from "./index";

describe("rolarD20", () => {
  it("pede um valor entre 1 e 20 e devolve o sorteado", () => {
    const pedidos: [number, number][] = [];
    const valor = rolarD20((min, max) => {
      pedidos.push([min, max]);
      return 17;
    });
    expect(valor).toBe(17);
    expect(pedidos).toEqual([[1, 20]]);
  });

  it.each([0, 21, 2.5, Number.NaN])("recusa o valor %s, que um d20 não produz", (invalido) => {
    expect(() => rolarD20(() => invalido)).toThrow(RangeError);
  });
});

describe("modificadores", () => {
  it("soma valores positivos e negativos", () => {
    expect(
      somarModificadores([
        { rotulo: "Bônus", valor: 3 },
        { rotulo: "Exaustão", valor: -2 },
      ]),
    ).toBe(1);
  });

  it("sem modificadores, o total é o valor do dado", () => {
    expect(totalDaRolagem(12, [])).toBe(12);
  });

  it("o total soma o dado e os modificadores", () => {
    expect(totalDaRolagem(12, [{ rotulo: "Bônus", valor: 4 }])).toBe(16);
  });
});

describe("alcancaDT", () => {
  it("resultado igual à DT é sucesso", () => expect(alcancaDT(15, 15)).toBe(true));
  it("resultado superior à DT é sucesso", () => expect(alcancaDT(16, 15)).toBe(true));
  it("resultado abaixo da DT é falha", () => expect(alcancaDT(14, 15)).toBe(false));
});
