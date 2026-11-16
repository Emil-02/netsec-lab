import type { Device } from "../../core/types";
import { ansi, type CommandContext, type CommandDef } from "../types";

function onSwitch(ctx: CommandContext): Device | null {
  if (ctx.device.kind === "switch") return ctx.device;
  ctx.error(`${ctx.name}: perintah ini hanya tersedia di switch. Pilih switch di menu "Perangkat" untuk mengendalikannya.`);
  return null;
}

function neighbourName(ctx: CommandContext, sw: Device, port: string) {
  const link = ctx.net.linkAt(sw.id, port);
  return link ? ctx.net.device(link.peer.device).name : "-";
}

function showVlan(ctx: CommandContext, sw: Device) {
  const vlans = new Map<number, string[]>();
  for (const i of sw.interfaces) {
    if (i.trunk) continue;
    const v = i.vlan ?? 1;
    vlans.set(v, [...(vlans.get(v) ?? []), i.name]);
  }
  ctx.print(ansi.bold(`${"VLAN".padEnd(6)}${"Nama".padEnd(16)}${"Status".padEnd(9)}Port`));
  ctx.print("----- --------------- -------- ------------------------------");
  for (const [v, ports] of [...vlans.entries()].sort(([a], [b]) => a - b)) {
    ctx.print(`${String(v).padEnd(6)}${(v === 1 ? "default" : `VLAN${String(v).padStart(4, "0")}`).padEnd(16)}${"active".padEnd(9)}${ports.join(", ")}`);
  }
  const trunks = sw.interfaces.filter((i) => i.trunk);
  if (trunks.length) {
    ctx.print("");
    ctx.print(ansi.bold("Port trunk (membawa semua VLAN, ditandai tag 802.1Q):"));
    for (const t of trunks) ctx.print(`  ${t.name} → ${neighbourName(ctx, sw, t.name)}`);
  }
  ctx.fact(`switch:show-vlan:${sw.id}`);
}

function showMac(ctx: CommandContext, sw: Device) {
  ctx.print(ansi.bold("          Mac Address Table"));
  ctx.print("-------------------------------------------");
  ctx.print(ansi.bold(`${"Vlan".padEnd(6)}${"Mac Address".padEnd(20)}${"Type".padEnd(10)}Port`));
  const entries = [...sw.macTable.values()].sort((a, b) => a.vlan - b.vlan || a.port.localeCompare(b.port));
  for (const e of entries) ctx.print(`${String(e.vlan).padEnd(6)}${e.mac.padEnd(20)}${"DYNAMIC".padEnd(10)}${e.port}`);
  ctx.print(`Total Mac Addresses: ${entries.length}`);
  ctx.fact(`switch:show-mac:${sw.id}`);
}

function showInterfaces(ctx: CommandContext, sw: Device) {
  ctx.print(ansi.bold(`${"Port".padEnd(7)}${"Terhubung ke".padEnd(16)}${"Status".padEnd(10)}Vlan`));
  for (const i of sw.interfaces) {
    const status = i.up ? ansi.green("connected".padEnd(10)) : ansi.red("disabled".padEnd(10));
    ctx.print(`${i.name.padEnd(7)}${neighbourName(ctx, sw, i.name).padEnd(16)}${status}${i.trunk ? "trunk" : (i.vlan ?? 1)}`);
  }
}

export const switchCommands: CommandDef[] = [
  {
    name: "show",
    category: "switch",
    summary: "Menampilkan info switch: show vlan | show mac address-table | show interfaces",
    usage: "show vlan | show mac address-table | show interfaces",
    run(ctx) {
      const sw = onSwitch(ctx);
      if (!sw) return 1;
      const what = ctx.args.join(" ");
      if (what.startsWith("vlan")) showVlan(ctx, sw);
      else if (what.startsWith("mac")) showMac(ctx, sw);
      else if (what.startsWith("int")) showInterfaces(ctx, sw);
      else {
        ctx.error("Penggunaan: show vlan | show mac address-table | show interfaces");
        return 1;
      }
      return 0;
    },
  },
  {
    name: "switchport",
    category: "switch",
    summary: "Mengatur port switch: masukkan ke VLAN tertentu atau jadikan trunk",
    usage: "switchport <port> vlan <id>  |  switchport <port> trunk",
    run(ctx) {
      const sw = onSwitch(ctx);
      if (!sw) return 1;
      const [portName, mode, value] = ctx.args;
      const port = sw.interfaces.find((i) => i.name === portName);
      if (!port) {
        ctx.error(`Port "${portName ?? ""}" tidak ada. Port yang tersedia: ${sw.interfaces.map((i) => i.name).join(", ")}`);
        return 1;
      }
      if (mode === "trunk") {
        port.trunk = true;
        port.vlan = undefined;
      } else if (mode === "vlan" || mode === "access") {
        const id = Number(value);
        if (!Number.isInteger(id) || id < 1 || id > 4094) {
          ctx.error("Nomor VLAN harus 1–4094. Contoh: switchport p3 vlan 20");
          return 1;
        }
        port.trunk = false;
        port.vlan = id === 1 ? undefined : id;
      } else {
        ctx.error("Penggunaan: switchport <port> vlan <id>  |  switchport <port> trunk");
        return 1;
      }
      for (const [key, entry] of sw.macTable) if (entry.port === port.name) sw.macTable.delete(key);
      ctx.print(ansi.green(`${port.name}: ${port.trunk ? "mode trunk" : `VLAN ${port.vlan ?? 1}`}`));
      ctx.fact(`switch:port:${sw.id}:${port.name}:${port.trunk ? "trunk" : (port.vlan ?? 1)}`);
      return 0;
    },
  },
];
