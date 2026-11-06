import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { conferirPacote, IdConteudo, lerPacote, ManifestoPacote, verificarDependencias } from "./index";
import { lerPasta, pastaConteudo } from "./pasta";

/* Dados fictícios: nada aqui vem dos livros. */
const base = ManifestoPacote.parse({ id: "exemplo-base", nome: "Base de exemplo", versao: "1.2.0" });
const complemento = ManifestoPacote.parse({
  id: "exemplo-extra",
  nome: "Extra de exemplo",
  versao: "1.0",
  tema: "tema-de-exemplo",
  dependencias: [{ id: "exemplo-base", versaoMinima: "1.1" }],
});

const efeito = (id: string) => ({ id, tipo: "efeito", nome: "Exemplo", fonte: { arquivo: "exemplo.md" }, texto: "Texto de exemplo." });

describe("lerPacote", () => {
  it("lê manifesto e conteúdo", () => {
    const pacote = lerPacote(JSON.stringify({ manifesto: base, conteudo: { efeitos: [efeito("efeito.exemplo")] } }));
    expect(pacote.manifesto.id).toBe("exemplo-base");
    expect(pacote.manifesto.dependencias).toEqual([]);
    expect(pacote.conteudo.efeitos[0]?.nome).toBe("Exemplo");
    expect(pacote.conteudo.criaturas).toEqual([]);
  });

  it("recusa tipo de conteúdo desconhecido", () => {
    expect(() => lerPacote(JSON.stringify({ manifesto: base, conteudo: { magias: [] } }))).toThrow();
  });

  it("recusa item sem id válido", () => {
    expect(() => lerPacote(JSON.stringify({ manifesto: base, conteudo: { efeitos: [efeito("Exemplo")] } }))).toThrow();
  });

  it("recusa pacote sem manifesto", () => {
    expect(() => lerPacote(JSON.stringify({ conteudo: {} }))).toThrow();
  });
});

describe("conferirPacote", () => {
  it("aponta id repetido, inclusive dentro das fichas", () => {
    const acao = {
      id: "criatura.exemplo.golpe",
      tipo: "acao",
      nome: "Golpe",
      fonte: { arquivo: "exemplo.yml" },
      texto: "",
      rotulo: "Golpe",
      custoPa: 1,
      recargaCriatura: null,
      elite: false,
      inicio: false,
      combo: false,
      secao: "Ações",
    };
    const criatura = {
      id: "criatura.exemplo",
      tipo: "criatura",
      nome: "Exemplo",
      fonte: { arquivo: "exemplo.yml" },
      texto: "",
      categoria: null,
      descricao: null,
      defesa: null,
      defesaTexto: "Depende",
      pv: 10,
      pvTexto: "10",
      deslocamentoM: 6,
      atributos: { brutalidade: 0, agilidade: 0, fibra: 0, intelecto: 0, astucia: 0, presenca: 0 },
      extras: [],
      nd: "1",
      xp: 200,
      secoes: [{ titulo: "Ações", itens: [acao, acao, { nota: "Texto solto." }] }],
    };
    const pacote = lerPacote(JSON.stringify({ manifesto: base, conteudo: { criaturas: [criatura] } }));
    expect(conferirPacote(pacote)).toEqual(["Id repetido: criatura.exemplo.golpe"]);
  });
});

describe("pasta de conteúdo", () => {
  it("fica fora do repositório, ou onde a variável mandar", () => {
    expect(pastaConteudo({ LOCALAPPDATA: "C:/Dados" }).replaceAll("\\", "/")).toBe("C:/Dados/ODM-dev/conteudo");
    expect(pastaConteudo({ ODM_CONTEUDO: "D:/outra", LOCALAPPDATA: "C:/Dados" })).toBe("D:/outra");
  });

  it("lê os pacotes e aponta o arquivo com problema, sem parar nos outros", () => {
    const pasta = mkdtempSync(join(tmpdir(), "odm-conteudo-"));
    try {
      writeFileSync(join(pasta, "odm-bom-1.0.json"), JSON.stringify({ manifesto: base, conteudo: {} }));
      writeFileSync(join(pasta, "odm-ruim-1.0.json"), "{");
      writeFileSync(join(pasta, "outro.json"), "{");
      const lidos = lerPasta(pasta);
      expect(lidos.map((l) => [l.arquivo, l.problemas.length > 0])).toEqual([
        ["odm-bom-1.0.json", false],
        ["odm-ruim-1.0.json", true],
      ]);
    } finally {
      rmSync(pasta, { recursive: true, force: true });
    }
  });

  it("pasta que não existe é só uma lista vazia", () => {
    expect(lerPasta(join(tmpdir(), "odm-nao-existe"))).toEqual([]);
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
