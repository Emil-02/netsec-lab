import { parseCidr } from "../../core/ip";
import type { ConnState, Device, FwChain, FwRule, FwTarget } from "../../core/types";
import { ansi, type CommandContext } from "../types";

const CHAINS: FwChain[] = ["INPUT", "FORWARD", "OUTPUT"];
const TARGETS: FwTarget[] = ["ACCEPT", "DROP", "REJECT", "LOG"];
const STATES: ConnState[] = ["NEW", "ESTABLISHED", "RELATED", "INVALID"];

function addr(a: FwRule["src"]) {
  if (!a) return "0.0.0.0/0";
  return a.prefix === 32 ? a.ip : `${a.ip}/${a.prefix}`;
}

function extras(r: FwRule) {
  const parts: string[] = [];
  if (r.proto && r.dport !== undefined) parts.push(`${r.proto} dpt:${r.dport}`);
  if (r.proto && r.sport !== undefined) parts.push(`${r.proto} spt:${r.sport}`);
  if (r.states) parts.push(`state ${r.states.join(",")}`);
  if (r.target === "REJECT") parts.push(`reject-with ${r.rejectWith ?? "icmp-port-unreachable"}`);
  if (r.target === "LOG") parts.push(`LOG flags 0 level 4${r.logPrefix ? ` prefix "${r.logPrefix}"` : ""}`);
  return parts.join(" ");
}

function human(n: number) {
  return n >= 10000 ? `${Math.round(n / 1000)}K` : String(n);
}

export function listFilter(ctx: CommandContext, only?: FwChain) {
  const verbose = ctx.args.some((a) => /^-[a-zA-Z]*v/.test(a));
  const numbers = ctx.args.includes("--line-numbers");
  for (const chain of only ? [only] : CHAINS) {
    const c = ctx.device.firewall.chains[chain];
    const policy = c.policy === "DROP" ? ansi.red(c.policy) : c.policy;
    ctx.print(ansi.bold(`Chain ${chain} (policy ${policy}${verbose ? ` ${c.pkts} packets, ${c.bytes} bytes` : ""})`));
    const head = `${numbers ? "num  " : ""}${verbose ? " pkts bytes " : ""}target     prot opt ${verbose ? "in     out    " : ""}source               destination`;
    ctx.print(head);
    c.rules.forEach((r, i) => {
      const target = r.target === "ACCEPT" ? ansi.green(r.target.padEnd(10)) : r.target === "LOG" ? ansi.cyan(r.target.padEnd(10)) : ansi.red(r.target.padEnd(10));
      const line =
        `${numbers ? String(i + 1).padEnd(5) : ""}${verbose ? `${human(r.pkts).padStart(5)} ${human(r.bytes).padStart(5)} ` : ""}` +
        `${target} ${(r.proto ?? "all").padEnd(4)} --  ${verbose ? `${(r.inIface ?? "*").padEnd(6)} ${(r.outIface ?? "*").padEnd(6)} ` : ""}` +
        `${addr(r.src).padEnd(20)} ${addr(r.dst).padEnd(20)} ${extras(r)}`;
      ctx.print(line);
    });
    ctx.print("");
  }
  ctx.fact(`iptables:listed:${ctx.device.id}`);
}

/** Parses rule match/target options. Returns an error string on failure. */
export function parseRuleSpec(args: string[]): FwRule | string {
  const rule: FwRule = { target: "ACCEPT", pkts: 0, bytes: 0 };
  let target: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const v = () => {
      const val = args[++i];
      if (val === undefined) throw new Error(`opsi ${a} butuh nilai`);
      return val;
    };
    try {
      switch (a) {
        case "-p":
        case "--protocol": {
          const p = v().toLowerCase();
          if (p !== "tcp" && p !== "udp" && p !== "icmp" && p !== "all") return `protokol "${p}" tidak dikenal (tcp, udp, icmp, all)`;
          if (p !== "all") rule.proto = p;
          break;
        }
        case "-s":
        case "--source":
        case "-d":
        case "--destination": {
          const c = parseCidr(v());
          if (!c) return `alamat "${args[i]}" tidak valid`;
          if (a.startsWith("-s") || a === "--source") rule.src = c;
          else rule.dst = c;
          break;
        }
        case "--dport":
        case "--sport": {
          const n = Number(v());
          if (!Number.isInteger(n) || n < 1 || n > 65535) return `port "${args[i]}" tidak valid`;
          if (a === "--dport") rule.dport = n;
          else rule.sport = n;
          break;
        }
        case "-i":
          rule.inIface = v();
          break;
        case "-o":
          rule.outIface = v();
          break;
        case "-m":
          v();
          break;
        case "--state":
        case "--ctstate": {
          const states = v().toUpperCase().split(",") as ConnState[];
          if (states.some((s) => !STATES.includes(s))) return `state tidak dikenal (NEW, ESTABLISHED, RELATED, INVALID)`;
          rule.states = states;
          break;
        }
        case "-j":
        case "--jump":
          target = v().toUpperCase();
          break;
        case "--reject-with": {
          const w = v();
          if (w !== "tcp-reset" && w !== "icmp-port-unreachable") return `--reject-with: gunakan tcp-reset atau icmp-port-unreachable`;
          rule.rejectWith = w;
          break;
        }
        case "--log-prefix":
          rule.logPrefix = v();
          break;
        default:
          return `opsi "${a}" tidak dikenal`;
      }
    } catch (e) {
      return (e as Error).message;
    }
  }
  if (!target) return "aturan butuh target: -j ACCEPT | DROP | REJECT | LOG";
  if (!TARGETS.includes(target as FwTarget)) return `target "${target}" tidak dikenal (ACCEPT, DROP, REJECT, LOG)`;
  if ((rule.dport !== undefined || rule.sport !== undefined) && rule.proto !== "tcp" && rule.proto !== "udp") {
    return "--dport/--sport butuh -p tcp atau -p udp";
  }
  if (rule.rejectWith === "tcp-reset" && rule.proto !== "tcp") return "--reject-with tcp-reset hanya untuk -p tcp";
  rule.target = target as FwTarget;
  return rule;
}

function sameRule(a: FwRule, b: FwRule) {
  const strip = (r: FwRule) => JSON.stringify({ ...r, pkts: 0, bytes: 0 });
  return strip(a) === strip(b);
}

function specOf(r: FwRule) {
  const parts: string[] = [];
  if (r.src) parts.push(`-s ${addr(r.src)}`);
  if (r.dst) parts.push(`-d ${addr(r.dst)}`);
  if (r.inIface) parts.push(`-i ${r.inIface}`);
  if (r.outIface) parts.push(`-o ${r.outIface}`);
  if (r.proto) parts.push(`-p ${r.proto}`);
  if (r.states) parts.push(`-m state --state ${r.states.join(",")}`);
  if (r.sport !== undefined) parts.push(`--sport ${r.sport}`);
  if (r.dport !== undefined) parts.push(`--dport ${r.dport}`);
  parts.push(`-j ${r.target}`);
  if (r.rejectWith) parts.push(`--reject-with ${r.rejectWith}`);
  if (r.logPrefix) parts.push(`--log-prefix "${r.logPrefix}"`);
  return parts.join(" ");
}

export function saveRules(ctx: CommandContext) {
  for (const chain of CHAINS) ctx.print(`-P ${chain} ${ctx.device.firewall.chains[chain].policy}`);
  for (const chain of CHAINS) for (const r of ctx.device.firewall.chains[chain].rules) ctx.print(`-A ${chain} ${specOf(r)}`);
}

function chainArg(ctx: CommandContext, name: string | undefined): FwChain | null {
  const c = (name ?? "").toUpperCase() as FwChain;
  if (CHAINS.includes(c)) return c;
  ctx.error(`iptables: chain "${name ?? ""}" tidak dikenal. Pilihan: INPUT, FORWARD, OUTPUT`);
  return null;
}

/** Handles `iptables` for the filter table. Assumes root has already been checked. */
export function filterTable(ctx: CommandContext, args: string[]): number {
  const device: Device = ctx.device;
  const fw = device.firewall;
  const op = args.find((a) => ["-A", "-I", "-D", "-P", "-F", "-L", "-S", "-Z"].includes(a) || /^-[nv]*L[nv]*$/.test(a));
  if (!op) {
    ctx.error("Penggunaan: iptables -L | -A/-I/-D <chain> <aturan> -j <target> | -P <chain> <ACCEPT|DROP> | -F");
    return 2;
  }
  const idx = args.indexOf(op);
  const rest = args.slice(idx + 1);

  if (op === "-S") {
    saveRules(ctx);
    return 0;
  }
  if (op.includes("L")) {
    const chainName = rest.find((a) => !a.startsWith("-"));
    const chain = chainName ? chainArg(ctx, chainName) : undefined;
    if (chain === null) return 1;
    listFilter(ctx, chain);
    return 0;
  }
  if (op === "-F" || op === "-Z") {
    const chain = rest[0] && !rest[0].startsWith("-") ? chainArg(ctx, rest[0]) : undefined;
    if (chain === null) return 1;
    for (const c of chain ? [chain] : CHAINS) {
      if (op === "-F") fw.chains[c].rules = [];
      else {
        fw.chains[c].pkts = 0;
        fw.chains[c].bytes = 0;
        fw.chains[c].rules.forEach((r) => (r.pkts = r.bytes = 0));
      }
    }
    ctx.fact(`iptables:${op === "-F" ? "flushed" : "zeroed"}:${device.id}`);
    return 0;
  }
  const chain = chainArg(ctx, rest[0]);
  if (!chain) return 1;
  if (op === "-P") {
    const policy = (rest[1] ?? "").toUpperCase();
    if (policy !== "ACCEPT" && policy !== "DROP") {
      ctx.error("iptables: policy hanya boleh ACCEPT atau DROP");
      return 1;
    }
    fw.chains[chain].policy = policy;
    ctx.fact(`iptables:policy:${device.id}:${chain}:${policy}`);
    return 0;
  }
  let specArgs = [...rest.slice(1), ...args.slice(0, idx)];
  specArgs = specArgs.filter((a, i) => !(a === "-t" || (i > 0 && specArgs[i - 1] === "-t")));
  let position: number | undefined;
  if ((op === "-I" || op === "-D") && /^\d+$/.test(specArgs[0] ?? "")) {
    position = Number(specArgs[0]);
    specArgs = specArgs.slice(1);
  }
  const rules = fw.chains[chain].rules;
  if (op === "-D" && position !== undefined && !specArgs.length) {
    if (position < 1 || position > rules.length) {
      ctx.error("iptables: Index of deletion too big.");
      return 1;
    }
    rules.splice(position - 1, 1);
    ctx.fact(`iptables:deleted:${device.id}:${chain}`);
    return 0;
  }
  const rule = parseRuleSpec(specArgs);
  if (typeof rule === "string") {
    ctx.error(`iptables v1.8.10: ${rule}`);
    return 2;
  }
  if (op === "-D") {
    const at = rules.findIndex((r) => sameRule(r, rule));
    if (at < 0) {
      ctx.error("iptables: Bad rule (does a matching rule exist in that chain?).");
      return 1;
    }
    rules.splice(at, 1);
    ctx.fact(`iptables:deleted:${device.id}:${chain}`);
    return 0;
  }
  if (op === "-I") rules.splice(Math.max(0, Math.min(rules.length, (position ?? 1) - 1)), 0, rule);
  else rules.push(rule);
  ctx.fact(`iptables:rule:${device.id}:${chain}:${specOf(rule)}`);
  return 0;
}
