import { describe, expect, it } from "vitest";
import { avaliarFirewall, motivoDaFalha, scriptConsulta, scriptLiberar, type RegraFirewall } from "./firewall";

const regra = (acao: string, perfis: string, protocolo = "TCP"): RegraFirewall => ({ acao, perfis, protocolo });

describe("avaliarFirewall", () => {
  it("regra que permite em qualquer rede libera", () => {
    expect(avaliarFirewall([regra("Allow", "Any")], ["Public"])).toBe("liberado");
  });

  it("o bloqueio criado ao fechar a janela do Windows é reconhecido", () => {
    const regras = [regra("Block", "Private, Public"), regra("Block", "Private, Public", "UDP")];
    expect(avaliarFirewall(regras, ["Private", "Public"])).toBe("bloqueado");
  });

  it("bloqueio vence permissão", () => {
    expect(avaliarFirewall([regra("Allow", "Any"), regra("Block", "Public")], ["Public"])).toBe("bloqueado");
  });

  it("permitir só em rede privada não basta numa rede pública", () => {
    expect(avaliarFirewall([regra("Allow", "Private")], ["Public"])).toBe("sem_liberacao");
  });

  it("com duas redes, todas precisam estar cobertas", () => {
    expect(avaliarFirewall([regra("Allow", "Private")], ["Private", "Public"])).toBe("sem_liberacao");
    expect(avaliarFirewall([regra("Allow", "Private, Public")], ["Private", "Public"])).toBe("liberado");
  });

  it("sem nenhuma regra, ainda falta liberar", () => {
    expect(avaliarFirewall([], ["Public"])).toBe("sem_liberacao");
  });

  it("regra só de UDP não conta: o app usa TCP", () => {
    expect(avaliarFirewall([regra("Allow", "Any", "UDP")], ["Public"])).toBe("sem_liberacao");
    expect(avaliarFirewall([regra("Block", "Any", "UDP"), regra("Allow", "Any")], ["Public"])).toBe("liberado");
  });

  it("bloqueio em outro tipo de rede não atrapalha a rede atual", () => {
    expect(avaliarFirewall([regra("Block", "Public"), regra("Allow", "Private")], ["Private"])).toBe("liberado");
  });

  it("entende a rede de domínio", () => {
    expect(avaliarFirewall([regra("Allow", "Domain")], ["DomainAuthenticated"])).toBe("liberado");
  });

  it("sem rede, não dá para saber", () => {
    expect(avaliarFirewall([], [])).toBe("desconhecido");
  });
});

describe("motivoDaFalha", () => {
  it("reconhece a confirmação recusada", () => {
    expect(motivoDaFalha(1223, false)).toBe("recusado");
  });

  it("janela sem resposta até o fim do prazo", () => {
    expect(motivoDaFalha(null, true)).toBe("sem_resposta");
  });

  it("qualquer outro erro é falha, sem culpar a pessoa", () => {
    expect(motivoDaFalha(1, false)).toBe("falhou");
    expect(motivoDaFalha(null, false)).toBe("falhou");
  });
});

describe("scripts", () => {
  const programa = "C:\\Área de Trabalho\\O'Brien\\Olho da Morte.exe";

  it("escapam aspas no caminho do programa", () => {
    expect(scriptConsulta(programa)).toContain("$p = 'C:\\Área de Trabalho\\O''Brien\\Olho da Morte.exe'");
    expect(scriptLiberar(programa)).toContain("$p = 'C:\\Área de Trabalho\\O''Brien\\Olho da Morte.exe'");
  });

  it("a consulta só lê", () => {
    expect(scriptConsulta(programa)).not.toMatch(/Remove-|New-|Set-/);
  });

  it("a liberação vale para este programa, só TCP e só entrada", () => {
    const script = scriptLiberar(programa);
    expect(script).toContain("-Direction Inbound -Action Allow -Profile Any -Protocol TCP -Program $p");
    expect(script).toContain("Get-NetFirewallApplicationFilter -Program $p");
  });
});
