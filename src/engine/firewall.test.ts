import { describe, expect, it } from "vitest";
import { buildNetwork, execute, type Network, type ShellSession, type TopologySpec } from "@/engine";

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

const spec: TopologySpec = {
  devices: [
    { id: "admin", kind: "pc", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.5/24" }] },
    { id: "luar", kind: "attacker", position: { x: 0, y: 0 }, interfaces: [{ name: "eth0", ip: "10.0.0.66/24" }] },
    { id: "sw", kind: "switch", position: { x: 0, y: 0 } },
    {
      id: "srv",
      kind: "server",
      user: "root",
      position: { x: 0, y: 0 },
      interfaces: [{ name: "eth0", ip: "10.0.0.20/24" }],
      services: [{ port: 22, protocol: "tcp", name: "ssh" }],
      web: { routes: { "/": { body: "web ok\n" } } },
      dns: ["10.0.0.53"],
    },
  ],
  links: [
    ["admin:eth0", "sw:p1"],
    ["luar:eth0", "sw:p2"],
    ["srv:eth0", "sw:p3"],
  ],
};

describe("iptables filter table", () => {
  it("default-deny with exceptions, while the server can still reach out", () => {
    const net = buildNetwork(spec);
    const srv = session(net, "srv");
    for (const cmd of [
      "iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT",
      "iptables -A INPUT -p tcp --dport 80 -j ACCEPT",
      "iptables -A INPUT -p tcp --dport 22 -s 10.0.0.5 -j ACCEPT",
      "iptables -P INPUT DROP",
    ]) {
      const r = execute(net, srv, cmd);
      expect(r.exitCode, cmd).toBe(0);
    }
    expect(text(execute(net, session(net, "luar"), "curl http://10.0.0.20/"))).toContain("web ok");
    expect(text(execute(net, session(net, "luar"), "nc -zv 10.0.0.20 22"))).toContain("timed out");
    expect(text(execute(net, session(net, "admin"), "nc -zv 10.0.0.20 22"))).toContain("succeeded");
    expect(text(execute(net, session(net, "luar"), "ping -c 1 10.0.0.20"))).toContain("0 received");
    // replies to connections the server starts itself are ESTABLISHED and allowed back in
    expect(text(execute(net, srv, "ping -c 1 10.0.0.5"))).toContain("1 received");
    const listing = text(execute(net, srv, "iptables -L INPUT -n -v --line-numbers"));
    expect(listing).toContain("Chain INPUT (policy DROP");
    expect(listing).toMatch(/3\s+\d+\s+\d+ ACCEPT\s+tcp\s+--\s+\*\s+\*\s+10\.0\.0\.5\s+0\.0\.0\.0\/0\s+tcp dpt:22/);
  });

  it("REJECT answers immediately, DROP stays silent, and the first match wins", () => {
    const net = buildNetwork(spec);
    const srv = session(net, "srv");
    execute(net, srv, "iptables -A INPUT -s 10.0.0.66 -p tcp --dport 80 -j REJECT --reject-with tcp-reset");
    execute(net, srv, "iptables -A INPUT -s 10.0.0.66 -j DROP");
    const luar = session(net, "luar");
    expect(text(execute(net, luar, "curl http://10.0.0.20/"))).toContain("Connection refused");
    expect(text(execute(net, luar, "nc -zv 10.0.0.20 22"))).toContain("timed out");
    execute(net, srv, "iptables -I INPUT 1 -s 10.0.0.66 -p tcp --dport 80 -j ACCEPT");
    expect(text(execute(net, luar, "curl http://10.0.0.20/"))).toContain("web ok");
    execute(net, srv, "iptables -D INPUT 1");
    expect(text(execute(net, luar, "curl http://10.0.0.20/"))).toContain("Connection refused");
    expect(text(execute(net, srv, "iptables -S"))).toContain("-A INPUT -s 10.0.0.66 -j DROP");
  });

  it("LOG writes to kern.log and continues matching", () => {
    const net = buildNetwork(spec);
    const srv = session(net, "srv");
    execute(net, srv, 'iptables -A INPUT -p tcp --dport 22 -j LOG --log-prefix "SSH-ATTEMPT: "');
    execute(net, session(net, "luar"), "nc -zv 10.0.0.20 22");
    const log = text(execute(net, srv, "cat /var/log/kern.log"));
    expect(log).toContain("SSH-ATTEMPT: IN=eth0");
    expect(log).toContain("SRC=10.0.0.66 DST=10.0.0.20");
  });

  it("validates input", () => {
    const net = buildNetwork(spec);
    const srv = session(net, "srv");
    expect(text(execute(net, srv, "iptables -A INPUT --dport 22 -j ACCEPT"))).toContain("butuh -p tcp");
    expect(text(execute(net, srv, "iptables -A INPUT -p tcp -j TERIMA"))).toContain("tidak dikenal");
    expect(text(execute(net, srv, "iptables -P INPUT TOLAK"))).toContain("ACCEPT atau DROP");
    expect(text(execute(net, session(net, "admin"), "iptables -L"))).toContain("Permission denied");
  });
});
