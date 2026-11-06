import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lerConfiguracoes, salvarConfiguracoes } from "./configuracoes";

let pasta: string;

beforeEach(() => {
  pasta = mkdtempSync(join(tmpdir(), "odm-Área-config-"));
});

afterEach(() => {
  rmSync(pasta, { recursive: true, force: true });
});

describe("configurações", () => {
  it("sem arquivo, usa a porta padrão", () => {
    expect(lerConfiguracoes(pasta)).toEqual({ porta: 47821 });
  });

  it("a porta escolhida fica salva", () => {
    salvarConfiguracoes(pasta, { porta: 47822 });
    expect(lerConfiguracoes(pasta)).toEqual({ porta: 47822 });
  });

  it("arquivo estragado volta para o padrão", () => {
    writeFileSync(join(pasta, "configuracoes.json"), "{ quebrado");
    expect(lerConfiguracoes(pasta)).toEqual({ porta: 47821 });
  });

  it("porta inválida no arquivo volta para o padrão", () => {
    writeFileSync(join(pasta, "configuracoes.json"), JSON.stringify({ porta: 80 }));
    expect(lerConfiguracoes(pasta)).toEqual({ porta: 47821 });
  });
});
