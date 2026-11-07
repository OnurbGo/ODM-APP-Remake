import { execFile } from "node:child_process";

/* Especificação, 3.2: o mestre não mexe em configuração do Windows. O painel detecta o bloqueio
   e libera com um clique e a confirmação do próprio Windows. */

export type RegraFirewall = { acao: string; perfis: string; protocolo: string };
export type EstadoFirewall = "liberado" | "bloqueado" | "sem_liberacao" | "desconhecido";
export type MotivoFalha = "recusado" | "sem_resposta" | "falhou";
export type ResultadoLiberar = { estado: EstadoFirewall; motivo: MotivoFalha | null };

const NOME_REGRA = "Olho da Morte (mesa)";
const TEMPO_CONSULTA_MS = 20_000;
/* Inclui o tempo que a pessoa leva para responder à confirmação do Windows. */
const TEMPO_LIBERAR_MS = 120_000;
/* ERROR_CANCELLED do Windows: a pessoa recusou a confirmação. */
const CODIGO_RECUSADO = 1223;

function perfilDaRede(categoria: string) {
  return categoria === "DomainAuthenticated" ? "Domain" : categoria;
}

function cobre(regra: RegraFirewall, rede: string) {
  return regra.perfis === "Any" || regra.perfis.split(",").some((p) => p.trim() === rede);
}

/* Bloqueio vence permissão, como no próprio Windows. O app só usa TCP. */
export function avaliarFirewall(regras: readonly RegraFirewall[], redes: readonly string[]): EstadoFirewall {
  if (redes.length === 0) return "desconhecido";
  const tcp = regras.filter((r) => r.protocolo === "TCP" || r.protocolo === "Any");
  const perfis = redes.map(perfilDaRede);

  if (tcp.some((r) => r.acao === "Block" && perfis.some((p) => cobre(r, p)))) return "bloqueado";
  const permitidas = tcp.filter((r) => r.acao === "Allow");
  return perfis.every((p) => permitidas.some((r) => cobre(r, p))) ? "liberado" : "sem_liberacao";
}

const textoPowerShell = (valor: string) => `'${valor.replace(/'/g, "''")}'`;
/* Codificado: caminhos com acento e aspas chegam intactos ao PowerShell. */
const codificar = (script: string) => Buffer.from(script, "utf16le").toString("base64");

/* Só lê: funciona sem administrador. */
export function scriptConsulta(programa: string) {
  return [
    `$p = ${textoPowerShell(programa)}`,
    "$redes = @(Get-NetConnectionProfile | ForEach-Object { $_.NetworkCategory.ToString() })",
    `$regras = @(Get-NetFirewallApplicationFilter -Program $p -ErrorAction SilentlyContinue | ForEach-Object {
      $r = $_ | Get-NetFirewallRule
      if ($r.Direction -eq 'Inbound' -and $r.Enabled -eq 'True') {
        @{ acao = $r.Action.ToString(); perfis = $r.Profile.ToString(); protocolo = ($r | Get-NetFirewallPortFilter).Protocol }
      }
    })`,
    "@{ redes = $redes; regras = $regras } | ConvertTo-Json -Compress -Depth 4",
  ].join("\n");
}

/* Tira os bloqueios só deste programa e cria uma regra só dele, só TCP, em qualquer rede. */
export function scriptLiberar(programa: string) {
  return [
    "$ErrorActionPreference = 'Stop'",
    `$p = ${textoPowerShell(programa)}`,
    `Get-NetFirewallApplicationFilter -Program $p -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object {
      $_.Direction -eq 'Inbound' -and ($_.Action -eq 'Block' -or $_.DisplayName -eq ${textoPowerShell(NOME_REGRA)})
    } | Remove-NetFirewallRule`,
    `New-NetFirewallRule -DisplayName ${textoPowerShell(NOME_REGRA)} -Direction Inbound -Action Allow -Profile Any -Protocol TCP -Program $p | Out-Null`,
  ].join("\n");
}

/* O estado do firewall diz se deu certo; o código de saída só explica por que não deu. */
export function motivoDaFalha(codigo: number | null, semResposta: boolean): MotivoFalha {
  if (semResposta) return "sem_resposta";
  return codigo === CODIGO_RECUSADO ? "recusado" : "falhou";
}

function rodar(script: string, tempo: number) {
  return new Promise<string>((resolver, rejeitar) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-EncodedCommand", codificar(script)],
      { timeout: tempo, windowsHide: true },
      (erro, saida) => (erro ? rejeitar(erro) : resolver(saida)),
    );
  });
}

export async function consultarFirewall(programa: string): Promise<EstadoFirewall> {
  if (process.platform !== "win32") return "desconhecido";
  try {
    const { regras, redes } = JSON.parse(await rodar(scriptConsulta(programa), TEMPO_CONSULTA_MS)) as {
      regras: RegraFirewall[];
      redes: string[];
    };
    return avaliarFirewall(regras, redes);
  } catch {
    return "desconhecido";
  }
}

/* Devolve o estado real depois da tentativa: recusar a confirmação do Windows não é erro do app. */
export async function liberarFirewall(programa: string): Promise<ResultadoLiberar> {
  if (process.platform !== "win32") return { estado: "desconhecido", motivo: "falhou" };
  const elevar = [
    "$ErrorActionPreference = 'Stop'",
    "try {",
    `  $r = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -Wait -PassThru -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${codificar(scriptLiberar(programa))}'`,
    "  exit $r.ExitCode",
    "} catch {",
    `  if ($_.Exception.NativeErrorCode -eq ${CODIGO_RECUSADO}) { exit ${CODIGO_RECUSADO} }`,
    "  exit 1",
    "}",
  ].join("\n");

  let motivo: MotivoFalha | null = null;
  try {
    await rodar(elevar, TEMPO_LIBERAR_MS);
  } catch (erro) {
    const { code, killed } = erro as { code?: number | string; killed?: boolean };
    motivo = motivoDaFalha(typeof code === "number" ? code : null, killed === true);
  }
  const estado = await consultarFirewall(programa);
  return { estado, motivo: estado === "liberado" ? null : (motivo ?? "falhou") };
}
