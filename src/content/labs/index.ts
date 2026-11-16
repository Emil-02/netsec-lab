import type { LabDefinition } from "@/engine";
import { dhcpLab, dnsLab, httpLab } from "./apps";
import { ctfLab } from "./ctf";
import { firewallLab, hashCrackLab, incidentLab } from "./defense";
import { kriptoDasarLab, reconLab } from "./security-basics";
import { arpDefenseLab, sniffingLab } from "./sniffing";
import { arpLab, macTableLab, vlanLab } from "./layer2";
import { linuxFile, linuxLogHunt, linuxNavigasi, linuxPermission } from "./linux";
import { enkapsulasi, hubVsSwitch, konfigurasiIp } from "./network";
import { natLab, staticRouteLab } from "./routing";
import { portLab, tcpHandshakeLab } from "./transport";
import { turLab } from "./tur-lab";
import { sqliLab, xssLab } from "./websec";

export const labList: LabDefinition[] = [
  turLab,
  linuxNavigasi,
  linuxFile,
  linuxPermission,
  linuxLogHunt,
  hubVsSwitch,
  enkapsulasi,
  konfigurasiIp,
  arpLab,
  macTableLab,
  vlanLab,
  staticRouteLab,
  natLab,
  portLab,
  tcpHandshakeLab,
  dnsLab,
  dhcpLab,
  httpLab,
  kriptoDasarLab,
  reconLab,
  sniffingLab,
  arpDefenseLab,
  hashCrackLab,
  firewallLab,
  incidentLab,
  sqliLab,
  xssLab,
  ctfLab,
];

export const labs: Record<string, LabDefinition> = Object.fromEntries(labList.map((l) => [l.id, l]));

export function getLab(id: string): LabDefinition | undefined {
  return labs[id];
}
