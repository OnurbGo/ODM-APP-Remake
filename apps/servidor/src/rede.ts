import { networkInterfaces, type NetworkInterfaceInfo } from "node:os";
import type { EnderecoRede, TipoRede } from "@odm/protocolo";

/* Adaptadores internos da máquina: nenhum outro dispositivo chega por eles. Um "vEthernet"
   externo não entra aqui, porque pode ser justamente a rede local. */
const SO_NESTA_MAQUINA = /wsl|default switch|virtualbox|vmware|docker|loopback/i;
const ORDEM: TipoRede[] = ["lan", "hamachi", "radmin", "outra"];

function classificar(nome: string, ip: string): TipoRede {
  const [a = 0, b = 0] = ip.split(".").map(Number);
  /* Faixas fixas das redes virtuais: 25.x no Hamachi e 26.x no Radmin. */
  if (a === 25 || /hamachi/i.test(nome)) return "hamachi";
  if (a === 26 || /radmin/i.test(nome)) return "radmin";
  const privada = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  return privada ? "lan" : "outra";
}

/* Só IPv4 utilizável: sem loopback e sem 169.254, que não leva a lugar nenhum. */
export function listarEnderecos(interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces()): EnderecoRede[] {
  const enderecos: EnderecoRede[] = [];
  for (const [nome, lista] of Object.entries(interfaces)) {
    for (const item of lista ?? []) {
      if (item.family !== "IPv4" || item.internal || item.address.startsWith("169.254.")) continue;
      if (SO_NESTA_MAQUINA.test(nome)) continue;
      enderecos.push({ ip: item.address, tipo: classificar(nome, item.address), interface: nome });
    }
  }
  return enderecos.sort((a, b) => ORDEM.indexOf(a.tipo) - ORDEM.indexOf(b.tipo) || a.ip.localeCompare(b.ip));
}
