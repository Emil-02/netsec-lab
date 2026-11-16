import { ansi, requireRoot, type CommandContext, type CommandDef } from "../types";
import { filterTable } from "./iptables-filter";

function listNat(ctx: CommandContext) {
  const rules = ctx.device.nat.rules;
  ctx.print(ansi.bold("Chain PREROUTING (policy ACCEPT)"));
  ctx.print("target     prot opt source               destination");
  ctx.print("");
  ctx.print(ansi.bold("Chain POSTROUTING (policy ACCEPT)"));
  ctx.print("target     prot opt source               destination");
  for (const r of rules) ctx.print(`${ansi.green("MASQUERADE")} all  --  0.0.0.0/0            0.0.0.0/0            ${ansi.dim(`(keluar lewat ${r.out})`)}`);
  ctx.fact("iptables:nat:listed");
}

function natRuleArgs(args: string[]) {
  const out = args[args.indexOf("-o") + 1];
  const target = args[args.indexOf("-j") + 1];
  return { out: args.includes("-o") ? out : undefined, target: args.includes("-j") ? target : undefined };
}

export const firewallCommands: CommandDef[] = [
  {
    name: "iptables",
    category: "jaringan",
    summary: "Mengatur aturan firewall & NAT di Linux",
    usage: "sudo iptables -L -n -v | -A INPUT -p tcp --dport 22 -j ACCEPT | -P INPUT DROP | -t nat -A POSTROUTING -o eth1 -j MASQUERADE",
    run(ctx) {
      if (!requireRoot(ctx, "iptables v1.8.10 (nf_tables): Permission denied (you must be root)")) return 4;
      const args = ctx.args;
      const table = args.includes("-t") ? args[args.indexOf("-t") + 1] : "filter";
      if (table !== "nat" && table !== "filter") {
        ctx.error(`iptables: tabel "${table}" tidak dikenal (gunakan nat atau filter)`);
        return 2;
      }
      if (table === "filter") return filterTable(ctx, args);
      if (args.includes("-L") || args.includes("-S") || args.some((a) => /^-[nv]*L[nv]*$/.test(a))) {
        listNat(ctx);
        return 0;
      }
      if (args.includes("-F")) {
        ctx.device.nat.rules = [];
        ctx.device.nat.table.clear();
        ctx.fact("iptables:nat:flushed");
        return 0;
      }
      const append = args.includes("-A");
      const remove = args.includes("-D");
      if (append || remove) {
        const chain = args[args.indexOf(append ? "-A" : "-D") + 1];
        const { out, target } = natRuleArgs(args);
        if (chain !== "POSTROUTING" || target !== "MASQUERADE" || !out) {
          ctx.error("iptables: di lab ini yang didukung: -t nat -A POSTROUTING -o <interface> -j MASQUERADE");
          return 2;
        }
        if (!ctx.device.interfaces.some((i) => i.name === out)) {
          ctx.error(`iptables: interface "${out}" tidak ada di perangkat ini (cek dengan: ip a)`);
          return 2;
        }
        if (append) {
          if (!ctx.device.nat.rules.some((r) => r.out === out)) ctx.device.nat.rules.push({ chain: "POSTROUTING", out, target: "MASQUERADE" });
          ctx.fact(`iptables:masquerade:${ctx.device.id}:${out}`);
        } else {
          const before = ctx.device.nat.rules.length;
          ctx.device.nat.rules = ctx.device.nat.rules.filter((r) => r.out !== out);
          if (before === ctx.device.nat.rules.length) {
            ctx.error("iptables: Bad rule (does a matching rule exist in that chain?).");
            return 1;
          }
        }
        return 0;
      }
      ctx.error("Penggunaan: sudo iptables -t nat -L | -F | -A POSTROUTING -o <iface> -j MASQUERADE");
      return 2;
    },
  },
  {
    name: "conntrack",
    category: "jaringan",
    summary: "Menampilkan tabel translasi NAT (koneksi yang sedang dilacak)",
    usage: "sudo conntrack -L",
    run(ctx) {
      if (!requireRoot(ctx, "conntrack")) return 1;
      const entries = [...ctx.device.nat.table.values()];
      for (const e of entries) {
        const proto = e.proto.toLowerCase().padEnd(5);
        const ports = e.proto === "ICMP" ? `type=8 code=0 id=${e.id}` : `sport=${e.port} dport=${e.remotePort}`;
        ctx.print(`${proto} src=${ansi.yellow(e.insideIp)} dst=${e.remoteIp} ${ports}  ${ansi.dim("→ diterjemahkan:")} src=${ansi.green(e.publicIp)}`);
      }
      ctx.print(ansi.dim(`conntrack v1.4.8: ${entries.length} flow entries have been shown.`));
      ctx.fact("conntrack:listed");
      return 0;
    },
  },
];
