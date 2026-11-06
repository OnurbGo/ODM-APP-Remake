import { describe, expect, it } from "vitest";
import { IdConteudo, lerPacote, ManifestoPacote, verificarDependencias } from "./index";

/* Dados fictícios: nada aqui vem dos livros. */
const base = ManifestoPacote.parse({ id: "exemplo-base", nome: "Base de exemplo", versao: "1.2.0" });
const complemento = ManifestoPacote.parse({
  id: "exemplo-extra",
  nome: "Extra de exemplo",
  versao: "1.0",
  tema: "tema-de-exemplo",
  dependencias: [{ id: "exemplo-base", versaoMinima: "1.1" }],
});

describe("lerPacote", () => {
  it("lê manifesto e conteúdo", () => {
    const pacote = lerPacote(JSON.stringify({ manifesto: base, conteudo: { "efeito.exemplo": { nome: "Exemplo" } } }));
    expect(pacote.manifesto.id).toBe("exemplo-base");
    expect(pacote.manifesto.dependencias).toEqual([]);
  });

  it("recusa pacote sem manifesto", () => {
    expect(() => lerPacote(JSON.stringify({ conteudo: {} }))).toThrow();
  });
});

describe("IdConteudo", () => {
  it("aceita o formato tipo.nome", () => {
    expect(IdConteudo.safeParse("efeito.exemplo").success).toBe(true);
    expect(IdConteudo.safeParse("criatura.exemplo.ataque").success).toBe(true);
  });

  it("recusa nome solto e maiúsculas", () => {
    expect(IdConteudo.safeParse("exemplo").success).toBe(false);
    expect(IdConteudo.safeParse("Efeito.Exemplo").success).toBe(false);
  });
});

describe("verificarDependencias", () => {
  it("nada falta quando a base está ativa e na versão certa", () => {
    expect(verificarDependencias(complemento, [base])).toEqual([]);
  });

  it("aponta a base ausente", () => {
    expect(verificarDependencias(complemento, [])).toEqual(["exemplo-base"]);
  });

  it("aponta versão antiga", () => {
    expect(verificarDependencias(complemento, [{ ...base, versao: "1.0.9" }])).toEqual(["exemplo-base 1.1"]);
  });

  it("compara a versão como número, não como texto", () => {
    expect(verificarDependencias(complemento, [{ ...base, versao: "1.10" }])).toEqual([]);
  });
});
