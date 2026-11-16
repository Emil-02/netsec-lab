import { describe, expect, it } from "vitest";
import { buildNetwork, execute, type Network, type ShellSession, type TopologySpec } from "@/engine";
import { md5 } from "@/engine/crypto/hash";

function session(net: Network, id: string): ShellSession {
  const device = net.device(id);
  return { device, cwd: device.fs?.home ?? "/", history: [] };
}

const text = (r: ReturnType<typeof execute>) =>
  r.events
    .filter((e) => e.kind === "output")
    .map((e) => (e as { text: string }).text)
    .join("\n")
    .replace(/\x1b\[[0-9;]*m/g, "");

const lan: TopologySpec = {
  devices: [
    { id: "kali", kind: "attacker", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.66/24" }] },
    { id: "hub", kind: "hub", position: { x: 0, y: 0 } },
    { id: "pc", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.10/24" }] },
    {
      id: "srv",
      kind: "server",
      position: { x: 0, y: 0 },
      interfaces: [{ name: "eth0", ip: "10.0.0.20/24" }],
      os: "Linux 6.8 (Ubuntu 24.04)",
      services: [
        { port: 22, protocol: "tcp", name: "ssh", version: "OpenSSH 9.6p1 Ubuntu 3ubuntu13" },
        { port: 31337, protocol: "tcp", name: "rahasia" },
        { port: 53, protocol: "udp", name: "domain" },
      ],
      web: { software: "nginx/1.24.0", routes: { "/login": () => ({ body: "ok\n" }) } },
    },
  ],
  links: [
    ["kali:eth0", "hub:p1"],
    ["pc:eth0", "hub:p2"],
    ["srv:eth0", "hub:p3"],
  ],
};

describe("nmap", () => {
  it("discovers live hosts with -sn", () => {
    const net = buildNetwork(lan);
    const r = execute(net, session(net, "kali"), "sudo nmap -sn 10.0.0.0/24");
    const out = text(r);
    expect(out).toContain("Nmap scan report for 10.0.0.10");
    expect(out).toContain("Nmap scan report for 10.0.0.20");
    expect(out).toContain("256 IP addresses (3 hosts up)");
  });

  it("finds open ports, versions and OS; misses high ports unless -p-", () => {
    const net = buildNetwork(lan);
    const kali = session(net, "kali");
    const out = text(execute(net, kali, "sudo nmap -sV -O 10.0.0.20"));
    expect(out).toMatch(/22\/tcp\s+open\s+ssh\s+OpenSSH 9\.6p1/);
    expect(out).toMatch(/80\/tcp\s+open\s+http\s+nginx 1\.24\.0/);
    expect(out).toContain("Not shown: 998 closed tcp ports (reset)");
    expect(out).toContain("OS details: Linux 6.8");
    expect(out).not.toContain("31337");
    expect(text(execute(net, kali, "nmap -p- 10.0.0.20"))).toMatch(/31337\/tcp\s+open/);
  });

  it("requires root for SYN scans and reports filtered ports behind a firewall", () => {
    const net = buildNetwork(lan);
    const kali = session(net, "kali");
    expect(text(execute(net, kali, "nmap -sS 10.0.0.20"))).toContain("requires root privileges");
    const srv = net.device("srv");
    srv.firewall.chains.INPUT.rules.push({ proto: "tcp", dport: 22, target: "DROP", pkts: 0, bytes: 0 });
    const out = text(execute(net, kali, "sudo nmap -p 22,80 10.0.0.20"));
    expect(out).toMatch(/22\/tcp\s+filtered/);
    expect(out).toMatch(/80\/tcp\s+open/);
    expect(srv.firewall.chains.INPUT.rules[0].pkts).toBeGreaterThan(0);
  });

  it("scans UDP", () => {
    const net = buildNetwork(lan);
    expect(text(execute(net, session(net, "kali"), "sudo nmap -sU -p 53,69 10.0.0.20"))).toMatch(/53\/udp\s+open/);
  });
});

describe("tcpdump", () => {
  it("captures other hosts' cleartext traffic on a hub", () => {
    const net = buildNetwork(lan);
    const kali = session(net, "kali");
    expect(text(execute(net, kali, "tcpdump"))).toContain("permission");
    const r = execute(net, kali, "sudo tcpdump -A tcp port 80", {
      background: [{ device: "pc", command: 'curl -s -d "user=budi&pass=rahasia123" http://10.0.0.20/login' }],
    });
    const out = text(r);
    expect(out).toContain("listening on eth0");
    expect(out).toMatch(/10\.0\.0\.10\.\d+ > 10\.0\.0\.20\.80: Flags \[S\]/);
    expect(out).toContain("user=budi&pass=rahasia123");
    expect(r.facts).toContain("tcpdump:read-http-password");
    expect(r.facts).toContain("tcpdump:saw-others");
  });

  it("filters by protocol and host", () => {
    const net = buildNetwork(lan);
    const r = execute(net, session(net, "kali"), "sudo tcpdump arp", { background: [{ device: "pc", command: "ping -c 1 10.0.0.20" }] });
    const out = text(r);
    expect(out).toContain("ARP, Request who-has 10.0.0.20 tell 10.0.0.10");
    expect(out).not.toContain("ICMP");
  });
});

describe("crypto commands", () => {
  it("hashes, encodes and cracks weak hashes", () => {
    const net = buildNetwork({
      devices: [
        {
          id: "pc",
          kind: "pc",
          position: { x: 0, y: 0 },
          files: { "hash.txt": `budi:${md5("sayang123")}\nadmin:${md5("Xk9#vT2!qLm8@pZ")}\n`, "words.txt": "123456\npassword\nsayang123\nqwerty\n" },
        },
      ],
      links: [],
    });
    const pc = session(net, "pc");
    expect(text(execute(net, pc, "echo -n abc | md5sum"))).toBe("900150983cd24fb0d6963f7d28e17f72  -");
    expect(text(execute(net, pc, "echo -n abc | sha256sum"))).toContain("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(text(execute(net, pc, "echo -n halo | base64"))).toBe("aGFsbw==");
    expect(text(execute(net, pc, "echo aGFsbw== | base64 -d"))).toBe("halo");
    const crack = execute(net, pc, "john --format=raw-md5 --wordlist=words.txt hash.txt");
    expect(text(crack)).toContain("sayang123");
    expect(crack.facts).toContain("john:cracked:budi");
    expect(crack.facts).not.toContain("john:cracked:admin");
    expect(text(execute(net, pc, "john --show hash.txt"))).toContain("budi:sayang123");
  });
});
