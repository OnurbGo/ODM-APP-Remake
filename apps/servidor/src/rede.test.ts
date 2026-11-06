import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { listarEnderecos } from "./rede";

const ipv4 = (address: string, internal = false) =>
  ({ address, family: "IPv4", internal, netmask: "255.255.255.0", mac: "00:00:00:00:00:00", cidr: null }) as NetworkInterfaceInfo;

describe("listarEnderecos", () => {
  it("reconhece LAN, Hamachi e Radmin, nesta ordem", () => {
    const enderecos = listarEnderecos({
      Radmin: [ipv4("26.1.2.3")],
      Hamachi: [ipv4("25.1.2.3")],
      "Wi-Fi": [ipv4("192.168.0.20")],
    });
    expect(enderecos.map((e) => [e.ip, e.tipo])).toEqual([
      ["192.168.0.20", "lan"],
      ["25.1.2.3", "hamachi"],
      ["26.1.2.3", "radmin"],
    ]);
  });

  it("reconhece a rede virtual pelo endereço, mesmo com outro nome de adaptador", () => {
    expect(listarEnderecos({ Ethernet3: [ipv4("25.9.9.9")] })[0]?.tipo).toBe("hamachi");
  });

  it("deixa fora loopback, 169.254 e IPv6", () => {
    const enderecos = listarEnderecos({
      lo: [ipv4("127.0.0.1", true)],
      Ethernet: [ipv4("169.254.10.20"), { ...ipv4("fe80::1"), family: "IPv6" } as NetworkInterfaceInfo],
    });
    expect(enderecos).toEqual([]);
  });

  it("deixa fora adaptadores que só existem dentro da máquina", () => {
    expect(listarEnderecos({ "vEthernet (WSL (Hyper-V firewall))": [ipv4("172.20.1.1")], "VirtualBox Host-Only": [ipv4("192.168.56.1")] })).toEqual([]);
  });

  it("mantém um vEthernet externo, que pode ser a rede local de verdade", () => {
    expect(listarEnderecos({ "vEthernet (Externa)": [ipv4("192.168.0.30")] })[0]?.tipo).toBe("lan");
  });
});
